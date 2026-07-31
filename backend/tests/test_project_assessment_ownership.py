from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.projects import get_project_assessment
from app.models import Assessment, Project


class FakeSession:
    def __init__(self, assessment):
        self.assessment = assessment

    def get(self, model, row_id):
        if model is Project:
            return SimpleNamespace(id=row_id, deleted_at=None)
        if model is Assessment:
            return self.assessment
        return None


@pytest.mark.asyncio
async def test_project_assessment_hides_another_projects_result():
    db = FakeSession(SimpleNamespace(project_id=22))

    with pytest.raises(HTTPException) as raised:
        await get_project_assessment(11, "assessment-1", db)

    assert raised.value.status_code == 404


@pytest.mark.asyncio
async def test_project_assessment_returns_404_when_missing():
    db = FakeSession(None)

    with pytest.raises(HTTPException) as raised:
        await get_project_assessment(11, "missing", db)

    assert raised.value.status_code == 404
