"""Add observation and evidence-gated continual queue tables."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260820_0007"
down_revision = "20260820_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "substance_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ingredient_id", sa.Integer(), sa.ForeignKey("ingredient_registry.id", ondelete="SET NULL")),
        sa.Column("original_query", sa.String(1000), nullable=False),
        sa.Column("normalized_query", sa.String(1000), nullable=False),
        sa.Column("query_type", sa.String(30), nullable=False, server_default="auto"),
        sa.Column("resolution_status", sa.String(40), nullable=False),
        sa.Column("canonical_smiles", sa.String(2000)),
        sa.Column("inchikey", sa.String(80)),
        sa.Column("registry_status", sa.String(40), nullable=False),
        sa.Column("qsar_eligible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("model_version", sa.String(100)),
        sa.Column("prediction_snapshot", postgresql.JSONB()),
        sa.Column("training_exposure", postgresql.JSONB()),
        sa.Column("applicability_domain", postgresql.JSONB()),
        sa.Column("uncertainty", sa.Float()),
        sa.Column("training_eligible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for column in ("ingredient_id", "resolution_status", "inchikey", "created_at"):
        op.create_index(f"ix_substance_observations_{column}", "substance_observations", [column])
    op.create_table(
        "continual_learning_queue",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("endpoint", sa.String(30), nullable=False),
        sa.Column("canonical_smiles", sa.String(2000), nullable=False),
        sa.Column("inchikey", sa.String(80), nullable=False),
        sa.Column("label", sa.Integer(), nullable=False),
        sa.Column("evidence_id", sa.Integer(), sa.ForeignKey("experimental_evidence.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("evidence_tier", sa.String(10), nullable=False),
        sa.Column("sample_weight", sa.Float(), nullable=False),
        sa.Column("review_status", sa.String(30), nullable=False),
        sa.Column("base_model_version", sa.String(100), nullable=False),
        sa.Column("added_to_candidate_version", sa.String(100)),
        sa.Column("eligibility_reason", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for column in ("endpoint", "inchikey", "evidence_id", "review_status"):
        op.create_index(f"ix_continual_learning_queue_{column}", "continual_learning_queue", [column])


def downgrade() -> None:
    op.drop_table("continual_learning_queue")
    op.drop_table("substance_observations")

