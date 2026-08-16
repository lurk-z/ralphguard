"""Online PubChem identity resolution for runtime screening.

This router is deliberately separate from toxicity-evidence review. Resolving a
SMILES against PubChem may create/update a *pending* IngredientRegistry row, but
it never verifies that row and never creates a training label.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from rdkit import Chem
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ingredient_registry import IngredientRegistry, PubChemCache
from app.schemas.ingredient_registry import IngredientRegistryOut
from app.services.chemistry import validate_and_describe
from app.services.ingredient_registry import (
    PUBCHEM_BASE,
    PUBCHEM_ERROR_TTL,
    PUBCHEM_NOT_FOUND_TTL,
    PUBCHEM_POSITIVE_TTL,
    PUBCHEM_PROPERTIES,
    _throttled_get,
    parse_pubchem_responses,
    registry_row_to_dict,
    remember_pubchem_candidate,
)

router = APIRouter()


class PubChemSmilesLookupInput(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=2000)
    refresh: bool = False


def _inchikey(smiles: str) -> str | None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    try:
        inchi = Chem.MolToInchi(mol)
        return Chem.InchiToInchiKey(inchi) if inchi else None
    except Exception:
        return None


def exact_structure_matches(left_smiles: str, right_smiles: str) -> bool:
    """Require exact standardized molecular identity for a SMILES lookup hit."""
    left_key = _inchikey(left_smiles)
    right_key = _inchikey(right_smiles)
    if left_key and right_key:
        return left_key == right_key
    left = Chem.MolFromSmiles(left_smiles)
    right = Chem.MolFromSmiles(right_smiles)
    if left is None or right is None:
        return False
    return Chem.MolToSmiles(left, canonical=True, isomericSmiles=True) == Chem.MolToSmiles(
        right, canonical=True, isomericSmiles=True
    )


def _cache_key(canonical_smiles: str) -> str:
    digest = hashlib.sha256(canonical_smiles.encode("utf-8")).hexdigest()
    return f"smiles:{digest}"


def _fetch_pubchem_by_smiles(canonical_smiles: str) -> dict:
    encoded = quote(canonical_smiles, safe="")
    with httpx.Client(headers={"User-Agent": "RalphGuard/0.1 PubChem SMILES resolver"}) as client:
        properties = _throttled_get(
            client,
            f"{PUBCHEM_BASE}/compound/smiles/{encoded}/property/{PUBCHEM_PROPERTIES}/JSON",
        )
        rows = properties.get("PropertyTable", {}).get("Properties", [])
        if not rows:
            raise LookupError("not found in PubChem")
        first = rows[0]
        cid = int(first["CID"])
        display_name = str(first.get("Title") or first.get("IUPACName") or f"PubChem CID {cid}")
        synonyms = _throttled_get(client, f"{PUBCHEM_BASE}/compound/cid/{cid}/synonyms/JSON")

    parsed = parse_pubchem_responses(display_name, properties, synonyms)
    returned_smiles = str(parsed.get("canonical_smiles") or "").strip()
    if not returned_smiles or not exact_structure_matches(canonical_smiles, returned_smiles):
        raise ValueError(
            "PubChem standardized the supplied SMILES to a different exact molecular identity"
        )
    parsed["query_smiles"] = canonical_smiles
    parsed["lookup_mode"] = "smiles_exact_identity"
    return parsed


def _cached_or_fetch_by_smiles(
    db: Session,
    canonical_smiles: str,
    *,
    refresh: bool,
) -> tuple[str, dict | None, str | None]:
    key = _cache_key(canonical_smiles)
    now = datetime.now(timezone.utc)
    cached = db.get(PubChemCache, key)
    if refresh and cached is not None:
        db.delete(cached)
        db.flush()
        cached = None
    if cached is not None and cached.expires_at > now:
        return cached.status, cached.payload, cached.error

    try:
        payload = _fetch_pubchem_by_smiles(canonical_smiles)
        status, error, ttl = "resolved", None, PUBCHEM_POSITIVE_TTL
    except LookupError as exc:
        payload, status, error, ttl = None, "not_found", str(exc), PUBCHEM_NOT_FOUND_TTL
    except ValueError as exc:
        # Identity mismatch is not transient. Cache briefly enough to prevent a
        # retry loop while still allowing future PubChem standardization changes.
        payload, status, error, ttl = None, "identity_mismatch", str(exc), PUBCHEM_NOT_FOUND_TTL
    except Exception as exc:
        payload, status, error, ttl = None, "error", str(exc)[:1000], PUBCHEM_ERROR_TTL

    if cached is None:
        cached = PubChemCache(
            query_key=key,
            query_name=f"SMILES {canonical_smiles[:240]}",
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


@router.post("/lookup-smiles", response_model=IngredientRegistryOut)
def lookup_pubchem_by_smiles(
    payload: PubChemSmilesLookupInput,
    db: Session = Depends(get_db),
) -> IngredientRegistryOut:
    valid, canonical, _descriptors, validation_error = validate_and_describe(payload.smiles)
    if not valid or not canonical:
        raise HTTPException(status_code=422, detail=validation_error or "invalid SMILES")

    # Reuse an exact registry identity first. A previously resolved pending
    # PubChem row is still useful for runtime screening without another request.
    existing = db.scalar(
        select(IngredientRegistry).where(IngredientRegistry.canonical_smiles == canonical)
    )
    if existing is not None and not payload.refresh:
        if existing.verification_status == "verified" or (existing.provenance or {}).get("pubchem"):
            return IngredientRegistryOut.model_validate(registry_row_to_dict(existing))

    status, pubchem, error = _cached_or_fetch_by_smiles(
        db, canonical, refresh=payload.refresh
    )
    if status != "resolved" or not pubchem:
        db.commit()
        if status == "not_found":
            raise HTTPException(status_code=404, detail=error or "not found in PubChem")
        if status == "identity_mismatch":
            raise HTTPException(status_code=409, detail=error or "PubChem identity mismatch")
        raise HTTPException(status_code=502, detail=error or "PubChem lookup failed")

    row = remember_pubchem_candidate(
        db,
        str(pubchem.get("canonical_name") or f"PubChem CID {pubchem.get('pubchem_cid')}"),
        pubchem,
        source="manual:pubchem_smiles_lookup",
        ocr_confidence=None,
    )
    db.commit()
    db.refresh(row)
    return IngredientRegistryOut.model_validate(registry_row_to_dict(row))
