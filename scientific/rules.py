"""
Structural Alerts (Layer 3 of confidence)
==========================================
Compact set of well-known SMARTS that flag substructures commonly associated
with skin / eye irritation or sensitization. If the QSAR predicts LOW risk
for a molecule that matches a known alert, that's a conflict and the
confidence drops to Medium.

This is NOT a full toxicophore set — it's a sanity check that complements
the data-driven model with rule-based knowledge (an OECD principle for
QSAR transparency).
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from rdkit import Chem

# (alert_name, SMARTS, endpoints it applies to)
_ALERTS: List[Tuple[str, str, Tuple[str, ...]]] = [
    ("aldehyde",          "[CX3H1](=O)[#6]",          ("skin", "eye", "sens")),
    ("acid_halide",       "[CX3](=O)[F,Cl,Br,I]",     ("skin", "eye", "acute")),
    ("epoxide",           "C1OC1",                    ("skin", "eye", "sens")),
    ("isocyanate",        "[N]=C=O",                  ("skin", "eye", "sens", "acute")),
    ("anhydride",         "[CX3](=O)O[CX3](=O)",      ("skin", "eye", "sens")),
    ("alpha_beta_unsat_carbonyl", "[CX3]=[CX3][CX3]=O", ("skin", "sens")),
    ("peroxide",          "[OX2][OX2]",               ("skin", "eye", "acute")),
    ("strong_acid",       "S(=O)(=O)[OH]",            ("skin", "eye")),
]


def check_structural_alerts(smiles: str) -> Dict[str, List[str]]:
    """
    Return dict mapping endpoint -> list of alert names that fire for this molecule.
    Empty list means no alert for that endpoint.
    """
    mol = Chem.MolFromSmiles(smiles)
    result: Dict[str, List[str]] = {"skin": [], "eye": [], "sens": [], "acute": []}
    if mol is None:
        return result

    for name, smarts, endpoints in _ALERTS:
        patt = Chem.MolFromSmarts(smarts)
        if patt is None:
            continue
        if mol.HasSubstructMatch(patt):
            for ep in endpoints:
                if ep in result:
                    result[ep].append(name)
    return result


def rule_agrees_with_prediction(alerts: List[str], probability: float, threshold: float = 0.4) -> bool:
    """
    Layer-3 agreement:
      - If alerts fire and model predicts HIGH (p >= threshold) → agrees (True)
      - If alerts fire but model predicts LOW (p < threshold) → conflict (False)
      - If no alerts → agreement is vacuously True (model carries the weight)
    """
    if not alerts:
        return True
    return probability >= threshold
