"""Assessment persistence and queue/inline execution dispatch."""
import datetime as dt
import json
import uuid
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Assessment, AssessmentStatus
from app.schemas.assessment import CreateAssessmentRequest
from app.services.queue import enqueue_assessment


def create_assessment(
    db: Session,
    payload: CreateAssessmentRequest,
    *,
    owner_id: str | None = None,
    enqueue: bool = True,
) -> Assessment:
    """Persist a queued assessment and optionally push it to Redis."""
    job_id = str(uuid.uuid4())
    row = Assessment(
        id=job_id,
        owner_id=owner_id,
        project_id=payload.project_id,
        region=payload.region,
        formula=[item.model_dump() for item in payload.formula],
        status=AssessmentStatus.queued,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if enqueue:
        enqueue_assessment(job_id)
    return row


def _cache_substances(db: Session, result: dict) -> None:
    """Best-effort descriptor cache, matching the standalone worker behavior."""
    for substance in result.get("substances") or []:
        canonical = substance.get("canonical_smiles")
        if not canonical:
            continue
        db.execute(
            text(
                "INSERT INTO substances (smiles, canonical_smiles, descriptors) "
                "VALUES (:smiles, :canonical, CAST(:descriptors AS jsonb)) "
                "ON CONFLICT (canonical_smiles) DO UPDATE "
                "SET descriptors = EXCLUDED.descriptors"
            ),
            {
                "smiles": substance.get("smiles") or canonical,
                "canonical": canonical,
                "descriptors": json.dumps(substance.get("descriptors") or {}),
            },
        )


def process_assessment_inline(job_id: str) -> None:
    """Run QSAR inside the FastAPI service for the free demo deployment."""
    from app.db.session import SessionLocal
    from app.services.local_inference import run_assessment

    with SessionLocal() as db:
        row = db.get(Assessment, job_id)
        if row is None:
            return
        formula = row.formula
        region = row.region
        row.status = AssessmentStatus.running
        row.error = None
        db.commit()

        try:
            result = run_assessment(formula, region)
            row.status = AssessmentStatus.completed
            row.result = result
            row.completed_at = dt.datetime.now(dt.timezone.utc)
            db.commit()
            try:
                _cache_substances(db, result)
                db.commit()
            except Exception:
                db.rollback()
        except Exception as exc:  # noqa: BLE001 — persist a user-visible job failure
            db.rollback()
            row = db.get(Assessment, job_id)
            if row is None:
                return
            row.status = AssessmentStatus.failed
            row.error = str(exc)[:1900]
            row.completed_at = dt.datetime.now(dt.timezone.utc)
            db.commit()


def get_assessment(db: Session, job_id: str) -> Optional[Assessment]:
    return db.get(Assessment, job_id)
