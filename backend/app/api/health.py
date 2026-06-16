"""Health check endpoint."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    """Health check - confirms API is alive."""
    return {"status": "ok", "service": "ralphguard-api"}


@router.get("/health/ready")
async def ready():
    """Readiness check - confirms dependencies are reachable."""
    # TODO: Check DB & Redis connectivity
    return {"status": "ready"}
