"""Persistent ingredient identity registry and PubChem response cache."""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    ForeignKey,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IngredientRegistry(Base):
    """One normalized ingredient identity, including pending OCR discoveries."""

    __tablename__ = "ingredient_registry"
    __table_args__ = (
        UniqueConstraint("normalized_name", name="uq_ingredient_registry_normalized_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    normalized_name: Mapped[str] = mapped_column(String(300), index=True)
    inci_name: Mapped[str | None] = mapped_column(String(300), nullable=True, index=True)
    canonical_name: Mapped[str] = mapped_column(String(300), nullable=False)
    thai_names: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    synonyms: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    cas_number: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    pubchem_cid: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    canonical_smiles: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    inchi: Mapped[str | None] = mapped_column(Text, nullable=True)
    inchikey: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    molecular_formula: Mapped[str | None] = mapped_column(String(200), nullable=True)
    molecular_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    substance_type: Mapped[str] = mapped_column(
        String(60), nullable=False, default="unknown_composition", index=True
    )
    structure_status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="unresolved", index=True
    )
    qsar_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    assessment_method: Mapped[str] = mapped_column(
        String(80), nullable=False, default="unresolved"
    )
    regulatory_status_th: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    provenance: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )
    registry_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    observation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PubChemCache(Base):
    """Persistent positive and negative PUG REST cache."""

    __tablename__ = "pubchem_cache"

    query_key: Mapped[str] = mapped_column(String(300), primary_key=True)
    query_name: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ExperimentalEvidence(Base):
    """Endpoint-specific evidence staged for review before model training.

    PubChem annotations are not ground truth and remain pending by default.
    Training export requires manual review, multi-source consensus, or the
    explicit low-weight single-regulatory-source policy.
    """

    __tablename__ = "experimental_evidence"
    __table_args__ = (
        UniqueConstraint(
            "ingredient_id",
            "endpoint",
            "evidence_fingerprint",
            name="uq_experimental_evidence_ingredient_endpoint_fingerprint",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredient_registry.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pubchem_cid: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    candidate_label: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence_type: Mapped[str] = mapped_column(
        String(60), nullable=False, default="ghs_classification"
    )
    hazard_codes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source_name: Mapped[str] = mapped_column(String(500), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_quality: Mapped[str] = mapped_column(
        String(30), nullable=False, default="unrated", index=True
    )
    evidence_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    provenance: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    review_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )
    reviewer_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
