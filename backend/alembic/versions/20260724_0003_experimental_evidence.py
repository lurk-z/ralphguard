"""reviewable PubChem endpoint evidence

Revision ID: 20260724_0003
Revises: 20260724_0002
Create Date: 2026-07-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260724_0003"
down_revision: Union[str, None] = "20260724_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "experimental_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "ingredient_id",
            sa.Integer(),
            sa.ForeignKey("ingredient_registry.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pubchem_cid", sa.BigInteger(), nullable=False),
        sa.Column("endpoint", sa.String(length=30), nullable=False),
        sa.Column("candidate_label", sa.Integer(), nullable=False),
        sa.Column(
            "evidence_type",
            sa.String(length=60),
            nullable=False,
            server_default="ghs_classification",
        ),
        sa.Column("hazard_codes", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("source_name", sa.String(length=500), nullable=False),
        sa.Column("source_id", sa.String(length=200), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column(
            "source_quality", sa.String(length=30), nullable=False, server_default="unrated"
        ),
        sa.Column("evidence_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("raw_evidence", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("provenance", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "review_status", sa.String(length=30), nullable=False, server_default="pending"
        ),
        sa.Column("reviewer_note", sa.String(length=2000), nullable=True),
        sa.Column(
            "imported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "ingredient_id",
            "endpoint",
            "evidence_fingerprint",
            name="uq_experimental_evidence_ingredient_endpoint_fingerprint",
        ),
    )
    for column in (
        "ingredient_id",
        "pubchem_cid",
        "endpoint",
        "source_quality",
        "review_status",
    ):
        op.create_index(f"ix_experimental_evidence_{column}", "experimental_evidence", [column])


def downgrade() -> None:
    for column in reversed(
        ("ingredient_id", "pubchem_cid", "endpoint", "source_quality", "review_status")
    ):
        op.drop_index(f"ix_experimental_evidence_{column}", table_name="experimental_evidence")
    op.drop_table("experimental_evidence")
