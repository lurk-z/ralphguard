"""Health and readiness endpoints."""
from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.queue import get_redis

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "ralphguard-api"}


@router.get("/health/ready")
async def ready():
    checks = {"db": "unknown", "redis": "unknown"}
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"fail: {e.__class__.__name__}"
    try:
        get_redis().ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"fail: {e.__class__.__name__}"
    ready = all(v == "ok" for v in checks.values())
    return {"status": "ready" if ready else "degraded", "checks": checks}
