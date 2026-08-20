"""Project management endpoints."""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.auth import CurrentUser, get_current_user
from app.models import Assessment, Project
from app.schemas.assessment import AssessmentResult, AssessmentStatus, AssessmentSummary
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter()


@router.get("/", response_model=List[ProjectOut])
async def list_projects(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> List[ProjectOut]:
    rows = (
        db.execute(
            select(Project)
            .where(Project.owner_id == user.id, Project.deleted_at.is_(None))
            .order_by(Project.updated_at.desc(), Project.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [ProjectOut.model_validate(r) for r in rows]


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectOut:
    row = Project(
        owner_id=user.id,
        name=payload.name,
        description=payload.description,
        color_key=payload.color_key,
        icon_key=payload.icon_key,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ProjectOut.model_validate(row)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> ProjectOut:
    row = db.get(Project, project_id)
    if row is None or row.owner_id != user.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")
    return ProjectOut.model_validate(row)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectOut:
    row = db.get(Project, project_id)
    if row is None or row.owner_id != user.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="project name must not be blank")
        row.name = name
    if "description" in changes:
        description = changes["description"]
        row.description = description.strip() if description and description.strip() else None
    if changes.get("color_key") is not None:
        row.color_key = changes["color_key"]
    if changes.get("icon_key") is not None:
        row.icon_key = changes["icon_key"]

    db.commit()
    db.refresh(row)
    return ProjectOut.model_validate(row)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> Response:
    row = db.get(Project, project_id)
    if row is None or row.owner_id != user.id or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")

    row.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/restore", response_model=ProjectOut)
async def restore_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectOut:
    row = db.get(Project, project_id)
    if row is None or row.owner_id != user.id:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")

    row.deleted_at = None
    db.commit()
    db.refresh(row)
    return ProjectOut.model_validate(row)


@router.get("/{project_id}/assessments", response_model=List[AssessmentSummary])
async def list_project_assessments(
    project_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)
) -> List[AssessmentSummary]:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail=f"project {project_id} not found")
    rows = (
        db.execute(
            select(Assessment)
            .where(Assessment.project_id == project_id, Assessment.owner_id == user.id)
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


@router.get(
    "/{project_id}/assessments/{assessment_id}",
    response_model=AssessmentResult,
)
async def get_project_assessment(
    project_id: int,
    assessment_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> AssessmentResult:
    """Return one assessment only when it belongs to the requested project."""
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id or project.deleted_at is not None:
        raise HTTPException(
            status_code=404,
            detail=f"assessment {assessment_id} not found in project {project_id}",
        )
    row = db.get(Assessment, assessment_id)
    if row is None or row.project_id != project_id or row.owner_id != user.id:
        # Do not reveal whether an assessment exists under another project.
        raise HTTPException(
            status_code=404,
            detail=f"assessment {assessment_id} not found in project {project_id}",
        )
    return AssessmentResult(
        id=row.id,
        status=AssessmentStatus(row.status.value),
        region=row.region,
        formula=row.formula,
        result=row.result,
        error=row.error,
        created_at=row.created_at,
        completed_at=row.completed_at,
    )
