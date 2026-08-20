"""PubChem GHS evidence ingestion with an explicit human-review gate.

PubChem PUG-View aggregates annotations from third parties. Hazard statements
can support a positive endpoint label, but absence of a statement is not a
negative experiment. This module creates positive candidates only. Candidate
training accepts manual review, multi-source regulatory consensus, or a clearly
tagged weight-0.25 single-regulatory-source tier; generic third-party evidence
remains pending.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

import httpx
from rdkit import Chem
from rdkit.Chem import Descriptors
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ingredient_registry import ExperimentalEvidence, IngredientRegistry
from app.core.endpoints import SUPPORTED_ENDPOINTS
from app.services.ingredient_registry import (
    PUBCHEM_BASE,
    PUBCHEM_PROPERTIES,
    _throttled_get,
    classify_substance,
    normalize_ingredient_name,
)


PUBCHEM_VIEW_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view"
ENDPOINTS = set(SUPPORTED_ENDPOINTS)

# Acute model documentation identifies CATMoS acute *oral* toxicity, so dermal
# and inhalation statements are intentionally not mapped to that endpoint.
HAZARD_ENDPOINTS: dict[str, tuple[str, ...]] = {
    "H314": ("skin", "eye"),
    "H315": ("skin",),
    "H317": ("sens",),
    "H318": ("eye",),
    "H319": ("eye",),
    "H320": ("eye",),
    "H300": ("acute",),
    "H301": ("acute",),
    "H302": ("acute",),
}
HAZARD_CODE_RE = re.compile(r"\b(H\d{3}[A-Za-z]?)\b")
SUPPLEMENTAL_HAZARD_CODE_RE = re.compile(r"\b((?:EUH|AUH)\s*\d{3}[A-Za-z]?)\b", re.IGNORECASE)
SUPPLEMENTAL_HAZARD_ENDPOINTS: dict[str, tuple[str, ...]] = {
    "EUH066": ("skin_dryness",),
    "AUH066": ("skin_dryness",),
}
SKIN_SENSITIZATION_CATEGORY_RE = re.compile(
    r"\bskin\s+sens(?:itisation|itization)?\.?\s*"
    r"(?:-\s*category\s*)?(1A|1B|1)\b",
    re.IGNORECASE,
)
QSAR_ALLOWED_ATOMIC_NUMBERS = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53}
QSAR_MIN_MW = 30.0
QSAR_MAX_MW = 500.0
QSAR_MIN_HEAVY_ATOMS = 2
QSAR_MAX_HEAVY_ATOMS = 36
SKIN_DRYNESS_DISCOVERY_RE = re.compile(
    r"\b(skin\s+dryness|dry\s+skin|dryness\s+(?:or|and)\s+cracking|"
    r"defats?\s+the\s+skin|defatting\s+of\s+the\s+skin|skin\s+barrier\s+disruption|"
    r"transepidermal\s+water\s+loss|TEWL|skin\s+hydration|stratum\s+corneum\s+hydration)\b",
    re.IGNORECASE,
)


def _walk_sections(sections: list[dict] | None):
    for section in sections or []:
        yield section
        yield from _walk_sections(section.get("Section"))


def _source_quality(source_name: str) -> str:
    value = source_name.casefold()
    if any(token in value for token in ("regulation (ec)", "european chemicals agency", "nite-cmc", "safe work australia")):
        return "regulatory"
    if any(token in value for token in ("hazardous substances data bank", "hsdb")):
        return "expert_curated"
    return "third_party"


def parse_skin_dryness_discovery_candidates(payload: dict) -> list[dict]:
    """Find review candidates without converting keyword matches to labels."""
    record = payload.get("Record") or {}
    cid = int(record.get("RecordNumber") or 0)
    references = {
        int(ref["ReferenceNumber"]): ref
        for ref in record.get("Reference", [])
        if ref.get("ReferenceNumber") is not None
    }
    results: list[dict] = []
    seen: set[str] = set()
    for section in _walk_sections(record.get("Section")):
        for info in section.get("Information", []):
            reference_number = int(info.get("ReferenceNumber") or 0)
            reference = references.get(reference_number, {})
            for value in (info.get("Value") or {}).get("StringWithMarkup", []):
                statement = str(value.get("String") or "").strip()
                if not statement or not SKIN_DRYNESS_DISCOVERY_RE.search(statement):
                    continue
                fingerprint = hashlib.sha256(
                    json.dumps(
                        {"cid": cid, "reference": reference_number, "heading": section.get("TOCHeading"), "statement": statement},
                        sort_keys=True,
                    ).encode("utf-8")
                ).hexdigest()
                if fingerprint in seen:
                    continue
                seen.add(fingerprint)
                results.append(
                    {
                        "pubchem_cid": cid,
                        "endpoint": "skin_dryness",
                        "candidate_label": None,
                        "label_status": "review_required",
                        "evidence_type": "keyword_discovery",
                        "evidence_subtype": "candidate_context",
                        "source_name": str(reference.get("SourceName") or f"PubChem reference {reference_number}"),
                        "source_id": str(reference.get("SourceID")) if reference.get("SourceID") is not None else None,
                        "source_url": reference.get("URL"),
                        "source_quality": _source_quality(str(reference.get("SourceName") or "")),
                        "evidence_fingerprint": fingerprint,
                        "raw_evidence": {"heading": section.get("TOCHeading"), "statement": statement},
                        "review_status": "pending",
                        "provenance": {
                            "provider": "PubChem PUG-View",
                            "mapping": "keyword discovery only; no automatic label",
                            "negative_inference_allowed": False,
                        },
                    }
                )
    return results


def parse_pubchem_ghs_evidence(payload: dict) -> list[dict]:
    """Extract endpoint-positive candidates and exact attribution from PUG-View.

    A source saying ``Not Classified`` is deliberately ignored: it is not
    endpoint-specific proof of a negative result and may simply reflect missing
    classification data.
    """
    record = payload.get("Record") or {}
    cid = int(record["RecordNumber"])
    references = {
        int(ref["ReferenceNumber"]): ref
        for ref in record.get("Reference", [])
        if ref.get("ReferenceNumber") is not None
    }
    grouped: dict[tuple[int, str], dict] = {}

    for section in _walk_sections(record.get("Section")):
        if section.get("TOCHeading") != "GHS Classification":
            continue
        for info in section.get("Information", []):
            if info.get("Name") != "GHS Hazard Statements":
                continue
            reference_number = int(info.get("ReferenceNumber") or 0)
            reference = references.get(reference_number, {})
            statements = [
                str(item.get("String") or "").strip()
                for item in (info.get("Value") or {}).get("StringWithMarkup", [])
                if str(item.get("String") or "").strip()
            ]
            endpoint_codes: dict[str, set[str]] = defaultdict(set)
            endpoint_statements: dict[str, list[str]] = defaultdict(list)
            for statement in statements:
                raw_codes = HAZARD_CODE_RE.findall(statement) + SUPPLEMENTAL_HAZARD_CODE_RE.findall(statement)
                for raw_code in raw_codes:
                    code = re.sub(r"\s+", "", raw_code.upper())
                    endpoints = HAZARD_ENDPOINTS.get(code, ()) + SUPPLEMENTAL_HAZARD_ENDPOINTS.get(code, ())
                    for endpoint in endpoints:
                        endpoint_codes[endpoint].add(code)
                        endpoint_statements[endpoint].append(statement)

            for endpoint, codes in endpoint_codes.items():
                source_name = str(reference.get("SourceName") or f"PubChem reference {reference_number}")
                raw = {
                    "record_title": record.get("RecordTitle"),
                    "reference_number": reference_number,
                    "statements": list(dict.fromkeys(endpoint_statements[endpoint])),
                }
                fingerprint_payload = {
                    "cid": cid,
                    "endpoint": endpoint,
                    "reference_number": reference_number,
                    "hazard_codes": sorted(codes),
                    "statements": raw["statements"],
                }
                fingerprint = hashlib.sha256(
                    json.dumps(fingerprint_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
                ).hexdigest()
                grouped[(reference_number, endpoint)] = {
                    "pubchem_cid": cid,
                    "endpoint": endpoint,
                    "candidate_label": 1,
                "evidence_type": "regulatory_skin_dryness" if endpoint == "skin_dryness" else "ghs_classification",
                    "hazard_codes": sorted(codes),
                    "source_name": source_name,
                    "source_id": str(reference.get("SourceID")) if reference.get("SourceID") is not None else None,
                    "source_url": reference.get("URL"),
                    "source_quality": _source_quality(source_name),
                    "evidence_fingerprint": fingerprint,
                    "raw_evidence": raw,
                    "provenance": {
                        "provider": "PubChem PUG-View",
                        "provider_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}#section=GHS-Classification",
                        "retrieval_heading": "GHS Classification",
                        "mapping_version": 1,
                        "negative_inference_allowed": False,
                    },
                }
    return list(grouped.values())


def fetch_pubchem_ghs_evidence(cid: int) -> list[dict]:
    with httpx.Client(headers={"User-Agent": "RalphGuard/0.1 PubChem evidence importer"}) as client:
        payload = _throttled_get(
            client,
            f"{PUBCHEM_VIEW_BASE}/data/compound/{int(cid)}/JSON?heading=GHS%20Classification",
        )
    return parse_pubchem_ghs_evidence(payload)


def fetch_global_ghs_page(page: int) -> dict:
    url = (
        f"{PUBCHEM_VIEW_BASE}/annotations/heading/JSON"
        f"?heading=GHS%20Classification&heading_type=Compound&page={int(page)}"
    )
    with httpx.Client(headers={"User-Agent": "RalphGuard/0.1 PubChem global importer"}) as client:
        return _throttled_get(
            client,
            url,
            timeout=120.0,
            max_attempts=6,
            base_backoff=2.0,
        )


def fetch_global_hazard_class_page(page: int) -> dict:
    """Fetch structured regulatory hazard classes from PubChem PUG-View."""
    url = (
        f"{PUBCHEM_VIEW_BASE}/annotations/heading/JSON"
        f"?heading=Hazard%20Classes%20and%20Categories&heading_type=Compound&page={int(page)}"
    )
    with httpx.Client(headers={"User-Agent": "RalphGuard/0.1 PubChem global importer"}) as client:
        return _throttled_get(
            client,
            url,
            timeout=120.0,
            max_attempts=6,
            base_backoff=2.0,
        )


def parse_global_ghs_annotations(payload: dict) -> list[dict]:
    """Convert one global annotation page to source-attributed endpoint rows."""
    annotations = (payload.get("Annotations") or {}).get("Annotation", [])
    candidates: list[dict] = []
    for annotation in annotations:
        cids = [int(cid) for cid in (annotation.get("LinkedRecords") or {}).get("CID", [])]
        if not cids:
            continue
        endpoint_codes: dict[str, set[str]] = defaultdict(set)
        endpoint_statements: dict[str, list[str]] = defaultdict(list)
        for data in annotation.get("Data", []):
            if data.get("Name") != "GHS Hazard Statements":
                continue
            for value in (data.get("Value") or {}).get("StringWithMarkup", []):
                statement = str(value.get("String") or "").strip()
                raw_codes = HAZARD_CODE_RE.findall(statement) + SUPPLEMENTAL_HAZARD_CODE_RE.findall(statement)
                for raw_code in raw_codes:
                    code = re.sub(r"\s+", "", raw_code.upper())
                    endpoints = HAZARD_ENDPOINTS.get(code, ()) + SUPPLEMENTAL_HAZARD_ENDPOINTS.get(code, ())
                    for endpoint in endpoints:
                        endpoint_codes[endpoint].add(code)
                        endpoint_statements[endpoint].append(statement)
        source_name = str(annotation.get("SourceName") or "Unknown PubChem source")
        for cid in cids:
            for endpoint, codes in endpoint_codes.items():
                raw = {
                    "annotation_id": annotation.get("ANID"),
                    "annotation_name": annotation.get("Name"),
                    "statements": list(dict.fromkeys(endpoint_statements[endpoint])),
                }
                fingerprint_payload = {
                    "cid": cid,
                    "endpoint": endpoint,
                    "annotation_id": annotation.get("ANID"),
                    "source_id": annotation.get("SourceID"),
                    "hazard_codes": sorted(codes),
                }
                candidates.append(
                    {
                        "pubchem_cid": cid,
                        "endpoint": endpoint,
                        "candidate_label": 1,
                        "evidence_type": "regulatory_skin_dryness" if endpoint == "skin_dryness" else "ghs_classification",
                        "hazard_codes": sorted(codes),
                        "source_name": source_name,
                        "source_id": str(annotation.get("SourceID")) if annotation.get("SourceID") is not None else None,
                        "source_url": annotation.get("URL"),
                        "source_quality": _source_quality(source_name),
                        "evidence_fingerprint": hashlib.sha256(
                            json.dumps(fingerprint_payload, sort_keys=True).encode("utf-8")
                        ).hexdigest(),
                        "raw_evidence": raw,
                        "provenance": {
                            "provider": "PubChem PUG-View global annotations",
                            "retrieval_heading": "GHS Classification",
                            "mapping_version": 1,
                            "negative_inference_allowed": False,
                        },
                    }
                )
    return candidates


def parse_global_hazard_class_annotations(payload: dict) -> list[dict]:
    """Map explicit Skin Sens. 1/1A/1B categories to positive weak labels.

    PubChem exposes these structured regulatory classifications separately
    from GHS hazard-statement text.  Only an explicit positive category is
    mapped; missing categories and ``Not Classified`` never create negatives.
    """
    annotations = (payload.get("Annotations") or {}).get("Annotation", [])
    candidates: list[dict] = []
    for annotation in annotations:
        cids = [int(cid) for cid in (annotation.get("LinkedRecords") or {}).get("CID", [])]
        if not cids:
            continue
        categories: set[str] = set()
        raw_values: list[str] = []
        for data in annotation.get("Data", []):
            for value in (data.get("Value") or {}).get("StringWithMarkup", []):
                classification = str(value.get("String") or "").strip()
                if not classification:
                    continue
                match = SKIN_SENSITIZATION_CATEGORY_RE.search(classification)
                if match is None:
                    continue
                category = match.group(1).upper()
                categories.add(f"SKIN_SENS_{category}")
                raw_values.append(classification)
        if not categories:
            continue
        source_name = str(annotation.get("SourceName") or "Unknown PubChem source")
        raw = {
            "annotation_id": annotation.get("ANID"),
            "annotation_name": annotation.get("Name"),
            "classifications": list(dict.fromkeys(raw_values)),
        }
        for cid in cids:
            fingerprint_payload = {
                "cid": cid,
                "endpoint": "sens",
                "annotation_id": annotation.get("ANID"),
                "source_id": annotation.get("SourceID"),
                "categories": sorted(categories),
                "evidence_type": "ghs_hazard_classification",
            }
            fingerprint = hashlib.sha256(
                json.dumps(fingerprint_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest()
            candidates.append(
                {
                    "pubchem_cid": cid,
                    "endpoint": "sens",
                    "candidate_label": 1,
                    "evidence_type": "ghs_hazard_classification",
                    "hazard_codes": sorted(categories),
                    "source_name": source_name,
                    "source_id": (
                        str(annotation.get("SourceID"))
                        if annotation.get("SourceID") is not None
                        else None
                    ),
                    "source_url": annotation.get("URL"),
                    "source_quality": _source_quality(source_name),
                    "evidence_fingerprint": fingerprint,
                    "raw_evidence": raw,
                    "provenance": {
                        "provider": "PubChem PUG-View",
                        "retrieval_heading": "Hazard Classes and Categories",
                        "mapping_version": 1,
                        "explicit_positive_category_required": True,
                        "negative_inference_allowed": False,
                    },
                }
            )
    return candidates


def fetch_pubchem_properties_by_cids(cids: list[int]) -> list[dict]:
    """Resolve structures in conservative batches through PUG REST."""
    properties = f"{PUBCHEM_PROPERTIES},HeavyAtomCount"
    rows: list[dict] = []
    with httpx.Client(headers={"User-Agent": "RalphGuard/0.1 PubChem global importer"}) as client:
        for offset in range(0, len(cids), 50):
            batch = ",".join(str(cid) for cid in cids[offset : offset + 50])
            payload = _throttled_get(
                client,
                f"{PUBCHEM_BASE}/compound/cid/{batch}/property/{properties}/JSON",
                timeout=60.0,
            )
            rows.extend((payload.get("PropertyTable") or {}).get("Properties", []))
    return rows


def screen_pubchem_property(properties: dict) -> tuple[dict | None, str | None]:
    """Apply the current QSAR domain envelope before a compound reaches training."""
    title = str(properties.get("Title") or properties.get("IUPACName") or "").strip()
    classification = classify_substance(title, properties)
    if classification["substance_type"] != "defined_single_substance":
        return None, classification["substance_type"]
    if classification["structure_status"] != "resolved":
        return None, classification["structure_status"]
    smiles = str(properties.get("SMILES") or "").strip()
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, "invalid_smiles"
    canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
    if "." in canonical_smiles:
        return None, "multi_component"
    atomic_numbers = {atom.GetAtomicNum() for atom in mol.GetAtoms()}
    if not atomic_numbers.issubset(QSAR_ALLOWED_ATOMIC_NUMBERS):
        return None, "unsupported_element"
    mw = float(Descriptors.MolWt(mol))
    heavy_atoms = int(mol.GetNumHeavyAtoms())
    if not QSAR_MIN_MW <= mw <= QSAR_MAX_MW:
        return None, "molecular_weight_outside_domain"
    if not QSAR_MIN_HEAVY_ATOMS <= heavy_atoms <= QSAR_MAX_HEAVY_ATOMS:
        return None, "heavy_atom_count_outside_domain"
    try:
        inchi = Chem.MolToInchi(mol)
        inchikey = Chem.InchiToInchiKey(inchi)
    except Exception:
        return None, "inchi_generation_failed"
    return {
        "pubchem_cid": int(properties["CID"]),
        "canonical_name": title or f"PubChem CID {properties['CID']}",
        "canonical_smiles": canonical_smiles,
        "inchi": inchi,
        "inchikey": inchikey,
        "molecular_formula": properties.get("MolecularFormula"),
        "molecular_weight": mw,
        "heavy_atom_count": heavy_atoms,
        "substance_type": "defined_single_substance",
        "structure_status": "resolved",
    }, None


def upsert_global_compound_evidence(
    db: Session,
    profile: dict,
    evidence_candidates: list[dict],
) -> tuple[IngredientRegistry, int, int]:
    """Persist one directly CID-resolved identity plus its pending evidence."""
    row = db.scalar(
        select(IngredientRegistry).where(IngredientRegistry.inchikey == profile["inchikey"])
    )
    if row is None:
        row = db.scalar(
            select(IngredientRegistry).where(
                IngredientRegistry.pubchem_cid == profile["pubchem_cid"]
            )
        )
    if row is None:
        normalized = normalize_ingredient_name(profile["canonical_name"])
        name_collision = db.scalar(
            select(IngredientRegistry).where(IngredientRegistry.normalized_name == normalized)
        )
        if name_collision is not None:
            normalized = normalize_ingredient_name(
                f"{profile['canonical_name']} [CID {profile['pubchem_cid']}]"
            )
        row = IngredientRegistry(
            normalized_name=normalized,
            inci_name=None,
            canonical_name=profile["canonical_name"],
            pubchem_cid=profile["pubchem_cid"],
            canonical_smiles=profile["canonical_smiles"],
            inchi=profile["inchi"],
            inchikey=profile["inchikey"],
            molecular_formula=profile.get("molecular_formula"),
            molecular_weight=profile.get("molecular_weight"),
            substance_type="defined_single_substance",
            structure_status="resolved",
            qsar_eligible=True,
            assessment_method="qsar",
            verification_status="verified",
            provenance={
                "identity_verification": {
                    "method": "pubchem_cid_direct_structure",
                    "source": "PubChem PUG REST",
                    "cid": profile["pubchem_cid"],
                    "screening_envelope": {
                        "mw": [QSAR_MIN_MW, QSAR_MAX_MW],
                        "heavy_atoms": [QSAR_MIN_HEAVY_ATOMS, QSAR_MAX_HEAVY_ATOMS],
                    },
                }
            },
        )
        db.add(row)
        db.flush()

    imported = 0
    existing = 0
    for candidate in evidence_candidates:
        evidence = db.scalar(
            select(ExperimentalEvidence).where(
                ExperimentalEvidence.ingredient_id == row.id,
                ExperimentalEvidence.endpoint == candidate["endpoint"],
                ExperimentalEvidence.evidence_fingerprint == candidate["evidence_fingerprint"],
            )
        )
        if evidence is None:
            db.add(ExperimentalEvidence(ingredient_id=row.id, **candidate))
            imported += 1
        else:
            existing += 1
    db.flush()
    return row, imported, existing


def import_pubchem_ghs_evidence(
    db: Session,
    ingredient: IngredientRegistry,
    *,
    refresh: bool = False,
) -> tuple[list[ExperimentalEvidence], int, int]:
    """Fetch and upsert candidates; return rows, imported count, existing count."""
    if ingredient.pubchem_cid is None:
        raise ValueError("ingredient has no PubChem CID")
    if not refresh:
        existing = list(
            db.execute(
                select(ExperimentalEvidence).where(
                    ExperimentalEvidence.ingredient_id == ingredient.id,
                    ExperimentalEvidence.evidence_type == "ghs_classification",
                )
            ).scalars()
        )
        if existing:
            return existing, 0, len(existing)

    candidates = fetch_pubchem_ghs_evidence(ingredient.pubchem_cid)
    rows: list[ExperimentalEvidence] = []
    imported = 0
    existing_count = 0
    for candidate in candidates:
        row = db.scalar(
            select(ExperimentalEvidence).where(
                ExperimentalEvidence.ingredient_id == ingredient.id,
                ExperimentalEvidence.endpoint == candidate["endpoint"],
                ExperimentalEvidence.evidence_fingerprint == candidate["evidence_fingerprint"],
            )
        )
        if row is None:
            row = ExperimentalEvidence(ingredient_id=ingredient.id, **candidate)
            db.add(row)
            imported += 1
        else:
            # Preserve the review decision while refreshing upstream metadata.
            for key, value in candidate.items():
                setattr(row, key, value)
            existing_count += 1
        rows.append(row)
    db.flush()
    return rows, imported, existing_count


def evidence_row_to_dict(row: ExperimentalEvidence) -> dict:
    return {
        "id": row.id,
        "ingredient_id": row.ingredient_id,
        "pubchem_cid": row.pubchem_cid,
        "endpoint": row.endpoint,
        "candidate_label": row.candidate_label,
        "evidence_type": row.evidence_type,
        "hazard_codes": row.hazard_codes or [],
        "source_name": row.source_name,
        "source_id": row.source_id,
        "source_url": row.source_url,
        "source_quality": row.source_quality,
        "raw_evidence": row.raw_evidence or {},
        "provenance": row.provenance or {},
        "review_status": row.review_status,
        "reviewer_note": row.reviewer_note,
        "imported_at": row.imported_at,
        "reviewed_at": row.reviewed_at,
        "updated_at": row.updated_at,
    }


def verified_training_rows(db: Session, endpoint: str) -> tuple[list[dict], dict[str, int]]:
    """Build a deduplicated, provenance-rich export for one endpoint."""
    if endpoint not in ENDPOINTS:
        raise ValueError(f"unknown endpoint: {endpoint}")
    evidence = list(
        db.execute(
            select(ExperimentalEvidence, IngredientRegistry)
            .join(IngredientRegistry, ExperimentalEvidence.ingredient_id == IngredientRegistry.id)
            .where(
                ExperimentalEvidence.endpoint == endpoint,
                ExperimentalEvidence.review_status.in_(
                    ("verified", "consensus_verified", "single_regulatory_weak_label")
                ),
            )
        ).all()
    )
    grouped: dict[str, list[tuple[ExperimentalEvidence, IngredientRegistry]]] = defaultdict(list)
    skipped_ineligible = 0
    for ev, ingredient in evidence:
        if (
            ingredient.verification_status != "verified"
            or not ingredient.qsar_eligible
            or ingredient.substance_type != "defined_single_substance"
            or ingredient.structure_status != "resolved"
            or not ingredient.canonical_smiles
            or "." in ingredient.canonical_smiles
        ):
            skipped_ineligible += 1
            continue
        grouped[ingredient.canonical_smiles].append((ev, ingredient))

    rows: list[dict] = []
    skipped_conflicts = 0
    for smiles, group in grouped.items():
        labels = {ev.candidate_label for ev, _ in group}
        if len(labels) != 1:
            skipped_conflicts += 1
            continue
        ingredient = group[0][1]
        has_manual_review = any(ev.review_status == "verified" for ev, _ in group)
        has_consensus = any(ev.review_status == "consensus_verified" for ev, _ in group)
        if has_manual_review:
            source = "PubChem PUG-View regulatory classification (reviewed)"
            label_quality = "reviewed"
            sample_weight = 1.0
        elif has_consensus:
            source = "PubChem PUG-View regulatory classification consensus (weak label)"
            label_quality = "regulatory_consensus_weak_label"
            sample_weight = 0.5
        else:
            source = "PubChem PUG-View single regulatory classification (weak label)"
            label_quality = "single_regulatory_source_weak_label"
            sample_weight = 0.25
        rows.append(
            {
                "smiles": smiles,
                "name": ingredient.canonical_name,
                "label": labels.pop(),
                "source": source,
                "pubchem_cid": ingredient.pubchem_cid,
                "evidence_ids": [ev.id for ev, _ in group],
                "hazard_codes": sorted({code for ev, _ in group for code in (ev.hazard_codes or [])}),
                "source_count": len({ev.source_name for ev, _ in group}),
                "source_quality": dict(Counter(ev.source_quality for ev, _ in group)),
                "review_statuses": sorted({ev.review_status for ev, _ in group}),
                "label_quality": label_quality,
                "sample_weight": sample_weight,
            }
        )
    rows.sort(key=lambda item: (item["name"].casefold(), item["smiles"]))
    return rows, {
        "verified_rows": len(evidence),
        "unique_structures": len(rows),
        "skipped_conflicts": skipped_conflicts,
        "skipped_ineligible": skipped_ineligible,
    }


def promote_consensus_evidence(db: Session, *, min_sources: int = 2) -> dict[str, int]:
    """Promote multi-source agreement to a clearly marked weak-label status."""
    pending = list(
        db.execute(
            select(ExperimentalEvidence, IngredientRegistry)
            .join(IngredientRegistry, ExperimentalEvidence.ingredient_id == IngredientRegistry.id)
            .where(
                ExperimentalEvidence.review_status == "pending",
                ExperimentalEvidence.source_quality.in_(("regulatory", "expert_curated")),
                IngredientRegistry.verification_status == "verified",
                IngredientRegistry.qsar_eligible.is_(True),
            )
        ).all()
    )
    grouped: dict[tuple[int, str, int], list[ExperimentalEvidence]] = defaultdict(list)
    for evidence, _ingredient in pending:
        grouped[(evidence.ingredient_id, evidence.endpoint, evidence.candidate_label)].append(evidence)

    promoted_rows = 0
    promoted_labels = 0
    by_endpoint: Counter[str] = Counter()
    now = datetime.now(timezone.utc)
    for (_ingredient_id, endpoint, _label), rows in grouped.items():
        independent_sources = {row.source_name.casefold() for row in rows}
        if len(independent_sources) < min_sources:
            continue
        promoted_labels += 1
        by_endpoint[endpoint] += 1
        for row in rows:
            row.review_status = "consensus_verified"
            row.reviewer_note = (
                f"Automated weak label: {len(independent_sources)} independent PubChem regulatory sources "
                f"agree; not treated as a direct experimental result"
            )
            row.reviewed_at = now
            provenance = dict(row.provenance or {})
            provenance["review"] = {
                "method": "pubchem_regulatory_classification_consensus_v2",
                "minimum_sources": min_sources,
                "independent_source_count": len(independent_sources),
                "label_quality": "regulatory_consensus_weak_label",
                "reviewed_at": now.isoformat(),
            }
            row.provenance = provenance
            promoted_rows += 1
    db.flush()
    return {
        "promoted_evidence_rows": promoted_rows,
        "promoted_unique_labels": promoted_labels,
        **{f"{endpoint}_labels": by_endpoint[endpoint] for endpoint in sorted(ENDPOINTS)},
    }


def promote_single_regulatory_evidence(db: Session) -> dict[str, int]:
    """Promote one-source positive regulatory classifications as weak labels.

    This deliberately excludes generic third-party annotations and never
    creates a negative label from missing hazard statements. Multi-source rows
    should be promoted by :func:`promote_consensus_evidence` first and retain
    their higher consensus weight.
    """
    pending = list(
        db.execute(
            select(ExperimentalEvidence, IngredientRegistry)
            .join(IngredientRegistry, ExperimentalEvidence.ingredient_id == IngredientRegistry.id)
            .where(
                ExperimentalEvidence.review_status == "pending",
                ExperimentalEvidence.source_quality == "regulatory",
                IngredientRegistry.verification_status == "verified",
                IngredientRegistry.qsar_eligible.is_(True),
            )
        ).all()
    )
    grouped: dict[tuple[int, str], list[ExperimentalEvidence]] = defaultdict(list)
    for evidence, _ingredient in pending:
        grouped[(evidence.ingredient_id, evidence.endpoint)].append(evidence)

    promoted_rows = 0
    promoted_labels = 0
    skipped_conflicts = 0
    by_endpoint: Counter[str] = Counter()
    now = datetime.now(timezone.utc)
    for (_ingredient_id, endpoint), rows in grouped.items():
        labels = {row.candidate_label for row in rows}
        if labels != {1}:
            skipped_conflicts += 1
            continue
        promoted_labels += 1
        by_endpoint[endpoint] += 1
        for row in rows:
            row.review_status = "single_regulatory_weak_label"
            row.reviewer_note = (
                "Automated low-weight weak label from one attributed regulatory "
                "PubChem classification source; not a direct experimental result"
            )
            row.reviewed_at = now
            provenance = dict(row.provenance or {})
            provenance["review"] = {
                "method": "pubchem_regulatory_classification_single_source_v2",
                "source_quality_required": "regulatory",
                "positive_hazard_code_required": True,
                "negative_inference_allowed": False,
                "label_quality": "single_regulatory_source_weak_label",
                "sample_weight": 0.25,
                "reviewed_at": now.isoformat(),
            }
            row.provenance = provenance
            promoted_rows += 1
    db.flush()
    return {
        "promoted_evidence_rows": promoted_rows,
        "promoted_unique_labels": promoted_labels,
        "skipped_conflicting_labels": skipped_conflicts,
        **{f"{endpoint}_labels": by_endpoint[endpoint] for endpoint in sorted(ENDPOINTS)},
    }
