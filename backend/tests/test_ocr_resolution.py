"""Ingredient resolution must identify structures without inventing a dose."""

from app.api.ocr import OcrItem, resolve


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

