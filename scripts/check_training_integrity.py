"""Audit RalphGuard QSAR training data before retraining.

This script does not train or overwrite any model. It checks the identity and
label integrity of the four endpoint datasets, including reviewed PubChem
supplemental rows, and optionally checks independent external sets for exact
molecular overlap.

Recommended run (scientific/backend environment with RDKit + pandas):

    python scripts/check_training_integrity.py

Optional external validation files:

    data/external/skin.csv
    data/external/eye.csv
    data/external/sens.csv
    data/external/acute.csv

Each external file must contain at least: smiles,label

Use --strict-conflicts when preparing a release candidate. External exact
identity overlap always causes a non-zero exit code because such a set cannot be
called independent external validation.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
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

DATASETS = {
    "skin": RAW_DIR / "skin_irritation.csv",
    "eye": RAW_DIR / "eye_irritation.csv",
    "sens": RAW_DIR / "llna_sensitization.csv",
    "acute": RAW_DIR / "catmos_acute_toxicity.csv",
}


def molecular_identity(smiles: Any) -> dict[str, Any] | None:
    """Return deterministic molecular identifiers for one valid single molecule."""
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
    return {
        "canonical_smiles": canonical,
        "inchi": inchi,
        "inchikey": inchikey,
        "scaffold": scaffold,
    }


def normalize_label(value: Any) -> int | None:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        return None
    return numeric if numeric in {0, 1} else None


def load_source(path: Path, origin: str) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    frame = pd.read_csv(path)
    missing = {"smiles", "label"}.difference(frame.columns)
    if missing:
        raise ValueError(f"{path} missing required columns: {sorted(missing)}")
    frame = frame.copy()
    frame["training_origin"] = origin
    frame["source_file"] = str(path.relative_to(BASE))
    if "sample_weight" not in frame.columns:
        frame["sample_weight"] = 1.0 if origin == "base" else 0.5
    return frame


def build_endpoint_frame(endpoint: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    base = load_source(DATASETS[endpoint], "base")
    supplemental_path = CURATED_DIR / f"pubchem_verified_{endpoint}.csv"
    supplemental = load_source(supplemental_path, "pubchem_reviewed")

    source_frames = [frame for frame in (base, supplemental) if not frame.empty]
    if not source_frames:
        return pd.DataFrame(), {
            "status": "missing_training_data",
            "base_file": str(DATASETS[endpoint].relative_to(BASE)),
            "supplemental_file": str(supplemental_path.relative_to(BASE)),
        }

    frame = pd.concat(source_frames, ignore_index=True, sort=False)
    frame["input_row"] = range(1, len(frame) + 1)
    frame["normalized_label"] = frame["label"].map(normalize_label)

    identities = frame["smiles"].map(molecular_identity)
    frame["canonical_smiles"] = identities.map(
        lambda item: item["canonical_smiles"] if item else None
    )
    frame["inchi"] = identities.map(lambda item: item["inchi"] if item else None)
    frame["inchikey"] = identities.map(lambda item: item["inchikey"] if item else None)
    frame["scaffold"] = identities.map(lambda item: item["scaffold"] if item else None)

    invalid_structure = frame["canonical_smiles"].isna()
    invalid_label = frame["normalized_label"].isna()
    valid = frame[~invalid_structure & ~invalid_label].copy()

    # Prefer InChIKey as the exact identity key. Fall back to canonical SMILES
    # only if RDKit cannot generate an InChIKey for a valid molecule.
    valid["identity_key"] = valid.apply(
        lambda row: row["inchikey"] or f"SMILES:{row['canonical_smiles']}", axis=1
    )
    label_counts = valid.groupby("identity_key")["normalized_label"].nunique()
    conflict_keys = set(label_counts[label_counts > 1].index)
    valid["label_conflict"] = valid["identity_key"].isin(conflict_keys)
    valid["duplicate_identity"] = valid.duplicated("identity_key", keep=False)

    clean = valid[~valid["label_conflict"]].drop_duplicates("identity_key", keep="first").copy()

    source_counts = Counter(str(value) for value in clean["training_origin"])
    scaffold_counts = clean["scaffold"].value_counts(dropna=True)
    singleton_scaffolds = int((scaffold_counts == 1).sum())

    summary = {
        "status": "audited",
        "raw_rows": int(len(frame)),
        "invalid_structure_rows": int(invalid_structure.sum()),
        "invalid_label_rows": int(invalid_label.sum()),
        "valid_rows_before_dedup": int(len(valid)),
        "unique_identity_count": int(valid["identity_key"].nunique()),
        "duplicate_rows_beyond_first": int(len(valid) - valid["identity_key"].nunique()),
        "conflicting_identity_count": int(len(conflict_keys)),
        "clean_training_identity_count": int(len(clean)),
        "positive": int((clean["normalized_label"] == 1).sum()),
        "negative": int((clean["normalized_label"] == 0).sum()),
        "training_origin": dict(sorted(source_counts.items())),
        "unique_scaffolds": int(clean["scaffold"].nunique()),
        "singleton_scaffolds": singleton_scaffolds,
        "largest_scaffold_group": int(scaffold_counts.max()) if not scaffold_counts.empty else 0,
        "base_file": str(DATASETS[endpoint].relative_to(BASE)),
        "supplemental_file": str(supplemental_path.relative_to(BASE)),
    }

    # Manifest is intentionally judge/audit friendly. Rows with conflicts stay
    # visible and are marked instead of silently disappearing from the audit.
    manifest_columns = [
        "input_row",
        "source_file",
        "training_origin",
        "smiles",
        "canonical_smiles",
        "inchi",
        "inchikey",
        "scaffold",
        "normalized_label",
        "sample_weight",
        "duplicate_identity",
        "label_conflict",
    ]
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    valid[manifest_columns].to_csv(MANIFEST_DIR / f"{endpoint}.csv", index=False)
    return clean, summary


def audit_external(endpoint: str, training: pd.DataFrame) -> dict[str, Any]:
    path = EXTERNAL_DIR / f"{endpoint}.csv"
    if not path.exists():
        return {
            "status": "not_provided",
            "path": str(path.relative_to(BASE)),
            "exact_identity_overlap": None,
        }

    external = load_source(path, "external")
    external["normalized_label"] = external["label"].map(normalize_label)
    identities = external["smiles"].map(molecular_identity)
    external["canonical_smiles"] = identities.map(
        lambda item: item["canonical_smiles"] if item else None
    )
    external["inchikey"] = identities.map(lambda item: item["inchikey"] if item else None)
    external["scaffold"] = identities.map(lambda item: item["scaffold"] if item else None)
    external = external.dropna(subset=["canonical_smiles", "normalized_label"]).copy()
    external["identity_key"] = external.apply(
        lambda row: row["inchikey"] or f"SMILES:{row['canonical_smiles']}", axis=1
    )
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
        "scaffold_overlap_fraction": (
            round(len(scaffold_overlap) / len(external_scaffolds), 4)
            if external_scaffolds
            else None
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--strict-conflicts",
        action="store_true",
        help="fail when contradictory labels remain for the same exact molecular identity",
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="fail when any base endpoint training CSV is unavailable",
    )
    args = parser.parse_args()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "exact_identity": "InChIKey with canonical-SMILES fallback",
            "duplicate_rule": "one exact molecular identity counted once per endpoint",
            "conflict_rule": "same exact identity with both labels is excluded until reviewed",
            "external_rule": "exact train/external identity overlap must equal zero",
            "missing_evidence_rule": "absence of hazard evidence is not converted to label 0",
        },
        "endpoints": {},
    }

    missing = []
    external_overlap_total = 0
    conflict_total = 0
    audited_count = 0

    for endpoint in DATASETS:
        training, summary = build_endpoint_frame(endpoint)
        if summary.get("status") == "missing_training_data":
            missing.append(endpoint)
            report["endpoints"][endpoint] = {
                "training": summary,
                "external": audit_external(endpoint, training),
            }
            continue

        audited_count += 1
        conflict_total += int(summary["conflicting_identity_count"])
        external = audit_external(endpoint, training)
        if external.get("exact_identity_overlap"):
            external_overlap_total += int(external["exact_identity_overlap"])
        report["endpoints"][endpoint] = {
            "training": summary,
            "external": external,
        }

    report["summary"] = {
        "audited_endpoints": audited_count,
        "missing_endpoints": missing,
        "conflicting_identity_count": conflict_total,
        "external_exact_overlap_count": external_overlap_total,
        "ready_for_retraining": audited_count == len(DATASETS) and conflict_total == 0,
        "independent_external_validation_ready": (
            audited_count == len(DATASETS)
            and external_overlap_total == 0
            and all(
                item["external"].get("status") == "audited"
                for item in report["endpoints"].values()
            )
        ),
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
