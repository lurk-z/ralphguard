from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.api.projects import create_project
from app.schemas.project import ProjectCreate, ProjectUpdate


class FakeSession:
    def __init__(self):
        self.added = None
        self.commits = 0

    def add(self, row):
        self.added = row

    def commit(self):
        self.commits += 1

    def refresh(self, row):
        row.id = 42
        row.created_at = datetime(2026, 7, 21, tzinfo=timezone.utc)


def test_project_payload_rejects_blank_names():
    with pytest.raises(ValidationError):
        ProjectCreate(name="   ")
    with pytest.raises(ValidationError):
        ProjectUpdate(name="   ")
    with pytest.raises(ValidationError):
        ProjectUpdate(name=None)


def test_project_payload_normalizes_user_text():
    payload = ProjectCreate(name="  Safety Lab  ", description="  screening notes  ")
    assert payload.name == "Safety Lab"
    assert payload.description == "screening notes"

    empty_description = ProjectCreate(name="Safety Lab", description="   ")
    assert empty_description.description is None


@pytest.mark.asyncio
async def test_create_project_persists_and_returns_the_backend_identity():
    db = FakeSession()
    result = await create_project(
        ProjectCreate(name="  Safety Lab  ", description="  screening notes  "),
        db,
    )

    assert db.commits == 1
    assert db.added.name == "Safety Lab"
    assert db.added.description == "screening notes"
    assert result.id == 42
    assert result.name == "Safety Lab"
