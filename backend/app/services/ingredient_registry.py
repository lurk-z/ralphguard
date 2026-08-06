"""Verified ingredient memory with conservative PubChem enrichment."""
from __future__ import annotations

import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Iterable
from urllib.parse import quote

import httpx
from rdkit import Chem
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ingredient_registry import IngredientRegistry, PubChemCache


PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
PUBCHEM_PROPERTIES = (
    "Title,IUPACName,MolecularFormula,MolecularWeight,SMILES,InChI,InChIKey,"
    "Charge,Complexity,CovalentUnitCount"
)
PUBCHEM_MAX_REQUESTS_PER_SECOND = 4.0  # below PubChem's published maximum of five
PUBCHEM_POSITIVE_TTL = timedelta(days=90)
PUBCHEM_NOT_FOUND_TTL = timedelta(days=14)
PUBCHEM_ERROR_TTL = timedelta(minutes=30)
MAX_PUBCHEM_LOOKUPS_PER_SCAN = 6

_request_lock = threading.Lock()
_last_request_at = 0.0


KNOWN_NON_QSAR: dict[str, dict] = {
    "aqua": {
        "canonical_name": "Water",
        "synonyms": ["Aqua", "Water", "Eau"],
        "pubchem_cid": 962,
        "canonical_smiles": "O",
        "inchi": "InChI=1S/H2O/h1H2",
        "inchikey": "XLYOFNOQVPJJNP-UHFFFAOYSA-N",
        "molecular_formula": "H2O",
        "molecular_weight": 18.015,
        "substance_type": "defined_single_substance",
        "structure_status": "resolved",
        "assessment_method": "known_carrier_baseline",
        "reason_code": "formula_carrier",
        "reason_th": "น้ำเป็นตัวพาสูตรที่รู้จักโครงสร้างแล้ว แต่ไม่นำไป extrapolate ด้วย QSAR ชุดนี้",
    },
    "sodium hydroxide": {
        "canonical_name": "Sodium Hydroxide",
        "synonyms": ["Sodium Hydroxide", "Caustic Soda", "Lye"],
        "cas_number": "1310-73-2",
        "pubchem_cid": 14798,
        "canonical_smiles": "[OH-].[Na+]",
        "inchi": "InChI=1S/Na.H2O/h;1H2/q+1;/p-1",
        "inchikey": "HEMHJVSKTPXQMS-UHFFFAOYSA-M",
        "molecular_formula": "NaOH",
        "molecular_weight": 39.997,
        "substance_type": "inorganic",
        "structure_status": "resolved",
        "assessment_method": "knowledge_base",
        "reason_code": "inorganic_outside_domain",
        "reason_th": "เป็นสารอนินทรีย์แบบไอออนิก จึงอยู่นอก applicability domain ของ QSAR ชุดโมเลกุลอินทรีย์",
    },
    "caprylyl/capryl glucoside": {
        "canonical_name": "Caprylyl/Capryl Glucoside",
        "synonyms": ["Caprylyl/Capryl Glucoside"],
        "substance_type": "UVCB",
        "structure_status": "variable_composition",
        "assessment_method": "knowledge_base",
        "reason_code": "variable_chain_mixture",
        "reason_th": "เป็นส่วนผสมของ alkyl glucosides หลายความยาวสาย จึงไม่มี SMILES เดี่ยวที่แทนองค์ประกอบทั้งหมด",
    },
    "polyquaternium-67": {
        "canonical_name": "Polyquaternium-67",
        "synonyms": ["Polyquaternium-67"],
        "substance_type": "polymer",
        "structure_status": "polymeric",
        "assessment_method": "knowledge_base",
        "reason_code": "polymer",
        "reason_th": "เป็นพอลิเมอร์ที่ไม่มีโมเลกุลเดี่ยวและน้ำหนักโมเลกุลตายตัวสำหรับ QSAR ชุดนี้",
    },
    "trisodium ethylenediaminedisuccinate": {
        "canonical_name": "Trisodium Ethylenediamine Disuccinate",
        "synonyms": ["Trisodium Ethylenediaminedisuccinate", "Trisodium EDDS"],
        "substance_type": "salt",
        "structure_status": "multi_component",
        "assessment_method": "knowledge_base",
        "reason_code": "salt_outside_domain",
        "reason_th": "เป็นเกลือหลายองค์ประกอบ จึงต้องใช้การประเมินเกลือหรือ knowledge base แทนโมเดลโมเลกุลเดี่ยว",
    },
    "sodium hyaluronate": {
        "canonical_name": "Sodium Hyaluronate",
        "synonyms": ["Sodium Hyaluronate", "Hyaluronic Acid Sodium Salt"],
        "substance_type": "polymer",
        "structure_status": "polymeric",
        "assessment_method": "knowledge_base",
        "reason_code": "polymer_salt",
        "reason_th": "เป็นเกลือพอลิเมอร์ที่มีการกระจายน้ำหนักโมเลกุล จึงไม่มีโครงสร้างเดี่ยวสำหรับ QSAR",
    },
    "parfum": {
        "canonical_name": "Parfum",
        "synonyms": ["Parfum", "Fragrance"],
        "substance_type": "fragrance",
        "structure_status": "unknown_composition",
        "assessment_method": "knowledge_base",
        "reason_code": "unknown_mixture",
        "reason_th": "เป็นสารผสมน้ำหอมที่ไม่ทราบองค์ประกอบรายโมเลกุลครบถ้วน จึงห้ามสร้าง SMILES ตัวแทน",
    },
}


