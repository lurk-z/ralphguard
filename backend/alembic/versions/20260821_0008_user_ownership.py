"""Add Google-authenticated ownership to projects and assessments."""
from alembic import op
import sqlalchemy as sa

revision = "20260821_0008"
down_revision = "20260820_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("owner_id", sa.String(255), nullable=True))
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.add_column("assessments", sa.Column("owner_id", sa.String(255), nullable=True))
    op.create_index("ix_assessments_owner_id", "assessments", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_assessments_owner_id", table_name="assessments")
    op.drop_column("assessments", "owner_id")
    op.drop_index("ix_projects_owner_id", table_name="projects")
    op.drop_column("projects", "owner_id")
