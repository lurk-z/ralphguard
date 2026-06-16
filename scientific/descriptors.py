"""
Molecular Descriptors
=====================
Compute physicochemical descriptors from SMILES using RDKit.

Used as features for QSAR models AND as raw chemistry info shown to user.
"""
from dataclasses import dataclass, asdict
from typing import Optional

from rdkit import Chem
from rdkit.Chem import Crippen, Descriptors, Lipinski, rdMolDescriptors


@dataclass
class MolecularDescriptors:
    """Container for the descriptor vector we use everywhere."""
    mw: float            # Molecular weight (g/mol)
    logp: float          # Octanol-water partition coefficient
    tpsa: float          # Topological polar surface area (Å²)
    hbd: int             # H-bond donor count
    hba: int             # H-bond acceptor count
    rotatable_bonds: int
    aromatic_rings: int
    heavy_atoms: int

    def to_dict(self) -> dict:
        return asdict(self)


def canonicalize_smiles(smiles: str) -> Optional[str]:
    """Return canonical SMILES, or None if invalid."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    return Chem.MolToSmiles(mol, canonical=True)


def compute_descriptors(smiles: str) -> Optional[MolecularDescriptors]:
    """
    Compute descriptors from SMILES.
    Returns None if SMILES is invalid.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None

    return MolecularDescriptors(
        mw=round(Descriptors.MolWt(mol), 2),
        logp=round(Crippen.MolLogP(mol), 2),
        tpsa=round(rdMolDescriptors.CalcTPSA(mol), 2),
        hbd=Lipinski.NumHDonors(mol),
        hba=Lipinski.NumHAcceptors(mol),
        rotatable_bonds=Lipinski.NumRotatableBonds(mol),
        aromatic_rings=Lipinski.NumAromaticRings(mol),
        heavy_atoms=mol.GetNumHeavyAtoms(),
    )


if __name__ == "__main__":
    # Quick test
    for s in ["CCO", "O=C(O)c1ccccc1O", "invalid"]:
        d = compute_descriptors(s)
        print(f"{s:40s} →  {d}")
