"""Botanical/material/constituent hierarchy for Thai herbal evidence."""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HerbalPlant(Base):
    __tablename__ = "herbal_plants"
    __table_args__ = (UniqueConstraint("accepted_scientific_name", name="uq_herbal_plant_accepted_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    thai_name: Mapped[str] = mapped_column(String(300), index=True)
    english_name: Mapped[str | None] = mapped_column(String(300), nullable=True, index=True)
    scientific_name: Mapped[str] = mapped_column(String(300), index=True)
    accepted_scientific_name: Mapped[str] = mapped_column(String(300), index=True)
    family: Mapped[str | None] = mapped_column(String(200), nullable=True)
    synonyms: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    provenance: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    verification_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class HerbalMaterial(Base):
    __tablename__ = "herbal_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    herb_id: Mapped[int] = mapped_column(ForeignKey("herbal_plants.id", ondelete="CASCADE"), index=True)
    plant_part: Mapped[str] = mapped_column(String(200))
    material_type: Mapped[str] = mapped_column(String(60), index=True)
    extract_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    solvent: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extraction_method: Mapped[str | None] = mapped_column(Text, nullable=True)
    standardization_marker: Mapped[str | None] = mapped_column(String(300), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)


class HerbConstituent(Base):
    __tablename__ = "herb_constituents"
    __table_args__ = (
        UniqueConstraint("herb_id", "material_id", "ingredient_registry_id", "compound_name", name="uq_herb_constituent_identity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    herb_id: Mapped[int] = mapped_column(ForeignKey("herbal_plants.id", ondelete="CASCADE"), index=True)
    material_id: Mapped[int | None] = mapped_column(ForeignKey("herbal_materials.id", ondelete="CASCADE"), nullable=True, index=True)
    compound_name: Mapped[str] = mapped_column(String(300), index=True)
    ingredient_registry_id: Mapped[int | None] = mapped_column(ForeignKey("ingredient_registry.id", ondelete="SET NULL"), nullable=True, index=True)
    pubchem_cid: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    inchikey: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    relationship_type: Mapped[str] = mapped_column(String(60), nullable=False, default="reported_constituent")
    evidence_source: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_strength: Mapped[str] = mapped_column(String(30), nullable=False, default="unrated")


class HerbEvidence(Base):
    __tablename__ = "herb_evidence"

    id: Mapped[int] = mapped_column(primary_key=True)
    herb_id: Mapped[int] = mapped_column(ForeignKey("herbal_plants.id", ondelete="CASCADE"), index=True)
    material_id: Mapped[int | None] = mapped_column(ForeignKey("herbal_materials.id", ondelete="CASCADE"), nullable=True, index=True)
    endpoint: Mapped[str] = mapped_column(String(30), index=True)
    effect: Mapped[str] = mapped_column(String(100), index=True)
    evidence_type: Mapped[str] = mapped_column(String(60))
    source: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    doi: Mapped[str | None] = mapped_column(String(300), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

