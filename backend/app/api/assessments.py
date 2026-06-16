"""Risk assessment endpoints — create + poll."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.assessment import (
    AssessmentResult,
    AssessmentStatus,
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
    db: Session = Depends(get_db),
) -> CreateAssessmentResponse:
    """Queue a formula for QSAR risk assessment. Poll the result via GET /{job_id}."""
    row = assessment_service.create_assessment(db, payload)
    return CreateAssessmentResponse(job_id=row.id, status=AssessmentStatus(row.status.value))


@router.get("/{job_id}", response_model=AssessmentResult)
async def get_assessment(
    job_id: str,
    db: Session = Depends(get_db),
) -> AssessmentResult:
    row = assessment_service.get_assessment(db, job_id)
    if row is None:
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
