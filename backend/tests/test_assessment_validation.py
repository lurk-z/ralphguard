"""Validation at the API boundary keeps invalid inputs out of the worker."""

import pytest
from pydantic import ValidationError

from app.schemas.assessment import CreateAssessmentRequest


def test_rejects_invalid_smiles():
    with pytest.raises(ValidationError, match="invalid SMILES"):
        CreateAssessmentRequest(
            formula=[{"name": "bad", "smiles": "not-a-smiles", "concentration": 10}],
            region="face",
        )


def test_rejects_formula_over_100_percent():
    with pytest.raises(ValidationError, match="exceeds 100"):
        CreateAssessmentRequest(
            formula=[
                {"name": "Ethanol", "smiles": "CCO", "concentration": 70},
                {"name": "Glycerin", "smiles": "OCC(O)CO", "concentration": 40},
            ],
            region="face",
        )


def test_accepts_valid_formula_and_water_balance():
    payload = CreateAssessmentRequest(
        formula=[
            {"name": "Water", "smiles": "O", "concentration": 89},
            {"name": "Ethanol", "smiles": "CCO", "concentration": 10},
            {"name": "Phenoxyethanol", "smiles": "OCCOc1ccccc1", "concentration": 1},
        ],
        region="face",
    )
    assert sum(item.concentration for item in payload.formula) == 100
