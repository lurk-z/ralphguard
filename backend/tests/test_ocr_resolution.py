"""Ingredient resolution must identify structures without inventing a dose."""

import inspect
from pathlib import Path

import pytest

from app.api.ocr import (
    OcrItem,
    OcrPass,
    OCR_PASS_PLAN,
    _consensus_text,
    _run_ocr_ensemble,
    _sort_matches_by_label_order,
    _tokens,
    read_label,
    resolve,
)
from app.services.ingredient_registry import non_qsar_family, non_qsar_profile


def test_production_ocr_uses_bounded_pass_plan_without_online_lookup_by_default():
    assert len(OCR_PASS_PLAN) == 1
    assert len(set(OCR_PASS_PLAN)) == len(OCR_PASS_PLAN)
    assert inspect.signature(read_label).parameters["online"].default is False


def test_resolve_known_inci_names():
    matched, no_structure, unmatched = resolve(
        "Ingredients: Aqua, Glycerin, Niacinamide, Phenoxyethanol",
        online=False,
    )
    names = {item[0] for item in matched}
    assert {"Glycerin", "Niacinamide", "Phenoxyethanol"}.issubset(names)
    assert "aqua" in no_structure
    assert not unmatched


def test_combined_local_and_registry_matches_follow_label_order():
    registry_smiles = "CC(C)(O)CO"
    matches = [
        ("Glycerin", "OCC(O)CO", 100, "local"),
        ("Example Active", registry_smiles, 100, "registry"),
        ("Phenoxyethanol", "OCCOc1ccccc1", 100, "local"),
    ]

    ordered = _sort_matches_by_label_order(
        "Ingredients: Example Active, Glycerin, Phenoxyethanol",
        matches,
        {registry_smiles: "example active"},
    )

    assert [item[0] for item in ordered] == [
        "Example Active",
        "Glycerin",
        "Phenoxyethanol",
    ]


def test_ocr_item_requires_user_concentration():
    item = OcrItem(name="Glycerin", smiles="OCC(O)CO", score=95)
    assert item.concentration is None
    assert item.requires_concentration is True


def test_local_resolver_never_auto_authorizes_an_external_name():
    matched, no_structure, unmatched = resolve(
        "Ingredients: Tranexamic Acid",
        online=True,  # retained argument must not bypass registry verification
    )
    assert matched == []
    assert no_structure == []
    assert unmatched == ["tranexamic acid"]


def test_wrapped_inci_label_keeps_phrases_and_slashes_intact():
    label = """INGREDIENTS: AQUA / WATER, ASCORBIC ACID, PENTYLENE
    GLYCOL, GLYCERIN, SODIUM HYDROXIDE, HYDROXYACETOPHENONE,
    SALICYLIC ACID, CAPRYLYL GLYCOL, CAPRYLYL/CAPRYL GLUCOSIDE,
    POLYQUATERNIUM-67, ADENOSINE, TRISODIUM
    ETHYLENEDIAMINEDISUCCINATE, SODIUM HYALURONATE, LINALOOL,
    LIMONENE, GERANIOL, PARFUM / FRAGRANCE"""

    tokens = _tokens(label)
    assert "pentylene glycol" in tokens
    assert "pentylene" not in tokens
    assert "glycol" not in tokens
    assert "caprylyl/capryl glucoside" in tokens

    matched, no_structure, unmatched = resolve(label, online=False)
    names = {item[0] for item in matched}
    assert names == {
        "Ascorbic Acid",
        "Pentylene Glycol",
        "Glycerin",
        "Hydroxyacetophenone",
        "Salicylic Acid",
        "Caprylyl Glycol",
        "Adenosine",
        "Linalool",
        "Limonene",
        "Geraniol",
    }
    assert set(no_structure) == {
        "aqua",
        "sodium hydroxide",
        "caprylyl/capryl glucoside",
        "polyquaternium-67",
        "trisodium ethylenediaminedisuccinate",
        "sodium hyaluronate",
        "parfum",
    }
    assert unmatched == []


def test_consensus_votes_on_whole_inci_names_not_word_fragments():
    passes = [
        OcrPass(
            text="Ingredients: Ascorbic Acid, Pentylene\nGlycol, Glycerin",
            confidence=78,
            variant="autocontrast",
            psm=6,
            quality=10,
        ),
        OcrPass(
            text="Ingredients: Ascorbic Acid, Pentylene Glycol, Glycerin",
            confidence=74,
            variant="sharpened",
            psm=4,
            quality=9,
        ),
        OcrPass(
            text="Ingredients: Ascorbic Acid, Pentylene Glycol, Glycerin",
            confidence=70,
            variant="binary_otsu",
            psm=11,
            quality=8,
        ),
    ]

    consensus = _consensus_text(passes)
    assert consensus == "ascorbic acid, pentylene glycol, glycerin"
    assert ", glycol," not in f", {consensus},"


