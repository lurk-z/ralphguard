"""Substance endpoints — SMILES validation and verified ingredient memory."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from rdkit import Chem
from rdkit.Chem.Draw import rdMolDraw2D
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ingredient_registry import ExperimentalEvidence, IngredientRegistry, PubChemCache
from app.schemas.ingredient_registry import (
    EvidenceImportSummary,
    EvidenceReviewInput,
    ExperimentalEvidenceOut,
    IngredientRegistryOut,
    PubChemEvidenceBulkInput,
    PubChemEvidenceImportInput,
    RegistryLookupInput,
    RegistryVerifyInput,
    SubstanceHazardSummary,
    SubstanceProfileOut,
    TrainingExportSummary,
)
from app.schemas.substance import SmilesInput, SmilesValidationResult
from app.services.chemistry import validate_and_describe
from app.services.ingredient_registry import (
    KNOWN_NON_QSAR,
    get_cached_pubchem_description,
    get_cached_or_fetch_pubchem,
    normalize_ingredient_name,
    registry_row_to_dict,
    remember_pubchem_candidate,
)
from app.services.pubchem_evidence import (
    ENDPOINTS,
    evidence_row_to_dict,
    import_pubchem_ghs_evidence,
    promote_consensus_evidence,
    verified_training_rows,
)

router = APIRouter()


ENDPOINT_ORDER = {"skin": 0, "eye": 1, "sens": 2, "acute": 3}


@router.post("/validate", response_model=SmilesValidationResult)
async def validate_smiles(payload: SmilesInput) -> SmilesValidationResult:
    valid, canonical, descriptors, error = validate_and_describe(payload.smiles)
    return SmilesValidationResult(
        smiles=payload.smiles,
        valid=valid,
        canonical=canonical,
        descriptors=descriptors,
        error=error,
    )


@router.get("/depiction.svg")
def depict_substance(
    smiles: str = Query(..., min_length=1, max_length=1000),
) -> Response:
    """Render a deterministic 2D structure from the supplied verified SMILES."""
    molecule = Chem.MolFromSmiles(smiles.strip())
    if molecule is None:
        raise HTTPException(status_code=422, detail="RDKit could not parse SMILES")
    drawer = rdMolDraw2D.MolDraw2DSVG(520, 280)
    options = drawer.drawOptions()
    options.clearBackground = True
    options.padding = 0.08
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, molecule)
    drawer.FinishDrawing()
    return Response(
        content=drawer.GetDrawingText(),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/profile", response_model=SubstanceProfileOut)
def get_substance_profile(
    name: str | None = Query(None, max_length=300),
    smiles: str | None = Query(None, max_length=1000),
    db: Session = Depends(get_db),
) -> SubstanceProfileOut:
    """Return identity, structure and sourced hazard context without mutating the registry."""
    if not (name and name.strip()) and not (smiles and smiles.strip()):
        raise HTTPException(status_code=422, detail="name or smiles is required")

    canonical: str | None = None
    descriptors: dict | None = None
    if smiles and smiles.strip():
        valid, canonical, descriptors, _error = validate_and_describe(smiles)
        if not valid:
            canonical = None

    row: IngredientRegistry | None = None
    if canonical:
        row = db.scalar(
            select(IngredientRegistry).where(IngredientRegistry.canonical_smiles == canonical)
        )
    if row is None and name and name.strip():
        normalized = normalize_ingredient_name(name)
        row = db.scalar(
            select(IngredientRegistry).where(
                or_(
                    IngredientRegistry.normalized_name == normalized,
                    IngredientRegistry.inci_name.ilike(name.strip()),
                    IngredientRegistry.canonical_name.ilike(name.strip()),
                )
            )
        )

    description: dict | None = None
    if row is not None and row.pubchem_cid is not None:
        status, payload, _error = get_cached_pubchem_description(db, int(row.pubchem_cid))
        if status == "resolved":
            description = payload
        db.commit()

    hazards: list[SubstanceHazardSummary] = []
    if row is not None:
        evidence = list(
            db.execute(
                select(ExperimentalEvidence).where(
                    ExperimentalEvidence.ingredient_id == row.id,
                    ExperimentalEvidence.review_status != "rejected",
                )
            ).scalars()
        )
        grouped: dict[str, list[ExperimentalEvidence]] = {}
        for item in evidence:
            grouped.setdefault(item.endpoint, []).append(item)
        for endpoint, items in sorted(
            grouped.items(), key=lambda pair: ENDPOINT_ORDER.get(pair[0], 99)
        ):
            statuses = {item.review_status for item in items}
            verification = (
                "verified"
                if "verified" in statuses
                else "consensus_verified"
                if "consensus_verified" in statuses
                else "pending"
            )
            hazards.append(
                SubstanceHazardSummary(
                    endpoint=endpoint,
                    hazard_codes=sorted(
                        {code for item in items for code in (item.hazard_codes or [])}
                    ),
                    source_count=len({item.source_name for item in items}),
                    verification=verification,
                )
            )

    known = KNOWN_NON_QSAR.get(normalize_ingredient_name(name or ""))
    if row is not None:
        return SubstanceProfileOut(
            found_in_registry=True,
            canonical_name=row.canonical_name,
            inci_name=row.inci_name,
            pubchem_cid=row.pubchem_cid,
            canonical_smiles=row.canonical_smiles,
            molecular_formula=row.molecular_formula,
            molecular_weight=row.molecular_weight,
            substance_type=row.substance_type,
            structure_status=row.structure_status,
            qsar_eligible=row.qsar_eligible,
            assessment_method=row.assessment_method,
            verification_status=row.verification_status,
            description=description.get("description") if description else None,
            description_source=description.get("source") if description else None,
            description_url=description.get("source_url") if description else None,
            hazards=hazards,
        )

    return SubstanceProfileOut(
        found_in_registry=False,
        canonical_name=str((known or {}).get("canonical_name") or name or "Unknown substance"),
        pubchem_cid=(known or {}).get("pubchem_cid"),
        canonical_smiles=str((known or {}).get("canonical_smiles") or canonical or "") or None,
        molecular_formula=(known or {}).get("molecular_formula"),
        molecular_weight=(known or {}).get("molecular_weight") or (descriptors or {}).get("mw"),
        substance_type=str(
            (known or {}).get("substance_type")
            or ("defined_single_substance" if canonical else "unknown_composition")
        ),
        structure_status=str(
            (known or {}).get("structure_status")
            or ("resolved" if canonical else "unresolved")
        ),
        qsar_eligible=False if known else None,
        assessment_method=str((known or {}).get("assessment_method") or "not_registered"),
        verification_status="verified" if known else "not_registered",
        hazards=[],
    )


@router.get("/registry", response_model=list[IngredientRegistryOut])
async def list_ingredient_registry(
    verification_status: str | None = Query(None, max_length=30),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[IngredientRegistryOut]:
    query = select(IngredientRegistry)
    if verification_status:
        query = query.where(IngredientRegistry.verification_status == verification_status)
    rows = db.execute(
        # A stable secondary key is required for offset pagination. Seeded rows
        # often share the same timestamp; ordering only by last_seen_at caused
        # duplicates between pages and silently hid other ingredients in the UI.
        query.order_by(
            IngredientRegistry.last_seen_at.desc(),
            IngredientRegistry.id.asc(),
        ).offset(offset).limit(limit)
    ).scalars()
    return [IngredientRegistryOut.model_validate(registry_row_to_dict(row)) for row in rows]


@router.post("/registry/lookup", response_model=IngredientRegistryOut)
async def lookup_ingredient(
    payload: RegistryLookupInput,
    db: Session = Depends(get_db),
) -> IngredientRegistryOut:
    key = normalize_ingredient_name(payload.name)
    row = db.scalar(select(IngredientRegistry).where(IngredientRegistry.normalized_name == key))
    if row and row.verification_status == "verified" and not payload.refresh:
        return IngredientRegistryOut.model_validate(registry_row_to_dict(row))
    if payload.refresh:
        cache = db.get(PubChemCache, key)
        if cache is not None:
            db.delete(cache)
            db.flush()
    status, pubchem, error = get_cached_or_fetch_pubchem(db, payload.name)
    if status != "resolved" or not pubchem:
        db.commit()
        raise HTTPException(status_code=404 if status == "not_found" else 502, detail=error or status)
    row = remember_pubchem_candidate(
        db,
        payload.name,
        pubchem,
        source="manual:pubchem_lookup",
        ocr_confidence=None,
    )
    db.commit()
    db.refresh(row)
    return IngredientRegistryOut.model_validate(registry_row_to_dict(row))


@router.patch("/registry/{registry_id}/verify", response_model=IngredientRegistryOut)
async def verify_ingredient(
    registry_id: int,
    payload: RegistryVerifyInput,
    db: Session = Depends(get_db),
) -> IngredientRegistryOut:
    row = db.get(IngredientRegistry, registry_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"ingredient registry {registry_id} not found")
    if payload.action == "reject":
        row.verification_status = "rejected"
        row.qsar_eligible = False
        row.assessment_method = "rejected_candidate"
    else:
        if payload.canonical_name is not None:
            row.canonical_name = payload.canonical_name.strip()
        if payload.canonical_smiles is not None:
            valid, canonical, _descriptors, error = validate_and_describe(payload.canonical_smiles)
            if not valid or not canonical:
                raise HTTPException(status_code=422, detail=error or "invalid SMILES")
            row.canonical_smiles = canonical
            row.structure_status = payload.structure_status or "resolved"
        elif payload.structure_status is not None:
            row.structure_status = payload.structure_status
        if payload.substance_type is not None:
            row.substance_type = payload.substance_type
        requested_qsar = payload.qsar_eligible if payload.qsar_eligible is not None else False
        if requested_qsar and row.normalized_name in KNOWN_NON_QSAR:
            raise HTTPException(
                status_code=422,
                detail="This verified carrier/mixture/polymer/inorganic ingredient is excluded from QSAR",
            )
        if requested_qsar and (
            not row.canonical_smiles
            or row.structure_status != "resolved"
            or row.substance_type != "defined_single_substance"
            or "." in row.canonical_smiles
        ):
            raise HTTPException(
                status_code=422,
                detail="QSAR eligibility requires a verified, resolved single-substance structure",
            )
        row.qsar_eligible = requested_qsar
        row.assessment_method = "qsar" if requested_qsar else "knowledge_base"
        row.verification_status = "verified"
    row.registry_version += 1
    provenance = dict(row.provenance or {})
    provenance["last_review"] = {
        "action": payload.action,
        "reviewer_note": payload.reviewer_note,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    row.provenance = provenance
    db.commit()
    db.refresh(row)
    return IngredientRegistryOut.model_validate(registry_row_to_dict(row))


@router.post(
    "/registry/{registry_id}/evidence/pubchem",
    response_model=EvidenceImportSummary,
)
async def import_pubchem_evidence_for_ingredient(
    registry_id: int,
    payload: PubChemEvidenceImportInput,
    db: Session = Depends(get_db),
) -> EvidenceImportSummary:
    ingredient = db.get(IngredientRegistry, registry_id)
    if ingredient is None:
        raise HTTPException(status_code=404, detail=f"ingredient registry {registry_id} not found")
    try:
        rows, imported, existing = import_pubchem_ghs_evidence(
            db, ingredient, refresh=payload.refresh
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError:
        rows, imported, existing = [], 0, 0
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"PubChem evidence lookup failed: {exc}") from exc
    db.commit()
    for row in rows:
        db.refresh(row)
    by_endpoint: dict[str, int] = {endpoint: 0 for endpoint in sorted(ENDPOINTS)}
    for row in rows:
        by_endpoint[row.endpoint] += 1
    return EvidenceImportSummary(
        ingredient_id=ingredient.id,
        pubchem_cid=int(ingredient.pubchem_cid or 0),
        imported=imported,
        existing=existing,
        by_endpoint=by_endpoint,
        evidence=[ExperimentalEvidenceOut.model_validate(evidence_row_to_dict(row)) for row in rows],
    )


@router.post("/registry/evidence/pubchem/bulk", response_model=list[EvidenceImportSummary])
async def import_pubchem_evidence_bulk(
    payload: PubChemEvidenceBulkInput,
    db: Session = Depends(get_db),
) -> list[EvidenceImportSummary]:
    results: list[EvidenceImportSummary] = []
    for registry_id in list(dict.fromkeys(payload.registry_ids)):
        ingredient = db.get(IngredientRegistry, registry_id)
        if ingredient is None or ingredient.pubchem_cid is None:
            continue
        try:
            rows, imported, existing = import_pubchem_ghs_evidence(
                db, ingredient, refresh=payload.refresh
            )
        except LookupError:
            rows, imported, existing = [], 0, 0
        by_endpoint: dict[str, int] = {endpoint: 0 for endpoint in sorted(ENDPOINTS)}
        for row in rows:
            by_endpoint[row.endpoint] += 1
        results.append(
            EvidenceImportSummary(
                ingredient_id=ingredient.id,
                pubchem_cid=int(ingredient.pubchem_cid),
                imported=imported,
                existing=existing,
                by_endpoint=by_endpoint,
                evidence=[
                    ExperimentalEvidenceOut.model_validate(evidence_row_to_dict(row))
                    for row in rows
                ],
            )
        )
    db.commit()
    return results


@router.get("/evidence", response_model=list[ExperimentalEvidenceOut])
async def list_experimental_evidence(
    ingredient_id: int | None = Query(None, ge=1),
    endpoint: str | None = Query(None),
    review_status: str | None = Query(None, max_length=30),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[ExperimentalEvidenceOut]:
    if endpoint is not None and endpoint not in ENDPOINTS:
        raise HTTPException(status_code=422, detail=f"endpoint must be one of {sorted(ENDPOINTS)}")
    query = select(ExperimentalEvidence)
    if ingredient_id is not None:
        query = query.where(ExperimentalEvidence.ingredient_id == ingredient_id)
    if endpoint is not None:
        query = query.where(ExperimentalEvidence.endpoint == endpoint)
    if review_status is not None:
        query = query.where(ExperimentalEvidence.review_status == review_status)
    rows = db.execute(query.order_by(ExperimentalEvidence.imported_at.desc()).limit(limit)).scalars()
    return [ExperimentalEvidenceOut.model_validate(evidence_row_to_dict(row)) for row in rows]


@router.post("/evidence/consensus-promote", response_model=dict[str, int])
async def promote_pubchem_consensus(
    min_sources: int = Query(2, ge=2, le=10),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    summary = promote_consensus_evidence(db, min_sources=min_sources)
    db.commit()
    return summary


@router.patch("/evidence/{evidence_id}/review", response_model=ExperimentalEvidenceOut)
async def review_experimental_evidence(
    evidence_id: int,
    payload: EvidenceReviewInput,
    db: Session = Depends(get_db),
) -> ExperimentalEvidenceOut:
    row = db.get(ExperimentalEvidence, evidence_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"evidence {evidence_id} not found")
    row.review_status = "verified" if payload.action == "verify" else "rejected"
    row.reviewer_note = payload.reviewer_note.strip()
    row.reviewed_at = datetime.now(timezone.utc)
    provenance = dict(row.provenance or {})
    provenance["review"] = {
        "action": payload.action,
        "note": row.reviewer_note,
        "reviewed_at": row.reviewed_at.isoformat(),
    }
    row.provenance = provenance
    db.commit()
    db.refresh(row)
    return ExperimentalEvidenceOut.model_validate(evidence_row_to_dict(row))


@router.get("/training-evidence/export", response_model=TrainingExportSummary)
async def export_verified_training_evidence(
    endpoint: str = Query(...),
    db: Session = Depends(get_db),
) -> TrainingExportSummary:
    if endpoint not in ENDPOINTS:
        raise HTTPException(status_code=422, detail=f"endpoint must be one of {sorted(ENDPOINTS)}")
    rows, stats = verified_training_rows(db, endpoint)
    return TrainingExportSummary(endpoint=endpoint, rows=rows, **stats)
