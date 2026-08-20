from app.api.herbs import material_assessment_method


def test_whole_extract_uses_botanical_evidence_not_single_molecule_qsar():
    assert material_assessment_method("extract") == "botanical_evidence"
    assert material_assessment_method("essential_oil") == "botanical_evidence"


def test_isolated_compound_can_use_compound_qsar():
    assert material_assessment_method("isolated_compound") == "compound_qsar"

