"""Model card endpoints — expose QSAR validation metrics + methodology.

The API intentionally separates what has already been validated from what is
planned. This prevents the judge-facing UI from presenting internal
cross-validation as independent external validation.
"""
import json
from pathlib import Path

from fastapi import APIRouter

from app.core.config import settings
from app.core.endpoints import ENDPOINT_META

router = APIRouter()

OECD_PRINCIPLES = [
    "1. A defined endpoint",
    "2. An unambiguous algorithm (endpoint-specific features + soft-voting ensemble)",
    "3. A defined domain of applicability (k-NN Tanimoto check)",
    "4. Appropriate measures of goodness-of-fit, robustness and predictivity (5-fold out-of-fold metrics; independent external validation is reported separately when available)",
    "5. A mechanistic interpretation, where possible (structural alerts / SMARTS)",
]

METHODOLOGY = {
    "algorithm": "Soft-voting ensemble (Random Forest, Extra Trees, Logistic Regression, HistGradientBoosting)",
    "features": "Endpoint-specific Morgan, MACCS and molecular-descriptor combinations",
    "descriptors": ["MW", "logP", "TPSA", "HBD", "HBA", "rotatable bonds"],
    "applicability_domain": "k-nearest-neighbour Morgan/Tanimoto similarity (k=5; current screening threshold 0.18)",
    "confidence_layers": [
        "Layer 1 — Applicability Domain (in/out of domain)",
        "Layer 2 — Prediction probability extremity",
        "Layer 3 — Structural-alert agreement",
        "Layer 4 — Ensemble member disagreement",
    ],
    "validation": (
        "Current production metrics are 5-fold stratified out-of-fold (OOF) estimates. "
        "Each sample is predicted by a fold model that was not fitted on that sample. "
        "The current operating threshold is selected from OOF predictions; nested-CV/external results "
        "must be reported separately when generated."
    ),
    "limitations": [
        "Some endpoint classes and independent external sets remain small even when total endpoint rows are large; results are screening-level only",
        "5-fold OOF validation is internal validation, not an independent external test",
        "Structurally near-duplicate chemicals can still make random stratified folds optimistic; scaffold/external validation is required for stronger novelty testing",
        "Model scores are not calibrated clinical probabilities",
    ],
}

DATA_INTEGRITY_POLICY = {
    "identity": "Canonicalize valid SMILES with RDKit and audit InChIKey/canonical-SMILES identity before training.",
    "duplicates": "The same molecular structure must not be counted repeatedly; duplicate structures are collapsed, same-tier label conflicts are excluded, and lower-tier weak conflicts are audited.",
    "pubchem_role": "PubChem expands chemical identity/structure coverage and regulatory evidence. A PubChem structure by itself is not a toxicity training label.",
    "nice_role": "NICEATM ICE reference records remain staging data until endpoint mapping and a human review gate are completed.",
    "missing_evidence": "Missing GHS/toxicity evidence and 'Not Classified' are not automatically converted to label 0.",
    "training_evidence": (
        "Candidate-v2 training separates evidence quality: direct human/animal ICE rows use full weight; conservative OECD alternative-method labels use weight 0.7; "
        "PubChem regulatory weak labels use weight 0.25 or 0.5. Evidence-quality weights are then normalized so both endpoint classes have equal total optimization weight."
    ),
    "evidence_priority": "For an exact identity: base ICE experimental/reference > human-reviewed NICE/ICE > PubChem weak label. Conflicts within the best tier are excluded; a contradictory lower tier is recorded and overridden.",
    "external_overlap": "An independent external-validation set must have zero exact molecular-identity overlap with the training pool before its metrics are called external validation.",
}

EVIDENCE_SOURCES = {
    "base_training_files": {
        "status": "local_not_committed",
        "description_th": (
            "Base endpoint CSV อยู่ใน data/raw และถูก gitignore ดังนั้น clone จาก GitHub เพียงอย่างเดียว "
            "ไม่สามารถตรวจ provenance รายแถวได้ ต้องสร้าง manifest จากเครื่องที่ใช้ train"
        ),
        "configured_sources": {
            "skin": "project documentation points to literature / ECHA REACH / OECD QSAR Toolbox sources",
            "eye": "project documentation points to eye-irritation reference/literature sources",
            "sens": "project documentation points to LLNA / ICCVAM-NICEATM sources",
            "acute": "project documentation points to CATMoS / EPA CompTox acute oral toxicity sources",
        },
    },
    "pubchem_structure": {
        "provider": "PubChem PUG REST",
        "role": "CID, canonical structure, InChI/InChIKey and molecular properties; not an automatic toxicity label",
    },
    "pubchem_hazard_evidence": {
        "provider": "PubChem PUG-View GHS Classification",
        "role": "source-attributed positive hazard candidates that must pass review/consensus before supplemental training export",
    },
    "nice_reference_evidence": {
        "provider": "NICEATM Integrated Chemical Environment (ICE)",
        "role": (
            "official bulk reference records plus exact-InChIKey API review candidates. Bulk records enter only through conservative deterministic mappings; "
            "API review candidates require a reviewed label, reviewer identity, note and timestamp before training export"
        ),
        "status": "review_pipeline_available",
    },
    "molecular_processing": {
        "provider": "RDKit",
        "role": "SMILES parsing/canonicalization, InChIKey, fingerprints and descriptors",
    },
    "machine_learning": {
        "provider": "scikit-learn",
        "role": "Random Forest, Extra Trees, Logistic Regression, HistGradientBoosting and cross-validation",
    },
}

