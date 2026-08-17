"""Prepare auditable experimental negative rows for skin and eye irritation.

The source SDF files are the peer-reviewed STopTox modeling sets published by
the authors in their public repository.  This importer deliberately accepts
only rows already classified as negative by the curated experimental dataset;
it never infers a negative from a missing H315/H319 statement.

The pipeline performs structure-domain screening, exact-identity
canonicalization, strong-evidence conflict checks, holdout quarantine, and
deterministic deduplication before writing::

    data/curated/skin_negative_clean.csv
    data/curated/eye_negative_clean.csv

Run in the scientific Docker image::

    python scripts/prepare_experimental_negatives.py --download
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from typing import Any
from urllib.request import Request, urlopen

import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors


RDLogger.DisableLog("rdApp.*")

BASE = Path(__file__).resolve().parents[1]
RAW_SOURCE_DIR = BASE / "data" / "raw" / "external_negative_sources"
CURATED_DIR = BASE / "data" / "curated"
STAGING_DIR = BASE / "data" / "staging"
EXTERNAL_DIR = BASE / "data" / "external"
REPORT_PATH = CURATED_DIR / "experimental_negative_manifest.json"
REVIEW_PATH = STAGING_DIR / "experimental_negative_review_queue.csv"

STOPTOX_COMMIT = "6ba3a7f82ab9fda8534f120114a566eec296e8ae"
STOPTOX_PAPER_URL = "https://doi.org/10.1289/EHP9341"
STOPTOX_REPOSITORY_URL = "https://github.com/joyvb/stoptox"

ALLOWED_ATOMIC_NUMBERS = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53}
MIN_MOLECULAR_WEIGHT = 30.0
MAX_MOLECULAR_WEIGHT = 500.0
MIN_HEAVY_ATOMS = 2
MAX_HEAVY_ATOMS = 50

SKIN_GUIDELINE_RE = re.compile(
    r"(?:OECD\s+Guideline\s+404|EU\s+Method\s+B\.4|"
    r"EPA\s+(?:OPPTS\s+870\.2500|OPP\s+81-5|OTS\s+798\.4470))",
    re.IGNORECASE,
)
SKIN_SPECIES = {"rabbit", "human", "other: lapin new zealand"}


@dataclass(frozen=True)
class SourceSpec:
    endpoint: str
    source_filename: str
    output_filename: str
    source_url: str
    expected_sha256: str
    method: str
    sample_weight: float


SOURCES = {
    "eye": SourceSpec(
        endpoint="eye",
        source_filename="stoptox_eye_irritation_balanced.sdf",
        output_filename="eye_negative_clean.csv",
        source_url=(
            "https://raw.githubusercontent.com/joyvb/stoptox/"
            f"{STOPTOX_COMMIT}/modeling/Projeto_3_Eye_irritation/data/AI_balanced.sdf"
        ),
        expected_sha256="03dc5888f0859ddcc1b694e186bb2137229ea571e3db56572205f482794de03d",
        method="OECD TG 405 experimental eye irritation, curated at dataset level",
        sample_weight=0.9,
    ),
    "skin": SourceSpec(
        endpoint="skin",
        source_filename="stoptox_skin_irritation_balanced.sdf",
        output_filename="skin_negative_clean.csv",
        source_url=(
            "https://raw.githubusercontent.com/joyvb/stoptox/"
            f"{STOPTOX_COMMIT}/modeling/Projeto_6_Skin_irritation/data/"
            "Skin_irritation_balanced_st.sdf"
        ),
        expected_sha256="c854fdea20b43b5ee2d392b42d0185eb928daf9d2a32129ac6603cf6ed53b68c",
        method="OECD TG 404 or explicitly whitelisted equivalent experimental method",
        sample_weight=0.9,
    ),
}

OUTPUT_COLUMNS = [
    "smiles",
    "label",
    "name",
    "inchikey",
    "casrn",
    "source",
    "source_url",
    "evidence_ids",
    "mapping_rules",
    "label_quality",
    "sample_weight",
    "study_type",
    "method",
    "result",
    "reliability",
    "source_record_id",
    "source_sha256",
    "source_repository",
    "source_commit",
    "provided_identity",
]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_source(spec: SourceSpec, *, force: bool = False) -> Path:
    destination = RAW_SOURCE_DIR / spec.source_filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists() or force:
        request = Request(
            spec.source_url,
            headers={"User-Agent": "RalphGuard-NSC2026/1.0 experimental-evidence-importer"},
        )
        temporary = destination.with_suffix(destination.suffix + ".part")
        with urlopen(request, timeout=120) as response, temporary.open("wb") as handle:
            while chunk := response.read(1024 * 1024):
                handle.write(chunk)
        temporary.replace(destination)
    actual = file_sha256(destination)
    if actual != spec.expected_sha256:
        raise ValueError(
            f"SHA-256 mismatch for {destination}: expected {spec.expected_sha256}, got {actual}"
        )
    return destination


def normalize_label(value: Any) -> int | None:
    try:
        label = int(float(value))
    except (TypeError, ValueError):
        return None
    return label if label in {0, 1} else None


def identity_from_smiles(smiles: Any) -> tuple[str, str] | None:
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


def molecule_identity(molecule: Chem.Mol) -> tuple[str, str] | None:
    try:
        molecule = Chem.RemoveHs(molecule)
        Chem.SanitizeMol(molecule)
        canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
        normalized = Chem.MolFromSmiles(canonical)
        if normalized is None:
            return None
        inchi = Chem.MolToInchi(normalized)
        inchikey = Chem.InchiToInchiKey(inchi) if inchi else ""
    except Exception:
        return None
    return inchikey or f"SMILES:{canonical}", canonical


def structure_rejection_reason(molecule: Chem.Mol) -> str | None:
    if len(Chem.GetMolFrags(molecule)) != 1:
        return "mixture_or_salt"
    atomic_numbers = {atom.GetAtomicNum() for atom in molecule.GetAtoms()}
    if not atomic_numbers.issubset(ALLOWED_ATOMIC_NUMBERS):
        return "unsupported_element"
    molecular_weight = float(Descriptors.MolWt(molecule))
    if not MIN_MOLECULAR_WEIGHT <= molecular_weight <= MAX_MOLECULAR_WEIGHT:
        return "molecular_weight_outside_domain"
    heavy_atoms = int(molecule.GetNumHeavyAtoms())
    if not MIN_HEAVY_ATOMS <= heavy_atoms <= MAX_HEAVY_ATOMS:
        return "heavy_atom_count_outside_domain"
    return None


def endpoint_evidence_rejection(spec: SourceSpec, molecule: Chem.Mol) -> str | None:
    outcome = normalize_label(molecule.GetProp("Outcome") if molecule.HasProp("Outcome") else None)
    if outcome is None:
        return "invalid_outcome"
    if outcome != 0:
        return "not_negative"
    if spec.endpoint == "skin":
        guideline = molecule.GetProp("guideline") if molecule.HasProp("guideline") else ""
        if not SKIN_GUIDELINE_RE.search(guideline):
            return "skin_guideline_not_whitelisted"
        species = (
            molecule.GetProp("species").strip().casefold()
            if molecule.HasProp("species")
            else ""
        )
        if species not in SKIN_SPECIES:
            return "skin_species_not_whitelisted"
    return None


def current_strong_identities(endpoint: str) -> dict[str, set[int]]:
    paths = [
        BASE / "data" / "raw" / f"{endpoint}_irritation.csv",
        CURATED_DIR / f"nice_verified_{endpoint}.csv",
    ]
    identities: dict[str, set[int]] = defaultdict(set)
    for path in paths:
        if not path.exists():
            continue
        frame = pd.read_csv(path)
        if not {"smiles", "label"}.issubset(frame.columns):
            continue
        for _, row in frame.iterrows():
            identity = identity_from_smiles(row["smiles"])
            label = normalize_label(row["label"])
            if identity is not None and label is not None:
                identities[identity[0]].add(label)
    return identities


def external_holdout_identities(endpoint: str) -> set[str]:
    path = EXTERNAL_DIR / f"{endpoint}.csv"
    if path.exists():
        frame = pd.read_csv(path)
    else:
        legacy = BASE / "data" / "external_validation.csv"
        if not legacy.exists():
            return set()
        frame = pd.read_csv(legacy)
        if "endpoint" not in frame.columns:
            return set()
        frame = frame[frame["endpoint"].astype(str) == endpoint]
    if "smiles" not in frame.columns:
        return set()
    return {
        identity[0]
        for identity in frame["smiles"].map(identity_from_smiles)
        if identity is not None
    }


def source_record_id(spec: SourceSpec, molecule: Chem.Mol, record_number: int) -> str:
    candidate_fields = ("CpId", "id_input", "Index")
    for field in candidate_fields:
        if molecule.HasProp(field) and molecule.GetProp(field).strip():
            return f"{spec.endpoint}:{field}:{molecule.GetProp(field).strip()}"
    return f"{spec.endpoint}:sdf_record:{record_number}"


def raw_review_row(
    spec: SourceSpec,
    record_number: int,
    reason: str,
    molecule: Chem.Mol | None = None,
    identity_key: str | None = None,
) -> dict[str, Any]:
    return {
        "endpoint": spec.endpoint,
        "record_number": record_number,
        "source_record_id": (
            source_record_id(spec, molecule, record_number) if molecule is not None else ""
        ),
        "reason": reason,
        "identity_key": identity_key or "",
        "outcome": molecule.GetProp("Outcome") if molecule is not None and molecule.HasProp("Outcome") else "",
        "casrn": (
            molecule.GetProp("CASRN")
            if molecule is not None and molecule.HasProp("CASRN")
            else molecule.GetProp("casrn")
            if molecule is not None and molecule.HasProp("casrn")
            else ""
        ),
        "guideline": (
            molecule.GetProp("guideline")
            if molecule is not None and molecule.HasProp("guideline")
            else ""
        ),
    }


def prepare_endpoint(spec: SourceSpec, source_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    source_hash = file_sha256(source_path)
    strong = current_strong_identities(spec.endpoint)
    holdout = external_holdout_identities(spec.endpoint)
    supplier = Chem.SDMolSupplier(str(source_path), removeHs=False)
    accepted_by_identity: dict[str, dict[str, Any]] = {}
    review_rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()

    for record_number, molecule in enumerate(supplier, start=1):
        counts["raw_sdf_records"] += 1
        if molecule is None:
            counts["invalid_structure"] += 1
            review_rows.append(raw_review_row(spec, record_number, "invalid_structure"))
            continue

        evidence_rejection = endpoint_evidence_rejection(spec, molecule)
        if evidence_rejection == "not_negative":
            counts["positive_rows_not_imported"] += 1
            continue
        if evidence_rejection:
            counts[evidence_rejection] += 1
            review_rows.append(raw_review_row(spec, record_number, evidence_rejection, molecule))
            continue

        structure_rejection = structure_rejection_reason(molecule)
        if structure_rejection:
            counts[structure_rejection] += 1
            review_rows.append(raw_review_row(spec, record_number, structure_rejection, molecule))
            continue

        identity = molecule_identity(molecule)
        if identity is None:
            counts["canonicalization_failed"] += 1
            review_rows.append(raw_review_row(spec, record_number, "canonicalization_failed", molecule))
            continue
        identity_key, canonical = identity
        if identity_key in holdout:
            counts["external_holdout_overlap"] += 1
            review_rows.append(
                raw_review_row(spec, record_number, "external_holdout_overlap", molecule, identity_key)
            )
            continue

        current_labels = strong.get(identity_key, set())
        if 1 in current_labels:
            counts["conflict_with_current_strong_positive"] += 1
            review_rows.append(
                raw_review_row(
                    spec,
                    record_number,
                    "conflict_with_current_strong_positive",
                    molecule,
                    identity_key,
                )
            )
            continue
        if current_labels == {0}:
            counts["already_present_strong_negative"] += 1
            continue
        if identity_key in accepted_by_identity:
            counts["duplicate_source_identity"] += 1
            continue

        provided_identity = ""
        if molecule.HasProp("InChIKey"):
            provided_identity = molecule.GetProp("InChIKey").strip()
        casrn = ""
        for field in ("CASRN", "casrn"):
            if molecule.HasProp(field) and molecule.GetProp(field).strip():
                casrn = molecule.GetProp(field).strip()
                break
        name = ""
        if molecule.HasProp("substance_name"):
            name = molecule.GetProp("substance_name").strip()
        if not name or name == "-":
            name = casrn or identity_key
        guideline = (
            molecule.GetProp("guideline").strip()
            if molecule.HasProp("guideline")
            else spec.method
        )
        record_id = source_record_id(spec, molecule, record_number)
        mapping_rules = [
            "explicit_curated_experimental_outcome_0",
            "absence_of_hazard_statement_not_used",
            "defined_single_structure",
            "exact_identity_deduplicated",
            "current_strong_conflicts_excluded",
            "external_holdout_quarantined",
        ]
        if spec.endpoint == "skin":
            mapping_rules.append("oecd_404_or_whitelisted_equivalent")
        else:
            mapping_rules.append("publication_dataset_oecd_405_curation")

        accepted_by_identity[identity_key] = {
            "smiles": canonical,
            "label": 0,
            "name": name,
            "inchikey": identity_key if not identity_key.startswith("SMILES:") else "",
            "casrn": casrn,
            "source": "STopTox peer-reviewed curated experimental irritation dataset",
            "source_url": STOPTOX_PAPER_URL,
            "evidence_ids": json.dumps([record_id], ensure_ascii=False),
            "mapping_rules": json.dumps(mapping_rules, ensure_ascii=False),
            "label_quality": "peer_reviewed_curated_experimental_negative",
            "sample_weight": spec.sample_weight,
            "study_type": "experimental",
            "method": guideline,
            "result": "not irritating / not classified (curated Outcome=0)",
            "reliability": "not_reported_per_record_in_public_sdf",
            "source_record_id": record_id,
            "source_sha256": source_hash,
            "source_repository": STOPTOX_REPOSITORY_URL,
            "source_commit": STOPTOX_COMMIT,
            "provided_identity": provided_identity,
        }
        counts["accepted_new_negative"] += 1

    rows = sorted(accepted_by_identity.values(), key=lambda item: (item["inchikey"], item["smiles"]))
    summary = {
        "endpoint": spec.endpoint,
        "source_file": str(source_path.relative_to(BASE)),
        "source_url": spec.source_url,
        "source_sha256": source_hash,
        "output_file": str((CURATED_DIR / spec.output_filename).relative_to(BASE)),
        "sample_weight": spec.sample_weight,
        "reliability_policy": (
            "per-record reliability is not exposed in the public SDF; accepted rows retain an explicit "
            "lower weight and the peer-reviewed dataset-level OECD experimental curation provenance"
        ),
        **dict(sorted(counts.items())),
    }
    return rows, review_rows, summary


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true", help="download missing commit-pinned STopTox SDF files")
    parser.add_argument("--force-download", action="store_true", help="replace and re-verify local source SDF files")
    parser.add_argument("--endpoint", choices=("all", "skin", "eye"), default="all")
    args = parser.parse_args()

    selected = list(SOURCES) if args.endpoint == "all" else [args.endpoint]
    summaries: dict[str, Any] = {}
    all_review_rows: list[dict[str, Any]] = []
    total_accepted = 0
    for endpoint in selected:
        spec = SOURCES[endpoint]
        source_path = RAW_SOURCE_DIR / spec.source_filename
        if args.download or args.force_download:
            source_path = download_source(spec, force=args.force_download)
        elif not source_path.exists():
            raise FileNotFoundError(f"missing {source_path}; rerun with --download")
        actual_hash = file_sha256(source_path)
        if actual_hash != spec.expected_sha256:
            raise ValueError(
                f"SHA-256 mismatch for {source_path}: expected {spec.expected_sha256}, got {actual_hash}"
            )

        rows, review_rows, summary = prepare_endpoint(spec, source_path)
        output_path = CURATED_DIR / spec.output_filename
        write_csv(output_path, rows, OUTPUT_COLUMNS)
        summary["output_sha256"] = file_sha256(output_path)
        summaries[endpoint] = summary
        all_review_rows.extend(review_rows)
        total_accepted += len(rows)
        print(
            f"{endpoint}: accepted_new_negative={len(rows)} review_rows={len(review_rows)} "
            f"output={output_path.relative_to(BASE)}",
            flush=True,
        )

    review_columns = [
        "endpoint",
        "record_number",
        "source_record_id",
        "reason",
        "identity_key",
        "outcome",
        "casrn",
        "guideline",
    ]
    write_csv(REVIEW_PATH, all_review_rows, review_columns)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "STopTox peer-reviewed curated experimental datasets",
        "paper": STOPTOX_PAPER_URL,
        "repository": STOPTOX_REPOSITORY_URL,
        "commit": STOPTOX_COMMIT,
        "negative_policy": (
            "explicit curated experimental Outcome=0 only; missing H315/H319 is never a negative label"
        ),
        "conflict_policy": (
            "same/higher-tier current positive evidence is review-gated; existing strong negatives are deduplicated; "
            "lower-tier PubChem contradictions are left for the central integrity audit to override"
        ),
        "endpoints": summaries,
        "total_new_negative_rows": total_accepted,
        "review_queue": str(REVIEW_PATH.relative_to(BASE)),
        "review_queue_rows": len(all_review_rows),
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
