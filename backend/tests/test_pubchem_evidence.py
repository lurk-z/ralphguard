"""Endpoint mapping tests for PubChem GHS evidence."""
from app.services.pubchem_evidence import (
    parse_global_ghs_annotations,
    parse_pubchem_ghs_evidence,
    screen_pubchem_property,
)


def _payload(*statements: str) -> dict:
    return {
        "Record": {
            "RecordNumber": 712,
            "RecordTitle": "Formaldehyde",
            "Reference": [
                {
                    "ReferenceNumber": 10,
                    "SourceName": "NITE-CMC",
                    "SourceID": "example",
                    "URL": "https://example.test/evidence",
                }
            ],
            "Section": [
                {
                    "TOCHeading": "Safety and Hazards",
                    "Section": [
                        {
                            "TOCHeading": "GHS Classification",
                            "Information": [
                                {
                                    "ReferenceNumber": 10,
                                    "Name": "GHS Hazard Statements",
                                    "Value": {
                                        "StringWithMarkup": [
                                            {"String": statement} for statement in statements
                                        ]
                                    },
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    }


def test_ghs_codes_are_mapped_to_the_four_matching_endpoints():
    rows = parse_pubchem_ghs_evidence(
        _payload(
            "H315: Causes skin irritation",
            "H317: May cause an allergic skin reaction",
            "H319: Causes serious eye irritation",
            "H301: Toxic if swallowed",
        )
    )
    by_endpoint = {row["endpoint"]: row for row in rows}
    assert set(by_endpoint) == {"skin", "eye", "sens", "acute"}
    assert by_endpoint["skin"]["hazard_codes"] == ["H315"]
    assert by_endpoint["acute"]["candidate_label"] == 1
    assert by_endpoint["sens"]["source_quality"] == "regulatory"
    assert by_endpoint["eye"]["provenance"]["negative_inference_allowed"] is False


def test_corrosive_statement_maps_to_skin_and_eye():
    rows = parse_pubchem_ghs_evidence(_payload("H314: Causes severe skin burns and eye damage"))
    assert {row["endpoint"] for row in rows} == {"skin", "eye"}


def test_non_classified_and_unrelated_hazards_do_not_create_negative_labels():
    rows = parse_pubchem_ghs_evidence(
        _payload("Not Classified", "H350: May cause cancer", "H330: Fatal if inhaled")
    )
    assert rows == []


def test_acute_endpoint_accepts_oral_codes_only():
    rows = parse_pubchem_ghs_evidence(
        _payload("H302: Harmful if swallowed", "H311: Toxic in contact with skin", "H331: Toxic if inhaled")
    )
    assert len(rows) == 1
    assert rows[0]["endpoint"] == "acute"
    assert rows[0]["hazard_codes"] == ["H302"]


def test_global_annotations_preserve_cid_and_source():
    payload = {
        "Annotations": {
            "Annotation": [
                {
                    "SourceName": "NITE-CMC",
                    "SourceID": "x1",
                    "ANID": 123,
                    "Name": "Example",
                    "URL": "https://example.test",
                    "LinkedRecords": {"CID": [10, 11]},
                    "Data": [
                        {
                            "Name": "GHS Hazard Statements",
                            "Value": {"StringWithMarkup": [{"String": "H317: Skin sensitizer"}]},
                        }
                    ],
                }
            ]
        }
    }
    rows = parse_global_ghs_annotations(payload)
    assert len(rows) == 2
    assert {row["pubchem_cid"] for row in rows} == {10, 11}
    assert {row["endpoint"] for row in rows} == {"sens"}
    assert all(row["source_name"] == "NITE-CMC" for row in rows)


def test_global_screen_accepts_small_single_organic_compound():
    profile, reason = screen_pubchem_property(
        {
            "CID": 702,
            "Title": "Ethanol",
            "SMILES": "CCO",
            "MolecularFormula": "C2H6O",
            "CovalentUnitCount": 1,
        }
    )
    assert reason is None
    assert profile["canonical_smiles"] == "CCO"
    assert profile["inchikey"] == "LFQSCWFLJHTTHZ-UHFFFAOYSA-N"


def test_global_screen_rejects_salts_metals_and_large_out_of_domain_compounds():
    salt, salt_reason = screen_pubchem_property(
        {
            "CID": 1,
            "Title": "Sodium acetate",
            "SMILES": "CC(=O)[O-].[Na+]",
            "MolecularFormula": "C2H3NaO2",
            "CovalentUnitCount": 2,
        }
    )
    metal, metal_reason = screen_pubchem_property(
        {
            "CID": 2,
            "Title": "Organozinc example",
            "SMILES": "C[Zn]C",
            "MolecularFormula": "C2H6Zn",
            "CovalentUnitCount": 1,
        }
    )
    huge, huge_reason = screen_pubchem_property(
        {
            "CID": 3,
            "Title": "Huge hydrocarbon",
            "SMILES": "C" * 50,
            "MolecularFormula": "C50H102",
            "CovalentUnitCount": 1,
        }
    )
    assert salt is None and salt_reason == "salt"
    assert metal is None and metal_reason == "unsupported_element"
    assert huge is None and huge_reason in {
        "molecular_weight_outside_domain",
        "heavy_atom_count_outside_domain",
    }