def normalize_ingredient_name(name: str) -> str:
    normalized = re.sub(r"\s*/\s*", "/", str(name).strip().lower())
    normalized = re.sub(r"\s+", " ", normalized)
    aliases = {
        "water": "aqua",
        "eau": "aqua",
        "aqua/water": "aqua",
        "water/aqua": "aqua",
        "fragrance": "parfum",
        "parfum/fragrance": "parfum",
        "fragrance/parfum": "parfum",
    }
    return aliases.get(normalized, normalized)[:300]


def _valid_cas(value: str) -> bool:
    """Validate a CAS Registry Number checksum before storing it."""
    match = re.fullmatch(r"(\d{2,7})-(\d{2})-(\d)", value)
    if not match:
        return False
    digits = "".join(match.groups()[:2])
    checksum = sum(int(digit) * weight for weight, digit in enumerate(reversed(digits), 1)) % 10
    return checksum == int(match.group(3))


def _canonicalize_smiles(smiles: str | None) -> tuple[str | None, str | None]:
    if not smiles:
        return None, None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None, "RDKit could not parse PubChem SMILES"
    return Chem.MolToSmiles(mol, canonical=True), None


def classify_substance(name: str, properties: dict) -> dict:
    """Classify identity separately from whether the current QSAR can use it."""
    normalized = normalize_ingredient_name(name)
    known = KNOWN_NON_QSAR.get(normalized)
    if known:
        return {
            "substance_type": known["substance_type"],
            "structure_status": known["structure_status"],
            "proposed_qsar_eligible": False,
            "assessment_method": known["assessment_method"],
            "reason_code": known["reason_code"],
            "reason_th": known["reason_th"],
        }

    lower = normalized.lower()
    if re.search(r"\b(parfum|fragrance|aroma)\b", lower):
        return {
            "substance_type": "fragrance",
            "structure_status": "unknown_composition",
            "proposed_qsar_eligible": False,
            "assessment_method": "knowledge_base",
            "reason_code": "unknown_mixture",
            "reason_th": "เป็นน้ำหอมหรือสารผสมที่องค์ประกอบไม่ตายตัว",
        }
    if re.search(r"\b(polyquaternium|polymer|copolymer|crosspolymer|hyaluronate)\b", lower):
        return {
            "substance_type": "polymer",
            "structure_status": "polymeric",
            "proposed_qsar_eligible": False,
            "assessment_method": "knowledge_base",
            "reason_code": "polymer",
            "reason_th": "เป็นพอลิเมอร์ที่ไม่มีโครงสร้างโมเลกุลเดี่ยวตายตัว",
        }
    if re.search(r"\b(extract|leaf juice|essential oil)\b", lower):
        return {
            "substance_type": "botanical_extract",
            "structure_status": "variable_composition",
            "proposed_qsar_eligible": False,
            "assessment_method": "knowledge_base",
            "reason_code": "botanical_mixture",
            "reason_th": "เป็นสารสกัดที่มีองค์ประกอบแปรผัน จึงห้ามใช้โมเลกุลตัวแทนเพียงตัวเดียว",
        }

    smiles = str(properties.get("SMILES") or "")
    formula = str(properties.get("MolecularFormula") or "")
    covalent_units = int(properties.get("CovalentUnitCount") or 1)
    if covalent_units > 1 or "." in smiles:
        return {
            "substance_type": "salt",
            "structure_status": "multi_component",
            "proposed_qsar_eligible": False,
            "assessment_method": "knowledge_base",
            "reason_code": "multi_component",
            "reason_th": "PubChem ระบุโครงสร้างมากกว่าหนึ่งองค์ประกอบ จึงไม่ส่งเข้าโมเดลโมเลกุลเดี่ยว",
        }
    if formula and "C" not in formula and smiles not in {"O", "[OH2]"}:
        return {
            "substance_type": "inorganic",
            "structure_status": "resolved",
            "proposed_qsar_eligible": False,
            "assessment_method": "knowledge_base",
            "reason_code": "inorganic_outside_domain",
            "reason_th": "เป็นสารอนินทรีย์ที่อยู่นอก applicability domain ของ QSAR ชุดนี้",
        }
    return {
        "substance_type": "defined_single_substance",
        "structure_status": "resolved",
        "proposed_qsar_eligible": True,
        "assessment_method": "pending_verification",
        "reason_code": "awaiting_verification",
        "reason_th": "พบโครงสร้างโมเลกุลเดี่ยวจาก PubChem แต่ต้องยืนยันตัวตนก่อนส่งเข้า QSAR",
    }


