from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


BASE = Path(__file__).resolve().parents[2]
SCRIPT = BASE / "scripts" / "prepare_ice_bulk_training.py"
SPEC = importlib.util.spec_from_file_location("ralphguard_ice_bulk_prep", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
prep = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = prep
SPEC.loader.exec_module(prep)


def record(assay: str, value: str, endpoint: str = "Call") -> dict:
    return {
        "assay": assay,
        "ice_endpoint": endpoint,
        "ice_value": value,
        "evidence_id": f"test:{assay}:{value}",
    }


def test_tg439_inactive_is_a_lower_weight_skin_negative() -> None:
    result = prep._aggregate_skin_in_vitro(
        [record("EpiDerm Irritation", "Inactive")]
    )
    assert result["candidate_label"] == 0
    assert result["sample_weight"] == 0.7


def test_skin_corrosion_inactive_is_not_misread_as_non_irritant() -> None:
    result = prep._aggregate_skin_in_vitro(
        [record("EpiDerm Corrosion", "Inactive")]
    )
    assert result["candidate_label"] is None
    assert result["sample_weight"] == 0.0


def test_positive_skin_corrosion_call_establishes_binary_hazard() -> None:
    result = prep._aggregate_skin_in_vitro(
        [
            record("EpiDerm Corrosion", "Active"),
            record("EpiSkin Irritation", "Inactive"),
        ]
    )
    assert result["candidate_label"] == 1


def test_conflicting_tg439_calls_are_review_gated() -> None:
    result = prep._aggregate_skin_in_vitro(
        [
            record("EpiDerm Irritation", "Active"),
            record("EpiSkin Irritation", "Inactive"),
        ]
    )
    assert result["candidate_label"] is None
    assert result["mapping_status"] == "conflict_review_required"


def test_tg494_only_promotes_vitrigel_no_category_call() -> None:
    negative = prep._aggregate_eye_in_vitro([record("Vitrigel", "Inactive")])
    positive = prep._aggregate_eye_in_vitro([record("Vitrigel", "Active")])
    assert negative["candidate_label"] == 0
    assert negative["sample_weight"] == 0.7
    assert positive["candidate_label"] is None
    assert positive["sample_weight"] == 0.0


def test_only_explicit_call_rows_are_mapped() -> None:
    result = prep._aggregate_skin_in_vitro(
        [record("EpiDerm Irritation", "10.2", endpoint="Viability")]
    )
    assert result["candidate_label"] is None
