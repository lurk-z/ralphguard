"""RalphGuard training-data integrity audit.

Run before retraining QSAR models:

    python scripts/check_training_integrity.py

The script intentionally performs *no training* and writes no model files. It
checks canonical-structure duplicates, label conflicts and exact overlap between
base/external datasets so the team can show reviewers that validation compounds
were not silently duplicated into training data.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CURATED = ROOT / "data" / "curated"
REPORT_PATH = CURATED / "training_integrity_report.json"

DATASETS = {
    "skin": RAW / "skin_irritation.csv",
    "eye": RAW / "eye_irritation.csv",
    "sens": RAW / "llna_sensitization.csv",
    "acute": RAW / "catmos_acute_toxicity.csv",
}
CURATED_DATASETS = {
    ep: CURATED / f"pubchem_verified_{ep}.csv" for ep in DATASETS
}
EXTERNAL = ROOT / "data" / "external_validation.csv"


@dataclass
class EndpointAudit:
    endpoint: str
    base_rows: int
    curated_rows: int
    invalid_smiles: int
    duplicate_canonical_rows: int
    conflicting_structures: int
    unique_structures: int
    external_exact_overlap: int | None


def canonicalize(value: object) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    mol = Chem.MolFromSmiles(text)
    return Chem.MolToSmiles(mol) if mol is not None else None


def read_if_exists(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame(columns=["smiles", "label"])
    frame = pd.read_csv(path)
    if "smiles" not in frame.columns:
        raise ValueError(f"{path} is missing required column: smiles")
    return frame


def canonical_series(frame: pd.DataFrame) -> pd.Series:
    return frame["smiles"].map(canonicalize)


def exact_overlap(left: Iterable[str], right: Iterable[str]) -> set[str]:
    return set(left).intersection(set(right))


def external_for_endpoint(frame: pd.DataFrame, endpoint: str) -> pd.DataFrame:
    if frame.empty:
        return frame
    if "endpoint" in frame.columns:
        return frame[frame["endpoint"].astype(str).str.lower() == endpoint].copy()
    # Older RalphGuard external_validation.csv files may store one label column
    # per endpoint. Exact structure-overlap auditing still works without labels.
    return frame.copy()


def audit_endpoint(endpoint: str, base_path: Path, curated_path: Path, external: pd.DataFrame) -> EndpointAudit:
    base = read_if_exists(base_path)
    curated = read_if_exists(curated_path)
    combined = pd.concat([base, curated], ignore_index=True, sort=False)
    canonical = canonical_series(combined)
    invalid = int(canonical.isna().sum())
    valid = combined.assign(canonical=canonical).dropna(subset=["canonical"]).copy()

    duplicate_rows = int(valid.duplicated("canonical", keep=False).sum())
    conflicts = 0
    if "label" in valid.columns and not valid.empty:
        labels = valid.groupby("canonical")["label"].nunique(dropna=True)
        conflicts = int((labels > 1).sum())

    unique_structures = int(valid["canonical"].nunique())
    overlap_count: int | None = None
    if not external.empty and "smiles" in external.columns:
        ext = external_for_endpoint(external, endpoint)
        ext_canonical = canonical_series(ext).dropna().tolist()
        overlap_count = len(exact_overlap(valid["canonical"].tolist(), ext_canonical))

    return EndpointAudit(
        endpoint=endpoint,
        base_rows=len(base),
        curated_rows=len(curated),
        invalid_smiles=invalid,
        duplicate_canonical_rows=duplicate_rows,
        conflicting_structures=conflicts,
        unique_structures=unique_structures,
        external_exact_overlap=overlap_count,
    )


def main() -> None:
    external = read_if_exists(EXTERNAL) if EXTERNAL.exists() else pd.DataFrame()
    audits = [
        audit_endpoint(ep, base, CURATED_DATASETS[ep], external)
        for ep, base in DATASETS.items()
    ]

    report = {
        "purpose": "pre-training leakage and data-integrity audit",
        "canonical_identity": "RDKit canonical SMILES",
        "notes": [
            "A public source does not mean a classical ML model has seen a compound before training.",
            "This audit checks exact molecular-identity overlap; scaffold similarity requires a separate scaffold-split evaluation.",
            "External overlap should be zero before reporting independent external validation.",
        ],
        "endpoints": [asdict(item) for item in audits],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("RalphGuard training integrity audit")
    print("=" * 92)
    print(f"{'endpoint':<10}{'base':>8}{'curated':>10}{'unique':>10}{'invalid':>10}{'dup rows':>12}{'conflicts':>12}{'ext overlap':>14}")
    for item in audits:
        overlap = "n/a" if item.external_exact_overlap is None else str(item.external_exact_overlap)
        print(
            f"{item.endpoint:<10}{item.base_rows:>8}{item.curated_rows:>10}"
            f"{item.unique_structures:>10}{item.invalid_smiles:>10}"
            f"{item.duplicate_canonical_rows:>12}{item.conflicting_structures:>12}{overlap:>14}"
        )
    print(f"\nSaved: {REPORT_PATH.relative_to(ROOT)}")

    nonzero_overlap = [
        item.endpoint for item in audits if (item.external_exact_overlap or 0) > 0
    ]
    if nonzero_overlap:
        raise SystemExit(
            "External validation leakage detected for: " + ", ".join(nonzero_overlap)
        )


if __name__ == "__main__":
    main()
