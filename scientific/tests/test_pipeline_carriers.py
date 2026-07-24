"""Known formula vehicles must not dominate out-of-domain QSAR aggregation."""

from types import SimpleNamespace
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import run_pipeline


ENDPOINTS = ("skin", "eye", "sens", "acute")


class FakePredictor:
    def __init__(self):
        self.calls: list[str] = []

    def predict(self, smiles: str):
        self.calls.append(smiles)
        confidence = SimpleNamespace(level="High", reason_th="in-domain", score=0.9)
        per_endpoint = {
            endpoint: SimpleNamespace(
                score=10.0,
                probability=0.1,
                alerts=[],
                rule_agrees=True,
                uncertainty=0.0,
                in_domain=True,
                domain_similarity=0.8,
                threshold=0.5,
                flagged=False,
                confidence=confidence,
            )
            for endpoint in ENDPOINTS
        }
        return SimpleNamespace(
            smiles=smiles,
            canonical_smiles=smiles,
            descriptors=SimpleNamespace(to_dict=lambda: {}),
            per_endpoint=per_endpoint,
        )


def test_water_is_reported_but_not_sent_to_qsar_or_risk_sum():
    predictor = FakePredictor()
    result = run_pipeline(
        predictor,
        [
            {"name": "Water (Aqua)", "smiles": "O", "concentration": 90},
            {"name": "Glycerin", "smiles": "OCC(O)CO", "concentration": 10},
        ],
        region="face",
    )

    assert predictor.calls == ["OCC(O)CO"]
    assert result["endpoints"]["skin"]["peak_score"] == 1.3
    assert result["formula_coverage"] == {
        "total_ingredients": 2,
        "qsar_assessed_ingredients": 1,
        "known_carrier_ingredients": 1,
        "unresolved_ingredients": 0,
        "coverage_percentage": 100.0,
    }
    water = result["ingredient_assessments"][0]
    assert water["name"] == "Water (Aqua)"
    assert water["qsar_eligible"] is False
    assert water["assessment_method"] == "known_carrier_baseline"


def test_botanical_surrogate_is_unresolved_and_never_sent_to_qsar():
    predictor = FakePredictor()
    result = run_pipeline(
        predictor,
        [
            {"name": "Water (Aqua)", "smiles": "O", "concentration": 88},
            {"name": "Aloe Vera", "smiles": "OC1C(O)C(O)C(O)C1O", "concentration": 2},
            {"name": "Glycerin", "smiles": "OCC(O)CO", "concentration": 10},
        ],
        region="face",
    )

    assert predictor.calls == ["OCC(O)CO"]
    aloe = result["ingredient_assessments"][1]
    assert aloe["resolved"] is False
    assert aloe["qsar_eligible"] is False
    assert aloe["assessment_method"] == "unsupported_composition"
    assert result["formula_coverage"]["unresolved_ingredients"] == 1
    assert result["formula_coverage"]["coverage_percentage"] == 66.7
