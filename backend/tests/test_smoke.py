"""Smoke tests - confirm basic endpoints work."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root():
    """Root endpoint returns API info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "RalphGuard"


def test_health():
    """Health endpoint returns OK."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
