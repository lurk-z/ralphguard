"""Risk assessment endpoints (stub)."""
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class FormulaItem(BaseModel):
    smiles: str
    name: Optional[str] = None
    concentration: float = Field(..., ge=0, le=100, description="Percentage 0-100")


class AssessRequest(BaseModel):
    formula: List[FormulaItem]
    region: str = Field(..., description="forearm | hand | face | eye")


@router.post("/")
async def create_assessment(payload: AssessRequest):
    """Submit a formula for risk assessment.

    Returns a job_id that can be polled for results.
    """
    # TODO: enqueue to Redis Streams, return job_id
    return {
        "status": "queued",
        "job_id": "stub-job-id",
        "message": "Worker integration pending",
    }


@router.get("/{job_id}")
async def get_assessment(job_id: str):
    """Get assessment result by job ID."""
    # TODO: fetch from DB
    return {
        "job_id": job_id,
        "status": "pending",
        "result": None,
    }
