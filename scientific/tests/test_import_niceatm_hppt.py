from scripts.import_niceatm_hppt import identity


def test_hppt_identity_canonicalizes_equivalent_smiles():
    ethanol_a = identity("CCO")
    ethanol_b = identity("OCC")
    assert ethanol_a is not None
    assert ethanol_a == ethanol_b


def test_hppt_identity_rejects_multicomponent_and_invalid_structures():
    assert identity("CCO.[Na+]") is None
    assert identity("not-a-smiles") is None
