"""
Morgan (ECFP-like) Fingerprints
================================
Used for both QSAR features AND similarity-based Applicability Domain.
"""
from typing import Optional

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem


def morgan_fingerprint(
    smiles: str,
    radius: int = 2,
    n_bits: int = 2048,
) -> Optional[np.ndarray]:
    """
    Compute Morgan fingerprint as a numpy array of 0/1.
    Returns None if SMILES is invalid.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None

    fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius=radius, nBits=n_bits)
    arr = np.zeros((n_bits,), dtype=np.int8)
    from rdkit.DataStructs import ConvertToNumpyArray
    ConvertToNumpyArray(fp, arr)
    return arr


def tanimoto_similarity(fp1: np.ndarray, fp2: np.ndarray) -> float:
    """Tanimoto coefficient between two binary fingerprints."""
    intersection = np.sum(fp1 & fp2)
    union = np.sum(fp1 | fp2)
    return float(intersection / union) if union > 0 else 0.0


if __name__ == "__main__":
    fp1 = morgan_fingerprint("CCO")
    fp2 = morgan_fingerprint("CCCO")
    fp3 = morgan_fingerprint("c1ccccc1")
    print(f"Ethanol vs Propanol: {tanimoto_similarity(fp1, fp2):.3f}")
    print(f"Ethanol vs Benzene : {tanimoto_similarity(fp1, fp3):.3f}")
