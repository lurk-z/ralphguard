"""seed the endpoint-balanced 50k registry slice and its evidence

Deployments previously came up with only the 1,336 substances written by
revision 20260724_0004, because the ~189,000 substances imported from PubChem
existed solely in the development database. This revision ships a larger,
endpoint-balanced slice as compressed CSV so a fresh environment seeds itself
during ``alembic upgrade head`` instead of requiring a manual import against a
live database.

Rows are staged through ``COPY`` and inserted with ``ON CONFLICT DO NOTHING``.
Loading 50,000 substances and 114,577 evidence rows one statement at a time
would delay the container's first health check; the staged bulk load finishes
in seconds and reruns cleanly.

Revision ID: 20260821_0009
Revises: 20260821_0008
Create Date: 2026-08-21
"""
from __future__ import annotations

import gzip
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260821_0009"
down_revision: Union[str, None] = "20260821_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_BATCH = "registry-slice-20260821-v2"
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
REGISTRY_SEED = DATA_DIR / "ingredient_registry_seed_v2.csv.gz"
EVIDENCE_SEED = DATA_DIR / "experimental_evidence_seed_v2.csv.gz"

REGISTRY_COLUMNS = (
    "normalized_name", "inci_name", "canonical_name", "thai_names", "synonyms",
    "cas_number", "pubchem_cid", "canonical_smiles", "inchi", "inchikey",
    "molecular_formula", "molecular_weight", "substance_type", "structure_status",
    "qsar_eligible", "assessment_method", "regulatory_status_th", "provenance",
    "verification_status", "registry_version",
)
EVIDENCE_COLUMNS = (
    "normalized_name", "pubchem_cid", "endpoint", "candidate_label", "evidence_type",
    "hazard_codes", "source_name", "source_id", "source_url", "source_quality",
    "evidence_fingerprint", "provenance", "review_status",
)


def _stage(connection, table: str, columns: Sequence[str], path: Path) -> None:
    """COPY a gzipped CSV into an all-text temporary staging table."""
    definition = ", ".join(f"{name} text" for name in columns)
    connection.exec_driver_sql(f"CREATE TEMP TABLE {table} ({definition}) ON COMMIT DROP")
    raw = connection.connection.driver_connection
    with raw.cursor() as cursor, gzip.open(path, "rb") as handle:
        cursor.copy_expert(
            f"COPY {table} ({', '.join(columns)}) FROM STDIN WITH (FORMAT csv, HEADER true)",
            handle,
        )


def upgrade() -> None:
    for path in (REGISTRY_SEED, EVIDENCE_SEED):
        if not path.exists():
            raise RuntimeError(f"registry seed slice is missing: {path}")

    connection = op.get_bind()
    _stage(connection, "stage_registry", REGISTRY_COLUMNS, REGISTRY_SEED)
    _stage(connection, "stage_evidence", EVIDENCE_COLUMNS, EVIDENCE_SEED)

    registry_count = connection.exec_driver_sql(
        "SELECT count(*) FROM stage_registry"
    ).scalar()
    if not registry_count or registry_count < 1000:
        raise RuntimeError(f"registry seed slice is unexpectedly small: {registry_count} rows")

    # The seed batch is recorded inside provenance so downgrade can remove
    # exactly these rows without touching substances added by other sources.
    connection.exec_driver_sql(
        """
        INSERT INTO ingredient_registry (
            normalized_name, inci_name, canonical_name, thai_names, synonyms,
            cas_number, pubchem_cid, canonical_smiles, inchi, inchikey,
            molecular_formula, molecular_weight, substance_type, structure_status,
            qsar_eligible, assessment_method, regulatory_status_th, provenance,
            verification_status, registry_version, observation_count
        )
        SELECT
            normalized_name,
            nullif(inci_name, ''),
            canonical_name,
            coalesce(nullif(thai_names, ''), '[]')::jsonb,
            coalesce(nullif(synonyms, ''), '[]')::jsonb,
            nullif(cas_number, ''),
            nullif(pubchem_cid, '')::bigint,
            nullif(canonical_smiles, ''),
            nullif(inchi, ''),
            nullif(inchikey, ''),
            nullif(molecular_formula, ''),
            nullif(molecular_weight, '')::double precision,
            substance_type,
            structure_status,
            qsar_eligible::boolean,
            assessment_method,
            nullif(regulatory_status_th, '')::jsonb,
            jsonb_set(
                coalesce(nullif(provenance, ''), '{}')::jsonb,
                '{offline_seed}',
                to_jsonb(%(seed)s::text),
                true
            ),
            verification_status,
            coalesce(nullif(registry_version, '')::integer, 1),
            1
        FROM stage_registry
        ON CONFLICT (normalized_name) DO NOTHING
        """,
        {"seed": SEED_BATCH},
    )

    # Parent ids differ per database, so evidence is attached by resolving the
    # substance through its normalized name rather than a carried-over key.
    connection.exec_driver_sql(
        """
        INSERT INTO experimental_evidence (
            ingredient_id, pubchem_cid, endpoint, candidate_label, evidence_type,
            hazard_codes, source_name, source_id, source_url, source_quality,
            evidence_fingerprint, raw_evidence, provenance, review_status
        )
        SELECT
            r.id,
            s.pubchem_cid::bigint,
            s.endpoint,
            s.candidate_label::integer,
            s.evidence_type,
            coalesce(nullif(s.hazard_codes, ''), '[]')::jsonb,
            s.source_name,
            nullif(s.source_id, ''),
            nullif(s.source_url, ''),
            s.source_quality,
            s.evidence_fingerprint,
            '{}'::jsonb,
            jsonb_set(
                coalesce(nullif(s.provenance, ''), '{}')::jsonb,
                '{offline_seed}',
                to_jsonb(%(seed)s::text),
                true
            ),
            s.review_status
        FROM stage_evidence s
        JOIN ingredient_registry r ON r.normalized_name = s.normalized_name
        ON CONFLICT (ingredient_id, endpoint, evidence_fingerprint) DO NOTHING
        """,
        {"seed": SEED_BATCH},
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM experimental_evidence "
            "WHERE provenance->>'offline_seed' = :seed_batch"
        ).bindparams(seed_batch=SEED_BATCH)
    )
    op.execute(
        sa.text(
            "DELETE FROM ingredient_registry WHERE provenance->>'offline_seed' = :seed_batch"
        ).bindparams(seed_batch=SEED_BATCH)
    )
