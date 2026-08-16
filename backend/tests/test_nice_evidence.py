from app.services.nice_evidence import aggregate_endpoint, harmonize_record


def _record(endpoint: str, assay: str, *, ice_endpoint: str, ice_value, unit: str | None = None):
    return {
        "ralphguard_endpoint": endpoint,
        "assay": assay,
        "ice_endpoint": ice_endpoint,
        "ice_value": ice_value,
        "ice_unit": unit,
        "raw_record": {"endpoint": ice_endpoint, "value": ice_value, "unit": unit},
    }


def test_skin_explicit_category_maps_positive():
    record = _record("skin", "Rabbit Draize Skin Irritation/Corrosion Test", ice_endpoint="GHS Classification", ice_value="Category 2 irritant")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] == 1
    assert mapped["mapping_status"] == "auto_candidate"


def test_eye_numeric_draize_score_requires_review():
    record = _record("eye", "Rabbit Draize Eye Irritation/Corrosion Test", ice_endpoint="Corneal opacity score", ice_value=2)
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] is None
    assert mapped["mapping_rule"] == "draize_numeric_requires_context"


def test_raw_negative_control_text_does_not_create_negative_label():
    record = _record("eye", "Rabbit Draize Eye Irritation/Corrosion Test", ice_endpoint="Corneal opacity score", ice_value=1)
    record["raw_record"]["control"] = "negative control"
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] is None
    assert mapped["mapping_rule"] == "draize_numeric_requires_context"


def test_llna_si_ge_3_supports_positive():
    record = _record("sens", "Murine Local Lymph Node Assay (LLNA)", ice_endpoint="Stimulation Index (SI)", ice_value="3.2")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] == 1
    assert mapped["mapping_rule"] == "llna_si_ge_3"


def test_llna_si_below_3_is_not_auto_negative():
    record = _record("sens", "Murine Local Lymph Node Assay (LLNA)", ice_endpoint="Stimulation Index (SI)", ice_value="2.4")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] is None
    assert mapped["mapping_status"] == "supportive_negative_only"


def test_acute_ld50_1500_mgkg_maps_positive():
    record = _record("acute", "Rat Acute Oral Toxicity", ice_endpoint="LD50", ice_value="1500", unit="mg/kg")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] == 1
    assert mapped["normalized_value"] == 1500


def test_acute_ld50_2_5_gkg_maps_negative():
    record = _record("acute", "Rat Acute Oral Toxicity", ice_endpoint="LD50", ice_value="2.5", unit="g/kg")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] == 0
    assert mapped["normalized_value"] == 2500


def test_acute_microgram_unit_is_converted_before_gram_match():
    record = _record("acute", "Rat Acute Oral Toxicity", ice_endpoint="LD50", ice_value="500000", unit="ug/kg")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] == 1
    assert mapped["normalized_value"] == 500


def test_acute_greater_equal_2000_is_ambiguous_at_boundary():
    record = _record("acute", "Rat Acute Oral Toxicity", ice_endpoint="LD50", ice_value=">= 2000", unit="mg/kg")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] is None
    assert mapped["mapping_rule"] == "acute_ld50_boundary_ambiguous"


def test_unknown_acute_unit_requires_review():
    record = _record("acute", "Rat Acute Oral Toxicity", ice_endpoint="LD50", ice_value="250", unit="ppm")
    mapped = harmonize_record(record)
    assert mapped["candidate_label"] is None
    assert mapped["mapping_rule"] == "acute_ld50_unit_unknown"


def test_conflicting_votes_do_not_produce_candidate_label():
    positive = _record("skin", "Rabbit Draize Skin Irritation/Corrosion Test", ice_endpoint="Classification", ice_value="Category 2 irritant")
    negative = _record("skin", "Rabbit Draize Skin Irritation/Corrosion Test", ice_endpoint="Classification", ice_value="Not Classified")
    result = aggregate_endpoint([positive, negative])
    assert result["candidate_label"] is None
    assert result["mapping_status"] == "conflict_review_required"
