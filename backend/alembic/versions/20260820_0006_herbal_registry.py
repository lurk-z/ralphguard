"""Add botanical, material, constituent, and herbal evidence tables.

Revision ID: 20260820_0006
Revises: 20260730_0005
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260820_0006"
down_revision = "20260730_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "herbal_plants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("thai_name", sa.String(300), nullable=False),
        sa.Column("english_name", sa.String(300)),
        sa.Column("scientific_name", sa.String(300), nullable=False),
        sa.Column("accepted_scientific_name", sa.String(300), nullable=False),
        sa.Column("family", sa.String(200)),
        sa.Column("synonyms", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("provenance", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("verification_status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("accepted_scientific_name", name="uq_herbal_plant_accepted_name"),
    )
    for column in ("thai_name", "english_name", "scientific_name", "accepted_scientific_name", "verification_status"):
        op.create_index(f"ix_herbal_plants_{column}", "herbal_plants", [column])
    op.create_table(
        "herbal_materials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("herb_id", sa.Integer(), sa.ForeignKey("herbal_plants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plant_part", sa.String(200), nullable=False),
        sa.Column("material_type", sa.String(60), nullable=False),
        sa.Column("extract_type", sa.String(200)),
        sa.Column("solvent", sa.String(200)),
        sa.Column("extraction_method", sa.Text()),
        sa.Column("standardization_marker", sa.String(300)),
        sa.Column("description", sa.Text()),
        sa.Column("source", sa.Text(), nullable=False),
    )
    op.create_index("ix_herbal_materials_herb_id", "herbal_materials", ["herb_id"])
    op.create_index("ix_herbal_materials_material_type", "herbal_materials", ["material_type"])
    op.create_table(
        "herb_constituents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("herb_id", sa.Integer(), sa.ForeignKey("herbal_plants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("herbal_materials.id", ondelete="CASCADE")),
        sa.Column("compound_name", sa.String(300), nullable=False),
        sa.Column("ingredient_registry_id", sa.Integer(), sa.ForeignKey("ingredient_registry.id", ondelete="SET NULL")),
        sa.Column("pubchem_cid", sa.BigInteger()),
        sa.Column("inchikey", sa.String(80)),
        sa.Column("relationship_type", sa.String(60), nullable=False, server_default="reported_constituent"),
        sa.Column("evidence_source", sa.Text(), nullable=False),
        sa.Column("evidence_strength", sa.String(30), nullable=False, server_default="unrated"),
        sa.UniqueConstraint("herb_id", "material_id", "ingredient_registry_id", "compound_name", name="uq_herb_constituent_identity"),
    )
    for column in ("herb_id", "material_id", "compound_name", "ingredient_registry_id", "pubchem_cid", "inchikey"):
        op.create_index(f"ix_herb_constituents_{column}", "herb_constituents", [column])
    op.create_table(
        "herb_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("herb_id", sa.Integer(), sa.ForeignKey("herbal_plants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("herbal_materials.id", ondelete="CASCADE")),
        sa.Column("endpoint", sa.String(30), nullable=False),
        sa.Column("effect", sa.String(100), nullable=False),
        sa.Column("evidence_type", sa.String(60), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text()),
        sa.Column("doi", sa.String(300)),
        sa.Column("notes", sa.Text()),
    )
    for column in ("herb_id", "material_id", "endpoint", "effect"):
        op.create_index(f"ix_herb_evidence_{column}", "herb_evidence", [column])


def downgrade() -> None:
    op.drop_table("herb_evidence")
    op.drop_table("herb_constituents")
    op.drop_table("herbal_materials")
    op.drop_table("herbal_plants")

