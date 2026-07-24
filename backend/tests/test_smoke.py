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


def test_substance_depiction_returns_rdkit_svg():
    response = client.get(
        "/api/substances/depiction.svg",
        params={"smiles": "Cn1cnc2c1c(=O)n(C)c(=O)n2C"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in response.text


def test_substance_depiction_rejects_invalid_smiles():
    response = client.get(
        "/api/substances/depiction.svg",
        params={"smiles": "not-a-smiles"},
    )
    assert response.status_code == 422
