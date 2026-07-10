"""Substance — a canonical chemical record, deduplicated by canonical SMILES."""
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Substance(Base):
    __tablename__ = "substances"
    __table_args__ = (
        UniqueConstraint("canonical_smiles", name="uq_substances_canonical_smiles"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    smiles: Mapped[str] = mapped_column(String(1000), nullable=False)
    canonical_smiles: Mapped[str] = mapped_column(String(1000), nullable=False, index=True)
    descriptors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