def parse_pubchem_responses(query_name: str, property_payload: dict, synonym_payload: dict) -> dict:
    properties = property_payload.get("PropertyTable", {}).get("Properties", [])
    if not properties:
        raise ValueError("PubChem returned no compound properties")
    prop = dict(properties[0])
    synonyms = (
        synonym_payload.get("InformationList", {}).get("Information", [{}])[0].get("Synonym", [])
    )
    synonyms = [str(value).strip() for value in synonyms if str(value).strip()][:200]
    canonical_smiles, smiles_error = _canonicalize_smiles(prop.get("SMILES"))
    cas_number = next((value for value in synonyms if _valid_cas(value)), None)
    classification = classify_substance(query_name, prop)
    return {
        "query_name": query_name,
        "pubchem_cid": int(prop["CID"]),
        "canonical_name": str(prop.get("Title") or prop.get("IUPACName") or query_name),
        "iupac_name": prop.get("IUPACName"),
        "canonical_smiles": canonical_smiles,
        "inchi": prop.get("InChI"),
        "inchikey": prop.get("InChIKey"),
        "molecular_formula": prop.get("MolecularFormula"),
        "molecular_weight": float(prop["MolecularWeight"]) if prop.get("MolecularWeight") else None,
        "charge": prop.get("Charge"),
        "complexity": prop.get("Complexity"),
        "covalent_unit_count": prop.get("CovalentUnitCount"),
        "synonyms": synonyms,
        "cas_number": cas_number,
        "smiles_error": smiles_error,
        **classification,
        "source": "PubChem PUG REST",
        "source_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{prop['CID']}",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def _throttled_get(client: httpx.Client, url: str, *, timeout: float = 8.0) -> dict:
    global _last_request_at
    for attempt in range(3):
        with _request_lock:
            interval = 1.0 / PUBCHEM_MAX_REQUESTS_PER_SECOND
            wait = interval - (time.monotonic() - _last_request_at)
            if wait > 0:
                time.sleep(wait)
            response = client.get(url, timeout=timeout)
            _last_request_at = time.monotonic()
        if response.status_code == 200:
            return response.json()
        if response.status_code == 404:
            raise LookupError("not found in PubChem")
        if response.status_code not in {429, 503, 504} or attempt == 2:
            response.raise_for_status()
        retry_after = response.headers.get("Retry-After")
        time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else 0.5 * (2**attempt))
    raise RuntimeError("PubChem retry loop exhausted")


