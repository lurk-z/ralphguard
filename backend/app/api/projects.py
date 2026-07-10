"""Project management endpoints."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Assessment, Project
from app.schemas.assessment import AssessmentStatus, AssessmentSummary
from app.schemas.project import ProjectCreate, ProjectOut

router = APIRouter()


@router.get("/", response_model=List[ProjectOut])
async def list_projects(db: Session = Depends(get_db)) -> List[ProjectOut]:
    rows = db.execute(select(Project).order_by(Project.created_at.desc())).scalars().all()
    return [ProjectOut.model_validate(r) for r in rows]


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
) -> ProjectOut:
    row = Project(name=payload.name, description=payload.description)
    db.add(row)
    db.commit()
    db.refresh(row)
    return ProjectOut.model_validate(row)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: Session = Depends(get_db)) -> ProjectOut:
    row = db.get(Project, project_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")
    return ProjectOut.model_validate(row)


@router.get("/{project_id}/assessments", response_model=List[AssessmentSummary])
async def list_project_assessments(
    project_id: int, db: Session = Depends(get_db)
) -> List[AssessmentSummary]:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")
    rows = (
        db.execute(
            select(Assessment)
            .where(Assessment.project_id == project_id)
            .order_by(Assessment.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [
        AssessmentSummary(
            id=r.id,
            status=AssessmentStatus(r.status.value),
            region=r.region,
            project_id=r.project_id,
            n_substances=len(r.formula or []),
            created_at=r.created_at,
            completed_at=r.completed_at,
        )
        for r in rows
    ]
