"""Project schemas."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

ProjectColorKey = Literal[
    "teal",
    "cyan",
    "blue",
    "indigo",
    "violet",
    "emerald",
    "amber",
    "slate",
    "rose",
    "orange",
]
ProjectIconKey = Literal[
    "flask",
    "beaker",
    "test-tube",
    "microscope",
    "shield",
    "droplets",
    "atom",
    "leaf",
    "heart-pulse",
    "clipboard-check",
]


def _normalized_project_name(value: Optional[str]) -> str:
    if value is None:
        raise ValueError("project name must not be blank")
    normalized = value.strip()
    if not normalized:
        raise ValueError("project name must not be blank")
    return normalized


def _normalized_description(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    color_key: ProjectColorKey = "teal"
    icon_key: ProjectIconKey = "flask"

    _normalize_name = field_validator("name")(_normalized_project_name)
    _normalize_description = field_validator("description")(_normalized_description)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    color_key: Optional[ProjectColorKey] = None
    icon_key: Optional[ProjectIconKey] = None

    _normalize_name = field_validator("name")(_normalized_project_name)
    _normalize_description = field_validator("description")(_normalized_description)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    color_key: ProjectColorKey
    icon_key: ProjectIconKey
    created_at: datetime
    updated_at: datetime
