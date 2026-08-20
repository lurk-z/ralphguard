"""Central endpoint metadata for the scientific runtime.

The fifth endpoint is optional at inference time until a reviewed candidate
artifact exists.  Production readiness continues to require the original four
artifacts, preserving backwards compatibility with deployed bundles.
"""
from __future__ import annotations

from typing import Final


ENDPOINT_CONFIG: Final[dict[str, dict[str, object]]] = {
    "skin": {
        "label_en": "Skin Irritation",
        "label_th": "การระคายเคืองผิวหนัง",
        "feature_mode": "maccs_descr",
        "temporal_profile": (0.72, 1.00, 0.60),
        "required_in_production": True,
    },
    "eye": {
        "label_en": "Eye Irritation",
        "label_th": "การระคายเคืองดวงตา",
        "feature_mode": "maccs_descr",
        "temporal_profile": (0.80, 1.00, 0.62),
        "required_in_production": True,
    },
    "sens": {
        "label_en": "Skin Sensitization",
        "label_th": "การแพ้ผิวหนัง",
        "feature_mode": "morgan",
        "temporal_profile": (0.50, 0.82, 1.00),
        "required_in_production": True,
    },
    "acute": {
        "label_en": "Acute Toxicity",
        "label_th": "ความเป็นพิษเฉียบพลัน",
        "feature_mode": "morgan_maccs_descr",
        "temporal_profile": (1.00, 0.88, 0.78),
        "required_in_production": True,
    },
    "skin_dryness": {
        "label_en": "Skin Dryness Potential",
        "label_th": "ศักยภาพทำให้ผิวแห้ง",
        # Selected only after the notebook benchmark; no default is invented.
        "feature_mode": None,
        # No evidence-backed Day 1/3/7 profile has been established.
        "temporal_profile": None,
        "required_in_production": False,
    },
}

ENDPOINTS: Final[tuple[str, ...]] = tuple(ENDPOINT_CONFIG)
REQUIRED_PRODUCTION_ENDPOINTS: Final[tuple[str, ...]] = tuple(
    endpoint
    for endpoint, config in ENDPOINT_CONFIG.items()
    if bool(config["required_in_production"])
)
ENDPOINT_LABELS_TH: Final[dict[str, str]] = {
    endpoint: str(config["label_th"])
    for endpoint, config in ENDPOINT_CONFIG.items()
}

