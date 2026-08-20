"""Health and readiness endpoints."""
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "ralphguard-api"}


@router.get("/health/ready")
async def ready():
    checks = {"db": "unknown"}
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"fail: {e.__class__.__name__}"
    if settings.ASSESSMENT_EXECUTION_MODE == "queue":
        from app.services.queue import get_redis

        checks["redis"] = "unknown"
        try:
            get_redis().ping()
            checks["redis"] = "ok"
        except Exception as e:
            checks["redis"] = f"fail: {e.__class__.__name__}"
    else:
        checks["inline_inference"] = "ok"
    ready = all(v == "ok" for v in checks.values())
    return {
        "status": "ready" if ready else "degraded",
        "execution_mode": settings.ASSESSMENT_EXECUTION_MODE,
        "checks": checks,
    }
