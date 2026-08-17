"""Regression tests for conservative experimental-negative preparation."""
from rdkit import Chem

from scripts import prepare_experimental_negatives as prep


def molecule(smiles: str, **properties: str) -> Chem.Mol:
    value = Chem.MolFromSmiles(smiles)
    assert value is not None
    for key, item in properties.items():
        value.SetProp(key, item)
    return value


def test_eye_requires_explicit_curated_negative_outcome() -> None:
    negative = molecule("CCO", Outcome="0")
    positive = molecule("CCN", Outcome="1")
    missing = molecule("CCC")

    assert prep.endpoint_evidence_rejection(prep.SOURCES["eye"], negative) is None
    assert prep.endpoint_evidence_rejection(prep.SOURCES["eye"], positive) == "not_negative"
    assert prep.endpoint_evidence_rejection(prep.SOURCES["eye"], missing) == "invalid_outcome"


def test_skin_requires_oecd_404_or_explicit_equivalent() -> None:
    accepted = molecule(
        "CCO",
        Outcome="0",
        guideline="OECD Guideline 404 (Acute Dermal Irritation / Corrosion)",
        species="rabbit",
    )
    wrong_method = molecule(
        "CCN",
        Outcome="0",
        guideline="OECD Guideline 402 (Acute Dermal Toxicity)",
        species="rabbit",
    )
    wrong_species = molecule(
        "CCC",
        Outcome="0",
        guideline="EPA OPPTS 870.2500 (Acute Dermal Irritation)",
        species="rat",
    )

    assert prep.endpoint_evidence_rejection(prep.SOURCES["skin"], accepted) is None
    assert (
        prep.endpoint_evidence_rejection(prep.SOURCES["skin"], wrong_method)
        == "skin_guideline_not_whitelisted"
    )
    assert (
        prep.endpoint_evidence_rejection(prep.SOURCES["skin"], wrong_species)
        == "skin_species_not_whitelisted"
    )


def test_structure_screen_rejects_salts_and_out_of_domain_molecules() -> None:
    assert prep.structure_rejection_reason(molecule("CCO")) is None
    assert prep.structure_rejection_reason(molecule("CCO.[Na+]")) == "mixture_or_salt"
    assert (
        prep.structure_rejection_reason(molecule("CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"))
        == "molecular_weight_outside_domain"
    )


def test_sources_are_commit_pinned_and_lower_weighted() -> None:
    assert all(prep.STOPTOX_COMMIT in spec.source_url for spec in prep.SOURCES.values())
    assert prep.SOURCES["eye"].sample_weight < 1.0
    assert prep.SOURCES["skin"].sample_weight < 1.0
