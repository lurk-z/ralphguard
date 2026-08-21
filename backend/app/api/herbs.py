"""Read-only Thai herbal registry endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.herbal_registry import HerbConstituent, HerbEvidence, HerbalMaterial, HerbalPlant
from app.models.ingredient_registry import IngredientRegistry

router = APIRouter()


def material_assessment_method(material_type: str) -> str:
    return "compound_qsar" if material_type == "isolated_compound" else "botanical_evidence"


@router.get("")
def search_herbs(
    q: str = Query("", max_length=200),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    term = q.strip()
    statement = select(HerbalPlant)
    if term:
        statement = statement.where(
            or_(
                HerbalPlant.thai_name.ilike(f"%{term}%"),
                HerbalPlant.english_name.ilike(f"%{term}%"),
                HerbalPlant.scientific_name.ilike(f"%{term}%"),
                HerbalPlant.accepted_scientific_name.ilike(f"%{term}%"),
            )
        )
    rows = db.scalars(statement.order_by(HerbalPlant.thai_name).limit(limit)).all()
    return [
        {
            "id": row.id,
            "thai_name": row.thai_name,
            "english_name": row.english_name,
            "scientific_name": row.scientific_name,
            "accepted_scientific_name": row.accepted_scientific_name,
            "family": row.family,
            "synonyms": row.synonyms,
            "verification_status": row.verification_status,
            "source": row.source,
        }
        for row in rows
    ]


@router.get("/{herb_id}")
def herb_detail(herb_id: int, db: Session = Depends(get_db)):
    plant = db.get(HerbalPlant, herb_id)
    if plant is None:
        raise HTTPException(status_code=404, detail="herb not found")
    materials = db.scalars(
        select(HerbalMaterial).where(HerbalMaterial.herb_id == herb_id)
    ).all()
    constituents = db.execute(
        select(HerbConstituent, IngredientRegistry)
        .outerjoin(IngredientRegistry, HerbConstituent.ingredient_registry_id == IngredientRegistry.id)
        .where(HerbConstituent.herb_id == herb_id)
    ).all()
    evidence = db.scalars(
        select(HerbEvidence).where(HerbEvidence.herb_id == herb_id)
    ).all()
    # Knowing a molecule's structure and being cleared to score it with QSAR
    # are different facts. A referenced constituent can carry an InChIKey and
    # PubChem CID from the literature without yet having a verified registry
    # entry; counting those as "structure not found" understated what the
    # catalogue actually knows.
    total = len(constituents)
    resolved = sum(
        1
        for link, compound in constituents
        if link.inchikey or (compound and compound.canonical_smiles)
    )
    registry_verified = sum(1 for _link, compound in constituents if compound is not None)
    qsar = sum(1 for _link, compound in constituents if compound and compound.qsar_eligible)
    return {
        "plant": {
            "id": plant.id,
            "thai_name": plant.thai_name,
            "english_name": plant.english_name,
            "scientific_name": plant.scientific_name,
            "accepted_scientific_name": plant.accepted_scientific_name,
            "family": plant.family,
            "synonyms": plant.synonyms,
            "verification_status": plant.verification_status,
            "source": plant.source,
            "provenance": plant.provenance,
        },
        "materials": [
            {
                "id": item.id,
                "plant_part": item.plant_part,
                "material_type": item.material_type,
                "extract_type": item.extract_type,
                "solvent": item.solvent,
                "assessment_method": material_assessment_method(item.material_type),
                "whole_material_qsar_eligible": item.material_type == "isolated_compound",
                "source": item.source,
            }
            for item in materials
        ],
        "constituents": [
            {
                "name": link.compound_name,
                "pubchem_cid": link.pubchem_cid,
                "inchikey": link.inchikey,
                "relationship_type": link.relationship_type,
                "evidence_source": link.evidence_source,
                "structure_resolved": bool(
                    link.inchikey or (compound and compound.canonical_smiles)
                ),
                "registry_verified": compound is not None,
                "qsar_eligible": bool(compound and compound.qsar_eligible),
            }
            for link, compound in constituents
        ],
        "evidence": [
            {
                "endpoint": item.endpoint,
                "effect": item.effect,
                "evidence_type": item.evidence_type,
                "source": item.source,
                "source_url": item.source_url,
                "doi": item.doi,
            }
            for item in evidence
        ],
        "coverage": {
            "known_constituents": total,
            "structure_resolved": resolved,
            "registry_verified": registry_verified,
            "qsar_assessed": qsar,
            # Structure known from the literature, but not yet verified in the
            # ingredient registry, so QSAR must not score it yet.
            "awaiting_verification": resolved - registry_verified,
            "literature_only": total - resolved,
            "unresolved": total - resolved,
            "structure_percentage": round(100.0 * resolved / max(1, total), 1),
            "percentage": round(100.0 * qsar / max(1, total), 1),
        },
    }
