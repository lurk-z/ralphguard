from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.projects import get_project_assessment


class FakeSession:
    def __init__(self, assessment):
        self.assessment = assessment

    def get(self, model, assessment_id):
        return self.assessment


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
