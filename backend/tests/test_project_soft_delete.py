from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.api.projects import delete_project, restore_project


class FakeSession:
    def __init__(self, project):
        self.project = project
        self.commits = 0
        self.deleted = []

    def get(self, model, row_id):
        return self.project

    def commit(self):
        self.commits += 1

    def refresh(self, row):
        row.updated_at = datetime(2026, 7, 30, tzinfo=timezone.utc)

    def delete(self, row):
        self.deleted.append(row)


def project_row():
    return SimpleNamespace(
        id=7,
        name="Safety Lab",
        description=None,
        color_key="teal",
        icon_key="flask",
        created_at=datetime(2026, 7, 21, tzinfo=timezone.utc),
        updated_at=datetime(2026, 7, 21, tzinfo=timezone.utc),
        deleted_at=None,
        assessments=[SimpleNamespace(id="assessment-1")],
    )


@pytest.mark.asyncio
async def test_delete_project_is_soft_and_preserves_assessments():
    row = project_row()
    db = FakeSession(row)

    response = await delete_project(row.id, db)

    assert response.status_code == 204
    assert row.deleted_at is not None
    assert [item.id for item in row.assessments] == ["assessment-1"]
    assert db.deleted == []
    assert db.commits == 1


@pytest.mark.asyncio
async def test_restore_project_clears_deleted_at():
    row = project_row()
    row.deleted_at = datetime(2026, 7, 30, tzinfo=timezone.utc)
    db = FakeSession(row)

    restored = await restore_project(row.id, db)

    assert row.deleted_at is None
    assert restored.id == row.id
    assert restored.name == row.name
    assert db.commits == 1
