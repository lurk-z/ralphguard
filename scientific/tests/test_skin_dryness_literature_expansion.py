from scripts.import_skin_dryness_literature_expansion import (
    _development_records,
    _external_records,
)


def test_added_skin_dryness_negatives_are_explicit_and_exposure_attributed():
    rows = _development_records()
    eligible = [
        row for row in rows
        if row["candidate_label"] in {0, 1} and row["review_status"] == "verified"
    ]

    assert {row["compound_name"] for row in eligible}.issuperset({
        "Glycerol",
        "Glyceryl monostearate",
        "DL-Panthenol",
        "1,3-Propanediol",
    })
    assert all(row["candidate_label"] == 0 for row in eligible)
    assert all(row["evidence_subtype"] in {
        "no_significant_tewl_increase",
        "no_skin_barrier_impairment",
    } for row in eligible)
    assert all(row["exposure_concentration"] for row in eligible)
    assert all(row["source_id"].startswith("PMID:") for row in eligible)


def test_panthenol_formulation_attribution_is_downweighted():
    panthenol = next(
        row for row in _development_records() if row["compound_name"] == "DL-Panthenol"
    )

    assert panthenol["evidence_tier"] == "B"
    assert panthenol["sample_weight"] == 0.9
    assert panthenol["label_quality"] == "formulation_attributed_experimental"


def test_literature_development_and_external_sources_are_disjoint():
    development_sources = {row["source_id"] for row in _development_records()}
    external_sources = {row["source_id"] for row in _external_records()}

    assert development_sources.isdisjoint(external_sources)
