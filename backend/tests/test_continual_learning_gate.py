from types import SimpleNamespace

from app.services.continual_learning import queue_decision


def evidence(**overrides):
    values = {
        "evidence_type": "regulatory_skin_dryness",
        "source_quality": "regulatory",
        "review_status": "verified",
        "provenance": {"label_source": "external_regulatory"},
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def ingredient(**overrides):
    values = {
        "canonical_smiles": "CCO",
        "inchikey": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
        "qsar_eligible": True,
        "substance_type": "defined_single_substance",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_verified_external_evidence_can_enter_queue():
    result = queue_decision(evidence(), ingredient())
    assert result.eligible is True
    assert result.evidence_tier == "D"
    assert result.sample_weight == 0.25


def test_prediction_and_unverified_observation_never_enter_queue():
    prediction = queue_decision(
        evidence(provenance={"label_source": "model_prediction"}), ingredient()
    )
    pending = queue_decision(evidence(review_status="pending"), ingredient())
    assert prediction.reason == "prediction_is_not_training_evidence"
    assert pending.reason == "evidence_not_verified"


def test_holdout_conflict_and_mixture_fail_closed():
    assert queue_decision(evidence(), ingredient(), reserved_holdout=True).reason == "reserved_holdout_identity"
    assert queue_decision(evidence(), ingredient(), conflicting_verified_label=True).reason == "conflicting_verified_label"
    assert queue_decision(evidence(), ingredient(substance_type="botanical_extract", qsar_eligible=False)).reason == "not_qsar_eligible_single_substance"
