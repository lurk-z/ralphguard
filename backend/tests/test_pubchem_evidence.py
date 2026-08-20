"""Endpoint mapping tests for PubChem GHS evidence."""
from types import SimpleNamespace

from app.services.pubchem_evidence import (
    parse_global_hazard_class_annotations,
    parse_global_ghs_annotations,
    parse_pubchem_ghs_evidence,
    parse_skin_dryness_discovery_candidates,
    promote_single_regulatory_evidence,
    screen_pubchem_property,
)
from scripts.import_global_pubchem_ghs import endpoint_coverage, prior_run_history


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


def test_eye_category_2b_h320_maps_to_eye_hazard():
    rows = parse_pubchem_ghs_evidence(_payload("H320: Causes eye irritation"))
    assert len(rows) == 1
    assert rows[0]["endpoint"] == "eye"
    assert rows[0]["candidate_label"] == 1


def test_euh066_and_auh066_create_skin_dryness_positive_candidates():
    rows = parse_pubchem_ghs_evidence(
        _payload(
            "EUH066: Repeated exposure may cause skin dryness or cracking",
            "AUH 066: Repeated exposure may cause skin dryness and cracking",
        )
    )

    assert len(rows) == 1
    assert rows[0]["endpoint"] == "skin_dryness"
    assert rows[0]["candidate_label"] == 1
    assert rows[0]["evidence_type"] == "regulatory_skin_dryness"
    assert rows[0]["hazard_codes"] == ["AUH066", "EUH066"]


def test_h315_does_not_imply_skin_dryness():
    rows = parse_pubchem_ghs_evidence(_payload("H315: Causes skin irritation"))
    assert {row["endpoint"] for row in rows} == {"skin"}


def test_missing_supplemental_code_never_creates_dryness_negative():
    rows = parse_pubchem_ghs_evidence(_payload("Not Classified"))
    assert rows == []


def test_dryness_keyword_is_review_candidate_not_training_label():
    payload = _payload("H315: Causes skin irritation")
    information = payload["Record"]["Section"][0]["Section"][0]["Information"]
    information.append(
        {
            "ReferenceNumber": 10,
            "Name": "Study result",
            "Value": {"StringWithMarkup": [{"String": "A significant increase in TEWL was observed."}]},
        }
    )
    rows = parse_skin_dryness_discovery_candidates(payload)
    assert len(rows) == 1
    assert rows[0]["candidate_label"] is None
    assert rows[0]["label_status"] == "review_required"
    assert rows[0]["provenance"]["negative_inference_allowed"] is False


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


def test_global_hazard_classes_map_only_explicit_skin_sensitization_categories():
    payload = {
        "Annotations": {
            "Annotation": [
                {
                    "SourceName": "European Chemicals Agency (ECHA)",
                    "SourceID": "example",
                    "ANID": 456,
                    "URL": "https://example.test/classification",
                    "LinkedRecords": {"CID": [20, 21]},
                    "Data": [
                        {
                            "Value": {
                                "StringWithMarkup": [
                                    {"String": "Skin Sens. 1A"},
                                    {"String": "Eye Irrit. 2"},
                                ]
                            }
                        }
                    ],
                },
                {
                    "SourceName": "NITE-CMC",
                    "SourceID": "negative",
                    "ANID": 457,
                    "LinkedRecords": {"CID": [22]},
                    "Data": [
                        {"Value": {"StringWithMarkup": [{"String": "Not Classified"}]}}
                    ],
                },
            ]
        }
    }

    rows = parse_global_hazard_class_annotations(payload)

    assert {row["pubchem_cid"] for row in rows} == {20, 21}
    assert {row["endpoint"] for row in rows} == {"sens"}
    assert all(row["hazard_codes"] == ["SKIN_SENS_1A"] for row in rows)
    assert all(row["candidate_label"] == 1 for row in rows)
    assert all(row["provenance"]["negative_inference_allowed"] is False for row in rows)


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


def test_single_regulatory_promotion_is_positive_only_and_low_weight_provenanced():
    positive = SimpleNamespace(
        ingredient_id=10,
        endpoint="skin",
        candidate_label=1,
        review_status="pending",
        reviewer_note=None,
        reviewed_at=None,
        provenance={"negative_inference_allowed": False},
    )
    non_positive = SimpleNamespace(
        ingredient_id=11,
        endpoint="skin",
        candidate_label=0,
        review_status="pending",
        reviewer_note=None,
        reviewed_at=None,
        provenance={},
    )

    class Result:
        def all(self):
            return [(positive, object()), (non_positive, object())]

    class FakeSession:
        flushed = False

        def execute(self, _query):
            return Result()

        def flush(self):
            self.flushed = True

    db = FakeSession()
    summary = promote_single_regulatory_evidence(db)

    assert positive.review_status == "single_regulatory_weak_label"
    assert positive.provenance["review"]["sample_weight"] == 0.25
    assert positive.provenance["review"]["negative_inference_allowed"] is False
    assert non_positive.review_status == "pending"
    assert summary["promoted_unique_labels"] == 1
    assert summary["skipped_conflicting_labels"] == 1
    assert db.flushed is True


def test_global_import_coverage_requires_every_endpoint_target():
    coverage = endpoint_coverage(
        {
            "skin": {1, 2},
            "eye": {3, 4},
            "sens": {5},
            "acute": {6, 7, 8},
        },
        target_per_endpoint=2,
    )

    assert coverage["minimum_met"] is False
    assert coverage["screened_unique_structures_by_endpoint"]["acute"] == 3
    assert coverage["gaps_by_endpoint"] == {
        "skin": 0,
        "eye": 0,
        "sens": 1,
        "acute": 0,
        "skin_dryness": 2,
    }


def test_prior_run_history_keeps_compact_previous_report(tmp_path):
    report = tmp_path / "report.json"
    report.write_text(
        '{"generated_at":"2026-01-01T00:00:00Z","start_page":1,'
        '"last_page_processed":200,"pages_processed":200,'
        '"screened_unique_structures":114309,"filtered":{"salt":1}}',
        encoding="utf-8",
    )

    history = prior_run_history(report)

    assert history == [{
        "generated_at": "2026-01-01T00:00:00Z",
        "start_page": 1,
        "last_page_processed": 200,
        "pages_processed": 200,
        "screened_unique_structures": 114309,
    }]
