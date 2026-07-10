"""Assessment service — creates DB rows and enqueues jobs."""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Assessment, AssessmentStatus
from app.schemas.assessment import CreateAssessmentRequest
from app.services.queue import enqueue_assessment


def create_assessment(db: Session, payload: CreateAssessmentRequest) -> Assessment:
    """Persist a queued assessment, push it to the worker queue, return the row."""
    job_id = str(uuid.uuid4())
    row = Assessment(
        id=job_id,
        project_id=payload.project_id,
        region=payload.region,
        formula=[item.model_dump() for item in payload.formula],
        status=AssessmentStatus.queued,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    enqueue_assessment(job_id)
    return row


def get_assessment(db: Session, job_id: str) -> Optional[Assessment]:
    return db.get(Assessment, job_id)
