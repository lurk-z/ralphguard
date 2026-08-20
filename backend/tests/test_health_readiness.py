"""Readiness must fail before production is allowed to receive traffic."""
import asyncio
import json

from fastapi.responses import JSONResponse

from app.api import health


class _Result:
    def __init__(self, scalar_value=None):
        self._scalar_value = scalar_value

    def scalar(self):
        return self._scalar_value


class _Db:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement):
        sql = str(statement)
        if "ingredient_registry" in sql or "herbal_plants" in sql:
            return _Result(1)
        return _Result()


def _session_factory():
    return _Db()


def test_ready_checks_auth_ai_schema_and_catalogues(monkeypatch):
    monkeypatch.setattr(health, "SessionLocal", _session_factory)
    monkeypatch.setattr(health.settings, "AUTH_SECRET", "configured")
    monkeypatch.setattr(health.settings, "GROQ_API_KEY", "configured")
    monkeypatch.setattr(health.settings, "ASSESSMENT_EXECUTION_MODE", "inline")

    response = asyncio.run(health.ready())

    assert response["status"] == "ready"
    assert all(value == "ok" for value in response["checks"].values())


def test_ready_returns_503_when_auth_is_missing(monkeypatch):
    monkeypatch.setattr(health, "SessionLocal", _session_factory)
    monkeypatch.setattr(health.settings, "AUTH_SECRET", "")
    monkeypatch.setattr(health.settings, "GROQ_API_KEY", "configured")
    monkeypatch.setattr(health.settings, "ASSESSMENT_EXECUTION_MODE", "inline")

    response = asyncio.run(health.ready())

    assert isinstance(response, JSONResponse)
    assert response.status_code == 503
    payload = json.loads(response.body)
    assert payload["status"] == "degraded"
    assert payload["checks"]["auth_config"] == "fail: not_configured"
