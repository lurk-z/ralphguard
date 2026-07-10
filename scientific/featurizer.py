"""
Shared featurizer — used by BOTH training (data_prep.py) and inference
(qsar/predictor.py) so the feature vector is identical end-to-end.

Feature modes (chosen per-endpoint from the nested-CV study in
docs/MODEL_IMPROVEMENT.md):
    - "morgan"              : Morgan/ECFP fingerprint (2048 bits)
    - "maccs_descr"         : MACCS keys (167) + physicochemical descriptors (10)
    - "morgan_maccs_descr"  : Morgan + MACCS + descriptors

AD (applicability domain) always uses the Morgan fingerprint regardless of the
model's feature mode, so we expose `morgan_bits()` separately.
"""
from __future__ import annotations

from typing import Optional

import numpy as np
from rdkit import Chem
from rdkit.Chem import (
    AllChem,
    Crippen,
    Descriptors,
    Lipinski,
    MACCSkeys,
    rdMolDescriptors,
)
from rdkit.DataStructs import ConvertToNumpyArray

MORGAN_BITS = 2048
DESCRIPTOR_NAMES = [
    "MolWt", "MolLogP", "TPSA", "NumHDonors", "NumHAcceptors",
    "NumRotatableBonds", "NumAromaticRings", "HeavyAtoms",
    "FractionCSP3", "NumRings",
]


def _mol(smiles: str):
    return Chem.MolFromSmiles(str(smiles))


def morgan_bits(mol, radius: int = 2, n_bits: int = MORGAN_BITS) -> np.ndarray:
    bv = AllChem.GetMorganFingerprintAsBitVect(mol, radius, nBits=n_bits)
    arr = np.zeros((n_bits,), dtype=np.int8)
    ConvertToNumpyArray(bv, arr)
    return arr


def _maccs(mol) -> np.ndarray:
    bv = MACCSkeys.GenMACCSKeys(mol)
    arr = np.zeros((167,), dtype=np.int8)
    ConvertToNumpyArray(bv, arr)
    return arr


def _descriptors(mol) -> np.ndarray:
    return np.array([
        Descriptors.MolWt(mol),
        Crippen.MolLogP(mol),
        rdMolDescriptors.CalcTPSA(mol),
        Lipinski.NumHDonors(mol),
        Lipinski.NumHAcceptors(mol),
        Lipinski.NumRotatableBonds(mol),
        rdMolDescriptors.CalcNumAromaticRings(mol),
        mol.GetNumHeavyAtoms(),
        rdMolDescriptors.CalcFractionCSP3(mol),
        rdMolDescriptors.CalcNumRings(mol),
    ], dtype=float)


def featurize_mol(mol, mode: str) -> np.ndarray:
    parts = []
    if "morgan" in mode:
        parts.append(morgan_bits(mol).astype(float))
    if "maccs" in mode:
        parts.append(_maccs(mol).astype(float))
    if "descr" in mode:
        parts.append(_descriptors(mol))
    if not parts:
        raise ValueError(f"unknown feature mode: {mode}")
    return np.concatenate(parts)


def featurize_smiles(smiles: str, mode: str) -> Optional[np.ndarray]:
    mol = _mol(smiles)
    if mol is None:
        return None
    return featurize_mol(mol, mode)
