"""Ingredient resolution must identify structures without inventing a dose."""

from pathlib import Path

import pytest

from app.api.ocr import (
    OcrItem,
    OcrPass,
    _consensus_text,
    _run_ocr_ensemble,
    _tokens,
    resolve,
)


def test_resolve_known_inci_names():
    matched, no_structure, unmatched = resolve(
        "Ingredients: Aqua, Glycerin, Niacinamide, Phenoxyethanol",
        online=False,
    )
    names = {item[0] for item in matched}
    assert {"Glycerin", "Niacinamide", "Phenoxyethanol"}.issubset(names)
    assert "aqua" in no_structure
    assert not unmatched


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

