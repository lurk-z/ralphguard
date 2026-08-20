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
from endpoints import ENDPOINT_LABELS_TH

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


def _is_known_carrier(entry: dict) -> bool:
    """Return True for a vehicle that must not be extrapolated through QSAR.

    The current models assign water a high hazard probability because water is
    outside their training domain. Since formulae are balanced with water to
    100%, including that extrapolation dominates every weighted score and can
    force a harmless vehicle to the 100-point clamp.
    """
    return str(entry.get("smiles", "")).strip() in {"O", "[OH2]"}


def _unsupported_composition_reason(entry: dict) -> str | None:
    """Reject a single-SMILES surrogate for an extract or variable mixture."""
    import re

    name = str(entry.get("name", "")).strip()
    if re.search(
        r"\b(witch\s*hazel|aloe\s*vera|extract|leaf\s+juice|fragrance|parfum|essential\s+oil)\b",
        name,
        flags=re.IGNORECASE,
    ):
        return "Botanical extracts and variable mixtures cannot be represented by one surrogate SMILES"
    return None


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
    modeled_entries: list[tuple[dict, SubstancePrediction]] = []
    mix_items: List[FormulaItem] = []
    errors: List[str] = []
    ingredient_assessments: list[dict] = []

    for entry in formula:
        smiles = entry["smiles"]
        if _is_known_carrier(entry):
            ingredient_assessments.append(
                {
                    "name": entry.get("name") or "Water (Aqua)",
                    "smiles": smiles,
                    "concentration": float(entry["concentration"]),
                    "recognized": True,
                    "resolved": True,
                    "qsar_eligible": False,
                    "assessment_method": "known_carrier_baseline",
                    "unresolved_reason": "Water is a formula vehicle and is not extrapolated through the QSAR models",
                }
            )
            continue
        unsupported_reason = _unsupported_composition_reason(entry)
        if unsupported_reason:
            ingredient_assessments.append(
                {
                    "name": entry.get("name") or smiles,
                    "smiles": smiles,
                    "concentration": float(entry["concentration"]),
                    "recognized": True,
                    "resolved": False,
                    "qsar_eligible": False,
                    "assessment_method": "unsupported_composition",
                    "unresolved_reason": unsupported_reason,
                }
            )
            continue
        try:
            pred = predictor.predict(smiles)
            substances.append(pred)
            modeled_entries.append((entry, pred))
            ingredient_assessments.append(
                {
                    "name": entry.get("name") or smiles,
                    "smiles": smiles,
                    "concentration": float(entry["concentration"]),
                    "recognized": True,
                    "resolved": True,
                    "qsar_eligible": True,
                    "assessment_method": "qsar",
                    "unresolved_reason": None,
                }
            )
            mix_items.append(
                FormulaItem(
                    smiles=pred.canonical_smiles,
                    concentration=float(entry["concentration"]),
                    potency={ep: p.score for ep, p in pred.per_endpoint.items()},
                )
            )
        except ValueError as e:
            errors.append(str(e))
            ingredient_assessments.append(
                {
                    "name": entry.get("name") or smiles,
                    "smiles": smiles,
                    "concentration": float(entry["concentration"]),
                    "recognized": bool(entry.get("name")),
                    "resolved": False,
                    "qsar_eligible": False,
                    "assessment_method": "unresolved",
                    "unresolved_reason": str(e),
                }
            )

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
        model_versions: set[str] = set()
        for sub in substances:
            if ep not in sub.per_endpoint:
                continue
            c = sub.per_endpoint[ep].confidence
            model_versions.add(str(getattr(sub.per_endpoint[ep], "model_version", "unknown")))
            in_domain = "out-of-domain" not in c.reason_th
            sim = _extract_similarity(c.reason_th)
            if worst is None or order[c.level] < order[worst.level]:
                worst = c
                worst_sim = sim
                worst_in_domain = in_domain

        endpoint_results[ep] = {
            "label_th": ENDPOINT_LABELS_TH.get(ep, ep),
            "peak_score": round(peak[ep], 2),
            "timecourse": timecourse.get(ep),
            "band": _band(peak[ep]),
            "confidence": _confidence_to_dict(worst, worst_in_domain, worst_sim) if worst else None,
            "model_status": (
                "research_candidate"
                if any(version.startswith("candidate") for version in model_versions)
                else "production"
            ),
            "model_versions": sorted(model_versions),
            "evidence_note_th": (
                "โมเดลทดลองสำหรับคัดกรอง ยังไม่ผ่านเกณฑ์เลื่อนเป็น production"
                if any(version.startswith("candidate") for version in model_versions)
                else None
            ),
        }

    return {
        "region": region,
        "endpoints": endpoint_results,
        "substances": [
            {
                "name": entry.get("name"),
                "concentration": float(entry["concentration"]),
                "smiles": s.smiles,
                "canonical_smiles": s.canonical_smiles,
                "descriptors": s.descriptors.to_dict(),
                "per_endpoint": {
                    ep: {
                        "probability": p.probability,
                        "score": p.score,
                        "alerts": p.alerts,
                        "rule_agrees": p.rule_agrees,
                        # explicit uncertainty quantification (reviewer feedback #1)
                        "uncertainty": getattr(p, "uncertainty", 0.0),
                        "in_domain": getattr(p, "in_domain", True),
                        "domain_similarity": getattr(p, "domain_similarity", 0.0),
                        "threshold": getattr(p, "threshold", 0.5),
                        "flagged": getattr(p, "flagged", p.probability >= 0.5),
                        "training_exposure": {
                            "seen": getattr(p, "training_seen", False),
                            "role": getattr(p, "training_exposure_role", "none"),
                            "model_version": getattr(p, "model_version", "unknown"),
                        },
                        "confidence": {
                            "level": p.confidence.level,
                            "reason_th": p.confidence.reason_th,
                        },
                    }
                    for ep, p in s.per_endpoint.items()
                },
            }
            for entry, s in modeled_entries
        ],
        "ingredient_assessments": ingredient_assessments,
        "formula_coverage": {
            "total_ingredients": len(formula),
            "qsar_assessed_ingredients": len(modeled_entries),
            "known_carrier_ingredients": sum(
                1 for item in ingredient_assessments if item["assessment_method"] == "known_carrier_baseline"
            ),
            "unresolved_ingredients": sum(
                1
                for item in ingredient_assessments
                if item["assessment_method"] not in {"qsar", "known_carrier_baseline"}
            ),
            "coverage_percentage": round(
                100.0
                * sum(
                    1
                    for item in ingredient_assessments
                    if item["assessment_method"] in {"qsar", "known_carrier_baseline"}
                )
                / max(1, len(formula)),
                1,
            ),
        },
        "errors": errors,
        "disclaimer_th": DISCLAIMER_TH,
    }


def _extract_similarity(reason_th: str) -> float:
    """Best-effort parse of 'Tanimoto = 0.xx' from the reason string."""
    import re
    m = re.search(r"=\s*([0-9.]+)", reason_th)
    return float(m.group(1)) if m else 0.0
