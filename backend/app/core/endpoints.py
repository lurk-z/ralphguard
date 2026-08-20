"""Backend endpoint source of truth and availability metadata."""
from __future__ import annotations

ENDPOINT_META: dict[str, dict[str, object]] = {
    "skin": {
        "label_en": "Skin Irritation",
        "label_th": "การระคายเคืองผิวหนัง",
        "oecd_tg": "OECD TG 404 / 439",
        "candidate_only": False,
    },
    "eye": {
        "label_en": "Eye Irritation",
        "label_th": "การระคายเคืองดวงตา",
        "oecd_tg": "OECD TG 405 / 492 / 494",
        "candidate_only": False,
    },
    "sens": {
        "label_en": "Skin Sensitization",
        "label_th": "การแพ้สัมผัสผิวหนัง",
        "oecd_tg": "OECD TG 429 / 442",
        "candidate_only": False,
    },
    "acute": {
        "label_en": "Acute Toxicity",
        "label_th": "ความเป็นพิษเฉียบพลัน",
        "oecd_tg": "OECD TG 420 / CATMoS",
        "candidate_only": False,
    },
    "skin_dryness": {
        "label_en": "Skin Dryness Potential",
        "label_th": "ศักยภาพทำให้ผิวแห้ง",
        "oecd_tg": None,
        "candidate_only": True,
        "evidence_note": "Dryness/barrier measurements and source-attributed regulatory or curated evidence; no dedicated OECD endpoint is claimed.",
    },
}

SUPPORTED_ENDPOINTS = frozenset(ENDPOINT_META)
ENDPOINT_ORDER = {endpoint: index for index, endpoint in enumerate(ENDPOINT_META)}

