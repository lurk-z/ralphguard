"""persistent ingredient registry and PubChem cache

Revision ID: 20260724_0002
Revises: 20260616_0001
Create Date: 2026-07-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260724_0002"
down_revision: Union[str, None] = "20260616_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ingredient_registry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("normalized_name", sa.String(length=300), nullable=False),
        sa.Column("inci_name", sa.String(length=300), nullable=True),
        sa.Column("canonical_name", sa.String(length=300), nullable=False),
        sa.Column("thai_names", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("synonyms", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("cas_number", sa.String(length=40), nullable=True),
        sa.Column("pubchem_cid", sa.BigInteger(), nullable=True),
        sa.Column("canonical_smiles", sa.String(length=2000), nullable=True),
        sa.Column("inchi", sa.Text(), nullable=True),
        sa.Column("inchikey", sa.String(length=80), nullable=True),
        sa.Column("molecular_formula", sa.String(length=200), nullable=True),
        sa.Column("molecular_weight", sa.Float(), nullable=True),
        sa.Column(
            "substance_type",
            sa.String(length=60),
            nullable=False,
            server_default="unknown_composition",
        ),
        sa.Column(
            "structure_status",
            sa.String(length=40),
            nullable=False,
            server_default="unresolved",
        ),
        sa.Column("qsar_eligible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "assessment_method",
            sa.String(length=80),
            nullable=False,
            server_default="unresolved",
        ),
        sa.Column("regulatory_status_th", postgresql.JSONB(), nullable=True),
        sa.Column("provenance", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "verification_status",
            sa.String(length=30),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("registry_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("observation_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_error", sa.String(length=1000), nullable=True),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("normalized_name", name="uq_ingredient_registry_normalized_name"),
    )
    for column in (
        "normalized_name",
        "inci_name",
        "cas_number",
        "pubchem_cid",
        "inchikey",
        "substance_type",
        "structure_status",
        "verification_status",
    ):
        op.create_index(f"ix_ingredient_registry_{column}", "ingredient_registry", [column])

    op.create_table(
        "pubchem_cache",
        sa.Column("query_key", sa.String(length=300), primary_key=True),
        sa.Column("query_name", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("error", sa.String(length=1000), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_pubchem_cache_status", "pubchem_cache", ["status"])
    op.create_index("ix_pubchem_cache_expires_at", "pubchem_cache", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_pubchem_cache_expires_at", table_name="pubchem_cache")
    op.drop_index("ix_pubchem_cache_status", table_name="pubchem_cache")
    op.drop_table("pubchem_cache")
    for column in reversed(
        (
            "normalized_name",
            "inci_name",
            "cas_number",
            "pubchem_cid",
            "inchikey",
            "substance_type",
            "structure_status",
            "verification_status",
        )
    ):
        op.drop_index(f"ix_ingredient_registry_{column}", table_name="ingredient_registry")
    op.drop_table("ingredient_registry")
