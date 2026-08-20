"""Import the official NICEATM human predictive patch-test (HPPT) database.

Only explicit Active/Inactive calls with reliability rating 1--4 are eligible.
Conflicting calls for the same exact molecular identity and identities reserved
for independent external validation are quarantined rather than guessed.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

import pandas as pd
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

BASE = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = BASE / "data" / "raw" / "skin_sensitization_sources" / "hppt_database_14feb2023.xlsx"
DEFAULT_OUTPUT = BASE / "data" / "curated" / "sens_hppt_clean.csv"
DEFAULT_REPORT = BASE / "data" / "curated" / "sens_hppt_import_report.json"
DEFAULT_REVIEW = BASE / "data" / "staging" / "sens_hppt_review_queue.csv"
SOURCE_URL = "https://ntp.niehs.nih.gov/iccvam/methods/immunotox/hppt/hppt_database_14feb2023.xlsx"
PAPER_DOI = "https://doi.org/10.1007/s00204-023-03530-3"
RRS_WEIGHTS = {1: 1.0, 2: 0.95, 3: 0.8, 4: 0.6}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def identity(smiles: object) -> tuple[str, str] | None:
    text = str(smiles or "").strip()
    if not text or text.lower() == "nan" or "." in text:
        return None
    molecule = Chem.MolFromSmiles(text)
    if molecule is None:
        return None
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    try:
        inchi = Chem.MolToInchi(molecule)
        key = Chem.InchiToInchiKey(inchi) if inchi else ""
    except Exception:
        key = ""
    return (key or f"SMILES:{canonical}", canonical)


def external_holdout_keys() -> set[str]:
    endpoint_path = BASE / "data" / "external" / "sens.csv"
    legacy_path = BASE / "data" / "external_validation.csv"
    if endpoint_path.exists():
        frame = pd.read_csv(endpoint_path)
    elif legacy_path.exists():
        frame = pd.read_csv(legacy_path)
        if "endpoint" in frame.columns:
            frame = frame[frame["endpoint"].astype(str).eq("sens")]
    else:
        return set()
    if "smiles" not in frame.columns:
        return set()
    return {item[0] for item in frame["smiles"].map(identity) if item is not None}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument(
        "--download",
        action="store_true",
        help="download the official workbook when --input does not exist",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--review-queue", type=Path, default=DEFAULT_REVIEW)
    args = parser.parse_args()
    input_path = args.input.resolve()
    if args.download and not input_path.exists():
        input_path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(SOURCE_URL, input_path)
    if not input_path.exists():
        parser.error(f"HPPT workbook not found: {input_path}; use --download")

    raw = pd.read_excel(input_path, sheet_name="HPPT Data")
    required = {"Record.No", "Call", "RRS", "QSAR.Ready.SMILES"}
    missing = required.difference(raw.columns)
    if missing:
        raise ValueError(f"HPPT workbook missing columns: {sorted(missing)}")

    frame = raw.copy()
    frame["rrs"] = pd.to_numeric(frame["RRS"], errors="coerce")
    frame["label"] = frame["Call"].astype(str).str.strip().map({"Active": 1, "Inactive": 0})
    frame["structure"] = frame["QSAR.Ready.SMILES"].where(
        frame["QSAR.Ready.SMILES"].notna(), frame.get("SMILES")
    )
    ids = frame["structure"].map(identity)
    frame["identity_key"] = ids.map(lambda item: item[0] if item else None)
    frame["smiles"] = ids.map(lambda item: item[1] if item else None)

    reasons = pd.Series("", index=frame.index, dtype="object")
    reasons.loc[frame["label"].isna()] = "unsupported_call"
    reasons.loc[~frame["rrs"].isin(RRS_WEIGHTS)] = "reliability_rating_not_1_to_4"
    reasons.loc[frame["identity_key"].isna()] = "invalid_or_multicomponent_structure"
    eligible = frame[reasons.eq("")].copy()

    conflict_counts = eligible.groupby("identity_key")["label"].nunique()
    conflict_keys = set(conflict_counts[conflict_counts > 1].index)
    reasons.loc[frame["identity_key"].isin(conflict_keys)] = "conflicting_active_inactive_calls"
    holdout_keys = external_holdout_keys()
    reasons.loc[frame["identity_key"].isin(holdout_keys)] = "external_holdout_overlap"
    eligible = frame[reasons.eq("")].copy()

    # Choose the most reliable record for weight/properties, while retaining
    # every supporting record number in the evidence trail.
    evidence = eligible.groupby("identity_key")["Record.No"].apply(
        lambda values: ";".join(str(value) for value in sorted(set(values)))
    )
    eligible = eligible.sort_values(
        ["identity_key", "rrs", "No.Test.Subjects"],
        ascending=[True, True, False],
        kind="stable",
    ).drop_duplicates("identity_key", keep="first")
    eligible["sample_weight"] = eligible["rrs"].astype(int).map(RRS_WEIGHTS)
    eligible["source"] = "NICEATM HPPT Database (2023)"
    eligible["source_url"] = SOURCE_URL
    eligible["paper_doi"] = PAPER_DOI
    eligible["evidence_ids"] = eligible["identity_key"].map(evidence).map(lambda value: f"HPPT Record.No {value}")
    eligible["test_type"] = eligible.get("Test.Type", "")
    eligible["reliability_rating"] = eligible["rrs"].astype(int)
    eligible["preferred_name"] = eligible.get("Preferred.Name", "")
    eligible["casrn"] = eligible.get("CASRN", "")
    eligible["dtxsid"] = eligible.get("DTXSID", "")
    columns = [
        "smiles", "label", "sample_weight", "source", "source_url", "paper_doi",
        "evidence_ids", "test_type", "reliability_rating", "preferred_name", "casrn", "dtxsid",
    ]
    output = eligible[columns].sort_values(["label", "smiles"], kind="stable").reset_index(drop=True)

    review = frame[~reasons.eq("")].copy()
    review["review_reason"] = reasons[~reasons.eq("")]
    review_columns = [column for column in (
        "Record.No", "CASRN", "DTXSID", "Preferred.Name", "Call", "RRS",
        "Test.Type", "QSAR.Ready.SMILES", "SMILES", "identity_key", "review_reason",
    ) if column in review.columns]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.review_queue.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    review[review_columns].to_csv(args.review_queue, index=False)

    reason_counts = reasons[~reasons.eq("")].value_counts().to_dict()
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": "sens",
        "source": "NICEATM Human Predictive Patch Test Database",
        "source_url": SOURCE_URL,
        "peer_reviewed_description": PAPER_DOI,
        "source_file": str(input_path.relative_to(BASE)),
        "source_sha256": sha256(input_path),
        "output_file": str(args.output.relative_to(BASE)),
        "output_sha256": sha256(args.output),
        "label_policy": "Explicit HPPT Active=1 and Inactive=0 only; RRS 1-4; no label inferred from missing information",
        "identity_policy": "Canonical structure/InChIKey; exact contradictory identities excluded",
        "weight_policy": {str(key): value for key, value in RRS_WEIGHTS.items()},
        "raw_test_rows": int(len(raw)),
        "accepted_unique_structures": int(len(output)),
        "label_1": int(output["label"].eq(1).sum()),
        "label_0": int(output["label"].eq(0).sum()),
        "accepted_by_reliability_rating": {
            str(int(key)): int(value) for key, value in output["reliability_rating"].value_counts().sort_index().items()
        },
        "external_holdout_identities_quarantined": int(frame.loc[frame["identity_key"].isin(holdout_keys), "identity_key"].nunique()),
        "review_queue": str(args.review_queue.relative_to(BASE)),
        "review_rows": int(len(review)),
        "review_reasons": {str(key): int(value) for key, value in reason_counts.items()},
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
