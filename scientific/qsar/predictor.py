"""
QSAR Predictor
==============
Loads the 4 endpoint models at startup and runs predictions for a SMILES string.

Each .pkl file may be EITHER:
  - a raw sklearn estimator (just `model.predict_proba` is used), OR
  - a bundle dict {"model": estimator, "train_fps": np.ndarray of shape (n, n_bits)}

When `train_fps` is available we run the k-NN Tanimoto Applicability Domain
check; otherwise AD is skipped and we mark the prediction as in-domain with
zero similarity (worker will downgrade confidence accordingly).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np

from applicability import check_applicability_domain
from confidence import ConfidenceResult, calculate_confidence
from descriptors import MolecularDescriptors, canonicalize_smiles, compute_descriptors
from fingerprints import morgan_fingerprint

ENDPOINTS = ("skin", "eye", "sens", "acute")
MODEL_FILES = {
    "skin": "skin_model.pkl",
    "eye": "eye_model.pkl",
    "sens": "sens_model.pkl",
    "acute": "acute_model.pkl",
}

# Map model probability (0..1 toward "positive / hazardous") to a 0-100 score
PROB_TO_SCORE = 100.0


@dataclass
class EndpointPrediction:
    endpoint: str
    probability: float  # 0..1 hazard probability
    score: float        # 0..100 potency for this substance
    confidence: ConfidenceResult


@dataclass
class SubstancePrediction:
    smiles: str
    canonical_smiles: str
    descriptors: MolecularDescriptors
    per_endpoint: Dict[str, EndpointPrediction] = field(default_factory=dict)

    # Worst-case confidence across endpoints (used as the substance-level badge)
    @property
    def overall_confidence(self) -> ConfidenceResult:
        if not self.per_endpoint:
            return ConfidenceResult(level="Low", reason_th="ไม่มีผลทำนาย", score=0.0)
        order = {"High": 2, "Medium": 1, "Low": 0}
        return min(
            (ep.confidence for ep in self.per_endpoint.values()),
            key=lambda c: order[c.level],
        )


class Predictor:
    """Loads all 4 endpoint models from disk and predicts for a SMILES."""

    def __init__(self, models_dir: str | os.PathLike[str]):
        self.models_dir = Path(models_dir)
        self._models: Dict[str, object] = {}
        self._train_fps: Dict[str, Optional[List[np.ndarray]]] = {}
        self._load_all()

    def _load_all(self) -> None:
        for endpoint, filename in MODEL_FILES.items():
            path = self.models_dir / filename
            if not path.exists():
                print(f"⚠️  model missing for {endpoint}: {path}")
                continue
            bundle = joblib.load(path)
            if isinstance(bundle, dict) and "model" in bundle:
                self._models[endpoint] = bundle["model"]
                fps = bundle.get("train_fps")
                self._train_fps[endpoint] = (
                    [np.asarray(fp, dtype=np.int8) for fp in fps] if fps is not None else None
                )
            else:
                # raw estimator
                self._models[endpoint] = bundle
                self._train_fps[endpoint] = None
            print(f"✅ loaded {endpoint}: {path.name}")

    @property
    def loaded_endpoints(self) -> List[str]:
        return list(self._models.keys())

    def is_ready(self) -> bool:
        return len(self._models) == len(MODEL_FILES)

    def predict(self, smiles: str) -> SubstancePrediction:
        """Predict all endpoints for a single SMILES. Raises ValueError if invalid."""
        canonical = canonicalize_smiles(smiles)
        if canonical is None:
            raise ValueError(f"invalid SMILES: {smiles}")

        descriptors = compute_descriptors(canonical)
        fp = morgan_fingerprint(canonical)
        if descriptors is None or fp is None:
            raise ValueError(f"cannot featurize SMILES: {smiles}")

        per_endpoint: Dict[str, EndpointPrediction] = {}
        for endpoint, model in self._models.items():
            probability = self._predict_proba(model, fp)
            score = round(probability * PROB_TO_SCORE, 2)

            train_fps = self._train_fps.get(endpoint)
            if train_fps:
                in_domain, similarity = check_applicability_domain(fp, train_fps)
            else:
                # Without training fps we cannot run AD — degrade to Medium ceiling
                in_domain, similarity = True, 0.0

            confidence = calculate_confidence(
                in_domain=in_domain,
                domain_similarity=similarity,
                prediction_prob=probability,
                rule_agrees=True,
            )

            per_endpoint[endpoint] = EndpointPrediction(
                endpoint=endpoint,
                probability=round(probability, 4),
                score=score,
                confidence=confidence,
            )

        return SubstancePrediction(
            smiles=smiles,
            canonical_smiles=canonical,
            descriptors=descriptors,
            per_endpoint=per_endpoint,
        )

    @staticmethod
    def _predict_proba(model, fp: np.ndarray) -> float:
        x = fp.reshape(1, -1)
        # Prefer predict_proba on positive class; fall back to decision_function/predict
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(x)[0]
            classes = list(getattr(model, "classes_", [0, 1]))
            if 1 in classes:
                return float(proba[classes.index(1)])
            return float(proba[-1])
        if hasattr(model, "decision_function"):
            raw = float(model.decision_function(x)[0])
            return 1.0 / (1.0 + np.exp(-raw))
        return float(model.predict(x)[0])