def fetch_pubchem_record(name: str) -> dict:
    encoded = quote(name.strip(), safe="")
    with httpx.Client(headers={"User-Agent": "RalphGuard/0.1 PubChem resolver"}) as client:
        properties = _throttled_get(
            client,
            f"{PUBCHEM_BASE}/compound/name/{encoded}/property/{PUBCHEM_PROPERTIES}/JSON",
        )
        cid_rows = properties.get("PropertyTable", {}).get("Properties", [])
        if not cid_rows:
            raise LookupError("not found in PubChem")
        cid = int(cid_rows[0]["CID"])
        synonyms = _throttled_get(client, f"{PUBCHEM_BASE}/compound/cid/{cid}/synonyms/JSON")
    return parse_pubchem_responses(name, properties, synonyms)


def get_cached_or_fetch_pubchem(db: Session, name: str) -> tuple[str, dict | None, str | None]:
    key = normalize_ingredient_name(name)
    now = datetime.now(timezone.utc)
    cached = db.get(PubChemCache, key)
    if cached and cached.expires_at > now:
        return cached.status, cached.payload, cached.error

    try:
        payload = fetch_pubchem_record(name)
        status, error, ttl = "resolved", None, PUBCHEM_POSITIVE_TTL
    except LookupError as exc:
        payload, status, error, ttl = None, "not_found", str(exc), PUBCHEM_NOT_FOUND_TTL
    except Exception as exc:  # transient failures are cached briefly, never hidden forever
        payload, status, error, ttl = None, "error", str(exc)[:1000], PUBCHEM_ERROR_TTL

    if cached is None:
        cached = PubChemCache(query_key=key, query_name=name, status=status, expires_at=now + ttl)
        db.add(cached)
    cached.query_name = name
    cached.status = status
    cached.payload = payload
    cached.error = error
    cached.fetched_at = now
    cached.expires_at = now + ttl
    db.flush()
    return status, payload, error


def get_cached_pubchem_description(
    db: Session, pubchem_cid: int
) -> tuple[str, dict | None, str | None]:
    """Fetch a sourced compound description without changing ingredient identity.

    Descriptions are display-only metadata. They are cached separately from name
    resolution and never alter QSAR eligibility or toxicity labels.
    """
    key = f"description:cid:{int(pubchem_cid)}"
    now = datetime.now(timezone.utc)
    cached = db.get(PubChemCache, key)
    if cached and cached.expires_at > now:
        return cached.status, cached.payload, cached.error

    try:
        with httpx.Client(headers={"User-Agent": "RalphGuard/0.1 PubChem profile"}) as client:
            raw = _throttled_get(
                client,
                f"{PUBCHEM_BASE}/compound/cid/{int(pubchem_cid)}/description/JSON",
                timeout=4.0,
            )
        information = raw.get("InformationList", {}).get("Information", [])
        described = next(
            (row for row in information if str(row.get("Description") or "").strip()),
            None,
        )
        if described is None:
            raise LookupError("PubChem returned no sourced description")
        payload = {
            "description": str(described["Description"]).strip()[:1600],
            "source": str(described.get("DescriptionSourceName") or "PubChem"),
            "source_url": str(
                described.get("DescriptionURL")
                or f"https://pubchem.ncbi.nlm.nih.gov/compound/{int(pubchem_cid)}"
            ),
        }
        status, error, ttl = "resolved", None, PUBCHEM_POSITIVE_TTL
    except LookupError as exc:
        payload, status, error, ttl = None, "not_found", str(exc), PUBCHEM_NOT_FOUND_TTL
    except Exception as exc:
        payload, status, error, ttl = None, "error", str(exc)[:1000], PUBCHEM_ERROR_TTL

    if cached is None:
        cached = PubChemCache(
            query_key=key,
            query_name=f"PubChem CID {int(pubchem_cid)} description",
            status=status,
            expires_at=now + ttl,
        )
        db.add(cached)
    cached.status = status
    cached.payload = payload
    cached.error = error
    cached.fetched_at = now
    cached.expires_at = now + ttl
    db.flush()
    return status, payload, error


