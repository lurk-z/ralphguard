"""Export an endpoint-balanced registry slice as gzipped seed data.

The deployment seeds itself from CSV during ``alembic upgrade head`` rather
than from a live copy of the development database, so a fresh environment
comes up complete without anyone running an import against production by hand.

Selection reuses :mod:`sync_registry_to_target`, so the seed and the direct
sync always choose the same substances.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = (
        "postgresql://ralphguard:ralphguard_dev@localhost:5432/ralphguard"
    )

from app.models.ingredient_registry import (  # noqa: E402
    ExperimentalEvidence,
    IngredientRegistry,
)
from scripts.sync_registry_to_target import select_balanced_substances  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
REGISTRY_OUT = DATA_DIR / "ingredient_registry_seed_v2.csv.gz"
EVIDENCE_OUT = DATA_DIR / "experimental_evidence_seed_v2.csv.gz"
MANIFEST_OUT = DATA_DIR / "registry_seed_v2_manifest.json"

REGISTRY_COLUMNS = (
    "normalized_name", "inci_name", "canonical_name", "thai_names", "synonyms",
    "cas_number", "pubchem_cid", "canonical_smiles", "inchi", "inchikey",
    "molecular_formula", "molecular_weight", "substance_type", "structure_status",
    "qsar_eligible", "assessment_method", "regulatory_status_th", "provenance",
    "verification_status", "registry_version",
)
# ``ingredient_id`` is deliberately absent: primary keys differ between
# databases, so the loader re-resolves the parent through normalized_name.
EVIDENCE_COLUMNS = (
    "normalized_name", "pubchem_cid", "endpoint", "candidate_label", "evidence_type",
    "hazard_codes", "source_name", "source_id", "source_url", "source_quality",
    "evidence_fingerprint", "provenance", "review_status",
)

JSON_COLUMNS = {
    "thai_names", "synonyms", "regulatory_status_th", "provenance", "hazard_codes",
}


def _cell(value: object, column: str) -> str:
    if value is None:
        return ""
    if column in JSON_COLUMNS:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--substances", type=int, default=50_000)
    args = parser.parse_args()
    if args.substances < 1:
        parser.error("--substances must be positive")

    engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with SessionLocal() as db:
        selected, coverage = select_balanced_substances(db, args.substances)
        print(f"selected {len(selected)} substances; coverage={coverage}")

        name_by_id: dict[int, str] = {}
        registry_rows = 0
        with gzip.open(REGISTRY_OUT, "wt", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(REGISTRY_COLUMNS)
            for start in range(0, len(selected), 1000):
                batch = selected[start : start + 1000]
                for row in db.scalars(
                    select(IngredientRegistry).where(IngredientRegistry.id.in_(batch))
                ):
                    name_by_id[row.id] = row.normalized_name
                    writer.writerow(
                        [_cell(getattr(row, column), column) for column in REGISTRY_COLUMNS]
                    )
                    registry_rows += 1
        print(f"registry rows written: {registry_rows}")

        evidence_rows = 0
        with gzip.open(EVIDENCE_OUT, "wt", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(EVIDENCE_COLUMNS)
            for start in range(0, len(selected), 1000):
                batch = selected[start : start + 1000]
                for row in db.scalars(
                    select(ExperimentalEvidence).where(
                        ExperimentalEvidence.ingredient_id.in_(batch)
                    )
                ):
                    parent = name_by_id.get(row.ingredient_id)
                    if parent is None:
                        continue
                    values = []
                    for column in EVIDENCE_COLUMNS:
                        if column == "normalized_name":
                            values.append(parent)
                        else:
                            values.append(_cell(getattr(row, column), column))
                    writer.writerow(values)
                    evidence_rows += 1
        print(f"evidence rows written: {evidence_rows}")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "requested_substances": args.substances,
        "registry_rows": registry_rows,
        "evidence_rows": evidence_rows,
        "endpoint_coverage": coverage,
        "files": {
            "registry": {
                "path": REGISTRY_OUT.name,
                "bytes": REGISTRY_OUT.stat().st_size,
                "sha256": sha256_file(REGISTRY_OUT),
            },
            "evidence": {
                "path": EVIDENCE_OUT.name,
                "bytes": EVIDENCE_OUT.stat().st_size,
                "sha256": sha256_file(EVIDENCE_OUT),
            },
        },
        "excluded_columns": {
            "experimental_evidence.raw_evidence": (
                "raw provider payload kept only in the development database; the "
                "citation chain (source name/id/url/quality and fingerprint) and "
                "the import provenance are both retained here"
            )
        },
        "selection_policy": (
            "verified substances with a canonical structure, chosen round-robin "
            "across endpoints starting from the scarcest"
        ),
    }
    MANIFEST_OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest["files"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
