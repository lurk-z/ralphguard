"""
QSAR Predictor (Ensemble v2)
============================
Loads every available endpoint model and predicts for a SMILES string.

Bundle formats supported:
  - "ensemble_v2": {members:[est...], member_names, feature_mode, threshold,
                    train_fps (Morgan), ...}  -> soft-voting ensemble + per-endpoint
                    operating threshold + uncertainty (member disagreement)
  - legacy:        {"model": estimator, "train_fps": [...]}  (Morgan features, thr 0.5)
  - raw estimator

Outputs per endpoint include an explicit UNCERTAINTY quantification:
  - probability        : ensemble mean hazard probability (0..1)
  - uncertainty        : std of member probabilities (0=agree, high=disagree)
  - in_domain / domain_similarity : applicability-domain (k-NN Tanimoto on Morgan)
  - threshold          : per-endpoint operating point (Youden's J)
  - confidence         : High/Medium/Low (3-layer) — downgraded if uncertainty high
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
from rdkit import Chem

from applicability import check_applicability_domain
from confidence import ConfidenceResult, calculate_confidence
from descriptors import MolecularDescriptors, canonicalize_smiles, compute_descriptors
from fingerprints import morgan_fingerprint
from featurizer import featurize_mol
from rules import check_structural_alerts, rule_agrees_with_prediction
from endpoints import ENDPOINTS, REQUIRED_PRODUCTION_ENDPOINTS

MODEL_FILES = {ep: f"{ep}_model.pkl" for ep in ENDPOINTS}
OPTIONAL_CANDIDATE_FILES = {
    "skin_dryness": Path("candidate_v3") / "skin_dryness_model.pkl",
}
PROB_TO_SCORE = 100.0
UNCERTAINTY_DOWNGRADE = 0.20  # std above this caps confidence at Medium


@dataclass
class EndpointPrediction:
    endpoint: str
    probability: float
    score: float
    confidence: ConfidenceResult
    alerts: List[str] = field(default_factory=list)
    rule_agrees: bool = True
    uncertainty: float = 0.0
    in_domain: bool = True
    domain_similarity: float = 0.0
    threshold: float = 0.5
    flagged: bool = False  # probability >= threshold
    training_seen: bool = False
    training_exposure_role: str = "none"
    model_version: str = "unknown"


@dataclass
class SubstancePrediction:
    smiles: str
    canonical_smiles: str
    descriptors: MolecularDescriptors
    per_endpoint: Dict[str, EndpointPrediction] = field(default_factory=dict)

    @property
    def overall_confidence(self) -> ConfidenceResult:
        if not self.per_endpoint:
            return ConfidenceResult(level="Low", reason_th="ไม่มีผลทำนาย", score=0.0)
        order = {"High": 2, "Medium": 1, "Low": 0}
        return min((ep.confidence for ep in self.per_endpoint.values()),
                   key=lambda c: order[c.level])


@dataclass
class _Model:
    fmt: str                       # "ensemble_v2" | "legacy" | "raw"
    members: list                  # list of estimators (1 for legacy/raw)
    feature_mode: str              # "morgan" | "maccs_descr" | ...
    threshold: float
    train_fps: Optional[List[np.ndarray]]
    training_identity_keys: frozenset[str] = frozenset()
    training_smiles: frozenset[str] = frozenset()
    model_version: str = "unknown"


class Predictor:
    def __init__(self, models_dir: str | os.PathLike[str]):
        self.models_dir = Path(models_dir)
        self._models: Dict[str, _Model] = {}
        self._optional_candidate_signatures: Dict[str, tuple[int, int]] = {}
        self._load_all()

    def _load_all(self) -> None:
        for endpoint, filename in MODEL_FILES.items():
            path = self.models_dir / filename
            if not path.exists():
                print(f"⚠️  model missing for {endpoint}: {path}")
                continue
            bundle = joblib.load(path)
            self._models[endpoint] = self._parse_bundle(bundle)
            print(f"✅ loaded {endpoint}: {path.name} ({self._models[endpoint].fmt})")

        self._maybe_load_optional_candidates()

    def _maybe_load_optional_candidates(self) -> None:
        """Hot-load an explicitly marked research candidate when it appears.

        The worker is long-running while the notebook writes a candidate. A
        missing optional artifact is checked again at prediction time, so the
        notebook does not need to restart the worker. Candidate files stay in
        candidate_v3 and are never copied into the production model directory.
        """
        signatures = getattr(self, "_optional_candidate_signatures", None)
        if signatures is None:
            signatures = {}
            self._optional_candidate_signatures = signatures
        for endpoint, relative_path in OPTIONAL_CANDIDATE_FILES.items():
            # An endpoint already loaded without an optional-candidate signature
            # is a production model and must never be replaced by a candidate.
            if endpoint in self._models and endpoint not in signatures:
                continue
            path = self.models_dir / relative_path
            if not path.exists():
                continue
            stat = path.stat()
            signature = (stat.st_mtime_ns, stat.st_size)
            if signatures.get(endpoint) == signature:
                continue
            bundle = joblib.load(path)
            if not isinstance(bundle, dict) or not bundle.get("research_preview"):
                print(f"candidate ignored for {endpoint}: missing research_preview marker")
                continue
            self._models[endpoint] = self._parse_bundle(bundle)
            signatures[endpoint] = signature
            print(f"loaded research candidate {endpoint}: {path}")

    @staticmethod
    def _parse_bundle(bundle) -> "_Model":
        def _fps(raw):
            return [np.asarray(fp, dtype=np.int8) for fp in raw] if raw is not None else None
        if isinstance(bundle, dict) and bundle.get("format") == "ensemble_v2":
            return _Model("ensemble_v2", list(bundle["members"]),
                          bundle.get("feature_mode", "morgan"),
                          float(bundle.get("threshold", 0.5)),
                          _fps(bundle.get("train_fps")),
                          frozenset(str(value) for value in bundle.get("train_identity_keys", [])),
                          frozenset(str(value) for value in bundle.get("train_smiles", [])),
                          str(bundle.get("model_version") or bundle.get("candidate_version") or "production"))
        if isinstance(bundle, dict) and bundle.get("format") == "ensemble_v2_candidate":
            return _Model("ensemble_v2", list(bundle["members"]),
                          bundle.get("feature_mode", "morgan"),
                          float(bundle.get("threshold", 0.5)),
                          _fps(bundle.get("train_fps")),
                          frozenset(str(value) for value in bundle.get("train_identity_keys", [])),
                          frozenset(str(value) for value in bundle.get("train_smiles", [])),
                          str(bundle.get("candidate_version") or "candidate"))
        if isinstance(bundle, dict) and "model" in bundle:
            return _Model("legacy", [bundle["model"]], "morgan", 0.5, _fps(bundle.get("train_fps")),
                          frozenset(), frozenset(str(value) for value in bundle.get("train_smiles", [])), "legacy")
        return _Model("raw", [bundle], "morgan", 0.5, None, frozenset(), frozenset(), "raw")

    @property
    def loaded_endpoints(self) -> List[str]:
        return list(self._models.keys())

    def is_ready(self) -> bool:
        return all(endpoint in self._models for endpoint in REQUIRED_PRODUCTION_ENDPOINTS)

    @property
    def missing_endpoints(self) -> List[str]:
        return [endpoint for endpoint in ENDPOINTS if endpoint not in self._models]

    @staticmethod
    def _member_proba(model, x) -> float:
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(x)[0]
            classes = list(getattr(model, "classes_", [0, 1]))
            return float(proba[classes.index(1)]) if 1 in classes else float(proba[-1])
        if hasattr(model, "decision_function"):
            return float(1.0 / (1.0 + np.exp(-model.decision_function(x)[0])))
        return float(model.predict(x)[0])

    def predict(self, smiles: str) -> SubstancePrediction:
        self._maybe_load_optional_candidates()
        canonical = canonicalize_smiles(smiles)
        if canonical is None:
            raise ValueError(f"invalid SMILES: {smiles}")
        mol = Chem.MolFromSmiles(canonical)
        descriptors = compute_descriptors(canonical)
        morgan = morgan_fingerprint(canonical)
        if mol is None or descriptors is None or morgan is None:
            raise ValueError(f"cannot featurize SMILES: {smiles}")

        alerts_by_endpoint = check_structural_alerts(canonical)
        per_endpoint: Dict[str, EndpointPrediction] = {}
        try:
            inchi = Chem.MolToInchi(mol)
            identity_key = Chem.InchiToInchiKey(inchi) if inchi else ""
        except Exception:
            identity_key = ""

        for endpoint, m in self._models.items():
            x = featurize_mol(mol, m.feature_mode).reshape(1, -1)
            probs = np.array([self._member_proba(est, x) for est in m.members])
            probability = float(probs.mean())
            uncertainty = float(probs.std())  # member disagreement

            if m.train_fps:
                in_domain, similarity = check_applicability_domain(morgan, m.train_fps)
            else:
                in_domain, similarity = True, 0.0

            ep_alerts = alerts_by_endpoint.get(endpoint, [])
            rule_agrees = rule_agrees_with_prediction(ep_alerts, probability)

            confidence = calculate_confidence(
                in_domain=in_domain, domain_similarity=similarity,
                prediction_prob=probability, rule_agrees=rule_agrees,
            )
            # uncertainty as a 4th signal: high member disagreement caps at Medium
            if uncertainty > UNCERTAINTY_DOWNGRADE and confidence.level == "High":
                confidence = ConfidenceResult(
                    level="Medium",
                    reason_th=confidence.reason_th + f" · โมเดลในชุดเห็นไม่ตรงกัน (uncertainty={uncertainty:.2f})",
                    score=min(confidence.score, 0.55),
                )

            per_endpoint[endpoint] = EndpointPrediction(
                endpoint=endpoint,
                probability=round(probability, 4),
                score=round(probability * PROB_TO_SCORE, 2),
                confidence=confidence,
                alerts=ep_alerts,
                rule_agrees=rule_agrees,
                uncertainty=round(uncertainty, 4),
                in_domain=in_domain,
                domain_similarity=round(similarity, 4),
                threshold=round(m.threshold, 4),
                flagged=probability >= m.threshold,
                training_seen=(
                    bool(identity_key and identity_key in m.training_identity_keys)
                    or canonical in m.training_smiles
                ),
                training_exposure_role=(
                    "training"
                    if (bool(identity_key and identity_key in m.training_identity_keys) or canonical in m.training_smiles)
                    else "none"
                ),
                model_version=m.model_version,
            )

        return SubstancePrediction(smiles=smiles, canonical_smiles=canonical,
                                   descriptors=descriptors, per_endpoint=per_endpoint)