def test_real_curved_thai_label_recognizes_more_than_eighty_percent():
    """Regression fixture supplied from the actual label-scanning workflow."""
    pytesseract = pytest.importorskip("pytesseract")
    fixture = Path(__file__).parent / "fixtures" / "garnier_bright_complete_real_label.jpg"
    ensemble = _run_ocr_ensemble(pytesseract, fixture.read_bytes())
    matched, no_structure, unmatched = resolve(ensemble["consensus_text"], online=False)

    expected_qsar = {
        "Ascorbic Acid",
        "Pentylene Glycol",
        "Glycerin",
        "Hydroxyacetophenone",
        "Salicylic Acid",
        "Caprylyl Glycol",
        "Adenosine",
        "Linalool",
        "Limonene",
        "Geraniol",
    }
    expected_without_qsar = {
        "aqua",
        "sodium hydroxide",
        "caprylyl/capryl glucoside",
        "polyquaternium-67",
        "trisodium ethylenediaminedisuccinate",
        "sodium hyaluronate",
        "parfum",
    }
    found_qsar = {item[0] for item in matched}
    found_without_qsar = set(no_structure)
    expected = expected_qsar | expected_without_qsar
    found = found_qsar | found_without_qsar

    assert len(found & expected) / len(expected) > 0.80
    assert found_qsar == expected_qsar
    assert found_without_qsar == expected_without_qsar
    assert unmatched == []



# The shampoo label below was read perfectly by Tesseract, yet the reader
# reported only 13 of its 23 printed ingredients: ten names had no curated
# entry, and the single-pass consensus gate discarded them before the registry
# resolver ever saw them. Nothing printed on a label may vanish silently.
SHAMPOO_LABEL = (
    "Ingredients : AQUA, POTASSIUM LAURETH PHOSPHATE, SODIUM LAURETH "
    "SULFATE, COCAMIDE MEA, SODIUM LAUROYL SARCOSINATE, GARCINIA "
    "MANGOSTANA PEEL EXTRACT, POTASSIUM LAURYL PHOSPHATE, "
    "COCAMIDOPROPYL BETAINE, ACRYLATES/STEARETH-20 METHACRYLATE "
    "COPOLYMER, PEG-150 DISTEARATE, DIPROPYLENE GLYCOL, PHENOXYETHANOL, "
    "FRAGRANCE, POLYQUATERNIUM-39, ETHYLHEXYLGLYCERIN, SODIUM "
    "CHLORIDE, GLYCERIN, METHYLPARABEN, DISODIUM EDTA, SODIUM "
    "HYDROXIDE, BUTYLPARABEN, ETHYLPARABEN, PROPYLPARABEN"
)


def test_every_printed_ingredient_is_accounted_for():
    matched, no_structure, unmatched = resolve(SHAMPOO_LABEL, online=False)

    assert {item[0] for item in matched} == {
        "Sodium Laureth Sulfate",
        "Sodium Lauroyl Sarcosinate",
        "Cocamidopropyl Betaine",
        "Dipropylene Glycol",
        "Phenoxyethanol",
        "Ethylhexylglycerin",
        "Sodium Chloride",
        "Glycerin",
        "Methylparaben",
        "Disodium Edta",
        "Butylparaben",
        "Ethylparaben",
        "Propylparaben",
    }
    assert set(no_structure) == {
        "aqua",
        "potassium laureth phosphate",
        "cocamide mea",
        "garcinia mangostana peel extract",
        "potassium lauryl phosphate",
        "acrylates/steareth-20 methacrylate copolymer",
        "peg-150 distearate",
        "parfum",
        "polyquaternium-39",
        "sodium hydroxide",
    }
    assert unmatched == []
    # 23 printed names in, 23 accounted for — no silent loss.
    assert len(matched) + len(no_structure) == 23


def test_family_recognition_explains_why_qsar_cannot_score_an_ingredient():
    assert non_qsar_profile("peg-150 distearate")["reason_code"] == "variable_chain_mixture"
    assert non_qsar_profile("polyquaternium-39")["substance_type"] == "polymer"
    assert (
        non_qsar_profile("garcinia mangostana peel extract")["substance_type"]
        == "botanical_extract"
    )
    # A curated single molecule must never be demoted by a family pattern.
    assert non_qsar_family("glycerin") is None
    assert non_qsar_family("salicylic acid") is None


def test_single_pass_consensus_keeps_unrecognized_names_for_the_registry():
    """With one OCR pass, cross-pass agreement is impossible to reach.

    Requiring two votes there dropped every name the curated table did not
    already know, which is exactly the evidence the registry resolver needs.
    """
    single = [
        OcrPass(
            text="Ingredients: Glycerin, Tranexamic Acid, Phenoxyethanol",
            confidence=88,
            variant="sharpened",
            psm=6,
            quality=12,
        )
    ]

    consensus = _consensus_text(single)
    assert "tranexamic acid" in consensus

    matched, _no_structure, unmatched = resolve(consensus, online=False)
    assert {item[0] for item in matched} == {"Glycerin", "Phenoxyethanol"}
    assert unmatched == ["tranexamic acid"]
