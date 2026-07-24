"""Ingredient identity and PubChem enrichment safety rules."""

from app.services.ingredient_registry import (
    classify_substance,
    non_qsar_profile,
    normalize_ingredient_name,
    parse_pubchem_responses,
)


def _property_payload(**overrides):
    row = {
        "CID": 5526,
        "Title": "4-(Aminomethyl)cyclohexanecarboxylic acid",
        "IUPACName": "4-(aminomethyl)cyclohexane-1-carboxylic acid",
        "MolecularFormula": "C8H15NO2",
        "MolecularWeight": "157.21",
        "SMILES": "C1CC(CCC1CN)C(=O)O",
        "InChI": "InChI=1S/C8H15NO2/c9-5-6-1-3-7(4-2-6)8(10)11/h6-7H,1-5,9H2,(H,10,11)",
        "InChIKey": "GYDJEQRTZSCIOI-UHFFFAOYSA-N",
        "Charge": 0,
        "Complexity": 172,
        "CovalentUnitCount": 1,
    }
    row.update(overrides)
    return {"PropertyTable": {"Properties": [row]}}


def _synonym_payload(*values):
    return {"InformationList": {"Information": [{"CID": 5526, "Synonym": list(values)}]}}


def test_aqua_is_resolved_water_but_not_qsar_eligible():
    profile = non_qsar_profile("Water")
    assert profile["name"] == "aqua"
    assert profile["canonical_smiles"] == "O"
    assert profile["pubchem_cid"] == 962
    assert profile["resolved"] is True
    assert profile["structure_available"] is True
    assert profile["qsar_eligible"] is False
    assert profile["assessment_method"] == "known_carrier_baseline"


def test_pubchem_single_substance_is_a_candidate_until_reviewed():
    parsed = parse_pubchem_responses(
        "Tranexamic Acid",
        _property_payload(),
        _synonym_payload("Tranexamic acid", "1197-18-8", "701-54-2"),
    )
    assert parsed["pubchem_cid"] == 5526
    assert parsed["canonical_smiles"] == "NCC1CCC(C(=O)O)CC1"
    assert parsed["inchikey"] == "GYDJEQRTZSCIOI-UHFFFAOYSA-N"
    assert parsed["molecular_formula"] == "C8H15NO2"
    assert parsed["cas_number"] == "1197-18-8"
    assert parsed["substance_type"] == "defined_single_substance"
    assert parsed["structure_status"] == "resolved"
    assert parsed["proposed_qsar_eligible"] is True
    assert parsed["assessment_method"] == "pending_verification"


def test_pubchem_multi_component_structure_is_not_proposed_for_qsar():
    classification = classify_substance(
        "Example sodium salt",
        {
            "SMILES": "O=C([O-])C.[Na+]",
            "MolecularFormula": "C2H3NaO2",
            "CovalentUnitCount": 2,
        },
    )
    assert classification["substance_type"] == "salt"
    assert classification["structure_status"] == "multi_component"
    assert classification["proposed_qsar_eligible"] is False


def test_name_normalization_collapses_inci_aliases():
    assert normalize_ingredient_name(" AQUA / WATER ") == "aqua"
    assert normalize_ingredient_name("Eau") == "aqua"
    assert normalize_ingredient_name("PARFUM / FRAGRANCE") == "parfum"


def test_verified_identity_cannot_be_overwritten_by_a_different_pubchem_structure():
    from types import SimpleNamespace
    from app.services import ingredient_registry as service

    row = SimpleNamespace(
        verification_status="verified",
        canonical_smiles="CCO",
        provenance={},
        last_error=None,
    )
    original = service._upsert_observation
    service._upsert_observation = lambda *_args, **_kwargs: row
    try:
        result = service.remember_pubchem_candidate(
            object(),
            "Ethanol",
            {
                "canonical_smiles": "CC(=O)O",
                "pubchem_cid": 176,
                "source_url": "https://pubchem.ncbi.nlm.nih.gov/compound/176",
            },
            source="test",
            ocr_confidence=None,
        )
    finally:
        service._upsert_observation = original
    assert result is row
    assert "pubchem_identity_conflict" in row.provenance
    assert "did not match" in row.last_error