def non_qsar_profile(name: str) -> dict:
    key = normalize_ingredient_name(name)
    profile = dict(KNOWN_NON_QSAR.get(key) or {})
    if not profile:
        profile = {
            "canonical_name": name.title(),
            "synonyms": [name],
            "substance_type": "unknown_composition",
            "structure_status": "unresolved",
            "assessment_method": "knowledge_base",
            "reason_code": "not_single_molecule",
            "reason_th": "รู้จักชื่อส่วนผสม แต่ยังไม่มีโครงสร้างโมเลกุลเดี่ยวที่ผ่านการยืนยันสำหรับ QSAR",
        }
    return {
        "name": key,
        "recognized": True,
        "resolved": profile.get("structure_status") == "resolved",
        "structure_available": bool(profile.get("canonical_smiles")),
        "canonical_smiles": profile.get("canonical_smiles"),
        "pubchem_cid": profile.get("pubchem_cid"),
        "substance_type": profile["substance_type"],
        "structure_status": profile["structure_status"],
        "qsar_eligible": False,
        "assessment_method": profile["assessment_method"],
        "reason_code": profile["reason_code"],
        "reason_th": profile["reason_th"],
        "verification_status": "verified",
    }


def _upsert_observation(
    db: Session,
    name: str,
    *,
    source: str,
    ocr_confidence: float | None,
) -> IngredientRegistry:
    key = normalize_ingredient_name(name)
    row = db.scalar(select(IngredientRegistry).where(IngredientRegistry.normalized_name == key))
    now = datetime.now(timezone.utc)
    if row is None:
        row = IngredientRegistry(
            normalized_name=key,
            inci_name=name.strip(),
            canonical_name=name.strip().title(),
            provenance={"first_source": source, "observations": []},
        )
        db.add(row)
    else:
        row.observation_count += 1
    row.last_seen_at = now
    provenance = dict(row.provenance or {})
    observations = list(provenance.get("observations") or [])[-19:]
    observations.append(
        {
            "source": source,
            "observed_name": name,
            "ocr_confidence": ocr_confidence,
            "seen_at": now.isoformat(),
        }
    )
    provenance["observations"] = observations
    row.provenance = provenance
    db.flush()
    return row


def remember_verified_ingredient(
    db: Session,
    name: str,
    smiles: str | None,
    *,
    source: str,
    ocr_confidence: float | None,
    qsar_eligible: bool,
) -> IngredientRegistry:
    row = _upsert_observation(db, name, source=source, ocr_confidence=ocr_confidence)
    profile = KNOWN_NON_QSAR.get(normalize_ingredient_name(name))
    if profile:
        row.canonical_name = profile["canonical_name"]
        row.synonyms = profile.get("synonyms", [])
        row.cas_number = profile.get("cas_number")
        row.pubchem_cid = profile.get("pubchem_cid")
        row.canonical_smiles = profile.get("canonical_smiles")
        row.inchi = profile.get("inchi")
        row.inchikey = profile.get("inchikey")
        row.molecular_formula = profile.get("molecular_formula")
        row.molecular_weight = profile.get("molecular_weight")
        row.substance_type = profile["substance_type"]
        row.structure_status = profile["structure_status"]
        row.assessment_method = profile["assessment_method"]
        row.qsar_eligible = False
    else:
        canonical, error = _canonicalize_smiles(smiles)
        row.canonical_name = name.title()
        row.canonical_smiles = canonical
        row.structure_status = "resolved" if canonical else "unresolved"
        row.substance_type = "defined_single_substance" if canonical else "unknown_composition"
        row.qsar_eligible = bool(qsar_eligible and canonical)
        row.assessment_method = "qsar" if row.qsar_eligible else "knowledge_base"
        row.last_error = error
        if canonical:
            mol = Chem.MolFromSmiles(canonical)
            if mol is not None:
                try:
                    row.inchi = Chem.MolToInchi(mol)
                    row.inchikey = Chem.InchiToInchiKey(row.inchi)
                except Exception:
                    pass
    row.verification_status = "verified"
    row.registry_version = max(1, row.registry_version or 1)
    return row


