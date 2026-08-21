"""Train RalphGuard QSAR candidate-v2 models without touching production models.

The candidate pipeline uses InChIKey as the primary exact molecular identity
with canonical isomeric SMILES as fallback. ICE experimental/reference rows,
peer-reviewed curated experimental negatives, and reviewed or explicitly
weak-labeled PubChem regulatory rows may supplement the base endpoint datasets,
but are provenance-separated and weighted.

Validation reported by this script:
1. 5-fold stratified OOF for like-for-like comparison with production
2. nested stratified CV (threshold chosen inside outer training folds)
3. scaffold-grouped CV for stronger structural novelty stress testing
4. optional external validation only when exact train/external identity overlap=0

All candidate artifacts are written under scientific/models/candidate_v2/.
Production scientific/models/*.pkl files are never modified.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import pickle
from pathlib import Path
import platform
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
import sklearn
import rdkit

RDLogger.DisableLog("rdApp.*")

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

import data_prep as training  # noqa: E402
from scripts.training_visualization import (  # noqa: E402
    export_predictions,
    plot_algorithm_pipeline,
    plot_data_profile,
    plot_evidence_origin_performance,
    plot_model_comparison,
    plot_training_preflight,
    plot_validation,
    write_training_report,
)

OUT = BASE / "scientific" / "models" / "candidate_v2"
EXTERNAL_DIR = BASE / "data" / "external"
CURATED_DIR = BASE / "data" / "curated"
PRODUCTION_REPORT = BASE / "scientific" / "models" / "validation_report.json"
BLOCKER_FILENAMES = ("training_blocked.json", "TRAINING_BLOCKED.md")
# How many weight-ordered candidates to perceive before scaffold round-robin.
# Bounds RDKit work while still offering many scaffolds per retained positive.
SCAFFOLD_SHORTLIST_FACTOR = 5


def clear_stale_blocker_markers(output_dir: Path) -> None:
    """Remove preflight blockers only after a candidate run succeeds."""
    for filename in BLOCKER_FILENAMES:
        (output_dir / filename).unlink(missing_ok=True)


def normalize_binary_label(value: Any) -> int | None:
    try:
        label = int(float(value))
    except (TypeError, ValueError):
        return None
    return label if label in {0, 1} else None


def identity_key(smiles: str) -> tuple[str, str] | None:
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


def _default_weight(origin: str) -> float:
    if origin == "pubchem_reviewed":
        return 0.5
    return 1.0


def _source_frame(path: Path, origin: str) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    frame = pd.read_csv(path).copy()
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        raise ValueError(f"{path} missing required columns: {sorted(missing)}")
    if origin in {"pubchem_reviewed", "nice_reviewed", "external_experimental"}:
        reviewed_required = {"source", "evidence_ids"}
        reviewed_missing = reviewed_required.difference(frame.columns)
        if reviewed_missing:
            raise ValueError(
                f"{path.name} is not a reviewed evidence export; missing {sorted(reviewed_missing)}"
            )
    frame["training_origin"] = origin
    frame["source_file"] = str(path.relative_to(BASE))
    default_weight = _default_weight(origin)
    if "sample_weight" not in frame.columns:
        frame["sample_weight"] = default_weight
    frame["sample_weight"] = pd.to_numeric(
        frame["sample_weight"], errors="coerce"
    ).fillna(default_weight).clip(0.05, 1.0)
    return frame


def external_holdout_identity_keys(endpoint: str) -> set[str]:
    """Return exact identities reserved for external validation."""
    path = EXTERNAL_DIR / f"{endpoint}.csv"
    if path.exists():
        frame = pd.read_csv(path)
    else:
        legacy_path = BASE / "data" / "external_validation.csv"
        if not legacy_path.exists():
            return set()
        frame = pd.read_csv(legacy_path)
        if "endpoint" not in frame.columns:
            raise ValueError(f"{legacy_path} is missing endpoint column")
        frame = frame[frame["endpoint"].astype(str) == endpoint].copy()
    if frame.empty:
        return set()
    if "smiles" not in frame.columns:
        raise ValueError(f"external holdout for {endpoint} is missing smiles column")
    identities = frame["smiles"].map(identity_key)
    return {item[0] for item in identities if item is not None}


def _scaffold_key(smiles: str) -> str:
    """Bemis-Murcko scaffold used as a chemical-diversity bucket."""
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        return ""
    try:
        return MurckoScaffold.MurckoScaffoldSmiles(mol=molecule, includeChirality=False)
    except Exception:
        return ""


def _diverse_positive_sample(weak_positives: pd.DataFrame, budget: int) -> pd.DataFrame:
    """Pick ``budget`` weak positives spread across Bemis-Murcko scaffolds.

    A plain weight/hash ordering is uniform over *rows*, so a downsampled pool
    inherits whichever congeneric series happens to be most numerous in
    PubChem. Round-robin over scaffolds keeps the retained positives spanning
    chemical space, which is what the negative-starved endpoints need most.

    Scaffolds are computed only for a bounded shortlist, because perceiving
    160,000 molecules would dominate the run time of the whole pipeline.
    """
    if budget <= 0 or weak_positives.empty:
        return weak_positives.head(0)
    if len(weak_positives) <= budget:
        return weak_positives

    shortlist = weak_positives.head(min(len(weak_positives), budget * SCAFFOLD_SHORTLIST_FACTOR)).copy()
    shortlist["scaffold"] = shortlist["canonical"].map(_scaffold_key)

    buckets: dict[str, list[int]] = {}
    for position, scaffold in zip(shortlist.index, shortlist["scaffold"]):
        buckets.setdefault(scaffold, []).append(position)

    selected: list[int] = []
    while len(selected) < budget:
        progressed = False
        for members in buckets.values():
            if not members:
                continue
            selected.append(members.pop(0))
            progressed = True
            if len(selected) >= budget:
                break
        if not progressed:
            break
    return shortlist.loc[selected].drop(columns=["scaffold"])


def load_candidate_endpoint(
    endpoint: str,
    feature_mode: str,
    max_training_rows: int = 0,
    max_positive_negative_ratio: float = 0.0,
):
    """Load one endpoint with exact-identity dedup/conflict handling.

    Evidence priority for duplicate rows with the same label:
      1) base ICE and peer-reviewed curated experimental evidence
      2) human-reviewed NICE/ICE evidence
      3) PubChem regulatory weak labels

    Contradictions are resolved only across evidence tiers: a higher-tier ICE
    experimental label overrides a lower-tier PubChem weak label. A conflict
    inside the best available tier remains excluded for review.
    """
    base_path = training.DATASETS[endpoint]
    pubchem_path = training.CURATED_PUBCHEM_DATASETS[endpoint]
    nice_path = CURATED_DIR / f"nice_verified_{endpoint}.csv"
    experimental_paths = [CURATED_DIR / f"{endpoint}_negative_clean.csv"]
    if endpoint == "sens":
        experimental_paths.append(CURATED_DIR / "sens_hppt_clean.csv")

    base = _source_frame(base_path, "base")
    experimental_frames = [
        _source_frame(path, "external_experimental") for path in experimental_paths
    ]
    experimental = pd.concat(
        [frame for frame in experimental_frames if not frame.empty],
        ignore_index=True,
        sort=False,
    ) if any(not frame.empty for frame in experimental_frames) else pd.DataFrame()
    nice = _source_frame(nice_path, "nice_reviewed")
    pubchem = _source_frame(pubchem_path, "pubchem_reviewed")
    frames = [frame for frame in (base, experimental, nice, pubchem) if not frame.empty]
    if not frames:
        raise RuntimeError(f"No training rows available for endpoint {endpoint}")

    frame = pd.concat(frames, ignore_index=True, sort=False)
    raw_rows = len(frame)
    identities = frame["smiles"].map(identity_key)
    frame["identity_key"] = identities.map(lambda item: item[0] if item else None)
    frame["canonical"] = identities.map(lambda item: item[1] if item else None)
    frame["normalized_label"] = frame["label"].map(normalize_binary_label)

    invalid_structure_rows = int(frame["identity_key"].isna().sum())
    invalid_label_rows = int(frame["normalized_label"].isna().sum())
    frame = frame.dropna(subset=["identity_key", "canonical", "normalized_label"]).copy()
    frame["normalized_label"] = frame["normalized_label"].astype(int)

    holdout_keys = external_holdout_identity_keys(endpoint)
    holdout_overlap = frame["identity_key"].isin(holdout_keys)
    external_holdout_rows_quarantined = int(holdout_overlap.sum())
    external_holdout_identities_quarantined = int(
        frame.loc[holdout_overlap, "identity_key"].nunique()
    )
    frame = frame[~holdout_overlap].copy()

    frame["origin_priority"] = frame["training_origin"].map(
        {"base": 0, "external_experimental": 0, "nice_reviewed": 1, "pubchem_reviewed": 2}
    ).fillna(9)
    overall_label_counts = frame.groupby("identity_key")["normalized_label"].nunique()
    any_conflict_keys = set(overall_label_counts[overall_label_counts > 1].index)
    best_priority = frame.groupby("identity_key")["origin_priority"].transform("min")
    best_tier = frame[frame["origin_priority"] == best_priority].copy()
    best_label_counts = best_tier.groupby("identity_key")["normalized_label"].nunique()
    conflict_keys = set(best_label_counts[best_label_counts > 1].index)
    lower_tier_conflict_keys = any_conflict_keys.difference(conflict_keys)
    if conflict_keys:
        best_tier = best_tier[~best_tier["identity_key"].isin(conflict_keys)].copy()

    rows_after_conflict = len(best_tier)
    frame = best_tier
    frame = frame.sort_values(
        ["identity_key", "origin_priority", "sample_weight"],
        ascending=[True, True, False],
        kind="stable",
    )
    duplicate_rows_beyond_first = int(rows_after_conflict - frame["identity_key"].nunique())
    clean_eligible = frame.drop_duplicates("identity_key", keep="first").reset_index(drop=True)
    eligible_rows_before_cap = len(clean_eligible)
    eligible_positive_rows = int((clean_eligible["normalized_label"] == 1).sum())
    eligible_negative_rows = int((clean_eligible["normalized_label"] == 0).sum())
    positive_budget_applied = 0
    if max_training_rows > 0 and len(clean_eligible) > max_training_rows:
        strong = clean_eligible[clean_eligible["training_origin"] != "pubchem_reviewed"].copy()
        weak = clean_eligible[clean_eligible["training_origin"] == "pubchem_reviewed"].copy()
        # Always retain higher-quality experimental/reviewed rows. Fill the
        # remaining budget with the strongest PubChem tier, then a stable hash
        # sample so reruns select the exact same chemical identities.
        weak["selection_hash"] = weak["identity_key"].map(
            lambda value: hashlib.sha256(str(value).encode("utf-8")).hexdigest()
        )
        weak = weak.sort_values(
            ["sample_weight", "selection_hash"],
            ascending=[False, True],
            kind="stable",
        )
        weak_budget = max(0, max_training_rows - len(strong))

        # The PubChem tier is almost entirely positive: a hazard statement is
        # recorded because the substance *has* the hazard, while a negative
        # needs explicit contrary evidence. Filling the budget without looking
        # at the label therefore produced roughly 500 positives per negative for
        # skin, and no amount of loss re-weighting recovers information that is
        # not in the sample — it only makes the handful of negatives dominate a
        # few trees. Cap the positive class relative to the negatives actually
        # available so the retained set can separate the two classes.
        weak_negative = weak[weak["normalized_label"] == 0]
        weak_positive = weak[weak["normalized_label"] == 1]
        negatives_kept = int((strong["normalized_label"] == 0).sum()) + len(weak_negative)
        positive_budget = max(0, weak_budget - len(weak_negative))
        if max_positive_negative_ratio > 0 and negatives_kept > 0:
            strong_positive_rows = int((strong["normalized_label"] == 1).sum())
            allowed_positives = int(round(max_positive_negative_ratio * negatives_kept))
            positive_budget = max(0, min(positive_budget, allowed_positives - strong_positive_rows))
            positive_budget_applied = positive_budget

        clean = pd.concat(
            [
                strong,
                weak_negative,
                _diverse_positive_sample(weak_positive, positive_budget),
            ],
            ignore_index=True,
            sort=False,
        )
    else:
        clean = clean_eligible.copy()

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
        "external_experimental_input_rows": int(len(experimental)),
        "nice_reviewed_input_rows": int(len(nice)),
        "pubchem_reviewed_input_rows": int(len(pubchem)),
        "invalid_structure_rows": invalid_structure_rows,
        "invalid_label_rows": invalid_label_rows,
        "external_holdout_rows_quarantined": external_holdout_rows_quarantined,
        "external_holdout_identities_quarantined": external_holdout_identities_quarantined,
        "conflicting_identity_count": int(len(conflict_keys)),
        "lower_tier_conflicts_resolved_by_evidence_priority": int(len(lower_tier_conflict_keys)),
        "duplicate_rows_beyond_first": duplicate_rows_beyond_first,
        "eligible_unique_identities_before_training_cap": int(eligible_rows_before_cap),
        "training_row_cap": int(max_training_rows),
        "rows_excluded_by_training_cap": int(eligible_rows_before_cap - len(clean)),
        "eligible_positive_identities_before_cap": eligible_positive_rows,
        "eligible_negative_identities_before_cap": eligible_negative_rows,
        "eligible_positive_negative_ratio_before_cap": (
            round(eligible_positive_rows / eligible_negative_rows, 1)
            if eligible_negative_rows
            else None
        ),
        "max_positive_negative_ratio_requested": float(max_positive_negative_ratio),
        "weak_positive_budget_after_ratio_cap": int(positive_budget_applied),
        "retained_positive_identities": int(sum(1 for label in labels if label == 1)),
        "retained_negative_identities": int(sum(1 for label in labels if label == 0)),
        "positive_selection_policy": (
            "every negative identity is retained; weak PubChem positives are capped "
            "relative to the available negatives and spread across Bemis-Murcko "
            "scaffolds, because the regulatory tier records hazards and therefore "
            "supplies almost no negatives"
        ),
        "unique_exact_identities_retained": int(len(labels)),
        "external_experimental_unique_identities_retained": int(
            origin_counts.get("external_experimental", 0)
        ),
        "nice_reviewed_unique_identities_retained": int(origin_counts.get("nice_reviewed", 0)),
        "pubchem_reviewed_unique_identities_retained": int(origin_counts.get("pubchem_reviewed", 0)),
        "training_sources": origin_counts,
        "identity_policy": "InChIKey primary; canonical isomeric SMILES fallback",
        "duplicate_preference": "base ICE and peer-reviewed curated experimental evidence (same tier) > reviewed NICE/ICE > PubChem weak label; lower-tier contradictions are overridden and same-tier contradictions are excluded",
        "external_holdout_policy": "exact holdout identities are removed from training before conflict handling and model fitting",
    }
    return (
        np.vstack(features).astype(np.float32, copy=False),
        np.vstack(morgan_fingerprints),
        np.asarray(labels, dtype=int),
        canonical_smiles,
        np.asarray(weights, dtype=float),
        identity_keys,
        retained_origins,
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


def metrics_by_origin(
    y: np.ndarray,
    probabilities: np.ndarray,
    predictions: np.ndarray,
    origins: list[str],
) -> dict[str, dict[str, Any]]:
    """Expose whether apparent performance comes from experimental or weak rows."""
    result: dict[str, dict[str, Any]] = {}
    origin_array = np.asarray(origins, dtype=object)
    for origin in sorted(set(origins)):
        mask = origin_array == origin
        subset_y = y[mask]
        subset_p = probabilities[mask]
        subset_pred = predictions[mask]
        tn, fp, fn, tp = confusion_matrix(subset_y, subset_pred, labels=[0, 1]).ravel()
        both_classes = len(np.unique(subset_y)) == 2
        result[origin] = {
            "n": int(mask.sum()),
            "n_pos": int(subset_y.sum()),
            "n_neg": int((subset_y == 0).sum()),
            "accuracy": round(float(accuracy_score(subset_y, subset_pred)), 3),
            "sensitivity": round(float(tp / (tp + fn)), 3) if tp + fn else None,
            "specificity": round(float(tn / (tn + fp)), 3) if tn + fp else None,
            "balanced_accuracy": round(float(balanced_accuracy_score(subset_y, subset_pred)), 3) if both_classes else None,
            "auc": round(float(roc_auc_score(subset_y, subset_p)), 3) if both_classes else None,
            "mcc": round(float(matthews_corrcoef(subset_y, subset_pred)), 3) if both_classes else None,
            "single_class_warning": None if both_classes else "metrics requiring both classes are intentionally omitted",
        }
    return result


def oof_validation(
    X: np.ndarray,
    y: np.ndarray,
    sample_weight: np.ndarray | None,
) -> tuple[dict[str, Any], float, dict[str, np.ndarray]]:
    """Run like-for-like 5-fold OOF and retain every sample prediction."""
    class_counts = np.bincount(y.astype(int), minlength=2)
    if class_counts.min() < 5:
        raise ValueError("5-fold OOF requires at least five samples in each class")
    splitter = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    probabilities = np.zeros(len(y), dtype=float)
    folds = np.zeros(len(y), dtype=int)
    for fold, (train_idx, test_idx) in enumerate(splitter.split(X, y), start=1):
        fold_weight = sample_weight[train_idx] if sample_weight is not None else None
        members = training.fit_members(X[train_idx], y[train_idx], fold_weight)
        probabilities[test_idx], _ = training.ensemble_proba(members, X[test_idx])
        folds[test_idx] = fold
    threshold = training.youden_threshold(y, probabilities)
    predictions = (probabilities >= threshold).astype(int)
    metrics = metric_dict(y, probabilities, predictions)
    metrics.update({
        "status": "complete",
        "protocol": "5-fold stratified out-of-fold",
        "threshold": round(float(threshold), 3),
        "threshold_policy": "Youden's J selected from the complete OOF prediction vector",
    })
    payload = {
        "y_true": y,
        "probabilities": probabilities,
        "predictions": predictions,
        "fold": folds,
        "threshold": np.full(len(y), threshold, dtype=float),
    }
    return metrics, threshold, payload


def inner_threshold(X: np.ndarray, y: np.ndarray, sample_weight: np.ndarray | None) -> float:
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
) -> tuple[dict[str, Any], dict[str, np.ndarray] | None]:
    class_counts = np.bincount(y.astype(int), minlength=2)
    if class_counts.min() < 5:
        return {"status": "unavailable", "reason": "fewer than five samples in one class"}, None
    outer = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    probabilities = np.zeros(len(y), dtype=float)
    predictions = np.zeros(len(y), dtype=int)
    folds = np.zeros(len(y), dtype=int)
    sample_thresholds = np.zeros(len(y), dtype=float)
    fold_thresholds: list[float] = []
    for fold, (train_idx, test_idx) in enumerate(outer.split(X, y), start=1):
        train_weight = sample_weight[train_idx] if sample_weight is not None else None
        threshold = inner_threshold(X[train_idx], y[train_idx], train_weight)
        members = training.fit_members(X[train_idx], y[train_idx], train_weight)
        fold_probability, _ = training.ensemble_proba(members, X[test_idx])
        probabilities[test_idx] = fold_probability
        predictions[test_idx] = (fold_probability >= threshold).astype(int)
        folds[test_idx] = fold
        sample_thresholds[test_idx] = threshold
        fold_thresholds.append(float(threshold))
    metrics = metric_dict(y, probabilities, predictions)
    metrics.update({
        "status": "complete",
        "protocol": "5-fold nested stratified CV",
        "threshold_policy": "threshold selected inside each outer training fold only",
        "outer_fold_thresholds": [round(value, 3) for value in fold_thresholds],
        "median_outer_threshold": round(float(np.median(fold_thresholds)), 3),
    })
    return metrics, {
        "y_true": y,
        "probabilities": probabilities,
        "predictions": predictions,
        "fold": folds,
        "threshold": sample_thresholds,
    }


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
    return np.asarray(groups, dtype=object), {
        "unique_groups": int(len(set(groups))),
        "ring_scaffold_rows": ring_scaffold_count,
        "acyclic_rows_unique_group": acyclic_count,
    }


def scaffold_grouped_cv(
    X: np.ndarray,
    y: np.ndarray,
    smiles: list[str],
    sample_weight: np.ndarray | None,
    *,
    threshold_mode: str = "inner_oof",
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    groups, group_summary = scaffold_groups(smiles)
    if len(set(groups)) < 5:
        return {"status": "unavailable", "reason": "fewer than five scaffold groups", **group_summary}, None
    try:
        outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
        probabilities = np.zeros(len(y), dtype=float)
        predictions = np.zeros(len(y), dtype=int)
        folds = np.zeros(len(y), dtype=int)
        sample_thresholds = np.zeros(len(y), dtype=float)
        fold_thresholds: list[float] = []
        fold_group_overlap: list[int] = []
        for fold, (train_idx, test_idx) in enumerate(outer.split(X, y, groups=groups), start=1):
            train_groups = set(groups[train_idx])
            test_groups = set(groups[test_idx])
            fold_group_overlap.append(len(train_groups.intersection(test_groups)))
            if len(np.unique(y[train_idx])) < 2:
                raise ValueError("outer scaffold training fold contains only one class")
            train_weight = sample_weight[train_idx] if sample_weight is not None else None
            threshold = (
                inner_threshold(X[train_idx], y[train_idx], train_weight)
                if threshold_mode == "inner_oof"
                else 0.5
            )
            members = training.fit_members(X[train_idx], y[train_idx], train_weight)
            fold_probability, _ = training.ensemble_proba(members, X[test_idx])
            probabilities[test_idx] = fold_probability
            predictions[test_idx] = (fold_probability >= threshold).astype(int)
            folds[test_idx] = fold
            sample_thresholds[test_idx] = threshold
            fold_thresholds.append(float(threshold))
        metrics = metric_dict(y, probabilities, predictions)
        metrics.update({
            "status": "complete",
            "protocol": "5-fold StratifiedGroupKFold by Bemis-Murcko scaffold",
            "threshold_policy": (
                "threshold selected from each outer training fold only"
                if threshold_mode == "inner_oof"
                else "fixed 0.5 threshold; avoids inner-CV cost and test-fold leakage for large data"
            ),
            "outer_fold_thresholds": [round(value, 3) for value in fold_thresholds],
            "group_overlap_per_fold": fold_group_overlap,
            "exact_group_overlap_zero": all(value == 0 for value in fold_group_overlap),
            "note": "acyclic structures receive structure-specific groups because their Bemis-Murcko scaffold is empty",
            **group_summary,
        })
        return metrics, {
            "y_true": y,
            "probabilities": probabilities,
            "predictions": predictions,
            "fold": folds,
            "threshold": sample_thresholds,
            "smiles": smiles,
        }
    except ValueError as exc:
        return {"status": "unavailable", "reason": str(exc), **group_summary}, None


def evaluate_external(
    endpoint: str,
    feature_mode: str,
    train_identity_keys: list[str],
    final_members: list[Any],
    training_threshold: float,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    path = EXTERNAL_DIR / f"{endpoint}.csv"
    if not path.exists():
        legacy_path = BASE / "data" / "external_validation.csv"
        if not legacy_path.exists():
            return {"status": "not_provided", "path": str(path.relative_to(BASE))}, None
        legacy = pd.read_csv(legacy_path)
        if "endpoint" not in legacy.columns:
            return {"status": "invalid_file", "path": str(legacy_path.relative_to(BASE)), "reason": "missing endpoint column"}, None
        frame = legacy[legacy["endpoint"].astype(str) == endpoint].copy()
        path = legacy_path
        if frame.empty:
            return {"status": "not_provided", "path": str(path.relative_to(BASE)), "reason": f"no rows for endpoint {endpoint}"}, None
    else:
        frame = pd.read_csv(path)
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        return {"status": "invalid_file", "path": str(path.relative_to(BASE)), "reason": f"missing columns: {sorted(missing)}"}, None
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
    unique = {key: (canonical_by_identity[key], next(iter(labels))) for key, labels in label_sets.items() if key not in external_conflicts}
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
        }, None
    features = []
    labels = []
    for canonical, label in unique.values():
        molecule = Chem.MolFromSmiles(canonical)
        if molecule is None:
            continue
        features.append(training.featurize_mol(molecule, feature_mode))
        labels.append(label)
    if not features:
        return {"status": "invalid_file", "path": str(path.relative_to(BASE)), "reason": "no valid external structures"}, None
    X_external = np.vstack(features).astype(float)
    y_external = np.asarray(labels, dtype=int)
    probabilities, _ = training.ensemble_proba(final_members, X_external)
    predictions = (probabilities >= training_threshold).astype(int)
    metrics = metric_dict(y_external, probabilities, predictions)
    return {
        "status": "complete",
        "path": str(path.relative_to(BASE)),
        "exact_identity_overlap": 0,
        "invalid_rows": invalid,
        "external_conflicting_identity_count": len(external_conflicts),
        "unique_external_structures": len(labels),
        "threshold_from_training_oof": round(float(training_threshold), 3),
        "metrics": metrics,
    }, {
        "y_true": y_external,
        "probabilities": probabilities,
        "predictions": predictions,
        "threshold": np.full(len(y_external), training_threshold, dtype=float),
        "smiles": [canonical for canonical, _ in unique.values()],
        "identity_key": list(unique),
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
    parser.add_argument(
        "--validation-profile",
        choices=("auto", "full", "large", "quick"),
        default="auto",
        help=(
            "auto uses full validation below 5,000 rows and large validation otherwise; "
            "large keeps OOF + scaffold CV but skips costly nested CV; quick runs OOF only"
        ),
    )
    parser.add_argument(
        "--max-training-rows-per-endpoint",
        type=int,
        default=0,
        help=(
            "deterministic per-endpoint compute cap; 0 uses every eligible identity. "
            "All experimental/reviewed rows are retained before weak PubChem rows."
        ),
    )
    parser.add_argument(
        "--max-positive-negative-ratio",
        type=float,
        default=10.0,
        help=(
            "cap retained positives at this multiple of the negatives actually "
            "available for the endpoint; 0 disables the cap and reproduces the "
            "previous label-blind sampling. Every negative identity is always kept."
        ),
    )
    args = parser.parse_args()
    if args.max_training_rows_per_endpoint < 0:
        parser.error("--max-training-rows-per-endpoint cannot be negative")
    if args.max_positive_negative_ratio < 0:
        parser.error("--max-positive-negative-ratio cannot be negative")
    selected_datasets = {
        endpoint: path for endpoint, path in training.DATASETS.items()
        if args.endpoint is None or endpoint == args.endpoint
    }
    OUT.mkdir(parents=True, exist_ok=True)
    plots_root = OUT / "plots"
    plot_algorithm_pipeline(plots_root)
    plot_training_preflight(selected_datasets, plots_root)
    missing = [
        path.name for endpoint, path in selected_datasets.items()
        if (args.endpoint is None or endpoint == args.endpoint) and not path.exists()
    ]
    if missing:
        blocked = {
            "status": "blocked_missing_raw_datasets",
            "missing": missing,
            "required_paths": [str(path.relative_to(BASE)) for path in selected_datasets.values()],
            "message": "Candidate training was not started because authentic endpoint labels are unavailable. No labels were inferred from Production predictions.",
        }
        (OUT / "training_blocked.json").write_text(json.dumps(blocked, ensure_ascii=False, indent=2), encoding="utf-8")
        (OUT / "TRAINING_BLOCKED.md").write_text(
            "# Candidate-v2 training blocked\n\n"
            "Training did not start because the following authentic raw datasets are missing:\n\n"
            + "".join(f"- `data/raw/{name}`\n" for name in missing)
            + "\nRalphGuard intentionally does not reconstruct labels from Production predictions, because that would create circular validation and data leakage.\n",
            encoding="utf-8",
        )
        print("ERROR: Candidate training requires authentic base raw datasets. Missing: " + ", ".join(missing), file=sys.stderr)
        print(f"preflight plots: {plots_root}")
        print(f"blocker report: {OUT / 'TRAINING_BLOCKED.md'}")
        return 4

    production_reference = load_production_reference()
    endpoints = [args.endpoint] if args.endpoint else list(training.DATASETS)
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_directory": str(OUT.relative_to(BASE)),
        "production_models_modified": False,
        "promotion_status": "manual_review_required",
        "runtime_versions": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "rdkit": rdkit.__version__,
            "scikit-learn": sklearn.__version__,
        },
        "identity_policy": "InChIKey primary; canonical isomeric SMILES fallback",
        "training_evidence_policy": {
            "base": "weight 1.0",
            "external_experimental": "peer-reviewed curated OECD experimental negative, weight 0.9; no missing-hazard inference",
            "nice_reviewed": "human-reviewed NICE/ICE reference evidence, weight 1.0",
            "pubchem_reviewed": "single regulatory source weight 0.25; multi-source consensus weight 0.5; manual review weight 1.0",
            "class_balance": "each class receives equal total optimization weight after evidence-quality weights are applied",
        },
        "protocol_notes": {
            "oof": "same 5-fold stratified OOF metric style as current production report for like-for-like comparison",
            "nested": "outer-test predictions use thresholds selected only from the outer-training data",
            "scaffold": "outer folds separate Bemis-Murcko scaffold groups where available",
            "external": "computed only if exact train/external molecular overlap is zero",
        },
        "validation_profile_requested": args.validation_profile,
        "endpoints": {},
    }

    for endpoint in endpoints:
        feature_mode = training.FEATURE_MODE[endpoint]
        (
            X,
            X_morgan,
            y,
            smiles,
            sample_weight,
            train_identity_keys,
            training_origins,
            data_stats,
        ) = load_candidate_endpoint(
            endpoint,
            feature_mode,
            args.max_training_rows_per_endpoint,
            args.max_positive_negative_ratio,
        )
        if len(np.unique(y)) < 2:
            raise ValueError(f"{endpoint} training data must contain both positive and negative labels")
        validation_profile = args.validation_profile
        if validation_profile == "auto":
            validation_profile = "large" if len(y) >= 5_000 else "full"
        model_profile = "large" if validation_profile in {"large", "quick"} else "standard"
        training.configure_training_profile(model_profile)
        oof_metrics, final_threshold, oof_payload = oof_validation(X, y, sample_weight)
        oof_metrics["metrics_by_training_origin"] = metrics_by_origin(
            y,
            oof_payload["probabilities"],
            oof_payload["predictions"],
            training_origins,
        )
        if validation_profile == "full":
            nested_metrics, nested_payload = nested_stratified_cv(X, y, sample_weight)
        else:
            nested_metrics, nested_payload = ({
                "status": "not_run_by_validation_profile",
                "profile": validation_profile,
                "reason": "nested CV is intentionally omitted to keep large-data training computationally bounded",
            }, None)
        if validation_profile == "quick":
            scaffold_metrics, scaffold_payload = ({
                "status": "not_run_by_validation_profile",
                "profile": validation_profile,
                "reason": "quick profile runs OOF validation only",
            }, None)
        else:
            scaffold_metrics, scaffold_payload = scaffold_grouped_cv(
                X,
                y,
                smiles,
                sample_weight,
                threshold_mode="fixed_0.5" if validation_profile == "large" else "inner_oof",
            )
        final_members = training.fit_members(X, y, sample_weight)
        effective_weight = training.effective_sample_weights(y, sample_weight)
        external, external_payload = evaluate_external(
            endpoint,
            feature_mode,
            train_identity_keys,
            final_members,
            final_threshold,
        )

        # Preserve sample identity next to every internal prediction so plots can
        # always be traced back to the exact cleaned molecule.
        for payload in (oof_payload, nested_payload, scaffold_payload):
            if payload is not None:
                payload["smiles"] = smiles
                payload["identity_key"] = train_identity_keys
                payload["training_origin"] = training_origins

        endpoint_plots = plots_root / endpoint
        plot_data_profile(endpoint, y, data_stats, endpoint_plots)
        validation_outputs = [
            ("OOF validation", oof_metrics, oof_payload, "02_oof_validation", "oof_predictions.csv"),
            ("Nested stratified CV", nested_metrics, nested_payload, "03_nested_cv", "nested_predictions.csv"),
            ("Scaffold-grouped CV", scaffold_metrics, scaffold_payload, "04_scaffold_cv", "scaffold_predictions.csv"),
            (
                "Independent external validation",
                external.get("metrics", external),
                external_payload,
                "05_external_validation",
                "external_predictions.csv",
            ),
        ]
        for stage, metrics, payload, stem, csv_name in validation_outputs:
            plot_validation(endpoint, stage, metrics, payload, endpoint_plots, stem)
            export_predictions(payload, endpoint_plots / csv_name)

        bundle = {
            "format": "ensemble_v2_candidate",
            "candidate_version": 2,
            "validation_profile": validation_profile,
            "model_resource_profile": model_profile,
            "members": final_members,
            "member_names": training.MEMBER_NAMES,
            "feature_mode": feature_mode,
            "threshold": final_threshold,
            "train_fps": [value for value in X_morgan],
            "train_smiles": smiles,
            "train_identity_keys": train_identity_keys,
            "metrics": oof_metrics,
            "validation": {"nested_stratified": nested_metrics, "scaffold_grouped": scaffold_metrics, "external": external},
            "endpoint": endpoint,
            "label": training.ENDPOINT_NAMES[endpoint],
            "data_integrity": data_stats,
            "training_sample_weight_summary": {
                "min": float(sample_weight.min()),
                "max": float(sample_weight.max()),
                "mean": float(sample_weight.mean()),
                "effective_min": float(effective_weight.min()),
                "effective_max": float(effective_weight.max()),
                "effective_mean": float(effective_weight.mean()),
                "effective_total_by_class": {
                    "negative": float(effective_weight[y == 0].sum()),
                    "positive": float(effective_weight[y == 1].sum()),
                },
            },
            "production_models_modified": False,
        }
        identity_index_path = OUT / f"{endpoint}_training_identities.csv.gz"
        pd.DataFrame(
            {
                "endpoint": endpoint,
                "identity_key": train_identity_keys,
                "canonical_smiles": smiles,
                "exposure_role": "training",
            }
        ).to_csv(identity_index_path, index=False, compression="gzip")
        bundle["training_identity_index"] = {
            "file": identity_index_path.name,
            "sha256": hashlib.sha256(identity_index_path.read_bytes()).hexdigest(),
            "count": len(train_identity_keys),
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
                "validation_profile": validation_profile,
                "model_resource_profile": model_profile,
                **data_stats,
            },
            "candidate_oof": oof_metrics,
            "candidate_nested_stratified": nested_metrics,
            "candidate_scaffold_grouped": scaffold_metrics,
            "external": external,
            "production_reference": production,
            "candidate_oof_minus_production_oof": delta,
        }
        comparison = {
            "Production OOF": production if isinstance(production, dict) else {},
            "Candidate OOF": oof_metrics,
            "Nested CV": nested_metrics,
            "Scaffold CV": scaffold_metrics,
            "External": external.get("metrics", {}) if external.get("status") == "complete" else {},
        }
        plot_model_comparison(endpoint, comparison, endpoint_plots)
        plot_evidence_origin_performance(
            endpoint,
            oof_metrics.get("metrics_by_training_origin", {}),
            endpoint_plots,
        )
        print(
            f"{endpoint}: n={len(y)} AUC={oof_metrics.get('auc')} MCC={oof_metrics.get('mcc')} "
            f"nested_AUC={nested_metrics.get('auc')} scaffold_AUC={scaffold_metrics.get('auc')} "
            f"external={external.get('status')}",
            flush=True,
        )

    (OUT / "validation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_training_report(report, OUT)
    # A successful run supersedes blocker markers written by an earlier
    # preflight failure.  Leaving them beside the completed report makes the
    # candidate directory contradict itself and can mislead reviewers.
    clear_stale_blocker_markers(OUT)
    print(f"candidate report: {OUT / 'validation_report.json'}")
    print(f"candidate plots: {plots_root}")
    print(f"candidate explanation: {OUT / 'TRAINING_REPORT.md'}")
    print("Production model files were not modified. Review candidate metrics before promotion.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
