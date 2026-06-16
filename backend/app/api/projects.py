"""Project management endpoints (stub - to be implemented)."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_projects():
    """List all projects."""
    # TODO: implement DB query
    return {"projects": []}


@router.post("/")
async def create_project():
    """Create a new project."""
    # TODO: implement
    return {"status": "not_implemented"}
