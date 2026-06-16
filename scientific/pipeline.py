"""
Full Assessment Pipeline
=========================
SMILES + concentrations + region → final result dict (matches AssessmentResult.result).

Used by the worker for the queued job, and re-usable for offline scripts/tests.
"""
from __future__ import annotations

from typing import List, Optional

from confidence import ConfidenceResult
from mixture import FormulaItem, compute_formula_risk, expand_timecourse
from qsar.predictor import Predictor, SubstancePrediction

ENDPOINT_LABELS_TH = {
    "skin": "การระคายเคืองผิวหนัง",
    "eye": "การระคายเคืองดวงตา",
    "sens": "การแพ้ผิวหนัง",
    "acute": "ความเป็นพิษเฉียบพลัน",
}

DISCLAIMER_TH = (
    "ผลจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เท่านั้น "
    "ไม่ใช่การทดสอบทางคลินิกหรือทดแทนการประเมินโดยผู้เชี่ยวชาญ"
)


def _band(score: float) -> str:
    if score < 25:
        return "low"
    if score < 50:
        return "moderate"
    if score < 75:
        return "high"
    return "severe"


def _confidence_to_dict(c: ConfidenceResult, in_domain: bool, similarity: float) -> dict:
    return {
        "level": c.level,
        "reason_th": c.reason_th,
        "score": round(c.score, 3),
        "in_domain": in_domain,
        "domain_similarity": round(similarity, 3),
    }


def run_pipeline(
    predictor: Predictor,
    formula: List[dict],
    region: str,
) -> dict:
    """
    Parameters
    ----------
    formula : list of {smiles, name?, concentration}
    region  : forearm | hand | face | eye

    Returns dict ready to serialize as Assessment.result.
    """
    substances: List[SubstancePrediction] = []
    mix_items: List[FormulaItem] = []
    errors: List[str] = []

    for entry in formula:
        smiles = entry["smiles"]
        try:
            pred = predictor.predict(smiles)
            substances.append(pred)
            mix_items.append(
                FormulaItem(
                    smiles=pred.canonical_smiles,
                    concentration=float(entry["concentration"]),
                    potency={ep: p.score for ep, p in pred.per_endpoint.items()},
                )
            )
        except ValueError as e:
            errors.append(str(e))

    if not substances:
        raise ValueError(f"no valid substances; errors: {errors}")

    peak = compute_formula_risk(mix_items, region=region)
    timecourse = expand_timecourse(peak)

    # Per-endpoint formula confidence = worst of contributing substances
    endpoint_results = {}
    for ep in peak:
        worst: Optional[ConfidenceResult] = None
        worst_sim = 1.0
        worst_in_domain = True
        order = {"High": 2, "Medium": 1, "Low": 0}
        for sub in substances:
            if ep not in sub.per_endpoint:
                continue
            c = sub.per_endpoint[ep].confidence
            in_domain = "out-of-domain" not in c.reason_th
            sim = _extract_similarity(c.reason_th)
            if worst is None or order[c.level] < order[worst.level]:
                worst = c
                worst_sim = sim
                worst_in_domain = in_domain

        endpoint_results[ep] = {
            "label_th": ENDPOINT_LABELS_TH.get(ep, ep),
            "peak_score": round(peak[ep], 2),
            "timecourse": timecourse[ep],
            "band": _band(peak[ep]),
            "confidence": _confidence_to_dict(worst, worst_in_domain, worst_sim) if worst else None,
        }

    return {
        "region": region,
        "endpoints": endpoint_results,
        "substances": [
            {
                "smiles": s.smiles,
                "canonical_smiles": s.canonical_smiles,
                "descriptors": s.descriptors.to_dict(),
                "per_endpoint": {
                    ep: {
                        "probability": p.probability,
                        "score": p.score,
                        "alerts": p.alerts,
                        "rule_agrees": p.rule_agrees,
                        "confidence": {
                            "level": p.confidence.level,
                            "reason_th": p.confidence.reason_th,
                        },
                    }
                    for ep, p in s.per_endpoint.items()
                },
            }
            for s in substances
        ],
        "errors": errors,
        "disclaimer_th": DISCLAIMER_TH,
    }


def _extract_similarity(reason_th: str) -> float:
    """Best-effort parse of 'Tanimoto = 0.xx' from the reason string."""
    import re
    m = re.search(r"=\s*([0-9.]+)", reason_th)
    return float(m.group(1)) if m else 0.0
