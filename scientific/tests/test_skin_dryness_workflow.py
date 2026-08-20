import pandas as pd

from scripts.skin_dryness_workflow import prepare_evidence_pool


def evidence(smiles, label, subtype, *, tier="A", status="verified", source="paper"):
    return {
        "smiles": smiles,
        "endpoint": "skin_dryness",
        "candidate_label": label,
        "label_status": "labeled" if label is not None else "unlabeled",
        "label_quality": "experimental" if tier == "A" else "regulatory_weak_positive",
        "evidence_subtype": subtype,
        "evidence_tier": tier,
        "review_status": status,
        "source_name": source,
        "source_url": f"https://example.test/{source}",
    }


def with_exposure(row, *, concentration, duration):
    return {
        **row,
        "exposure_route": "dermal",
        "exposure_concentration": concentration,
        "concentration_unit": "%",
        "exposure_duration": duration,
        "duration_unit": "hours",
        "measurement_type": "TEWL",
        "test_system": "human patch",
        "species": "human",
    }


def test_absence_of_euh066_never_becomes_negative():
    result = prepare_evidence_pool(
        pd.DataFrame([evidence("CCO", None, "", status="pending")]),
        write_outputs=False,
    )
    assert result["training"].empty
    assert len(result["unlabeled"]) == 1


def test_negative_requires_an_explicit_negative_subtype():
    result = prepare_evidence_pool(
        pd.DataFrame([evidence("CCO", 0, "missing_euh066")]),
        write_outputs=False,
    )
    assert result["training"].empty
    assert result["review"].iloc[0]["review_reason"] == "negative_requires_explicit_evidence"


def test_explicit_negative_with_provenance_is_training_eligible():
    result = prepare_evidence_pool(
        pd.DataFrame([evidence("CCO", 0, "no_significant_tewl_increase")]),
        write_outputs=False,
    )
    assert result["training"]["label"].tolist() == [0]


def test_source_declared_not_qsar_eligible_is_excluded():
    row = evidence("CCO", 0, "no_significant_tewl_increase")
    row["qsar_eligible"] = False
    result = prepare_evidence_pool(pd.DataFrame([row]), write_outputs=False)
    assert result["training"].empty
    assert result["review"].iloc[0]["review_reason"] == "not_qsar_eligible"


def test_same_tier_conflict_is_excluded():
    result = prepare_evidence_pool(
        pd.DataFrame([
            evidence("CCO", 1, "direct_dryness", source="positive"),
            evidence("OCC", 0, "no_observed_dryness_or_cracking", source="negative"),
        ]),
        write_outputs=False,
    )
    assert result["training"].empty
    assert result["manifest"]["counts"]["same_tier_conflicts"] == 1


def test_higher_tier_explicit_evidence_overrides_regulatory_conflict():
    result = prepare_evidence_pool(
        pd.DataFrame([
            evidence("CCO", 0, "no_observed_dryness_or_cracking", tier="A", source="experiment"),
            evidence("OCC", 1, "regulatory_skin_dryness", tier="D", source="regulator"),
        ]),
        write_outputs=False,
    )
    assert result["training"]["label"].tolist() == [0]


def test_external_holdout_is_quarantined():
    result = prepare_evidence_pool(
        pd.DataFrame([evidence("CCO", 1, "direct_dryness")]),
        external_holdout=pd.DataFrame([{"smiles": "OCC", "label": 1}]),
        write_outputs=False,
    )
    assert result["training"].empty
    assert result["manifest"]["counts"]["external_quarantined"] == 1


def test_opposite_labels_under_different_exposure_require_review_not_majority_vote():
    result = prepare_evidence_pool(
        pd.DataFrame([
            with_exposure(
                evidence("CS(C)=O", 0, "no_significant_tewl_increase", source="low-dose"),
                concentration="50", duration="0.5",
            ),
            with_exposure(
                evidence("CS(C)=O", 1, "tewl_increase", source="high-dose"),
                concentration="90", duration="0.5",
            ),
        ]),
        write_outputs=False,
    )
    assert result["training"].empty
    assert result["manifest"]["counts"]["exposure_dependent_review"] == 1
    assert set(result["review"]["review_reason"]) == {
        "exposure_dependent_identity_requires_review"
    }


def test_same_molecule_different_smiles_is_one_identity():
    result = prepare_evidence_pool(
        pd.DataFrame([
            evidence("CCO", 0, "no_significant_tewl_increase", source="one"),
            evidence("OCC", 0, "no_significant_tewl_increase", source="two"),
        ]),
        write_outputs=False,
    )
    assert len(result["training"]) == 1
    assert result["manifest"]["counts"]["unique_inchikey"] == 1