VALIDATION_STATUS = {
    "internal_oof": {"status": "complete", "description_th": "มีผล 5-fold out-of-fold สำหรับโมเดล production ปัจจุบัน"},
    "exact_structure_dedup_audit": {"status": "tooling_available", "description_th": "มีขั้นตอนตรวจ canonical SMILES / InChIKey และ label conflict ก่อนสร้างชุดฝึกรุ่นใหม่"},
    "nice_reference_harmonization": {"status": "tooling_available", "description_th": "มี collector + conservative mapping + human review gate สำหรับ NICEATM ICE แล้ว แต่จำนวน reviewed rows จริงขึ้นกับการรันและตรวจข้อมูลบนเครื่องพัฒนา"},
    "nested_validation": {"status": "tooling_available", "description_th": "Candidate-v2 รองรับ nested stratified CV เพื่อเลือก threshold ภายใน outer-training fold"},
    "scaffold_validation": {"status": "tooling_available", "description_th": "Candidate-v2 รองรับ Bemis–Murcko scaffold-grouped CV; ยังไม่ใช่ production metric จนกว่าจะรัน candidate dataset จริง"},
    "independent_external_validation": {"status": "not_completed", "description_th": "ยังไม่มีชุดทดสอบอิสระที่ยืนยันว่า exact identity ไม่ overlap และใช้เป็นหลักฐาน final external validation"},
}


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _models_dir() -> Path:
    return Path(settings.MODELS_DIR)


def _load_metrics() -> dict:
    return _read_json(_models_dir() / "validation_report.json")


def _load_skin_dryness_candidate_metric() -> dict | None:
    report = _read_json(
        _models_dir() / "candidate_v3" / "skin_dryness_validation_report.json"
    )
    oof = report.get("candidate_oof")
    if not isinstance(oof, dict):
        return None
    return {
        **oof,
        "n_pos": report.get("positive"),
        "n_neg": report.get("negative"),
        "n_train": report.get("n"),
        "validation_scope": "candidate_internal_oof",
        "promotion_status": report.get("promotion_status"),
        "promotion_checks": report.get("promotion_checks"),
        "research_preview": bool(report.get("research_preview")),
        "scaffold_validation": report.get("candidate_scaffold_grouped"),
        "external_validation": report.get("external"),
    }


def _load_training_integrity() -> dict:
    return _read_json(_models_dir() / "training_integrity_report.json")


@router.get("/metrics")
async def model_metrics():
    metrics = _load_metrics()
    dryness_candidate = _load_skin_dryness_candidate_metric()
    endpoints = [
        {
            "endpoint": ep,
            **meta,
            "metrics": dryness_candidate if ep == "skin_dryness" else metrics.get(ep),
            "status": (
                (
                    "research_candidate"
                    if dryness_candidate.get("promotion_status") == "eligible_for_manual_promotion"
                    else "research_candidate_blocked"
                )
                if ep == "skin_dryness" and dryness_candidate
                else "not_trained" if ep == "skin_dryness"
                else "production" if metrics.get(ep)
                else "not_available"
            ),
        }
        for ep, meta in ENDPOINT_META.items()
    ]
    return {
        "available": bool(metrics or dryness_candidate),
        "endpoints": endpoints,
        "note_th": (
            "ค่าปัจจุบันเป็น 5-fold out-of-fold internal validation: สารแต่ละรายการถูกทำนายใน fold "
            "ที่ไม่ได้ใช้รายการนั้นฝึกโมเดล แต่ยังไม่ใช่ independent external validation และไม่ควรตีความ "
            "model score เป็นความน่าจะเป็นทางคลินิก"
        ),
    }


@router.get("/info")
async def model_info():
    return {
        "methodology": METHODOLOGY,
        "oecd_principles": OECD_PRINCIPLES,
        "endpoints": ENDPOINT_META,
        "data_integrity_policy": DATA_INTEGRITY_POLICY,
        "evidence_sources": EVIDENCE_SOURCES,
        "validation_status": VALIDATION_STATUS,
        "training_integrity": _load_training_integrity() or None,
        "disclaimer_th": (
            "ผลจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เท่านั้น "
            "ไม่ใช่ผลการทดลองทางคลินิก ไม่ใช่การรับรองความปลอดภัยของผลิตภัณฑ์ "
            "และไม่ทดแทนการประเมินโดยผู้เชี่ยวชาญ"
        ),
    }
