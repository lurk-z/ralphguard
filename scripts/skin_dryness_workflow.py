"""Evidence-gated Skin Dryness preparation, benchmark, and candidate training.

This module is intentionally callable from the project notebook.  It never
writes production artifacts and refuses supervised fitting unless both classes
remain after identity, provenance, conflict, and holdout checks.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import pickle
import platform
import re
import subprocess
import sys
from typing import Any, Iterable

import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from rdkit.Chem.Scaffolds import MurckoScaffold
import rdkit
import sklearn
import matplotlib.pyplot as plt

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "scientific"))

import data_prep as training  # noqa: E402
from applicability import check_applicability_domain  # noqa: E402
from scripts.train_candidate_v2 import (  # noqa: E402
    evaluate_external,
    metric_dict,
    metrics_by_origin,
    oof_validation,
    scaffold_grouped_cv,
)
from scripts.training_visualization import plot_validation  # noqa: E402

ENDPOINT = "skin_dryness"
FEATURE_MODES = ("morgan", "maccs_descr", "morgan_maccs_descr", "descr")
TARGET_POOL_SIZE = 10_000
TARGET_VALIDATED_ACCURACY = 0.85
CURATED_PATH = BASE / "data" / "curated" / "skin_dryness_training.csv"
MANIFEST_PATH = BASE / "data" / "curated" / "skin_dryness_manifest.json"
REVIEW_PATH = BASE / "data" / "staging" / "skin_dryness_review_queue.csv"
UNLABELED_PATH = BASE / "data" / "staging" / "skin_dryness_unlabeled_pool.csv"
EXTERNAL_PATH = BASE / "data" / "external" / "skin_dryness.csv"
CANDIDATE_DIR = BASE / "scientific" / "models" / "candidate_v3"
MIN_TRAINING_PER_CLASS_FOR_PROMOTION = 25
MIN_EXTERNAL_PER_CLASS_FOR_PROMOTION = 15
ALLOWED_ATOMIC_NUMBERS = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53}
PROTECTED_ENDPOINTS = ("skin", "eye", "sens", "acute")

TIER_RANK = {"A": 0, "B": 1, "C": 2, "D": 3}
TIER_WEIGHT = {"A": 1.0, "B": 0.9, "C": 0.5, "D": 0.25}
LABEL_POLICY_VERSION = "1.1-exposure-aware"
EVIDENCE_SCHEMA = (
    "record_id", "compound_name", "pubchem_cid", "cas_number",
    "raw_smiles", "canonical_smiles", "inchi", "inchikey", "endpoint",
    "candidate_label", "label_status", "label_quality", "evidence_type",
    "evidence_subtype", "hazard_codes", "measurement_type",
    "measurement_value", "measurement_unit", "baseline_value", "control_value",
    "statistical_significance", "exposure_route", "exposure_concentration",
    "concentration_unit", "exposure_duration", "duration_unit",
    "exposure_frequency", "test_system", "species", "model_name", "source_name",
    "source_id", "source_url", "doi", "publication_year", "source_quality",
    "evidence_tier", "sample_weight", "review_status", "reviewer",
    "reviewer_note", "reviewed_at", "retrieved_at", "raw_file", "raw_sha256",
    "evidence_fingerprint",
)
EXPLICIT_NEGATIVE_SUBTYPES = {
    "no_observed_dryness_or_cracking",
    "no_significant_tewl_increase",
    "no_significant_hydration_decrease",
    "no_skin_barrier_impairment",
}
TRAINING_REVIEW_STATUSES = {
    "reviewed_positive",
    "reviewed_negative",
    "consensus_verified",
    "verified",
}


def current_git_commit() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=BASE,
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "unavailable"


def _plot_feature_benchmark(benchmark: dict[str, Any], output_dir: Path) -> None:
    modes = list(FEATURE_MODES)
    oof_mcc = [float(benchmark["results"][mode]["oof"].get("mcc") or 0.0) for mode in modes]
    scaffold_mcc = [float(benchmark["results"][mode]["scaffold"].get("mcc") or 0.0) for mode in modes]
    positions = np.arange(len(modes))
    fig, axis = plt.subplots(figsize=(9, 5))
    axis.bar(positions - 0.18, oof_mcc, 0.36, label="OOF MCC", color="#0F766E")
    axis.bar(positions + 0.18, scaffold_mcc, 0.36, label="Scaffold MCC", color="#2563EB")
    axis.set_xticks(positions, modes)
    axis.set_ylim(-1.0, 1.0)
    axis.axhline(0, color="#64748B", linewidth=0.8)
    axis.set_ylabel("Matthews correlation coefficient")
    axis.set_title(f"Skin Dryness feature benchmark — selected {benchmark['selected_feature_mode']}")
    axis.legend()
    axis.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    output_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_dir / "01_feature_benchmark.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _protected_model_hashes() -> dict[str, str | None]:
    """Snapshot production artifacts so candidate training cannot hide a write."""
    return {
        endpoint: sha256_file(BASE / "scientific" / "models" / f"{endpoint}_model.pkl")
        if (BASE / "scientific" / "models" / f"{endpoint}_model.pkl").exists()
        else None
        for endpoint in PROTECTED_ENDPOINTS
    }


def _verify_manifest_files(manifest: dict[str, Any]) -> dict[str, Any]:
    results: dict[str, Any] = {}
    for role, item in manifest.get("files", {}).items():
        relative = str(item.get("path") or "")
        expected = str(item.get("sha256") or "")
        path = BASE / relative if relative else None
        actual = sha256_file(path) if path is not None and path.is_file() else None
        results[str(role)] = {
            "path": relative,
            "expected_sha256": expected or None,
            "actual_sha256": actual,
            "valid": bool(expected and actual == expected),
        }
    return {
        "files": results,
        "all_valid": bool(results) and all(item["valid"] for item in results.values()),
    }


def molecular_identity(smiles: Any) -> tuple[str, str] | None:
    molecule = Chem.MolFromSmiles(str(smiles or "").strip())
    if molecule is None:
        return None
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    try:
        inchi = Chem.MolToInchi(molecule)
        inchikey = Chem.InchiToInchiKey(inchi) if inchi else ""
    except Exception:
        inchikey = ""
    return inchikey or f"SMILES:{canonical}", canonical


def _qsar_eligible(smiles: Any) -> bool:
    molecule = Chem.MolFromSmiles(str(smiles or "").strip())
    if molecule is None:
        return False
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    return bool(
        "." not in canonical
        and all(atom.GetAtomicNum() in ALLOWED_ATOMIC_NUMBERS for atom in molecule.GetAtoms())
        and 2 <= molecule.GetNumHeavyAtoms() <= 36
        and 30 <= Descriptors.MolWt(molecule) <= 500
    )


def _normalized_label(value: Any) -> int | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    try:
        label = int(float(value))
    except (TypeError, ValueError):
        return None
    return label if label in {0, 1} else None


def _evidence_fingerprint(row: pd.Series, identity: str) -> str:
    payload = {
        "identity": identity,
        "endpoint": ENDPOINT,
        "source": str(row.get("source_name") or row.get("source") or ""),
        "source_id": str(row.get("source_id") or row.get("doi") or ""),
        "evidence_subtype": str(row.get("evidence_subtype") or ""),
        "label": _normalized_label(row.get("candidate_label", row.get("label"))),
        "measurement": str(row.get("measurement_type") or ""),
        "exposure_route": str(row.get("exposure_route") or ""),
        "exposure_concentration": str(row.get("exposure_concentration") or ""),
        "concentration_unit": str(row.get("concentration_unit") or ""),
        "exposure_duration": str(row.get("exposure_duration") or ""),
        "duration_unit": str(row.get("duration_unit") or ""),
        "test_system": str(row.get("test_system") or ""),
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def _context_value(value: Any) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "unspecified"
    normalized = re.sub(r"\s+", " ", str(value).strip().casefold())
    return normalized or "unspecified"


def _exposure_signature(row: pd.Series) -> str:
    """Comparable observation context; never silently majority-vote across it."""
    fields = (
        "exposure_route", "exposure_concentration", "concentration_unit",
        "exposure_duration", "duration_unit", "exposure_frequency",
        "measurement_type", "test_system", "species",
    )
    return "|".join(_context_value(row.get(field)) for field in fields)


def _scaffold_key(smiles: str, identity_key: str) -> str:
    molecule = Chem.MolFromSmiles(str(smiles))
    if molecule is None:
        return "INVALID"
    scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=molecule)
    return scaffold or f"ACYCLIC:{identity_key}"


def prepare_evidence_pool(
    candidates: pd.DataFrame,
    *,
    external_holdout: pd.DataFrame | None = None,
    target_pool_size: int = TARGET_POOL_SIZE,
    write_outputs: bool = True,
) -> dict[str, Any]:
    """Audit source-attributed evidence and export only eligible labels.

    Unlabeled rows remain useful for discovery/AD analysis but never enter the
    supervised CSV.  Label 0 requires an explicit-negative subtype.
    """
    frame = candidates.copy()
    schema_defaults = {column: "" for column in EVIDENCE_SCHEMA}
    schema_defaults.update({
        "endpoint": ENDPOINT,
        "label_status": "unlabeled",
        "label_quality": "unlabeled",
        "evidence_tier": "D",
        "review_status": "pending",
        "evidence_subtype": "",
        "source_name": "",
        "source_url": "",
    })
    for column, default in schema_defaults.items():
        if column not in frame.columns:
            frame[column] = default
    if "smiles" not in frame.columns and "canonical_smiles" in frame.columns:
        frame["smiles"] = frame["canonical_smiles"]
    if "smiles" not in frame.columns:
        raise ValueError("skin dryness evidence requires smiles or canonical_smiles")

    identities = frame["smiles"].map(molecular_identity)
    frame["identity_key"] = identities.map(lambda value: value[0] if value else None)
    frame["canonical_smiles"] = identities.map(lambda value: value[1] if value else None)
    computed_qsar_eligible = frame["canonical_smiles"].map(_qsar_eligible)
    source_qsar_flag = frame.get("qsar_eligible", pd.Series(index=frame.index, dtype=object))
    source_explicit_false = source_qsar_flag.astype(str).str.strip().str.casefold().isin(
        {"false", "0", "no"}
    )
    frame["qsar_eligible_normalized"] = computed_qsar_eligible & ~source_explicit_false
    label_source = (
        frame["candidate_label"]
        if "candidate_label" in frame.columns
        else frame.get("label", pd.Series(index=frame.index, dtype=object))
    )
    frame["normalized_label"] = label_source.map(_normalized_label)
    frame["evidence_tier"] = frame["evidence_tier"].astype(str).str.upper()
    frame["tier_rank"] = frame["evidence_tier"].map(TIER_RANK)
    frame["exposure_signature"] = frame.apply(_exposure_signature, axis=1)
    frame["evidence_fingerprint"] = [
        _evidence_fingerprint(row, str(row.get("identity_key") or "invalid"))
        for _, row in frame.iterrows()
    ]

    invalid_structure = frame["identity_key"].isna()
    outside_qsar_domain = ~frame["qsar_eligible_normalized"]
    wrong_endpoint = frame["endpoint"].astype(str) != ENDPOINT
    label_zero = frame["normalized_label"] == 0
    invalid_negative = label_zero & ~frame["evidence_subtype"].astype(str).isin(EXPLICIT_NEGATIVE_SUBTYPES)
    missing_provenance = (
        frame["source_name"].astype(str).str.strip().eq("")
        | frame["source_url"].astype(str).str.strip().eq("")
    )
    reviewed = frame["review_status"].astype(str).isin(TRAINING_REVIEW_STATUSES)
    labeled = frame["normalized_label"].isin([0, 1])
    known_tier = frame["tier_rank"].notna()
    eligible = ~(
        invalid_structure | outside_qsar_domain | wrong_endpoint | invalid_negative | missing_provenance
    )
    eligible &= reviewed & labeled & known_tier

    holdout_ids: set[str] = set()
    if external_holdout is not None and not external_holdout.empty:
        external_smiles = external_holdout.get("smiles", external_holdout.get("canonical_smiles"))
        if external_smiles is not None:
            holdout_ids = {
                value[0]
                for value in external_smiles.map(molecular_identity)
                if value is not None
            }
    holdout_mask = frame["identity_key"].isin(holdout_ids)
    eligible &= ~holdout_mask

    candidate = frame[eligible].copy()
    candidate["best_rank"] = candidate.groupby("identity_key")["tier_rank"].transform("min")
    best = candidate[candidate["tier_rank"] == candidate["best_rank"]].copy()
    label_counts = best.groupby("identity_key")["normalized_label"].nunique()
    conflicts = set(label_counts[label_counts > 1].index)
    context_label_counts = best.groupby(
        ["identity_key", "exposure_signature"]
    )["normalized_label"].nunique()
    same_condition_conflicts = {
        identity
        for identity, _context in context_label_counts[context_label_counts > 1].index
    }
    exposure_dependent_identities = conflicts.difference(same_condition_conflicts)
    training_rows = best[~best["identity_key"].isin(conflicts)].copy()
    training_rows = training_rows.sort_values(
        ["identity_key", "tier_rank", "evidence_fingerprint"], kind="stable"
    ).drop_duplicates("identity_key", keep="first")
    training_rows["label"] = training_rows["normalized_label"].astype(int)
    training_rows["sample_weight"] = training_rows["evidence_tier"].map(TIER_WEIGHT).astype(float)
    training_rows["training_origin"] = training_rows["label_quality"].astype(str)

    unlabeled = frame[
        frame["identity_key"].notna() & ~frame["normalized_label"].isin([0, 1])
    ].drop_duplicates("identity_key")
    # Ordinary structure-only/unlabeled discovery rows belong only in the
    # unlabeled pool. Review queue is reserved for attempted labels or explicit
    # review-required candidates, avoiding a meaningless 10k-item queue.
    review_mask = (
        (labeled & ~eligible & ~invalid_structure)
        | frame["label_status"].astype(str).eq("review_required")
        | frame["identity_key"].isin(conflicts)
    )
    review = frame[review_mask].copy()
    review["review_reason"] = "review_required"
    review.loc[invalid_negative, "review_reason"] = "negative_requires_explicit_evidence"
    review.loc[outside_qsar_domain & ~invalid_structure, "review_reason"] = "not_qsar_eligible"
    review.loc[missing_provenance, "review_reason"] = "missing_source_provenance"
    review.loc[holdout_mask, "review_reason"] = "reserved_holdout_identity"
    review.loc[
        frame["identity_key"].isin(same_condition_conflicts), "review_reason"
    ] = "same_tier_same_exposure_conflict"
    review.loc[
        frame["identity_key"].isin(exposure_dependent_identities), "review_reason"
    ] = "exposure_dependent_identity_requires_review"

    external_unique = 0
    external_positive = 0
    external_negative = 0
    external_scaffold_overlap = 0
    if external_holdout is not None and not external_holdout.empty:
        external_audit = external_holdout.copy()
        if "smiles" not in external_audit and "canonical_smiles" in external_audit:
            external_audit["smiles"] = external_audit["canonical_smiles"]
        external_audit["identity"] = external_audit["smiles"].map(molecular_identity)
        external_audit = external_audit[external_audit["identity"].notna()].copy()
        external_audit["identity_key"] = external_audit["identity"].map(lambda item: item[0])
        external_audit["canonical"] = external_audit["identity"].map(lambda item: item[1])
        external_audit["normalized_label"] = external_audit.get(
            "label", pd.Series(index=external_audit.index, dtype=object)
        ).map(_normalized_label)
        external_audit = external_audit.drop_duplicates("identity_key")
        external_unique = int(len(external_audit))
        external_positive = int((external_audit["normalized_label"] == 1).sum())
        external_negative = int((external_audit["normalized_label"] == 0).sum())
        train_scaffolds = {
            _scaffold_key(str(row["canonical_smiles"]), str(row["identity_key"]))
            for _, row in training_rows.iterrows()
        }
        external_scaffolds = {
            _scaffold_key(str(row["canonical"]), str(row["identity_key"]))
            for _, row in external_audit.iterrows()
        }
        external_scaffold_overlap = len(train_scaffolds.intersection(external_scaffolds))

    tier_distribution = {
        tier: int((training_rows["evidence_tier"] == tier).sum()) for tier in TIER_RANK
    }
    quality_distribution = {
        str(key): int(value)
        for key, value in training_rows["label_quality"].value_counts().sort_index().items()
    }

    manifest = {
        "dataset": "skin_dryness_evidence_pool_v2",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "label_policy_version": LABEL_POLICY_VERSION,
        "target_pool": int(target_pool_size),
        "counts": {
            "total_pool": int(len(frame)),
            "unique_inchikey": int(frame["identity_key"].nunique()),
            "valid_structures": int((~invalid_structure).sum()),
            "qsar_eligible": int(frame["qsar_eligible_normalized"].sum()),
            "training_eligible": int(len(training_rows)),
            "experimental_ground_truth": int((training_rows["evidence_tier"] == "A").sum()),
            "curated_labeled": int((training_rows["evidence_tier"] == "B").sum()),
            "regulatory_weak_positive": int(
                ((training_rows["evidence_tier"].isin(["C", "D"])) & (training_rows["label"] == 1)).sum()
            ),
            "positive_count": int((training_rows["label"] == 1).sum()),
            "negative_count": int((training_rows["label"] == 0).sum()),
            "unlabeled": int(len(unlabeled)),
            "review_queue": int(len(review)),
            "same_tier_conflicts": int(len(conflicts)),
            "same_tier_same_exposure_conflicts": int(len(same_condition_conflicts)),
            "exposure_dependent_review": int(len(exposure_dependent_identities)),
            "external_quarantined": int(holdout_mask.sum()),
            "external_unique_identities": external_unique,
            "external_positive_count": external_positive,
            "external_negative_count": external_negative,
            "train_external_exact_overlap_after_quarantine": 0,
            "train_external_scaffold_overlap": int(external_scaffold_overlap),
            "duplicate_evidence_rows": int(len(frame) - frame["evidence_fingerprint"].nunique()),
            "duplicate_identity_rows": int((~invalid_structure).sum() - frame["identity_key"].nunique()),
            "remaining_pool_gap": max(0, int(target_pool_size) - int(frame["identity_key"].nunique())),
        },
        "evidence_tier_distribution": tier_distribution,
        "training_label_quality_distribution": quality_distribution,
        "tier_weights": TIER_WEIGHT,
        "aggregation_policy": (
            "highest evidence tier per exact identity; same-tier opposite labels with "
            "the same exposure are quarantined as conflicts; opposite labels under "
            "different exposure contexts require review; no majority vote"
        ),
        "minimum_pool_met": int(frame["identity_key"].nunique()) >= int(target_pool_size),
        "supervised_fit_ready": bool(
            len(training_rows) > 0 and training_rows["label"].nunique() == 2
        ),
        "negative_policy": "explicit negative evidence only; absence of EUH066/AUH066 is not label 0",
        "production_models_modified": False,
    }

    if write_outputs:
        for path in (CURATED_PATH, MANIFEST_PATH, REVIEW_PATH, UNLABELED_PATH):
            path.parent.mkdir(parents=True, exist_ok=True)
        keep_columns = [column for column in EVIDENCE_SCHEMA if column in training_rows.columns]
        keep_columns += [
            column for column in ("label", "identity_key", "training_origin", "exposure_signature")
            if column in training_rows.columns and column not in keep_columns
        ]
        training_rows[keep_columns].rename(
            columns={"canonical_smiles": "smiles"}
        ).to_csv(CURATED_PATH, index=False)
        review.to_csv(REVIEW_PATH, index=False)
        unlabeled.to_csv(UNLABELED_PATH, index=False)
        manifest["files"] = {
            "training": {"path": str(CURATED_PATH.relative_to(BASE)), "sha256": sha256_file(CURATED_PATH)},
            "review": {"path": str(REVIEW_PATH.relative_to(BASE)), "sha256": sha256_file(REVIEW_PATH)},
            "unlabeled": {"path": str(UNLABELED_PATH.relative_to(BASE)), "sha256": sha256_file(UNLABELED_PATH)},
        }
        external_manifest_path = EXTERNAL_PATH.with_name("skin_dryness_manifest.json")
        if EXTERNAL_PATH.exists():
            manifest["files"]["external"] = {
                "path": str(EXTERNAL_PATH.relative_to(BASE)),
                "sha256": sha256_file(EXTERNAL_PATH),
            }
        if external_manifest_path.exists():
            manifest["files"]["external_manifest"] = {
                "path": str(external_manifest_path.relative_to(BASE)),
                "sha256": sha256_file(external_manifest_path),
            }
        MANIFEST_PATH.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return {"manifest": manifest, "training": training_rows, "review": review, "unlabeled": unlabeled}


def load_training_matrix(path: Path, feature_mode: str):
    frame = pd.read_csv(path)
    required = {"smiles", "label", "sample_weight"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"{path} missing {sorted(missing)}")
    identities = frame["smiles"].map(molecular_identity)
    frame["identity_key"] = identities.map(lambda value: value[0] if value else None)
    frame["canonical"] = identities.map(lambda value: value[1] if value else None)
    frame = frame.dropna(subset=["identity_key", "canonical"]).drop_duplicates("identity_key")
    frame["label"] = frame["label"].map(_normalized_label)
    frame = frame.dropna(subset=["label"])
    if frame["label"].nunique() != 2:
        raise ValueError("Skin Dryness candidate requires verified positive and explicit negative classes")
    features, morgans = [], []
    for canonical in frame["canonical"]:
        molecule = Chem.MolFromSmiles(canonical)
        features.append(training.featurize_mol(molecule, feature_mode))
        morgans.append(training.morgan_bits(molecule))
    return (
        np.vstack(features).astype(np.float32, copy=False),
        np.vstack(morgans),
        frame["label"].astype(int).to_numpy(),
        frame["canonical"].astype(str).tolist(),
        frame["sample_weight"].astype(float).to_numpy(),
        frame["identity_key"].astype(str).tolist(),
        frame.get("training_origin", pd.Series(["unknown"] * len(frame))).astype(str).tolist(),
    )


def benchmark_features(
    training_path: Path = CURATED_PATH,
    *,
    validation_profile: str = "full",
) -> dict[str, Any]:
    """Benchmark all required feature modes without selecting by AUC alone."""
    results: dict[str, Any] = {}
    for mode in FEATURE_MODES:
        X, _morgan, y, smiles, weights, _ids, _origins = load_training_matrix(training_path, mode)
        oof, threshold, _ = oof_validation(X, y, weights)
        scaffold, _ = scaffold_grouped_cv(
            X, y, smiles, weights,
            threshold_mode="inner_oof" if validation_profile == "full" else "fixed_0.5",
        )
        results[mode] = {"oof": oof, "scaffold": scaffold, "threshold": threshold, "dimensions": int(X.shape[1])}

    def rank_key(mode: str):
        item = results[mode]
        scaffold = item["scaffold"]
        complete = scaffold.get("status") == "complete"
        return (
            1 if complete else 0,
            float(scaffold.get("mcc") or -1.0),
            float(scaffold.get("balanced_accuracy") or -1.0),
            float(item["oof"].get("mcc") or -1.0),
            float(item["oof"].get("auc") or -1.0),
            -int(item["dimensions"]),
        )

    selected = max(FEATURE_MODES, key=rank_key)
    return {
        "endpoint": ENDPOINT,
        "selection_policy": "scaffold status > scaffold MCC > scaffold balanced accuracy > OOF MCC > OOF AUC > lower dimension",
        "selected_feature_mode": selected,
        "results": results,
    }


def _grouped_oof_metrics(payload: dict[str, Any] | None, origins: list[str]) -> dict[str, Any]:
    if not payload:
        return {}
    y_true = np.asarray(payload["y_true"])
    probabilities = np.asarray(payload["probabilities"])
    predictions = np.asarray(payload["predictions"])
    origin_array = np.asarray(origins)
    return metrics_by_origin(y_true, probabilities, predictions, origin_array.tolist())


def _external_diagnostics(
    *,
    external: dict[str, Any],
    payload: dict[str, Any] | None,
    mode: str,
    members: list[Any],
    train_smiles: list[str],
    train_fps: np.ndarray,
    source_overlap: list[str],
    training_frame: pd.DataFrame,
    external_frame: pd.DataFrame,
) -> dict[str, Any]:
    """Explain external failure without changing or tuning against the holdout."""
    if external.get("status") != "complete" or not payload:
        return {
            "status": "unavailable",
            "external_status": external.get("status"),
            "exact_identity_overlap": external.get("exact_identity_overlap"),
        }
    ext_smiles = [str(value) for value in payload.get("smiles", [])]
    y_true = np.asarray(payload["y_true"], dtype=int)
    probabilities = np.asarray(payload["probabilities"], dtype=float)
    predictions = np.asarray(payload["predictions"], dtype=int)
    ext_features: list[np.ndarray] = []
    domain_rows: list[dict[str, Any]] = []
    for smiles in ext_smiles:
        molecule = Chem.MolFromSmiles(smiles)
        if molecule is None:
            continue
        ext_features.append(training.featurize_mol(molecule, mode))
        fingerprint = training.morgan_bits(molecule)
        in_domain, similarity = check_applicability_domain(
            fingerprint, list(train_fps)
        )
        domain_rows.append(
            {"smiles": smiles, "in_domain": bool(in_domain), "domain_similarity": float(similarity)}
        )
    uncertainty = []
    if ext_features:
        _, member_disagreement = training.ensemble_proba(
            members, np.vstack(ext_features).astype(float)
        )
        uncertainty = [float(value) for value in member_disagreement]
    for index, row in enumerate(domain_rows):
        row.update(
            {
                "label": int(y_true[index]),
                "probability": float(probabilities[index]),
                "prediction": int(predictions[index]),
                "ensemble_disagreement": uncertainty[index] if index < len(uncertainty) else None,
            }
        )
    train_scaffolds = {
        _scaffold_key(smiles, molecular_identity(smiles)[0])
        for smiles in train_smiles if molecular_identity(smiles)
    }
    external_scaffolds = {
        _scaffold_key(smiles, molecular_identity(smiles)[0])
        for smiles in ext_smiles if molecular_identity(smiles)
    }
    similarities = [row["domain_similarity"] for row in domain_rows]
    in_domain_mask = np.asarray([row["in_domain"] for row in domain_rows], dtype=bool)
    blockers = []
    if len(y_true) < 30:
        blockers.append("external sample is too small for a stable final claim")
    if min(int((y_true == 0).sum()), int((y_true == 1).sum())) < MIN_EXTERNAL_PER_CLASS_FOR_PROMOTION:
        blockers.append("external class counts are below the configured minimum")
    if similarities and float(np.mean(similarities)) < 0.18:
        blockers.append("external structures are predominantly outside the endpoint applicability domain")
    if source_overlap:
        blockers.append("source-level overlap exists between training and external evidence")
    if len(train_scaffolds.intersection(external_scaffolds)) == 0:
        blockers.append("external set has no shared scaffold groups; structural distribution shift is likely")
    training_quality = Counter(
        training_frame.get("label_quality", pd.Series(dtype=str)).fillna("unknown").astype(str)
    )
    external_quality = Counter(
        external_frame.get("label_quality", pd.Series(dtype=str)).fillna("unknown").astype(str)
    )
    training_measurements = Counter(
        training_frame.get("measurement_type", pd.Series(dtype=str)).fillna("unspecified").astype(str)
    )
    external_measurements = Counter(
        external_frame.get("measurement_type", pd.Series(dtype=str)).fillna("unspecified").astype(str)
    )
    external_test_systems = Counter(
        external_frame.get("test_system", pd.Series(dtype=str)).fillna("unspecified").astype(str)
    )
    external_species = Counter(
        external_frame.get("species", pd.Series(dtype=str)).fillna("unspecified").astype(str)
    )
    weak_training = sum(
        count for origin, count in training_quality.items() if "regulatory_weak" in origin
    )
    if len(training_frame) and weak_training / len(training_frame) > 0.5:
        blockers.append("training labels are dominated by regulatory weak positives")
    if set(training_quality).isdisjoint(set(external_quality)):
        blockers.append("training and external sets have disjoint evidence-quality origins")

    def domain_subset(mask: np.ndarray) -> dict[str, Any]:
        subset_y = y_true[mask]
        subset_probability = probabilities[mask]
        subset_prediction = predictions[mask]
        counts = {
            "n": int(mask.sum()),
            "positive": int((subset_y == 1).sum()),
            "negative": int((subset_y == 0).sum()),
        }
        if counts["n"] == 0 or min(counts["positive"], counts["negative"]) < 2:
            return {
                "status": "insufficient_sample",
                **counts,
                "reason": "requires both classes with at least two observations per class",
            }
        return {"status": "complete", **counts, **metric_dict(
            subset_y, subset_probability, subset_prediction
        )}

    return {
        "status": "complete",
        "policy": "diagnostic only; external data are not used to tune features, threshold, weights, or hyperparameters",
        "external_count": int(len(y_true)),
        "class_counts": {"positive": int((y_true == 1).sum()), "negative": int((y_true == 0).sum())},
        "identity_correctness": {
            "invalid_rows": int(external.get("invalid_rows") or 0),
            "conflicting_identities": int(external.get("external_conflicting_identity_count") or 0),
            "exact_training_overlap": int(external.get("exact_identity_overlap") or 0),
        },
        "evidence_composition": {
            "training_label_quality": dict(sorted(training_quality.items())),
            "external_label_quality": dict(sorted(external_quality.items())),
            "training_measurement_type": dict(sorted(training_measurements.items())),
            "external_measurement_type": dict(sorted(external_measurements.items())),
            "external_test_system": dict(sorted(external_test_systems.items())),
            "external_species": dict(sorted(external_species.items())),
            "interpretation": (
                "The development set is regulatory-positive-heavy while the external set is "
                "source-held-out direct experimental evidence; this origin and measurement shift "
                "is reported as a limitation and is not corrected by tuning on the holdout."
            ),
        },
        "probability_by_class": {
            "positive_mean": float(probabilities[y_true == 1].mean()) if np.any(y_true == 1) else None,
            "negative_mean": float(probabilities[y_true == 0].mean()) if np.any(y_true == 0) else None,
        },
        "applicability_domain": {
            "threshold": 0.18,
            "mean_similarity": float(np.mean(similarities)) if similarities else None,
            "median_similarity": float(np.median(similarities)) if similarities else None,
            "in_domain": int(in_domain_mask.sum()),
            "out_of_domain": int((~in_domain_mask).sum()),
            "rows": domain_rows,
        },
        "performance_by_applicability_domain": {
            "in_domain": domain_subset(in_domain_mask),
            "out_of_domain": domain_subset(~in_domain_mask),
        },
        "uncertainty": {
            "definition": "standard deviation of ensemble member probabilities",
            "mean": float(np.mean(uncertainty)) if uncertainty else None,
            "maximum": float(np.max(uncertainty)) if uncertainty else None,
        },
        "scaffolds": {
            "training_unique": len(train_scaffolds),
            "external_unique": len(external_scaffolds),
            "overlap": len(train_scaffolds.intersection(external_scaffolds)),
        },
        "source_overlap": source_overlap,
        "likely_blockers": blockers,
    }


def train_candidate_from_notebook(
    training_path: Path = CURATED_PATH,
    *,
    validation_profile: str = "full",
    output_dir: Path = CANDIDATE_DIR,
) -> dict[str, Any]:
    """Benchmark and train Candidate-v3; intended to be called by the notebook."""
    protected_hashes_before = _protected_model_hashes()
    benchmark = benchmark_features(training_path, validation_profile=validation_profile)
    mode = str(benchmark["selected_feature_mode"])
    X, X_morgan, y, smiles, weights, identities, origins = load_training_matrix(training_path, mode)
    training.configure_training_profile("standard")
    oof, threshold, oof_payload = oof_validation(X, y, weights)
    scaffold, scaffold_payload = scaffold_grouped_cv(X, y, smiles, weights, threshold_mode="inner_oof")
    members = training.fit_members(X, y, weights)
    external, external_payload = evaluate_external(ENDPOINT, mode, identities, members, threshold)
    output_dir.mkdir(parents=True, exist_ok=True)
    plots_dir = output_dir / "plots" / ENDPOINT
    _plot_feature_benchmark(benchmark, plots_dir)
    plot_validation(ENDPOINT, "5-fold stratified OOF", oof, oof_payload, plots_dir, "02_oof_validation")
    plot_validation(ENDPOINT, "scaffold-grouped CV", scaffold, scaffold_payload, plots_dir, "03_scaffold_validation")
    external_metrics = external.get("metrics", external)
    plot_validation(ENDPOINT, "external holdout", external_metrics, external_payload, plots_dir, "04_external_validation")
    training_frame = pd.read_csv(training_path)
    external_frame = pd.read_csv(EXTERNAL_PATH) if EXTERNAL_PATH.exists() else pd.DataFrame()
    training_source_ids = set(training_frame.get("source_id", pd.Series(dtype=str)).dropna().astype(str))
    external_source_ids = set(external_frame.get("source_id", pd.Series(dtype=str)).dropna().astype(str))
    source_overlap = sorted(training_source_ids.intersection(external_source_ids))
    origin_metrics = _grouped_oof_metrics(oof_payload, origins)
    external_diagnostics = _external_diagnostics(
        external=external,
        payload=external_payload,
        mode=mode,
        members=members,
        train_smiles=smiles,
        train_fps=X_morgan,
        source_overlap=source_overlap,
        training_frame=training_frame,
        external_frame=external_frame,
    )
    diagnostics_path = output_dir / "skin_dryness_external_root_cause_report.json"
    diagnostics_path.write_text(
        json.dumps(external_diagnostics, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    manifest_payload = (
        json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if MANIFEST_PATH.exists()
        else {}
    )
    manifest_counts = manifest_payload.get("counts", {})
    manifest_verification = _verify_manifest_files(manifest_payload)
    external_metrics = external.get("metrics", {}) if external.get("status") == "complete" else {}
    protected_hashes_after = _protected_model_hashes()
    protected_artifacts_unchanged = protected_hashes_before == protected_hashes_after
    promotion_checks = {
        "training_contains_two_classes": len(np.unique(y)) == 2,
        "training_positive_at_least_25": int(y.sum()) >= MIN_TRAINING_PER_CLASS_FOR_PROMOTION,
        "training_negative_at_least_25": int((y == 0).sum()) >= MIN_TRAINING_PER_CLASS_FOR_PROMOTION,
        "scaffold_validation_complete": scaffold.get("status") == "complete",
        "scaffold_mcc_at_least_0_40": float(scaffold.get("mcc") or -1.0) >= 0.40,
        "oof_accuracy_at_least_0_85": float(oof.get("accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        "oof_balanced_accuracy_at_least_0_85": float(oof.get("balanced_accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        "scaffold_accuracy_at_least_0_85": float(scaffold.get("accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        "scaffold_balanced_accuracy_at_least_0_85": float(scaffold.get("balanced_accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        "external_validation_complete": external.get("status") == "complete",
        "external_positive_at_least_15": int(external_metrics.get("n_pos") or 0) >= MIN_EXTERNAL_PER_CLASS_FOR_PROMOTION,
        "external_negative_at_least_15": int(external_metrics.get("n_neg") or 0) >= MIN_EXTERNAL_PER_CLASS_FOR_PROMOTION,
        "external_accuracy_at_least_0_85": float(external_metrics.get("accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        "external_balanced_accuracy_at_least_0_85": float(external_metrics.get("balanced_accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        "external_auc_at_least_0_75": float(external_metrics.get("auc") or -1.0) >= 0.75,
        "external_mcc_at_least_0_40": float(external_metrics.get("mcc") or -1.0) >= 0.40,
        "external_exact_identity_overlap_zero": int(external.get("exact_identity_overlap") or 0) == 0,
        "external_source_overlap_zero": not source_overlap,
        "unresolved_same_tier_conflicts_zero": int(manifest_counts.get("same_tier_conflicts") or 0) == 0,
        "dataset_manifest_hashes_valid": bool(manifest_verification["all_valid"]),
        "protected_production_artifacts_unchanged": protected_artifacts_unchanged,
    }
    promotion_status = (
        "eligible_for_manual_promotion"
        if all(promotion_checks.values())
        else "research_only_blocked"
    )
    accuracy_target = {
        "target": TARGET_VALIDATED_ACCURACY,
        "primary_metric": "balanced_accuracy",
        "reason": "Balanced accuracy prevents a majority-class prediction from appearing to meet the target.",
        "oof": {
            "accuracy": oof.get("accuracy"),
            "balanced_accuracy": oof.get("balanced_accuracy"),
            "meets_target": float(oof.get("balanced_accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        },
        "scaffold_grouped": {
            "accuracy": scaffold.get("accuracy"),
            "balanced_accuracy": scaffold.get("balanced_accuracy"),
            "meets_target": float(scaffold.get("balanced_accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        },
        "external": {
            "accuracy": external_metrics.get("accuracy"),
            "balanced_accuracy": external_metrics.get("balanced_accuracy"),
            "meets_target": float(external_metrics.get("balanced_accuracy") or -1.0) >= TARGET_VALIDATED_ACCURACY,
        },
    }
    accuracy_target["all_validation_levels_meet_target"] = all(
        accuracy_target[level]["meets_target"]
        for level in ("oof", "scaffold_grouped", "external")
    )
    bundle = {
        "format": "ensemble_v2_candidate",
        "candidate_version": "candidate_v3",
        "endpoint": ENDPOINT,
        "label": "Skin Dryness Potential",
        "feature_mode": mode,
        "feature_benchmark": benchmark,
        "members": members,
        "member_names": training.MEMBER_NAMES,
        "threshold": threshold,
        "train_fps": list(X_morgan),
        "train_smiles": smiles,
        "train_identity_keys": identities,
        "metrics": oof,
        "validation": {"scaffold_grouped": scaffold, "external": external},
        "training_sources": dict(Counter(origins)),
        "evidence_origin_oof_metrics": origin_metrics,
        "external_diagnostics": external_diagnostics,
        "production_models_modified": False,
        "promotion_status": promotion_status,
        "research_preview": True,
        "promotion_checks": promotion_checks,
        "accuracy_target": accuracy_target,
        "manifest_verification": manifest_verification,
        "protected_production_artifact_hashes": {
            "before": protected_hashes_before,
            "after": protected_hashes_after,
        },
        "external_source_overlap": source_overlap,
        "random_seed": 42,
    }
    identity_index_path = output_dir / "skin_dryness_training_identities.csv.gz"
    pd.DataFrame(
        {
            "endpoint": ENDPOINT,
            "identity_key": identities,
            "canonical_smiles": smiles,
            "exposure_role": "training",
        }
    ).to_csv(identity_index_path, index=False, compression="gzip")
    bundle["training_identity_index"] = {
        "file": identity_index_path.name,
        "sha256": sha256_file(identity_index_path),
        "count": len(identities),
    }
    with (output_dir / "skin_dryness_model.pkl").open("wb") as handle:
        pickle.dump(bundle, handle)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": ENDPOINT,
        "candidate_directory": str(output_dir.relative_to(BASE)),
        "runtime_versions": {
            "python": platform.python_version(),
            "rdkit": rdkit.__version__,
            "scikit_learn": sklearn.__version__,
        },
        "git_commit": current_git_commit(),
        "random_seed": 42,
        "threshold_selection_method": "Youden's J from 5-fold OOF predictions",
        "training_profile": "standard",
        "dataset_sha256": sha256_file(training_path),
        "n": int(len(y)),
        "positive": int(y.sum()),
        "negative": int((y == 0).sum()),
        "feature_benchmark": benchmark,
        "evidence_tier_distribution": {
            str(key): int(value)
            for key, value in training_frame.get(
                "evidence_tier", pd.Series(dtype=str)
            ).value_counts().sort_index().items()
        },
        "sample_weight_distribution": {
            str(key): int(value)
            for key, value in pd.to_numeric(
                training_frame.get("sample_weight", pd.Series(dtype=float)), errors="coerce"
            ).value_counts().sort_index().items()
        },
        "evidence_origin_oof_metrics": origin_metrics,
        "candidate_oof": oof,
        "candidate_scaffold_grouped": scaffold,
        "external": external,
        "external_diagnostics": external_diagnostics,
        "external_root_cause_report": {
            "path": str(diagnostics_path.relative_to(BASE)),
            "sha256": sha256_file(diagnostics_path),
        },
        "promotion_status": promotion_status,
        "accuracy_target": accuracy_target,
        "promotion_checks": promotion_checks,
        "promotion_blockers": [
            name for name, passed in promotion_checks.items() if not passed
        ],
        "manifest_verification": manifest_verification,
        "protected_production_artifact_hashes": {
            "before": protected_hashes_before,
            "after": protected_hashes_after,
        },
        "external_source_overlap": source_overlap,
        "research_preview": True,
        "production_models_modified": False,
    }
    (output_dir / "skin_dryness_validation_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output_dir / "SKIN_DRYNESS_MODEL_CARD.md").write_text(
        "\n".join(
            [
                "# Skin Dryness Candidate-v3 Model Card",
                "",
                f"- Training rows: {len(y)} (+{int(y.sum())}/-{int((y == 0).sum())})",
                f"- Selected features: `{mode}`",
                f"- OOF accuracy / balanced accuracy: {oof.get('accuracy')} / {oof.get('balanced_accuracy')}",
                f"- OOF MCC: {oof.get('mcc')}",
                f"- Scaffold accuracy / balanced accuracy: {scaffold.get('accuracy')} / {scaffold.get('balanced_accuracy')}",
                f"- Scaffold MCC: {scaffold.get('mcc')}",
                f"- Validated balanced-accuracy target: {TARGET_VALIDATED_ACCURACY}",
                f"- All validation levels meet target: {accuracy_target['all_validation_levels_meet_target']}",
                f"- External status: `{external.get('status')}`",
                f"- Promotion: `{promotion_status}`",
                f"- External source overlap: `{source_overlap or 'none'}`",
                "",
                "This is a research-preview in-silico screening candidate, not clinical evidence. Regulatory weak positives are provenance-separated and weighted; missing hazard statements are never negative labels. Production artifacts were not modified.",
            ]
        ),
        encoding="utf-8",
    )
    return report
