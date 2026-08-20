"""Evidence-gated continual-learning utilities for candidate experiments only."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from rdkit import Chem
from rdkit.Chem.Scaffolds import MurckoScaffold
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import balanced_accuracy_score, matthews_corrcoef, recall_score, roc_auc_score


VERIFIED_REVIEW_STATUSES = {
    "reviewed_positive",
    "reviewed_negative",
    "consensus_verified",
    "verified",
}


@dataclass(frozen=True)
class EvidenceGateDecision:
    eligible: bool
    reason: str


def evidence_gate(
    evidence: dict[str, Any],
    *,
    observed_as_unseen: bool,
    holdout_identity_keys: set[str] | None = None,
) -> EvidenceGateDecision:
    """Decide queue eligibility without using predictions as labels."""
    identity = str(evidence.get("identity_key") or evidence.get("inchikey") or "").strip()
    if not observed_as_unseen:
        return EvidenceGateDecision(False, "identity_was_seen_by_selected_model")
    if not identity:
        return EvidenceGateDecision(False, "missing_exact_molecular_identity")
    if identity in (holdout_identity_keys or set()):
        return EvidenceGateDecision(False, "reserved_holdout_identity")
    if evidence.get("source") in {None, "", "user_submission", "model_prediction"}:
        return EvidenceGateDecision(False, "missing_independent_source_attribution")
    if str(evidence.get("review_status") or "") not in VERIFIED_REVIEW_STATUSES:
        return EvidenceGateDecision(False, "evidence_not_verified")
    if evidence.get("identity_conflict"):
        return EvidenceGateDecision(False, "identity_label_conflict")
    try:
        label = int(evidence.get("label"))
    except (TypeError, ValueError):
        return EvidenceGateDecision(False, "missing_verified_binary_label")
    if label not in {0, 1}:
        return EvidenceGateDecision(False, "missing_verified_binary_label")
    if evidence.get("label_source") in {"model_prediction", "ralphguard_prediction"}:
        return EvidenceGateDecision(False, "self_training_is_forbidden")
    return EvidenceGateDecision(True, "verified_evidence_gate_passed")


def scaffold_key(smiles: str) -> str:
    molecule = Chem.MolFromSmiles(str(smiles or ""))
    if molecule is None:
        return f"invalid:{smiles}"
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=molecule)
    return f"scaffold:{scaffold}" if scaffold else f"acyclic:{canonical}"


def scaffold_stream_split(
    smiles: list[str],
    *,
    seed: int = 42,
    base_fraction: float = 0.8,
    stream_fraction: float = 0.1,
) -> dict[str, np.ndarray]:
    """Assign whole scaffold groups to base/new-stream/final partitions."""
    if not 0 < base_fraction < 1 or not 0 < stream_fraction < 1:
        raise ValueError("split fractions must be between zero and one")
    if base_fraction + stream_fraction >= 1:
        raise ValueError("base + stream fractions must leave a final holdout")
    groups: dict[str, list[int]] = {}
    for index, value in enumerate(smiles):
        groups.setdefault(scaffold_key(value), []).append(index)
    ordered = sorted(
        groups,
        key=lambda value: hashlib.sha256(f"{seed}:{value}".encode("utf-8")).hexdigest(),
    )
    target_base = len(smiles) * base_fraction
    target_stream = len(smiles) * stream_fraction
    result = {"base": [], "new_stream": [], "final_holdout": []}
    for group in ordered:
        if len(result["base"]) < target_base:
            bucket = "base"
        elif len(result["new_stream"]) < target_stream:
            bucket = "new_stream"
        else:
            bucket = "final_holdout"
        result[bucket].extend(groups[group])
    return {key: np.asarray(sorted(values), dtype=int) for key, values in result.items()}


def select_replay_indices(
    y: np.ndarray,
    smiles: list[str],
    *,
    max_samples: int,
    seed: int = 42,
) -> np.ndarray:
    """Deterministic class/scaffold-aware replay selection."""
    if max_samples <= 0:
        return np.asarray([], dtype=int)
    candidates = sorted(
        range(len(y)),
        key=lambda index: (
            int(y[index]),
            scaffold_key(smiles[index]),
            hashlib.sha256(f"{seed}:{smiles[index]}".encode("utf-8")).hexdigest(),
        ),
    )
    by_class = {0: [], 1: []}
    for index in candidates:
        by_class[int(y[index])].append(index)
    selected: list[int] = []
    while len(selected) < max_samples and any(by_class.values()):
        for label in (0, 1):
            if by_class[label] and len(selected) < max_samples:
                selected.append(by_class[label].pop(0))
    return np.asarray(sorted(selected), dtype=int)


def fit_incremental_head(
    X_base: np.ndarray,
    y_base: np.ndarray,
    X_verified: np.ndarray,
    y_verified: np.ndarray,
    *,
    replay_indices: np.ndarray,
    seed: int = 42,
) -> SGDClassifier:
    """Fit an experimental incremental logistic head with verified replay."""
    head = SGDClassifier(loss="log_loss", random_state=seed, class_weight="balanced")
    head.fit(X_base, y_base)
    replay_X = X_base[replay_indices]
    replay_y = y_base[replay_indices]
    update_X = np.vstack([replay_X, X_verified])
    update_y = np.concatenate([replay_y, y_verified])
    head.partial_fit(update_X, update_y, classes=np.asarray([0, 1]))
    return head


def _classification_metrics(model: SGDClassifier, X: np.ndarray, y: np.ndarray) -> dict[str, Any]:
    probability = model.predict_proba(X)[:, 1]
    prediction = (probability >= 0.5).astype(int)
    return {
        "n": int(len(y)),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, prediction)), 4),
        "mcc": round(float(matthews_corrcoef(y, prediction)), 4),
        "sensitivity": round(float(recall_score(y, prediction, pos_label=1, zero_division=0)), 4),
        "specificity": round(float(recall_score(y, prediction, pos_label=0, zero_division=0)), 4),
        "auc": round(float(roc_auc_score(y, probability)), 4) if len(np.unique(y)) == 2 else None,
    }


def continual_update_experiment(
    X_base: np.ndarray,
    y_base: np.ndarray,
    X_new_stream: np.ndarray,
    y_new_stream: np.ndarray,
    X_final_holdout: np.ndarray,
    y_final_holdout: np.ndarray,
    *,
    replay_indices: np.ndarray,
    seed: int = 42,
) -> tuple[SGDClassifier, dict[str, Any]]:
    """Evaluate a replay update without ever fitting on the final holdout."""
    if len(X_final_holdout) == 0:
        raise ValueError("final holdout must remain non-empty and untouched")
    baseline = SGDClassifier(loss="log_loss", random_state=seed, class_weight="balanced")
    baseline.fit(X_base, y_base)
    before_stream = _classification_metrics(baseline, X_new_stream, y_new_stream)
    before_final = _classification_metrics(baseline, X_final_holdout, y_final_holdout)

    updated = deepcopy(baseline)
    update_X = np.vstack([X_base[replay_indices], X_new_stream])
    update_y = np.concatenate([y_base[replay_indices], y_new_stream])
    updated.partial_fit(update_X, update_y, classes=np.asarray([0, 1]))
    after_stream = _classification_metrics(updated, X_new_stream, y_new_stream)
    after_final = _classification_metrics(updated, X_final_holdout, y_final_holdout)

    report = {
        "protocol": "80/10/10 scaffold stream; frozen RDKit features; replay SGD logistic head",
        "base_rows": int(len(y_base)),
        "new_verified_rows": int(len(y_new_stream)),
        "replay_rows": int(len(replay_indices)),
        "final_holdout_rows": int(len(y_final_holdout)),
        "before": {"new_stream": before_stream, "final_holdout": before_final},
        "after": {"new_stream": after_stream, "final_holdout": after_final},
        "delta": {
            "new_stream_balanced_accuracy": round(after_stream["balanced_accuracy"] - before_stream["balanced_accuracy"], 4),
            "final_holdout_balanced_accuracy": round(after_final["balanced_accuracy"] - before_final["balanced_accuracy"], 4),
            "forgetting_score": round(before_final["balanced_accuracy"] - after_final["balanced_accuracy"], 4),
        },
        "final_holdout_used_for_fit": False,
        "promotion_status": "manual_review_required",
    }
    return updated, report


def write_model_lineage(
    path: Path,
    *,
    model_id: str,
    parent: str,
    base_dataset_hash: str,
    new_evidence_hash: str,
    replay_hash: str,
    feature_version: str,
    seed: int = 42,
) -> dict[str, Any]:
    payload = {
        "model_id": model_id,
        "parent": parent,
        "base_dataset_hash": base_dataset_hash,
        "new_evidence_hash": new_evidence_hash,
        "replay_hash": replay_hash,
        "feature_version": feature_version,
        "random_seed": seed,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "candidate",
        "production_promoted": False,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
