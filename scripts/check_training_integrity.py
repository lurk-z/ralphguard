"""Audit RalphGuard QSAR training data before candidate retraining.

The audit combines, per endpoint:
- base ICE experimental/reference dataset
- peer-reviewed curated experimental negative rows (if present)
- human-reviewed NICE/ICE supplemental rows (if present)
- attributed PubChem regulatory weak-label supplemental rows (if present)

It checks exact molecular identity, duplicate structures, contradictory labels,
scaffold diversity and optional external-set overlap. It never trains or
modifies model artifacts.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any

import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem.Scaffolds import MurckoScaffold

RDLogger.DisableLog("rdApp.*")

BASE = Path(__file__).resolve().parents[1]
RAW_DIR = BASE / "data" / "raw"
CURATED_DIR = BASE / "data" / "curated"
EXTERNAL_DIR = BASE / "data" / "external"
MODELS_DIR = BASE / "scientific" / "models"
MANIFEST_DIR = MODELS_DIR / "training_manifests"
REPORT_PATH = MODELS_DIR / "training_integrity_report.json"
DATASET_MANIFEST_PATH = RAW_DIR / "dataset_manifest.json"

DATASETS = {
    "skin": RAW_DIR / "skin_irritation.csv",
    "eye": RAW_DIR / "eye_irritation.csv",
    "sens": RAW_DIR / "skin_sensitization.csv",
    "acute": RAW_DIR / "acute_oral_toxicity.csv",
}


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audit_dataset_manifest() -> dict[str, Any]:
    if not DATASET_MANIFEST_PATH.exists():
        return {
            "status": "missing",
            "path": str(DATASET_MANIFEST_PATH.relative_to(BASE)),
            "all_prepared_hashes_match": False,
        }
    try:
        payload = json.loads(DATASET_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "status": "invalid",
            "path": str(DATASET_MANIFEST_PATH.relative_to(BASE)),
            "reason": str(exc),
            "all_prepared_hashes_match": False,
        }

    declared = payload.get("datasets") if isinstance(payload, dict) else None
    if not isinstance(declared, dict):
        return {
            "status": "invalid",
            "path": str(DATASET_MANIFEST_PATH.relative_to(BASE)),
            "reason": "manifest.datasets must be an object",
            "all_prepared_hashes_match": False,
        }

    endpoint_results: dict[str, dict[str, Any]] = {}
    all_match = True
    for endpoint, expected_path in DATASETS.items():
        item = declared.get(endpoint)
        if not isinstance(item, dict):
            endpoint_results[endpoint] = {"status": "missing_manifest_entry"}
            all_match = False
            continue
        declared_file = str(item.get("file") or "")
        declared_hash = str(item.get("prepared_sha256") or "").casefold()
        if declared_file != expected_path.name:
            endpoint_results[endpoint] = {
                "status": "filename_mismatch",
                "expected": expected_path.name,
                "declared": declared_file,
            }
            all_match = False
            continue
        if not expected_path.exists():
            endpoint_results[endpoint] = {"status": "training_file_missing"}
            all_match = False
            continue
        actual_hash = file_sha256(expected_path)
        hash_matches = bool(re.fullmatch(r"[0-9a-f]{64}", declared_hash)) and declared_hash == actual_hash
        endpoint_results[endpoint] = {
            "status": "verified" if hash_matches else "prepared_hash_mismatch",
            "prepared_sha256_declared": declared_hash or None,
            "prepared_sha256_actual": actual_hash,
        }
        all_match = all_match and hash_matches

    return {
        "status": "verified" if all_match else "failed",
        "path": str(DATASET_MANIFEST_PATH.relative_to(BASE)),
        "all_prepared_hashes_match": all_match,
        "endpoints": endpoint_results,
    }


def molecular_identity(smiles: Any) -> dict[str, Any] | None:
    text = str(smiles or "").strip()
    if not text:
        return None
    molecule = Chem.MolFromSmiles(text)
    if molecule is None:
        return None
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    try:
        inchi = Chem.MolToInchi(molecule)
        inchikey = Chem.InchiToInchiKey(inchi) if inchi else ""
    except Exception:
        inchi = ""
        inchikey = ""
    try:
        scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=molecule) or "[acyclic]"
    except Exception:
        scaffold = "[unknown]"
    return {"canonical_smiles": canonical, "inchi": inchi, "inchikey": inchikey, "scaffold": scaffold}


def normalize_label(value: Any) -> int | None:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        return None
    return numeric if numeric in {0, 1} else None


def default_weight(origin: str) -> float:
    return 0.5 if origin == "pubchem_reviewed" else 1.0


def load_source(path: Path, origin: str) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    frame = pd.read_csv(path).copy()
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        raise ValueError(f"{path} missing required columns: {sorted(missing)}")
    frame["training_origin"] = origin
    frame["source_file"] = str(path.relative_to(BASE))
    if "sample_weight" not in frame.columns:
        frame["sample_weight"] = default_weight(origin)
    frame["sample_weight"] = pd.to_numeric(frame["sample_weight"], errors="coerce").fillna(default_weight(origin)).clip(0.05, 1.0)
    return frame


def load_external_endpoint(endpoint: str) -> tuple[pd.DataFrame, Path, str | None]:
    """Load the endpoint holdout without changing its contents."""
    path = EXTERNAL_DIR / f"{endpoint}.csv"
    if path.exists():
        frame = pd.read_csv(path)
    else:
        legacy_path = BASE / "data" / "external_validation.csv"
        if not legacy_path.exists():
            return pd.DataFrame(), path, "not_provided"
        frame = pd.read_csv(legacy_path)
        path = legacy_path
        if "endpoint" not in frame.columns:
            return pd.DataFrame(), path, "missing endpoint column"
        frame = frame[frame["endpoint"].astype(str) == endpoint].copy()
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        return pd.DataFrame(), path, f"missing columns: {sorted(missing)}"
    if frame.empty:
        return frame, path, "not_provided"
    return frame, path, None


def external_holdout_identity_keys(endpoint: str) -> set[str]:
    frame, _path, error = load_external_endpoint(endpoint)
    if error and error != "not_provided":
        raise ValueError(f"invalid external holdout for {endpoint}: {error}")
    if frame.empty:
        return set()
    identities = frame["smiles"].map(molecular_identity)
    return {
        item["inchikey"] or f"SMILES:{item['canonical_smiles']}"
        for item in identities
        if item is not None
    }


def build_endpoint_frame(endpoint: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    base_path = DATASETS[endpoint]
    experimental_path = CURATED_DIR / f"{endpoint}_negative_clean.csv"
    nice_path = CURATED_DIR / f"nice_verified_{endpoint}.csv"
    pubchem_path = CURATED_DIR / f"pubchem_verified_{endpoint}.csv"
    base = load_source(base_path, "base")
    experimental = load_source(experimental_path, "external_experimental")
    nice = load_source(nice_path, "nice_reviewed")
    pubchem = load_source(pubchem_path, "pubchem_reviewed")

    source_frames = [frame for frame in (base, experimental, nice, pubchem) if not frame.empty]
    if not source_frames:
        return pd.DataFrame(), {
            "status": "missing_training_data",
            "base_file": str(base_path.relative_to(BASE)),
            "external_experimental_file": str(experimental_path.relative_to(BASE)),
            "nice_file": str(nice_path.relative_to(BASE)),
            "pubchem_file": str(pubchem_path.relative_to(BASE)),
        }

    frame = pd.concat(source_frames, ignore_index=True, sort=False)
    frame["input_row"] = range(1, len(frame) + 1)
    frame["normalized_label"] = frame["label"].map(normalize_label)
    identities = frame["smiles"].map(molecular_identity)
    frame["canonical_smiles"] = identities.map(lambda item: item["canonical_smiles"] if item else None)
    frame["inchi"] = identities.map(lambda item: item["inchi"] if item else None)
    frame["inchikey"] = identities.map(lambda item: item["inchikey"] if item else None)
    frame["scaffold"] = identities.map(lambda item: item["scaffold"] if item else None)

    invalid_structure = frame["canonical_smiles"].isna()
    invalid_label = frame["normalized_label"].isna()
    valid = frame[~invalid_structure & ~invalid_label].copy()
    valid["identity_key"] = valid.apply(lambda row: row["inchikey"] or f"SMILES:{row['canonical_smiles']}", axis=1)
    valid["origin_priority"] = valid["training_origin"].map(
        {"base": 0, "external_experimental": 0, "nice_reviewed": 1, "pubchem_reviewed": 2}
    ).fillna(9)
    overall_label_counts = valid.groupby("identity_key")["normalized_label"].nunique()
    any_conflict_keys = set(overall_label_counts[overall_label_counts > 1].index)
    valid["best_origin_priority"] = valid.groupby("identity_key")["origin_priority"].transform("min")
    best_tier = valid[valid["origin_priority"] == valid["best_origin_priority"]].copy()
    best_label_counts = best_tier.groupby("identity_key")["normalized_label"].nunique()
    conflict_keys = set(best_label_counts[best_label_counts > 1].index)
    lower_tier_conflict_keys = any_conflict_keys.difference(conflict_keys)
    valid["label_conflict"] = valid["identity_key"].isin(conflict_keys)
    valid["lower_tier_conflict_overridden"] = valid["identity_key"].isin(lower_tier_conflict_keys)
    valid["duplicate_identity"] = valid.duplicated("identity_key", keep=False)

    # Audit clean set follows the same evidence-tier adjudication and
    # deterministic duplicate priority as the candidate trainer.
    non_conflict = best_tier[~best_tier["identity_key"].isin(conflict_keys)].copy()
    non_conflict = non_conflict.sort_values(
        ["identity_key", "origin_priority", "sample_weight"],
        ascending=[True, True, False],
        kind="stable",
    )
    clean = non_conflict.drop_duplicates("identity_key", keep="first").copy()
    holdout_keys = external_holdout_identity_keys(endpoint)
    valid["external_holdout_overlap"] = valid["identity_key"].isin(holdout_keys)
    clean_holdout_overlap = clean["identity_key"].isin(holdout_keys)
    external_quarantined = int(clean_holdout_overlap.sum())
    clean = clean[~clean_holdout_overlap].copy()

    source_counts = Counter(str(value) for value in clean["training_origin"])
    scaffold_counts = clean["scaffold"].value_counts(dropna=True)
    summary = {
        "status": "audited",
        "raw_rows": int(len(frame)),
        "base_rows": int(len(base)),
        "external_experimental_rows": int(len(experimental)),
        "nice_reviewed_rows": int(len(nice)),
        "pubchem_reviewed_rows": int(len(pubchem)),
        "invalid_structure_rows": int(invalid_structure.sum()),
        "invalid_label_rows": int(invalid_label.sum()),
        "valid_rows_before_dedup": int(len(valid)),
        "unique_identity_count": int(valid["identity_key"].nunique()),
        "duplicate_rows_beyond_first": int(len(valid) - valid["identity_key"].nunique()),
        "conflicting_identity_count": int(len(conflict_keys)),
        "lower_tier_conflicts_resolved_by_evidence_priority": int(len(lower_tier_conflict_keys)),
        "external_holdout_identities_quarantined": external_quarantined,
        "clean_training_identity_count": int(len(clean)),
        "positive": int((clean["normalized_label"] == 1).sum()),
        "negative": int((clean["normalized_label"] == 0).sum()),
        "training_origin": dict(sorted(source_counts.items())),
        "unique_scaffolds": int(clean["scaffold"].nunique()),
        "singleton_scaffolds": int((scaffold_counts == 1).sum()),
        "largest_scaffold_group": int(scaffold_counts.max()) if not scaffold_counts.empty else 0,
        "base_file": str(base_path.relative_to(BASE)),
        "external_experimental_file": str(experimental_path.relative_to(BASE)),
        "nice_file": str(nice_path.relative_to(BASE)),
        "pubchem_file": str(pubchem_path.relative_to(BASE)),
        "duplicate_preference": "base ICE and peer-reviewed curated experimental evidence (same tier) > human-reviewed NICE/ICE > PubChem regulatory weak label; lower-tier contradictions are overridden and same-tier contradictions are excluded",
        "external_holdout_policy": "exact InChIKey/canonical-SMILES matches are excluded from training; the external file is unchanged",
    }

    manifest_columns = [
        "input_row", "source_file", "training_origin", "smiles", "canonical_smiles",
        "inchi", "inchikey", "scaffold", "normalized_label", "sample_weight",
        "duplicate_identity", "label_conflict", "lower_tier_conflict_overridden",
        "external_holdout_overlap",
    ]
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    valid[manifest_columns].to_csv(MANIFEST_DIR / f"{endpoint}.csv", index=False)
    return clean, summary


def audit_external(endpoint: str, training: pd.DataFrame) -> dict[str, Any]:
    external, path, error = load_external_endpoint(endpoint)
    if error:
        if error == "not_provided":
            return {
                "status": "not_provided",
                "path": str(path.relative_to(BASE)),
                "exact_identity_overlap": None,
                "reason": f"no rows for endpoint {endpoint}",
            }
        return {
            "status": "invalid_file",
            "path": str(path.relative_to(BASE)),
            "exact_identity_overlap": None,
            "reason": error,
        }
    external["normalized_label"] = external["label"].map(normalize_label)
    identities = external["smiles"].map(molecular_identity)
    external["canonical_smiles"] = identities.map(lambda item: item["canonical_smiles"] if item else None)
    external["inchikey"] = identities.map(lambda item: item["inchikey"] if item else None)
    external["scaffold"] = identities.map(lambda item: item["scaffold"] if item else None)
    external = external.dropna(subset=["canonical_smiles", "normalized_label"]).copy()
    external["identity_key"] = external.apply(lambda row: row["inchikey"] or f"SMILES:{row['canonical_smiles']}", axis=1)
    external = external.drop_duplicates("identity_key", keep="first")

    train_ids = set(training["identity_key"]) if not training.empty else set()
    external_ids = set(external["identity_key"])
    overlap = sorted(train_ids.intersection(external_ids))
    train_scaffolds = set(training["scaffold"].dropna()) if not training.empty else set()
    external_scaffolds = set(external["scaffold"].dropna())
    scaffold_overlap = train_scaffolds.intersection(external_scaffolds)
    return {
        "status": "audited",
        "path": str(path.relative_to(BASE)),
        "external_unique_identities": int(len(external_ids)),
        "exact_identity_overlap": int(len(overlap)),
        "overlap_examples": overlap[:20],
        "external_unique_scaffolds": int(len(external_scaffolds)),
        "scaffold_overlap_count": int(len(scaffold_overlap)),
        "scaffold_overlap_fraction": round(len(scaffold_overlap) / len(external_scaffolds), 4) if external_scaffolds else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict-conflicts", action="store_true", help="fail when contradictory labels remain for the same exact molecular identity")
    parser.add_argument("--require-all", action="store_true", help="fail when any base endpoint training CSV is unavailable")
    parser.add_argument("--require-manifest", action="store_true", help="fail unless dataset_manifest.json hashes match all prepared CSV files")
    parser.add_argument(
        "--min-total-training-rows",
        type=int,
        default=0,
        help="fail unless the final clean, deduplicated endpoint-row total reaches this value",
    )
    parser.add_argument(
        "--min-per-endpoint-training-rows",
        type=int,
        default=0,
        help="fail unless every endpoint reaches this many clean, deduplicated molecules",
    )
    parser.add_argument(
        "--min-class-training-rows",
        type=int,
        default=0,
        help="fail unless both binary classes in every endpoint reach this many molecules",
    )
    parser.add_argument(
        "--recommended-min-class-training-rows",
        type=int,
        default=100,
        help="advisory per-class target reported separately from the hard trainability gate",
    )
    args = parser.parse_args()
    if (
        args.min_total_training_rows < 0
        or args.min_per_endpoint_training_rows < 0
        or args.min_class_training_rows < 0
        or args.recommended_min_class_training_rows < 0
    ):
        parser.error("minimum row requirements cannot be negative")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "exact_identity": "InChIKey with canonical-SMILES fallback",
            "duplicate_rule": "one exact molecular identity counted once per endpoint",
            "conflict_rule": "same-tier label conflicts are excluded; a higher-quality experimental/reviewed tier overrides a contradictory lower-tier weak label",
            "evidence_priority": "base ICE and peer-reviewed curated experimental evidence (same tier) > reviewed NICE/ICE > PubChem regulatory weak label",
            "external_rule": "exact train/external identity overlap must equal zero",
            "missing_evidence_rule": "absence of hazard evidence is not converted to label 0",
        },
        "endpoints": {},
        "dataset_manifest": audit_dataset_manifest(),
    }

    missing: list[str] = []
    external_overlap_total = 0
    conflict_total = 0
    lower_tier_conflicts_resolved_total = 0
    clean_training_total = 0
    endpoint_clean_counts: dict[str, int] = {}
    endpoint_class_counts: dict[str, dict[str, int]] = {}
    external_quarantined_total = 0
    audited_count = 0
    for endpoint in DATASETS:
        training_frame, summary = build_endpoint_frame(endpoint)
        if summary.get("status") == "missing_training_data":
            missing.append(endpoint)
            endpoint_clean_counts[endpoint] = 0
            endpoint_class_counts[endpoint] = {"positive": 0, "negative": 0}
            report["endpoints"][endpoint] = {"training": summary, "external": audit_external(endpoint, training_frame)}
            continue
        audited_count += 1
        conflict_total += int(summary["conflicting_identity_count"])
        lower_tier_conflicts_resolved_total += int(
            summary["lower_tier_conflicts_resolved_by_evidence_priority"]
        )
        clean_training_total += int(summary["clean_training_identity_count"])
        endpoint_clean_counts[endpoint] = int(summary["clean_training_identity_count"])
        endpoint_class_counts[endpoint] = {
            "positive": int(summary["positive"]),
            "negative": int(summary["negative"]),
        }
        external_quarantined_total += int(summary["external_holdout_identities_quarantined"])
        external = audit_external(endpoint, training_frame)
        if external.get("exact_identity_overlap"):
            external_overlap_total += int(external["exact_identity_overlap"])
        report["endpoints"][endpoint] = {"training": summary, "external": external}

    minimum_met = clean_training_total >= args.min_total_training_rows
    endpoint_gaps = {
        endpoint: max(0, args.min_per_endpoint_training_rows - endpoint_clean_counts.get(endpoint, 0))
        for endpoint in DATASETS
    }
    endpoint_minimum_met = all(gap == 0 for gap in endpoint_gaps.values())
    class_gaps = {
        endpoint: {
            label: max(0, args.min_class_training_rows - counts.get(label, 0))
            for label in ("positive", "negative")
        }
        for endpoint, counts in endpoint_class_counts.items()
    }
    class_minimum_met = all(
        gap == 0
        for endpoint_gaps_by_class in class_gaps.values()
        for gap in endpoint_gaps_by_class.values()
    ) and len(class_gaps) == len(DATASETS)
    recommended_class_gaps = {
        endpoint: {
            label: max(0, args.recommended_min_class_training_rows - counts.get(label, 0))
            for label in ("positive", "negative")
        }
        for endpoint, counts in endpoint_class_counts.items()
    }
    recommended_class_minimum_met = all(
        gap == 0
        for endpoint_gaps_by_class in recommended_class_gaps.values()
        for gap in endpoint_gaps_by_class.values()
    ) and len(recommended_class_gaps) == len(DATASETS)
    report["summary"] = {
        "audited_endpoints": audited_count,
        "missing_endpoints": missing,
        "conflicting_identity_count": conflict_total,
        "lower_tier_conflicts_resolved_by_evidence_priority": lower_tier_conflicts_resolved_total,
        "clean_training_endpoint_rows": clean_training_total,
        "external_holdout_identities_quarantined_from_training": external_quarantined_total,
        "minimum_training_endpoint_rows_requested": args.min_total_training_rows,
        "minimum_training_endpoint_rows_met": minimum_met,
        "minimum_per_endpoint_training_rows_requested": args.min_per_endpoint_training_rows,
        "clean_training_rows_by_endpoint": endpoint_clean_counts,
        "per_endpoint_training_row_gaps": endpoint_gaps,
        "minimum_per_endpoint_training_rows_met": endpoint_minimum_met,
        "minimum_class_training_rows_requested": args.min_class_training_rows,
        "training_class_rows_by_endpoint": endpoint_class_counts,
        "training_class_row_gaps": class_gaps,
        "minimum_class_training_rows_met": class_minimum_met,
        "recommended_minimum_class_training_rows": args.recommended_min_class_training_rows,
        "recommended_training_class_row_gaps": recommended_class_gaps,
        "recommended_class_minimum_met": recommended_class_minimum_met,
        "external_exact_overlap_count": external_overlap_total,
        "ready_for_retraining": (
            audited_count == len(DATASETS)
            and minimum_met
            and endpoint_minimum_met
            and class_minimum_met
        ),
        "independent_external_validation_ready": (
            audited_count == len(DATASETS)
            and external_overlap_total == 0
            and all(item["external"].get("status") == "audited" for item in report["endpoints"].values())
        ),
        "dataset_manifest_verified": bool(report["dataset_manifest"].get("all_prepared_hashes_match")),
    }

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"report: {REPORT_PATH}")
    print(f"manifests: {MANIFEST_DIR}")

    if external_overlap_total > 0:
        print("ERROR: independent external set has exact molecular overlap with training data", file=sys.stderr)
        return 3
    if args.strict_conflicts and conflict_total > 0:
        print("ERROR: contradictory labels remain for exact molecular identities", file=sys.stderr)
        return 2
    if args.require_all and missing:
        print(f"ERROR: missing endpoint datasets: {', '.join(missing)}", file=sys.stderr)
        return 4
    if args.require_manifest and not report["dataset_manifest"].get("all_prepared_hashes_match"):
        print("ERROR: dataset manifest is missing, invalid, or does not match prepared training files", file=sys.stderr)
        return 5
    if not minimum_met:
        print(
            f"ERROR: final clean training total {clean_training_total:,} is below "
            f"the requested {args.min_total_training_rows:,}",
            file=sys.stderr,
        )
        return 6
    if not endpoint_minimum_met:
        print(
            "ERROR: one or more endpoints are below the requested clean training-row minimum: "
            f"{endpoint_gaps}",
            file=sys.stderr,
        )
        return 7
    if not class_minimum_met:
        print(
            "ERROR: one or more endpoint classes are below the requested minimum: "
            f"{class_gaps}. Do not infer negative labels from missing hazard statements.",
            file=sys.stderr,
        )
        return 8
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
