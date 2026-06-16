"""Substance management endpoints (stub)."""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class SmilesInput(BaseModel):
    smiles: str


@router.post("/validate")
async def validate_smiles(payload: SmilesInput):
    """Validate a SMILES string (stub - will use RDKit)."""
    # TODO: integrate with scientific worker
    return {
        "smiles": payload.smiles,
        "valid": True,
        "canonical": payload.smiles,  # placeholder
    }
