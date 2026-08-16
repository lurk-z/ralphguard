"""Train RalphGuard QSAR candidate-v2 models without touching production models.

The script reuses the production featurizer/model definitions from data_prep.py,
but writes every artifact under scientific/models/candidate_v2/.  It reports:

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


def metric_dict(y: np.ndarray, probabilities: np.ndarray, predictions: np.ndarray) -> dict[str, Any]:
    tn, fp, fn, tp = confusion_matrix(y, predictions, labels=[0, 1]).ravel()
    return {
        "accuracy": round(float(accuracy_score(y, predictions)), 3),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, predictions)), 3),
        "sensitivity": round(float(tp / (tp + fn) if tp + fn else 0), 3),
        "specificity": round(float(tn / (tn + fp) if tn + fp else 0), 3),
        "auc": (
            round(float(roc_auc_score(y, probabilities)), 3)
            if len(np.unique(y)) > 1
            else None
        ),
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
            # Bemis-Murcko is empty for acyclic molecules. Treating all acyclic
            # chemistry as one giant group can make 5-fold CV impossible, so
            # each exact acyclic structure receives its own conservative group.
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
        return {
            "status": "unavailable",
            "reason": "fewer than five scaffold groups",
            **group_summary,
        }

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
                "note": "acyclic structures receive structure-specific groups because their Bemis-Murcko scaffold is empty",
                **group_summary,
            }
        )
        return metrics
    except ValueError as exc:
        return {
            "status": "unavailable",
            "reason": str(exc),
            **group_summary,
        }


def identity_key(smiles: str) -> tuple[str, str] | None:
    molecule = Chem.MolFromSmiles(str(smiles))
    if molecule is None:
        return None
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    try:
        inchi = Chem.MolToInchi(molecule)
        inchikey = Chem.InchiToInchiKey(inchi) if inchi else ""
    except Exception:
        inchikey = ""
    return (inchikey or f"SMILES:{canonical}", canonical)


def evaluate_external(
    endpoint: str,
    feature_mode: str,
    train_smiles: list[str],
    final_members: list[Any],
    production_threshold: float,
) -> dict[str, Any]:
    path = EXTERNAL_DIR / f"{endpoint}.csv"
    if not path.exists():
        return {"status": "not_provided", "path": str(path.relative_to(BASE))}

    frame = pd.read_csv(path)
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        return {
            "status": "invalid_file",
            "path": str(path.relative_to(BASE)),
            "reason": f"missing columns: {sorted(missing)}",
        }

    train_ids = {item[0] for item in (identity_key(value) for value in train_smiles) if item}
    rows = []
    invalid = 0
    for _, row in frame.iterrows():
        identity = identity_key(str(row["smiles"]))
        try:
            label = int(float(row["label"]))
        except (TypeError, ValueError):
            label = -1
        if identity is None or label not in {0, 1}:
            invalid += 1
            continue
        rows.append((identity[0], identity[1], label))

    unique: dict[str, tuple[str, int]] = {}
    for key, canonical, label in rows:
        unique.setdefault(key, (canonical, label))
    overlap = sorted(set(unique).intersection(train_ids))
    if overlap:
        return {
            "status": "rejected_exact_overlap",
            "path": str(path.relative_to(BASE)),
            "exact_identity_overlap": len(overlap),
            "overlap_examples": overlap[:20],
            "invalid_rows": invalid,
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
        return {
            "status": "invalid_file",
            "path": str(path.relative_to(BASE)),
            "reason": "no valid external structures",
        }

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
    parser.add_argument(
        "--endpoint",
        choices=sorted(training.DATASETS),
        help="train one endpoint only; default trains all four",
    )
    args = parser.parse_args()

    missing = [
        path.name
        for endpoint, path in training.DATASETS.items()
        if (args.endpoint is None or endpoint == args.endpoint) and not path.exists()
    ]
    if missing:
        raise RuntimeError(
            "Candidate training requires the base raw datasets on this machine. Missing: "
            + ", ".join(missing)
        )

    OUT.mkdir(parents=True, exist_ok=True)
    production_reference = load_production_reference()
    endpoints = [args.endpoint] if args.endpoint else list(training.DATASETS)
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_directory": str(OUT.relative_to(BASE)),
        "production_models_modified": False,
        "promotion_status": "manual_review_required",
        "protocol_notes": {
            "oof": "same 5-fold stratified OOF protocol as current production report for like-for-like comparison",
            "nested": "outer-test predictions use thresholds selected only from the outer-training data",
            "scaffold": "outer folds separate Bemis-Murcko scaffold groups where available",
            "external": "computed only if exact train/external molecular overlap is zero",
        },
        "endpoints": {},
    }

    for endpoint in endpoints:
        feature_mode = training.FEATURE_MODE[endpoint]
        (
            X,
            X_morgan,
            y,
            smiles,
            dropped,
            supplemental,
            conflicts,
            origins,
            sample_weight,
        ) = training.load_endpoint(
            training.DATASETS[endpoint],
            feature_mode,
            training.CURATED_PUBCHEM_DATASETS[endpoint],
        )
        if len(np.unique(y)) < 2:
            raise ValueError(f"{endpoint} training data must contain both positive and negative labels")

        oof_metrics, final_threshold = training.evaluate_oof(X, y, sample_weight)
        nested_metrics = nested_stratified_cv(X, y, sample_weight)
        scaffold_metrics = scaffold_grouped_cv(X, y, smiles, sample_weight)

        final_members = training.fit_members(X, y, sample_weight)
        external = evaluate_external(
            endpoint,
            feature_mode,
            smiles,
            final_members,
            final_threshold,
        )

        bundle = {
            "format": "ensemble_v2_candidate",
            "candidate_version": 2,
            "members": final_members,
            "member_names": training.MEMBER_NAMES,
            "feature_mode": feature_mode,
            "threshold": final_threshold,
            "train_fps": [value for value in X_morgan],
            "train_smiles": smiles,
            "metrics": oof_metrics,
            "validation": {
                "nested_stratified": nested_metrics,
                "scaffold_grouped": scaffold_metrics,
                "external": external,
            },
            "endpoint": endpoint,
            "label": training.ENDPOINT_NAMES[endpoint],
            "training_sources": origins,
            "pubchem_reviewed_rows_loaded": supplemental,
            "conflicting_structures_excluded": conflicts,
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
                "dropped_or_deduplicated_rows": int(dropped),
                "reviewed_pubchem_rows_loaded": int(supplemental),
                "conflicting_structures_excluded": int(conflicts),
                "training_sources": origins,
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
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"candidate report: {OUT / 'validation_report.json'}")
    print("Production model files were not modified. Review candidate metrics before promotion.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
