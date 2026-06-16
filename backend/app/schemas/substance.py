"""Substance schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SmilesInput(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=1000)
    name: Optional[str] = Field(None, max_length=300)


class SmilesValidationResult(BaseModel):
    smiles: str
    valid: bool
    canonical: Optional[str] = None
    descriptors: Optional[dict] = None
    error: Optional[str] = None


class SubstanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str]
    smiles: str
    canonical_smiles: str
    descriptors: Optional[dict]
    created_at: datetime
