"""Train RalphGuard QSAR candidate-v2 models without touching production models.

The candidate pipeline deliberately uses a stricter molecular-identity rule than
the historical production trainer: InChIKey is the primary exact identity and
canonical isomeric SMILES is the fallback. The same identity cannot be counted
multiple times, and an identity with contradictory labels is excluded pending
review.

The script writes every artifact under scientific/models/candidate_v2/ and
reports:

1. the same 5-fold stratified OOF protocol used by the current production report
2. nested stratified CV where each outer-test sample uses a threshold chosen only
   from the corresponding outer-training data
3. scaffold-grouped outer CV for a stronger structural-novelty stress test
4. optional independent external-set metrics, only when exact molecular overlap
   with the candidate training pool is zero

Recommended sequence:

    python scripts/check_training_integrity.py --strict-conflicts --require-all
    python scripts/train_candidate_v2.py

This script NEVER promotes candidate files into scientific/models/*.pkl.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import pickle
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem.Scaffolds import MurckoScaffold
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    matthews_corrcoef,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

RDLogger.DisableLog("rdApp.*")

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

import data_prep as training  # noqa: E402

OUT = BASE / "scientific" / "models" / "candidate_v2"
EXTERNAL_DIR = BASE / "data" / "external"
PRODUCTION_REPORT = BASE / "scientific" / "models" / "validation_report.json"


def normalize_binary_label(value: Any) -> int | None:
    try:
        label = int(float(value))
    except (TypeError, ValueError):
        return None
    return label if label in {0, 1} else None


def identity_key(smiles: str) -> tuple[str, str] | None:
    """Return exact identity key + canonical isomeric SMILES for a valid molecule."""
    molecule = Chem.MolFromSmiles(str(smiles or "").strip())
    if molecule is None:
        return None
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    try:
        inchi = Chem.MolToInchi(molecule)
        inchikey = Chem.InchiToInchiKey(inchi) if inchi else ""
    except Exception:
        inchikey = ""
    return (inchikey or f"SMILES:{canonical}", canonical)


def _source_frame(path: Path, origin: str) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    frame = pd.read_csv(path).copy()
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        raise ValueError(f"{path} missing required columns: {sorted(missing)}")
    if origin == "pubchem_reviewed":
        reviewed_required = {"source", "evidence_ids"}
        reviewed_missing = reviewed_required.difference(frame.columns)
        if reviewed_missing:
            raise ValueError(
                f"{path.name} is not a reviewed evidence export; missing {sorted(reviewed_missing)}"
            )
    frame["training_origin"] = origin
    frame["source_file"] = str(path.relative_to(BASE))
    if "sample_weight" not in frame.columns:
        frame["sample_weight"] = 1.0 if origin == "base" else 0.5
    frame["sample_weight"] = pd.to_numeric(
        frame["sample_weight"], errors="coerce"
    ).fillna(1.0 if origin == "base" else 0.5).clip(0.05, 1.0)
    return frame


def load_candidate_endpoint(endpoint: str, feature_mode: str):
    """Load/clean one endpoint using the same exact-identity policy as the audit.

    Duplicate preference is deterministic: a base row wins over a supplemental
    weak-label row when both describe the same identity with the same label.
    Within the same origin, the highest sample weight wins. Contradictory labels
    for an exact identity are removed entirely until evidence is reviewed.
    """
    base_path = training.DATASETS[endpoint]
    supplemental_path = training.CURATED_PUBCHEM_DATASETS[endpoint]
    base = _source_frame(base_path, "base")
    supplemental = _source_frame(supplemental_path, "pubchem_reviewed")
    frames = [frame for frame in (base, supplemental) if not frame.empty]
    if not frames:
        raise RuntimeError(f"No training rows available for endpoint {endpoint}")

    frame = pd.concat(frames, ignore_index=True, sort=False)
    raw_rows = len(frame)
    supplemental_input_rows = len(supplemental)

    identities = frame["smiles"].map(identity_key)
    frame["identity_key"] = identities.map(lambda item: item[0] if item else None)
    frame["canonical"] = identities.map(lambda item: item[1] if item else None)
    frame["normalized_label"] = frame["label"].map(normalize_binary_label)

    invalid_structure_rows = int(frame["identity_key"].isna().sum())
    invalid_label_rows = int(frame["normalized_label"].isna().sum())
    frame = frame.dropna(subset=["identity_key", "canonical", "normalized_label"]).copy()
    frame["normalized_label"] = frame["normalized_label"].astype(int)

    label_counts = frame.groupby("identity_key")["normalized_label"].nunique()
    conflict_keys = set(label_counts[label_counts > 1].index)
    if conflict_keys:
        frame = frame[~frame["identity_key"].isin(conflict_keys)].copy()

    rows_after_conflict = len(frame)
    frame["origin_priority"] = frame["training_origin"].map(
        {"base": 0, "pubchem_reviewed": 1}
    ).fillna(9)
    frame = frame.sort_values(
        ["identity_key", "origin_priority", "sample_weight"],
        ascending=[True, True, False],
        kind="stable",
    )
    duplicate_rows_beyond_first = int(rows_after_conflict - frame["identity_key"].nunique())
    clean = frame.drop_duplicates("identity_key", keep="first").reset_index(drop=True)

    features: list[np.ndarray] = []
    morgan_fingerprints: list[np.ndarray] = []
    labels: list[int] = []
    canonical_smiles: list[str] = []
    weights: list[float] = []
    retained_origins: list[str] = []
    identity_keys: list[str] = []

    for _, row in clean.iterrows():
        molecule = Chem.MolFromSmiles(str(row["canonical"]))
        if molecule is None:
            continue
        features.append(training.featurize_mol(molecule, feature_mode))
        morgan_fingerprints.append(training.morgan_bits(molecule))
        labels.append(int(row["normalized_label"]))
        canonical_smiles.append(str(row["canonical"]))
        weights.append(float(row["sample_weight"]))
        retained_origins.append(str(row["training_origin"]))
        identity_keys.append(str(row["identity_key"]))

    if not features:
        raise RuntimeError(f"No valid molecular features remained for endpoint {endpoint}")

    origin_counts = dict(sorted(Counter(retained_origins).items()))
    stats = {
        "raw_rows_before_identity_audit": int(raw_rows),
        "base_input_rows": int(len(base)),
        "supplemental_input_rows": int(supplemental_input_rows),
        "invalid_structure_rows": invalid_structure_rows,
        "invalid_label_rows": invalid_label_rows,
        "conflicting_identity_count": int(len(conflict_keys)),
        "duplicate_rows_beyond_first": duplicate_rows_beyond_first,
        "unique_exact_identities_retained": int(len(labels)),
        "supplemental_unique_identities_retained": int(origin_counts.get("pubchem_reviewed", 0)),
        "training_sources": origin_counts,
        "identity_policy": "InChIKey primary; canonical isomeric SMILES fallback",
        "duplicate_preference": "base evidence before supplemental weak label; then highest sample weight",
    }

    return (
        np.vstack(features).astype(float),
        np.vstack(morgan_fingerprints),
        np.asarray(labels, dtype=int),
        canonical_smiles,
        np.asarray(weights, dtype=float),
        identity_keys,
        stats,
    )


def metric_dict(y: np.ndarray, probabilities: np.ndarray, predictions: np.ndarray) -> dict[str, Any]:
    tn, fp, fn, tp = confusion_matrix(y, predictions, labels=[0, 1]).ravel()
    return {
        "accuracy": round(float(accuracy_score(y, predictions)), 3),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, predictions)), 3),
        "sensitivity": round(float(tp / (tp + fn) if tp + fn else 0), 3),
        "specificity": round(float(tn / (tn + fp) if tn + fp else 0), 3),
        "auc": round(float(roc_auc_score(y, probabilities)), 3) if len(np.unique(y)) > 1 else None,
        "mcc": round(float(matthews_corrcoef(y, predictions)), 3),
        "n_pos": int(y.sum()),
        "n_neg": int((y == 0).sum()),
    }


def inner_threshold(X: np.ndarray, y: np.ndarray, sample_weight: np.ndarray | None) -> float:
    """Choose Youden threshold using only data supplied to this function."""
    class_counts = np.bincount(y.astype(int), minlength=2)
    n_splits = int(min(5, class_counts.min()))
    if n_splits < 2:
        return 0.5
    splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    probabilities = np.zeros(len(y), dtype=float)
    for train_idx, test_idx in splitter.split(X, y):
        fold_weight = sample_weight[train_idx] if sample_weight is not None else None
        members = training.fit_members(X[train_idx], y[train_idx], fold_weight)
        probabilities[test_idx], _ = training.ensemble_proba(members, X[test_idx])
    return training.youden_threshold(y, probabilities)


def nested_stratified_cv(
    X: np.ndarray,
    y: np.ndarray,
    sample_weight: np.ndarray | None,
) -> dict[str, Any]:
    class_counts = np.bincount(y.astype(int), minlength=2)
    if class_counts.min() < 5:
        return {"status": "unavailable", "reason": "fewer than five samples in one class"}
    outer = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    probabilities = np.zeros(len(y), dtype=float)
    predictions = np.zeros(len(y), dtype=int)
    fold_thresholds: list[float] = []

    for train_idx, test_idx in outer.split(X, y):
        train_weight = sample_weight[train_idx] if sample_weight is not None else None
        threshold = inner_threshold(X[train_idx], y[train_idx], train_weight)
        members = training.fit_members(X[train_idx], y[train_idx], train_weight)
        fold_probability, _ = training.ensemble_proba(members, X[test_idx])
        probabilities[test_idx] = fold_probability
        predictions[test_idx] = (fold_probability >= threshold).astype(int)
        fold_thresholds.append(float(threshold))

    metrics = metric_dict(y, probabilities, predictions)
    metrics.update(
        {
            "status": "complete",
            "protocol": "5-fold nested stratified CV",
            "threshold_policy": "threshold selected inside each outer training fold only",
            "outer_fold_thresholds": [round(value, 3) for value in fold_thresholds],
            "median_outer_threshold": round(float(np.median(fold_thresholds)), 3),
        }
    )
    return metrics


def scaffold_groups(smiles: list[str]) -> tuple[np.ndarray, dict[str, Any]]:
    groups: list[str] = []
    ring_scaffold_count = 0
    acyclic_count = 0
    for canonical in smiles:
        molecule = Chem.MolFromSmiles(canonical)
        if molecule is None:
            groups.append(f"invalid:{canonical}")
            continue
        scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=molecule)
        if scaffold:
            groups.append(f"scaffold:{scaffold}")
            ring_scaffold_count += 1
        else:
            groups.append(f"acyclic:{canonical}")
            acyclic_count += 1
    array = np.asarray(groups, dtype=object)
    return array, {
        "unique_groups": int(len(set(groups))),
        "ring_scaffold_rows": ring_scaffold_count,
        "acyclic_rows_unique_group": acyclic_count,
    }


def scaffold_grouped_cv(
    X: np.ndarray,
    y: np.ndarray,
    smiles: list[str],
    sample_weight: np.ndarray | None,
) -> dict[str, Any]:
    groups, group_summary = scaffold_groups(smiles)
    if len(set(groups)) < 5:
        return {"status": "unavailable", "reason": "fewer than five scaffold groups", **group_summary}

    try:
        outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
        probabilities = np.zeros(len(y), dtype=float)
        predictions = np.zeros(len(y), dtype=int)
        fold_thresholds: list[float] = []
        fold_group_overlap: list[int] = []

        for train_idx, test_idx in outer.split(X, y, groups=groups):
            train_groups = set(groups[train_idx])
            test_groups = set(groups[test_idx])
            fold_group_overlap.append(len(train_groups.intersection(test_groups)))
            if len(np.unique(y[train_idx])) < 2:
                raise ValueError("outer scaffold training fold contains only one class")

            train_weight = sample_weight[train_idx] if sample_weight is not None else None
            threshold = inner_threshold(X[train_idx], y[train_idx], train_weight)
            members = training.fit_members(X[train_idx], y[train_idx], train_weight)
            fold_probability, _ = training.ensemble_proba(members, X[test_idx])
            probabilities[test_idx] = fold_probability
            predictions[test_idx] = (fold_probability >= threshold).astype(int)
            fold_thresholds.append(float(threshold))

        metrics = metric_dict(y, probabilities, predictions)
        metrics.update(
            {
                "status": "complete",
                "protocol": "5-fold StratifiedGroupKFold by Bemis-Murcko scaffold",
                "threshold_policy": "threshold selected from each outer training fold only",
                "outer_fold_thresholds": [round(value, 3) for value in fold_thresholds],
                "group_overlap_per_fold": fold_group_overlap,
                "exact_group_overlap_zero": all(value == 0 for value in fold_group_overlap),
                "note": "acyclic structures receive structure-specific groups because their Bemis-Murcko scaffold is empty",
                **group_summary,
            }
        )
        return metrics
    except ValueError as exc:
        return {"status": "unavailable", "reason": str(exc), **group_summary}


def evaluate_external(
    endpoint: str,
    feature_mode: str,
    train_identity_keys: list[str],
    final_members: list[Any],
    production_threshold: float,
) -> dict[str, Any]:
    path = EXTERNAL_DIR / f"{endpoint}.csv"
    if not path.exists():
        return {"status": "not_provided", "path": str(path.relative_to(BASE))}

    frame = pd.read_csv(path)
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        return {"status": "invalid_file", "path": str(path.relative_to(BASE)), "reason": f"missing columns: {sorted(missing)}"}

    train_ids = set(train_identity_keys)
    rows: list[tuple[str, str, int]] = []
    invalid = 0
    for _, row in frame.iterrows():
        identity = identity_key(str(row["smiles"]))
        label = normalize_binary_label(row["label"])
        if identity is None or label is None:
            invalid += 1
            continue
        rows.append((identity[0], identity[1], label))

    label_sets: dict[str, set[int]] = {}
    canonical_by_identity: dict[str, str] = {}
    for key, canonical, label in rows:
        label_sets.setdefault(key, set()).add(label)
        canonical_by_identity.setdefault(key, canonical)
    external_conflicts = {key for key, labels in label_sets.items() if len(labels) > 1}
    unique = {
        key: (canonical_by_identity[key], next(iter(labels)))
        for key, labels in label_sets.items()
        if key not in external_conflicts
    }

    overlap = sorted(set(unique).intersection(train_ids))
    if overlap:
        return {
            "status": "rejected_exact_overlap",
            "path": str(path.relative_to(BASE)),
            "exact_identity_overlap": len(overlap),
            "overlap_examples": overlap[:20],
            "invalid_rows": invalid,
            "external_conflicting_identity_count": len(external_conflicts),
            "message": "External metrics not computed because exact molecular identities overlap training data.",
        }

    features = []
    labels = []
    for canonical, label in unique.values():
        molecule = Chem.MolFromSmiles(canonical)
        if molecule is None:
            continue
        features.append(training.featurize_mol(molecule, feature_mode))
        labels.append(label)
    if not features:
        return {"status": "invalid_file", "path": str(path.relative_to(BASE)), "reason": "no valid external structures"}

    X_external = np.vstack(features).astype(float)
    y_external = np.asarray(labels, dtype=int)
    probabilities, _ = training.ensemble_proba(final_members, X_external)
    predictions = (probabilities >= production_threshold).astype(int)
    metrics = metric_dict(y_external, probabilities, predictions)
    return {
        "status": "complete",
        "path": str(path.relative_to(BASE)),
        "exact_identity_overlap": 0,
        "invalid_rows": invalid,
        "external_conflicting_identity_count": len(external_conflicts),
        "unique_external_structures": len(labels),
        "threshold_from_training_oof": round(float(production_threshold), 3),
        "metrics": metrics,
    }


def load_production_reference() -> dict[str, Any]:
    if not PRODUCTION_REPORT.exists():
        return {}
    try:
        payload = json.loads(PRODUCTION_REPORT.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", choices=sorted(training.DATASETS), help="train one endpoint only; default trains all four")
    args = parser.parse_args()

    missing = [
        path.name
        for endpoint, path in training.DATASETS.items()
        if (args.endpoint is None or endpoint == args.endpoint) and not path.exists()
    ]
    if missing:
        raise RuntimeError(
            "Candidate training requires the base raw datasets on this machine. Missing: " + ", ".join(missing)
        )

    OUT.mkdir(parents=True, exist_ok=True)
    production_reference = load_production_reference()
    endpoints = [args.endpoint] if args.endpoint else list(training.DATASETS)
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_directory": str(OUT.relative_to(BASE)),
        "production_models_modified": False,
        "promotion_status": "manual_review_required",
        "identity_policy": "InChIKey primary; canonical isomeric SMILES fallback",
        "protocol_notes": {
            "oof": "same 5-fold stratified OOF metric style as current production report for like-for-like comparison",
            "nested": "outer-test predictions use thresholds selected only from the outer-training data",
            "scaffold": "outer folds separate Bemis-Murcko scaffold groups where available",
            "external": "computed only if exact train/external molecular overlap is zero",
        },
        "endpoints": {},
    }

    for endpoint in endpoints:
        feature_mode = training.FEATURE_MODE[endpoint]
        X, X_morgan, y, smiles, sample_weight, train_identity_keys, data_stats = load_candidate_endpoint(endpoint, feature_mode)
        if len(np.unique(y)) < 2:
            raise ValueError(f"{endpoint} training data must contain both positive and negative labels")

        oof_metrics, final_threshold = training.evaluate_oof(X, y, sample_weight)
        nested_metrics = nested_stratified_cv(X, y, sample_weight)
        scaffold_metrics = scaffold_grouped_cv(X, y, smiles, sample_weight)

        final_members = training.fit_members(X, y, sample_weight)
        external = evaluate_external(endpoint, feature_mode, train_identity_keys, final_members, final_threshold)

        bundle = {
            "format": "ensemble_v2_candidate",
            "candidate_version": 2,
            "members": final_members,
            "member_names": training.MEMBER_NAMES,
            "feature_mode": feature_mode,
            "threshold": final_threshold,
            "train_fps": [value for value in X_morgan],
            "train_smiles": smiles,
            "train_identity_keys": train_identity_keys,
            "metrics": oof_metrics,
            "validation": {
                "nested_stratified": nested_metrics,
                "scaffold_grouped": scaffold_metrics,
                "external": external,
            },
            "endpoint": endpoint,
            "label": training.ENDPOINT_NAMES[endpoint],
            "data_integrity": data_stats,
            "training_sample_weight_summary": {
                "min": float(sample_weight.min()),
                "max": float(sample_weight.max()),
                "mean": float(sample_weight.mean()),
            },
            "production_models_modified": False,
        }
        with (OUT / f"{endpoint}_model.pkl").open("wb") as handle:
            pickle.dump(bundle, handle)

        production = production_reference.get(endpoint) if production_reference else None
        delta = {}
        if isinstance(production, dict):
            for key in ("accuracy", "balanced_accuracy", "sensitivity", "specificity", "auc", "mcc"):
                old = production.get(key)
                new = oof_metrics.get(key)
                if isinstance(old, (int, float)) and isinstance(new, (int, float)):
                    delta[key] = round(float(new) - float(old), 3)

        report["endpoints"][endpoint] = {
            "dataset": {
                "n": int(len(y)),
                "positive": int(y.sum()),
                "negative": int((y == 0).sum()),
                "feature_mode": feature_mode,
                **data_stats,
            },
            "candidate_oof": oof_metrics,
            "candidate_nested_stratified": nested_metrics,
            "candidate_scaffold_grouped": scaffold_metrics,
            "external": external,
            "production_reference": production,
            "candidate_oof_minus_production_oof": delta,
        }
        print(
            f"{endpoint}: n={len(y)} AUC={oof_metrics.get('auc')} MCC={oof_metrics.get('mcc')} "
            f"nested_AUC={nested_metrics.get('auc')} scaffold_AUC={scaffold_metrics.get('auc')} "
            f"external={external.get('status')}",
            flush=True,
        )

    (OUT / "validation_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"candidate report: {OUT / 'validation_report.json'}")
    print("Production model files were not modified. Review candidate metrics before promotion.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
