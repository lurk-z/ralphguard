"""Project — top-level grouping of assessments."""
from datetime import datetime
from typing import List

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    assessments: Mapped[List["Assessment"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
