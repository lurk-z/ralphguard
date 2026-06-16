"""Assessment schemas — request, queued response, final result."""
from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


Endpoint = Literal["skin", "eye", "sens", "acute"]
Region = Literal["forearm", "hand", "face", "eye"]
ConfidenceLevel = Literal["High", "Medium", "Low"]


class AssessmentStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class FormulaItem(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=1000)
    name: Optional[str] = Field(None, max_length=300)
    concentration: float = Field(..., ge=0, le=100, description="Percentage 0-100")


class CreateAssessmentRequest(BaseModel):
    formula: List[FormulaItem] = Field(..., min_length=1, max_length=20)
    region: Region
    project_id: Optional[int] = None


class CreateAssessmentResponse(BaseModel):
    job_id: str
    status: AssessmentStatus


class Confidence(BaseModel):
    level: ConfidenceLevel
    reason_th: str
    score: float
    in_domain: bool
    domain_similarity: float


class EndpointResult(BaseModel):
    peak_score: float = Field(..., description="0-100 peak risk score")
    timecourse: List[int] = Field(..., description="Day 1, Day 3, Day 7 scores 0-100")
    band: Literal["low", "moderate", "high", "severe"]
    confidence: Confidence


class SubstancePrediction(BaseModel):
    smiles: str
    canonical_smiles: str
    name: Optional[str]
    concentration: float
    descriptors: dict
    per_endpoint: dict
    confidence: Confidence


class AssessmentResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    job_id: str = Field(..., alias="id")
    status: AssessmentStatus
    region: str
    formula: List[FormulaItem]
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
