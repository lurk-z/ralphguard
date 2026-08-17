"""add project appearance and soft delete

Revision ID: 20260730_0005
Revises: 20260724_0004
Create Date: 2026-07-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260730_0005"
down_revision: Union[str, None] = "20260724_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "color_key",
            sa.String(length=20),
            server_default="teal",
            nullable=False,
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "icon_key",
            sa.String(length=30),
            server_default="flask",
            nullable=False,
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column(
        "projects",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_projects_deleted_at", "projects", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_projects_deleted_at", table_name="projects")
    op.drop_column("projects", "deleted_at")
    op.drop_column("projects", "updated_at")
    op.drop_column("projects", "icon_key")
    op.drop_column("projects", "color_key")
