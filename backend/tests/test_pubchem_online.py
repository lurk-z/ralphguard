"""Safety tests for PubChem online SMILES resolution."""

from app.api.pubchem_online import exact_structure_matches


def test_exact_structure_accepts_equivalent_canonicalization():
    assert exact_structure_matches("CCO", "OCC") is True


def test_exact_structure_rejects_different_connectivity():
    assert exact_structure_matches("CCO", "CC(=O)O") is False


def test_exact_structure_rejects_different_defined_stereochemistry():
    # Opposite stereoisomers must not be silently treated as the same exact
    # PubChem identity when the user supplied stereochemistry explicitly.
    assert exact_structure_matches("C[C@H](O)C(=O)O", "C[C@@H](O)C(=O)O") is False


def test_invalid_structure_never_matches():
    assert exact_structure_matches("not-a-smiles", "CCO") is False