def remember_pubchem_candidate(
    db: Session,
    name: str,
    payload: dict,
    *,
    source: str,
    ocr_confidence: float | None,
) -> IngredientRegistry:
    row = _upsert_observation(db, name, source=source, ocr_confidence=ocr_confidence)
    if row.verification_status == "verified":
        # A curator-approved identity remains authoritative, but PubChem may
        # safely fill metadata that is still missing.  It must never silently
        # change the verified QSAR decision or canonical identity.
        existing_structure, _ = _canonicalize_smiles(row.canonical_smiles)
        proposed_structure, _ = _canonicalize_smiles(payload.get("canonical_smiles"))
        if existing_structure and proposed_structure and existing_structure != proposed_structure:
            provenance = dict(row.provenance or {})
            provenance["pubchem_identity_conflict"] = {
                "cid": payload.get("pubchem_cid"),
                "source_url": payload.get("source_url"),
                "existing_canonical_smiles": existing_structure,
                "proposed_canonical_smiles": proposed_structure,
                "observed_name": name,
                "detected_at": datetime.now(timezone.utc).isoformat(),
            }
            row.provenance = provenance
            row.last_error = "PubChem name hit did not match the verified canonical structure"
            return row
        row.synonyms = list(dict.fromkeys([*(row.synonyms or []), *payload.get("synonyms", [])]))[:200]
        for attribute, payload_key in (
            ("cas_number", "cas_number"),
            ("pubchem_cid", "pubchem_cid"),
            ("canonical_smiles", "canonical_smiles"),
            ("inchi", "inchi"),
            ("inchikey", "inchikey"),
            ("molecular_formula", "molecular_formula"),
            ("molecular_weight", "molecular_weight"),
        ):
            if getattr(row, attribute) is None and payload.get(payload_key) is not None:
                setattr(row, attribute, payload[payload_key])
        provenance = dict(row.provenance or {})
        provenance["pubchem"] = {
            "cid": payload.get("pubchem_cid"),
            "source_url": payload.get("source_url"),
            "fetched_at": payload.get("fetched_at"),
            "metadata_only": True,
        }
        row.provenance = provenance
        return row
    row.canonical_name = payload["canonical_name"]
    row.synonyms = payload.get("synonyms", [])
    row.cas_number = payload.get("cas_number")
    row.pubchem_cid = payload.get("pubchem_cid")
    row.canonical_smiles = payload.get("canonical_smiles")
    row.inchi = payload.get("inchi")
    row.inchikey = payload.get("inchikey")
    row.molecular_formula = payload.get("molecular_formula")
    row.molecular_weight = payload.get("molecular_weight")
    row.substance_type = payload["substance_type"]
    row.structure_status = payload["structure_status"]
    row.qsar_eligible = False  # explicit: PubChem cannot self-authorize QSAR use
    row.assessment_method = "pending_verification"
    row.verification_status = "pending"
    row.last_error = payload.get("smiles_error")
    provenance = dict(row.provenance or {})
    provenance["pubchem"] = {
        "cid": payload.get("pubchem_cid"),
        "source_url": payload.get("source_url"),
        "fetched_at": payload.get("fetched_at"),
        "proposed_qsar_eligible": payload.get("proposed_qsar_eligible", False),
        "reason_code": payload.get("reason_code"),
        "reason_th": payload.get("reason_th"),
    }
    row.provenance = provenance
    return row


def learn_ocr_ingredients(
    db: Session,
    matched: Iterable[tuple],
    no_structure: Iterable[str],
    unmatched: Iterable[str],
    *,
    ocr_confidence: float | None,
    online: bool,
) -> list[dict]:
    """Persist observations and return new PubChem candidates for the UI."""
    for name, smiles, _score, source in matched:
        remember_verified_ingredient(
            db,
            name,
            smiles,
            source=f"ocr:{source}",
            ocr_confidence=ocr_confidence,
            qsar_eligible=True,
        )
    for name in no_structure:
        remember_verified_ingredient(
            db,
            name,
            KNOWN_NON_QSAR.get(normalize_ingredient_name(name), {}).get("canonical_smiles"),
            source="ocr:curated",
            ocr_confidence=ocr_confidence,
            qsar_eligible=False,
        )

    candidates: list[dict] = []
    for name in list(unmatched)[:MAX_PUBCHEM_LOOKUPS_PER_SCAN]:
        observation = _upsert_observation(
            db, name, source="ocr:unmatched", ocr_confidence=ocr_confidence
        )
        if not online:
            continue
        classification = classify_substance(name, {})
        if classification["substance_type"] in {
            "fragrance",
            "polymer",
            "botanical_extract",
        }:
            observation.substance_type = classification["substance_type"]
            observation.structure_status = classification["structure_status"]
            observation.assessment_method = classification["assessment_method"]
            continue
        status, payload, error = get_cached_or_fetch_pubchem(db, name)
        if status == "resolved" and payload:
            row = remember_pubchem_candidate(
                db,
                name,
                payload,
                source="ocr:pubchem",
                ocr_confidence=ocr_confidence,
            )
            candidates.append(registry_row_to_dict(row))
        else:
            observation.last_error = error
    db.commit()
    return candidates


