"""index ingredient_registry.canonical_smiles

Structure lookups are on the hottest paths in the app: the substance hover card
resolves a profile by canonical SMILES, the ready-count tile counts distinct
structures, and label OCR matches resolved structures against the registry.
None of them had an index, so each one scanned the whole table. That was
tolerable at 1,336 rows and is not at 50,000.

Revision ID: 20260821_0010
Revises: 20260821_0009
Create Date: 2026-08-21
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20260821_0010"
down_revision: Union[str, None] = "20260821_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_ingredient_registry_canonical_smiles",
        "ingredient_registry",
        ["canonical_smiles"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ingredient_registry_canonical_smiles",
        table_name="ingredient_registry",
    )
