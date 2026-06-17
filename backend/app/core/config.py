"""Application configuration loaded from environment variables."""
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings - reads from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "RalphGuard"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_SECRET_KEY: str = "change-me"
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Database
    DATABASE_URL: str = "postgresql://ralphguard:ralphguard_dev@postgres:5432/ralphguard"

    # Redis / Queue
    REDIS_URL: str = "redis://redis:6379/0"
    QUEUE_STREAM_NAME: str = "ralphguard:jobs"

    # Models (read-only mount of scientific/models — used for the model card)
    MODELS_DIR: str = "/models"


settings = Settings()
