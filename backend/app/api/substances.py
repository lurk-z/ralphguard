"""Substance endpoints — SMILES validation via RDKit."""
from fastapi import APIRouter

from app.schemas.substance import SmilesInput, SmilesValidationResult
from app.services.chemistry import validate_and_describe

router = APIRouter()


@router.post("/validate", response_model=SmilesValidationResult)
async def validate_smiles(payload: SmilesInput) -> SmilesValidationResult:
    valid, canonical, descriptors, error = validate_and_describe(payload.smiles)
    return SmilesValidationResult(
        smiles=payload.smiles,
        valid=valid,
        canonical=canonical,
        descriptors=descriptors,
        error=error,
    )
