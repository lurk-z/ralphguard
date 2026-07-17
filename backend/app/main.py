"""
RalphGuard Backend API
======================
FastAPI application entry point.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assessments, chat, health, models, ocr, projects, substances, tts
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    print(f"🚀 Starting {settings.APP_NAME} API...")
    yield
    # Shutdown
    print(f"👋 Shutting down {settings.APP_NAME} API...")


app = FastAPI(
    title="RalphGuard API",
    description=(
        "In-silico Irritation & Toxicity Risk Screening Platform. "
        "Predicts skin/eye irritation, sensitization, and acute toxicity "
        "from molecular structures using QSAR models."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # RalphGuard has no cookie-based user session. Credentials must be disabled
    # when the development default "*" is used, otherwise browser CORS handling
    # is inconsistent across localhost/127.0.0.1/LAN origins.
    allow_credentials="*" not in settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router, tags=["health"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(substances.router, prefix="/api/substances", tags=["substances"])
app.include_router(assessments.router, prefix="/api/assessments", tags=["assessments"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])
app.include_router(ocr.router, prefix="/api/ocr", tags=["ocr"])


@app.get("/")
async def root():
    """Root endpoint - basic info."""
    return {
        "name": settings.APP_NAME,
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
