from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.services import assessment_service


def test_inline_mode_schedules_local_inference_without_redis(monkeypatch):
    fake_db = Mock()

    def override_db():
        yield fake_db

    enqueue = Mock(side_effect=AssertionError("Redis must not be used in inline mode"))
    process_inline = Mock()
    monkeypatch.setattr(settings, "ASSESSMENT_EXECUTION_MODE", "inline")
    monkeypatch.setattr(assessment_service, "enqueue_assessment", enqueue)
    monkeypatch.setattr(assessment_service, "process_assessment_inline", process_inline)
    app.dependency_overrides[get_db] = override_db
    try:
        response = TestClient(app).post(
            "/api/assessments/",
            json={
                "formula": [
                    {"smiles": "CCO", "name": "Ethanol", "concentration": 10.0}
                ],
                "region": "forearm",
            },
        )
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 202
    enqueue.assert_not_called()
    process_inline.assert_called_once_with(response.json()["job_id"])
