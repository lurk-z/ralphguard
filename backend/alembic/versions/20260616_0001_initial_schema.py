"""initial schema — projects, substances, assessments

Revision ID: 20260616_0001
Revises:
Create Date: 2026-06-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260616_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_projects_name", "projects", ["name"])

    op.create_table(
        "substances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=300), nullable=True),
        sa.Column("smiles", sa.String(length=1000), nullable=False),
        sa.Column("canonical_smiles", sa.String(length=1000), nullable=False),
        sa.Column("descriptors", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("canonical_smiles", name="uq_substances_canonical_smiles"),
    )
    op.create_index("ix_substances_canonical_smiles", "substances", ["canonical_smiles"])

    # Create the assessment_status ENUM exactly once.
    #   - create_type=False  -> the column below will NOT auto-emit CREATE TYPE
    #     during op.create_table (an inline sa.Enum default would, leading to a
    #     duplicate "type already exists" failure on `alembic upgrade head`).
    #   - .create(checkfirst=True) -> emits a single CREATE TYPE, idempotent on
    #     re-apply.
    assessment_status = postgresql.ENUM(
        "queued", "running", "completed", "failed",
        name="assessment_status",
        create_type=False,
    )
    assessment_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "assessments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("region", sa.String(length=50), nullable=False),
        sa.Column("formula", postgresql.JSONB(), nullable=False),
        sa.Column(
            "status",
            assessment_status,
            nullable=False,
            server_default="queued",
        ),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("error", sa.String(length=2000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_assessments_project_id", "assessments", ["project_id"])
    op.create_index("ix_assessments_status", "assessments", ["status"])


def downgrade() -> None:
    op.drop_index("ix_assessments_status", table_name="assessments")
    op.drop_index("ix_assessments_project_id", table_name="assessments")
    op.drop_table("assessments")
    sa.Enum(name="assessment_status").drop(op.get_bind(), checkfirst=True)
    op.drop_index("ix_substances_canonical_smiles", table_name="substances")
    op.drop_table("substances")
    op.drop_index("ix_projects_name", table_name="projects")
    op.drop_table("projects")
