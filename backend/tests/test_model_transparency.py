"""Regression tests for judge-facing QSAR transparency claims."""
import asyncio

from app.api import models


def test_model_card_does_not_claim_independent_external_validation() -> None:
    validation = str(models.METHODOLOGY["validation"]).casefold()
    assert "out-of-fold" in validation
    assert "independent external" not in validation
    assert models.VALIDATION_STATUS["independent_external_validation"]["status"] == "not_completed"


def test_pubchem_structure_is_not_presented_as_training_label() -> None:
    role = str(models.EVIDENCE_SOURCES["pubchem_structure"]["role"]).casefold()
    assert "not an automatic toxicity label" in role
    missing = str(models.DATA_INTEGRITY_POLICY["missing_evidence"]).casefold()
    assert "not automatically converted to label 0" in missing


def test_nice_evidence_is_presented_as_review_gated() -> None:
    source = models.EVIDENCE_SOURCES["nice_reference_evidence"]
    role = str(source["role"]).casefold()
    assert "reviewed label" in role
    assert "reviewer identity" in role
    policy = str(models.DATA_INTEGRITY_POLICY["nice_role"]).casefold()
    assert "staging" in policy
    assert "human review gate" in policy


def test_external_policy_requires_zero_exact_identity_overlap() -> None:
    policy = str(models.DATA_INTEGRITY_POLICY["external_overlap"]).casefold()
    assert "zero exact molecular-identity overlap" in policy


def test_metrics_endpoint_labels_are_current_production_oof(monkeypatch) -> None:
    monkeypatch.setattr(
        models,
        "_load_metrics",
        lambda: {
            "skin": {
                "accuracy": 0.885,
                "balanced_accuracy": 0.896,
                "sensitivity": 0.947,
                "specificity": 0.845,
                "auc": 0.926,
                "mcc": 0.776,
                "threshold": 0.4,
                "n_pos": 38,
                "n_neg": 58,
            }
        },
    )
    payload = asyncio.run(models.model_metrics())
    skin = next(item for item in payload["endpoints"] if item["endpoint"] == "skin")
    assert payload["available"] is True
    assert skin["metrics"]["n_pos"] == 38
    assert skin["metrics"]["n_neg"] == 58
    note = payload["note_th"].casefold()
    assert "out-of-fold internal validation" in note
    assert "ยังไม่ใช่ independent external validation" in note


def test_model_info_exposes_evidence_and_integrity_status(monkeypatch) -> None:
    monkeypatch.setattr(models, "_load_training_integrity", lambda: {})
    payload = asyncio.run(models.model_info())
    assert "data_integrity_policy" in payload
    assert "evidence_sources" in payload
    assert "validation_status" in payload
    assert payload["training_integrity"] is None
