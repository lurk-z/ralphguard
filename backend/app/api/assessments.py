"""Risk assessment endpoints — create + list + poll."""
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
from app.core.auth import CurrentUser, get_current_user
from app.models import Assessment, Project
from app.schemas.assessment import (
    AssessmentResult,
    AssessmentStatus,
    AssessmentSummary,
    CreateAssessmentRequest,
    CreateAssessmentResponse,
)
from app.services import assessment_service

router = APIRouter()


@router.post(
    "/",
    response_model=CreateAssessmentResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_assessment(
    payload: CreateAssessmentRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> CreateAssessmentResponse:
    """Start a formula assessment and poll the result via GET /{job_id}."""
    inline = settings.ASSESSMENT_EXECUTION_MODE == "inline"
    if payload.project_id is not None:
        project = db.get(Project, payload.project_id)
        if project is None or project.owner_id != user.id or project.deleted_at is not None:
            raise HTTPException(status_code=404, detail=f"project {payload.project_id} not found")
    row = assessment_service.create_assessment(db, payload, owner_id=user.id, enqueue=not inline)
    if inline:
        background_tasks.add_task(assessment_service.process_assessment_inline, row.id)
    return CreateAssessmentResponse(job_id=row.id, status=AssessmentStatus(row.status.value))


@router.get("/", response_model=List[AssessmentSummary])
async def list_assessments(
    db: Session = Depends(get_db),
    project_id: Optional[int] = Query(None, description="Filter by project"),
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
) -> List[AssessmentSummary]:
    """List recent assessments (newest first), optionally filtered by project."""
    stmt = select(Assessment).where(Assessment.owner_id == user.id).order_by(Assessment.created_at.desc()).limit(limit)
    if project_id is not None:
        stmt = stmt.where(Assessment.project_id == project_id)
    rows = db.execute(stmt).scalars().all()
    return [
        AssessmentSummary(
            id=r.id,
            status=AssessmentStatus(r.status.value),
            region=r.region,
            project_id=r.project_id,
            n_substances=len(r.formula or []),
            created_at=r.created_at,
            completed_at=r.completed_at,
        )
        for r in rows
    ]


@router.get("/{job_id}", response_model=AssessmentResult)
async def get_assessment(
    job_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> AssessmentResult:
    row = assessment_service.get_assessment(db, job_id)
    if row is None or row.owner_id != user.id:
        raise HTTPException(status_code=404, detail=f"assessment {job_id} not found")
    return AssessmentResult(
        id=row.id,
        status=AssessmentStatus(row.status.value),
        region=row.region,
        formula=row.formula,
        result=row.result,
        error=row.error,
        created_at=row.created_at,
        completed_at=row.completed_at,
    )