def registry_row_to_dict(row: IngredientRegistry) -> dict:
    provenance = row.provenance or {}
    pubchem = provenance.get("pubchem") or {}
    return {
        "id": row.id,
        "inci_name": row.inci_name,
        "canonical_name": row.canonical_name,
        "thai_names": row.thai_names or [],
        "synonyms": row.synonyms or [],
        "cas_number": row.cas_number,
        "pubchem_cid": row.pubchem_cid,
        "canonical_smiles": row.canonical_smiles,
        "inchi": row.inchi,
        "inchikey": row.inchikey,
        "molecular_formula": row.molecular_formula,
        "molecular_weight": row.molecular_weight,
        "substance_type": row.substance_type,
        "structure_status": row.structure_status,
        "qsar_eligible": row.qsar_eligible,
        "assessment_method": row.assessment_method,
        "regulatory_status_th": row.regulatory_status_th,
        "provenance": provenance,
        "verification_status": row.verification_status,
        "registry_version": row.registry_version,
        "observation_count": row.observation_count,
        "reason_code": pubchem.get("reason_code"),
        "reason_th": pubchem.get("reason_th"),
        "first_seen_at": row.first_seen_at,
        "last_seen_at": row.last_seen_at,
        "updated_at": row.updated_at,
    }


def resolve_verified_registry(
    db: Session,
    names: Iterable[str],
    *,
    include_observed_names: bool = False,
) -> tuple[list[tuple], list[str], dict[str, dict], list[str]] | tuple[
    list[tuple], list[str], dict[str, dict], list[str], dict[str, str]
]:
    """Resolve OCR names from previously verified registry memory.

    Returns QSAR-ready matches, known non-QSAR names, their structured display
    profiles, and names that remain unresolved.  This is the step that makes a
    reviewed first encounter useful on subsequent scans.
    """
    requested = list(dict.fromkeys(str(name).strip() for name in names if str(name).strip()))
    if not requested:
        return [], [], {}, []
    rows = db.execute(
        select(IngredientRegistry).where(IngredientRegistry.verification_status == "verified")
    ).scalars()
    aliases: dict[str, IngredientRegistry] = {}
    for row in rows:
        aliases[row.normalized_name] = row
        for alias in row.synonyms or []:
            aliases.setdefault(normalize_ingredient_name(alias), row)
        if row.inci_name:
            aliases.setdefault(normalize_ingredient_name(row.inci_name), row)
        aliases.setdefault(normalize_ingredient_name(row.canonical_name), row)

    matched: list[tuple] = []
    non_qsar: list[str] = []
    profiles: dict[str, dict] = {}
    remaining: list[str] = []
    observed_by_smiles: dict[str, str] = {}
    seen_rows: set[int] = set()
    for observed in requested:
        row = aliases.get(normalize_ingredient_name(observed))
        if row is None:
            remaining.append(observed)
            continue
        if row.id in seen_rows:
            continue
        seen_rows.add(row.id)
        if row.qsar_eligible and row.canonical_smiles:
            matched.append((row.inci_name or row.canonical_name, row.canonical_smiles, 100, "registry"))
            observed_by_smiles.setdefault(row.canonical_smiles, observed)
            continue
        display_name = row.normalized_name
        non_qsar.append(display_name)
        pubchem = (row.provenance or {}).get("pubchem") or {}
        profiles[display_name] = {
            "name": display_name,
            "recognized": True,
            "resolved": row.structure_status == "resolved",
            "structure_available": bool(row.canonical_smiles),
            "canonical_smiles": row.canonical_smiles,
            "pubchem_cid": row.pubchem_cid,
            "substance_type": row.substance_type,
            "structure_status": row.structure_status,
            "qsar_eligible": False,
            "assessment_method": row.assessment_method,
            "reason_code": pubchem.get("reason_code") or "verified_non_qsar",
            "reason_th": pubchem.get("reason_th")
            or "ข้อมูลได้รับการยืนยันใน Ingredient Registry แล้ว แต่ไม่อยู่ในขอบเขตของ QSAR ชุดนี้",
            "verification_status": row.verification_status,
        }
    result = (matched, non_qsar, profiles, remaining)
    if include_observed_names:
        return (*result, observed_by_smiles)
    return result
