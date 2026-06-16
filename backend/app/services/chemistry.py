"""RDKit-backed SMILES validation + descriptor computation for the API."""
from typing import Optional

from rdkit import Chem
from rdkit.Chem import Crippen, Descriptors, Lipinski, rdMolDescriptors


def validate_and_describe(smiles: str) -> tuple[bool, Optional[str], Optional[dict], Optional[str]]:
    """
    Returns (valid, canonical_smiles, descriptors, error).
    """
    if not smiles or not smiles.strip():
        return False, None, None, "empty SMILES"

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return False, None, None, "RDKit could not parse SMILES"

    canonical = Chem.MolToSmiles(mol, canonical=True)
    descriptors = {
        "mw": round(Descriptors.MolWt(mol), 2),
        "logp": round(Crippen.MolLogP(mol), 2),
        "tpsa": round(rdMolDescriptors.CalcTPSA(mol), 2),
        "hbd": Lipinski.NumHDonors(mol),
        "hba": Lipinski.NumHAcceptors(mol),
        "rotatable_bonds": Lipinski.NumRotatableBonds(mol),
        "aromatic_rings": Lipinski.NumAromaticRings(mol),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
    }
    return True, canonical, descriptors, None
