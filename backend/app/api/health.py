"""Health and readiness endpoints."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "ralphguard-api"}


@router.get("/health/ready")
async def ready():
    checks = {
        "auth_config": "ok" if settings.AUTH_SECRET else "fail: not_configured",
        "llm_config": "ok" if settings.GROQ_API_KEY else "fail: not_configured",
        "db": "unknown",
        "user_schema": "unknown",
        "ingredient_catalogue": "unknown",
        "herbal_catalogue": "unknown",
    }
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"fail: {e.__class__.__name__}"
    if checks["db"] == "ok":
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT owner_id FROM projects LIMIT 0"))
                db.execute(text("SELECT owner_id FROM assessments LIMIT 0"))
            checks["user_schema"] = "ok"
        except Exception as e:
            checks["user_schema"] = f"fail: {e.__class__.__name__}"
        try:
            with SessionLocal() as db:
                ingredient = db.execute(
                    text("SELECT 1 FROM ingredient_registry LIMIT 1")
                ).scalar()
                herb = db.execute(text("SELECT 1 FROM herbal_plants LIMIT 1")).scalar()
            checks["ingredient_catalogue"] = "ok" if ingredient == 1 else "fail: empty"
            checks["herbal_catalogue"] = "ok" if herb == 1 else "fail: empty"
        except Exception as e:
            failure = f"fail: {e.__class__.__name__}"
            checks["ingredient_catalogue"] = failure
            checks["herbal_catalogue"] = failure
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
    payload = {
        "status": "ready" if ready else "degraded",
        "execution_mode": settings.ASSESSMENT_EXECUTION_MODE,
        "checks": checks,
    }
    if not ready:
        return JSONResponse(status_code=503, content=payload)
    return payload
