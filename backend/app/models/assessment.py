"""Assessment — one risk-screening job for a formula on a body region."""
import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AssessmentStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    formula: Mapped[list] = mapped_column(JSONB, nullable=False)
    status: Mapped[AssessmentStatus] = mapped_column(
        SAEnum(AssessmentStatus, name="assessment_status"),
        default=AssessmentStatus.queued,
        nullable=False,
        index=True,
    )
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project | None"] = relationship(back_populates="assessments")
