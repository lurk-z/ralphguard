"""seed the verified offline ingredient registry

Revision ID: 20260724_0004
Revises: 20260724_0003
Create Date: 2026-07-24
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260724_0004"
down_revision: Union[str, None] = "20260724_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_BATCH = "pubchem-registry-20260724-v1"
SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "ingredient_registry_seed.csv"


def _nullable(value: str) -> str | None:
    value = value.strip()
    return value or None


def upgrade() -> None:
    if not SEED_PATH.exists():
        raise RuntimeError(f"ingredient registry seed is missing: {SEED_PATH}")

    with SEED_PATH.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) < 1000:
        raise RuntimeError(f"ingredient registry seed is unexpectedly small: {len(rows)} rows")

    statement = sa.text(
        """
        INSERT INTO ingredient_registry (
            normalized_name, inci_name, canonical_name, thai_names, synonyms,
            cas_number, pubchem_cid, canonical_smiles, inchi, inchikey,
            molecular_formula, molecular_weight, substance_type,
            structure_status, qsar_eligible, assessment_method,
            regulatory_status_th, provenance, verification_status,
            registry_version, observation_count
        ) VALUES (
            :normalized_name, :inci_name, :canonical_name,
            CAST(:thai_names AS jsonb), CAST(:synonyms AS jsonb),
            :cas_number, :pubchem_cid, :canonical_smiles, :inchi, :inchikey,
            :molecular_formula, :molecular_weight, :substance_type,
            :structure_status, :qsar_eligible, :assessment_method,
            CAST(:regulatory_status_th AS jsonb), CAST(:provenance AS jsonb),
            :verification_status, :registry_version, 1
        )
        ON CONFLICT (normalized_name) DO NOTHING
        """
    )
    payload = []
    for row in rows:
        provenance = json.loads(row["provenance"] or "{}")
        provenance["offline_seed"] = SEED_BATCH
        payload.append(
            {
                "normalized_name": row["normalized_name"],
                "inci_name": _nullable(row["inci_name"]),
                "canonical_name": row["canonical_name"],
                "thai_names": row["thai_names"] or "[]",
                "synonyms": row["synonyms"] or "[]",
                "cas_number": _nullable(row["cas_number"]),
                "pubchem_cid": int(row["pubchem_cid"]) if row["pubchem_cid"] else None,
                "canonical_smiles": _nullable(row["canonical_smiles"]),
                "inchi": _nullable(row["inchi"]),
                "inchikey": _nullable(row["inchikey"]),
                "molecular_formula": _nullable(row["molecular_formula"]),
                "molecular_weight": float(row["molecular_weight"]) if row["molecular_weight"] else None,
                "substance_type": row["substance_type"],
                "structure_status": row["structure_status"],
                "qsar_eligible": row["qsar_eligible"].lower() == "true",
                "assessment_method": row["assessment_method"],
                "regulatory_status_th": row["regulatory_status_th"] or "null",
                "provenance": json.dumps(provenance, ensure_ascii=False),
                "verification_status": row["verification_status"],
                "registry_version": int(row["registry_version"] or 1),
            }
        )

    connection = op.get_bind()
    for offset in range(0, len(payload), 250):
        connection.execute(statement, payload[offset : offset + 250])


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM ingredient_registry WHERE provenance->>'offline_seed' = :seed_batch"
        ).bindparams(seed_batch=SEED_BATCH)
    )
