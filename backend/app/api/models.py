"""Model card endpoints — expose QSAR validation metrics + methodology.

These power the judge-facing "model transparency" page and satisfy OECD QSAR
validation principles (defined endpoint, unambiguous algorithm, applicability
domain, appropriate measures of goodness-of-fit, mechanistic interpretation).
"""
import json
from pathlib import Path

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()

ENDPOINT_META = {
    "skin": {
        "label_en": "Skin Irritation",
        "label_th": "การระคายเคืองผิวหนัง",
        "oecd_tg": "OECD TG 404 / 439",
    },
    "eye": {
        "label_en": "Eye Irritation",
        "label_th": "การระคายเคืองดวงตา",
        "oecd_tg": "OECD TG 405 / 492",
    },
    "sens": {
        "label_en": "Skin Sensitization",
        "label_th": "การแพ้สัมผัสผิวหนัง",
        "oecd_tg": "OECD TG 429 / 442",
    },
    "acute": {
        "label_en": "Acute Toxicity",
        "label_th": "ความเป็นพิษเฉียบพลัน",
        "oecd_tg": "OECD TG 420 / CATMoS",
    },
}

OECD_PRINCIPLES = [
    "1. A defined endpoint",
    "2. An unambiguous algorithm (Random Forest on Morgan fingerprints)",
    "3. A defined domain of applicability (k-NN Tanimoto check)",
    "4. Appropriate measures of goodness-of-fit, robustness and predictivity "
    "(5-fold CV + held-out test: accuracy, balanced accuracy, sensitivity, "
    "specificity, ROC-AUC)",
    "5. A mechanistic interpretation, where possible (structural alerts / SMARTS)",
]

METHODOLOGY = {
    "algorithm": "Random Forest (200 trees)",
    "features": "Morgan/ECFP fingerprints (radius 2, 2048 bits)",
    "descriptors": ["MW", "logP", "TPSA", "HBD", "HBA", "rotatable bonds"],
    "applicability_domain": "k-nearest-neighbour Tanimoto similarity (k=5, threshold 0.30)",
    "confidence_layers": [
        "Layer 1 — Applicability Domain (in/out of domain)",
        "Layer 2 — Prediction probability extremity",
        "Layer 3 — Structural-alert agreement",
    ],
    "validation": "5-fold stratified CV + 20% held-out test set",
}


def _load_metrics() -> dict:
    path = Path(settings.MODELS_DIR) / "validation_report.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


@router.get("/metrics")
async def model_metrics():
    """Per-endpoint validation metrics (read from validation_report.json)."""
    metrics = _load_metrics()
    endpoints = []
    for ep, meta in ENDPOINT_META.items():
        endpoints.append(
            {
                "endpoint": ep,
                **meta,
                "metrics": metrics.get(ep),  # None if models not trained yet
            }
        )
    return {
        "available": bool(metrics),
        "endpoints": endpoints,
        "note_th": (
            "หากค่าเมตริกเป็นว่าง ให้รัน `python data_prep.py` เพื่อฝึกโมเดล "
            "และสร้าง validation_report.json"
        ),
    }


@router.get("/info")
async def model_info():
    """Static methodology / OECD-principles card (no DB or files needed)."""
    return {
        "methodology": METHODOLOGY,
        "oecd_principles": OECD_PRINCIPLES,
        "endpoints": ENDPOINT_META,
        "disclaimer_th": (
            "ผลจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เท่านั้น "
            "ไม่ใช่การทดสอบทางคลินิกหรือทดแทนการประเมินโดยผู้เชี่ยวชาญ"
        ),
    }
