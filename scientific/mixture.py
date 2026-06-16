"""
Mixture Risk Aggregation
=========================
Combine individual substance scores into a formula-level risk.

Current approach: dose-additivity weighted by concentration.
Future work: account for synergy / quenching (EFSA mixture guidelines).
"""
from dataclasses import dataclass
from typing import Dict, List


@dataclass
class FormulaItem:
    smiles: str
    concentration: float  # 0-100 %
    potency: Dict[str, float]  # endpoint -> 0-100 per-substance score


REGION_SENSITIVITY: Dict[str, Dict[str, float]] = {
    "forearm": {"skin": 1.0, "eye": 0.2},
    "hand": {"skin": 0.85, "eye": 0.15},
    "face": {"skin": 1.3, "eye": 0.5},
    "eye": {"skin": 1.1, "eye": 1.6},
}


def compute_formula_risk(
    items: List[FormulaItem],
    region: str = "forearm",
) -> Dict[str, float]:
    """
    Compute per-endpoint risk score for the whole formula.

    Steps:
      1. Weighted sum:   peak_e = Σ (conc_i / 100 × potency_i_e)
      2. Apply region sensitivity factor for skin / eye endpoints
      3. Clamp to [0, 100]
    """
    region_factor = REGION_SENSITIVITY.get(region, REGION_SENSITIVITY["forearm"])
    base: Dict[str, float] = {"skin": 0.0, "eye": 0.0, "sens": 0.0, "acute": 0.0}

    for item in items:
        frac = item.concentration / 100.0
        for endpoint, pot in item.potency.items():
            base[endpoint] = base.get(endpoint, 0.0) + frac * pot

    # Apply region factors (only to skin / eye)
    base["skin"] *= region_factor.get("skin", 1.0)
    base["eye"] *= region_factor.get("eye", 1.0)

    # Clamp to [0, 100]
    return {k: max(0.0, min(100.0, v)) for k, v in base.items()}


# Temporal profiles by endpoint (Day 1, Day 3, Day 7 relative to peak)
# Heuristic profiles aligned with OECD TG 404 (irritation) and TG 429 (sensitization).
TEMPORAL_PROFILES: Dict[str, List[float]] = {
    "skin":  [0.72, 1.00, 0.60],   # peak at 48-72h
    "eye":   [0.80, 1.00, 0.62],
    "sens":  [0.50, 0.82, 1.00],   # delayed-type hypersensitivity
    "acute": [1.00, 0.88, 0.78],   # immediate peak
}


def expand_timecourse(peak_scores: Dict[str, float]) -> Dict[str, List[int]]:
    """Expand peak scores to Day 1/3/7 using temporal profiles."""
    return {
        ep: [int(round(peak_scores[ep] * m)) for m in TEMPORAL_PROFILES[ep]]
        for ep in peak_scores
    }
