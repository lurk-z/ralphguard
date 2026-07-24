"""Export verified ingredient identities into the offline clone seed.

This is a maintenance command. Runtime users do not need database/network
access to PubChem because Alembic imports the resulting CSV on first startup.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.ingredient_registry import IngredientRegistry


OUTPUT = BACKEND_ROOT / "data" / "ingredient_registry_seed.csv"
FIELDS = [
    "normalized_name",
    "inci_name",
    "canonical_name",
    "thai_names",
    "synonyms",
    "cas_number",
    "pubchem_cid",
    "canonical_smiles",
    "inchi",
    "inchikey",
    "molecular_formula",
    "molecular_weight",
    "substance_type",
    "structure_status",
    "qsar_eligible",
    "assessment_method",
    "regulatory_status_th",
    "provenance",
    "verification_status",
    "registry_version",
]


def encode_json(value: object, fallback: object) -> str:
    return json.dumps(value if value is not None else fallback, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        rows = db.execute(
            select(IngredientRegistry)
            .where(IngredientRegistry.verification_status == "verified")
            .order_by(IngredientRegistry.normalized_name)
        ).scalars().all()

    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            provenance = dict(row.provenance or {})
            provenance["offline_seed"] = "pubchem-registry-20260724-v1"
            writer.writerow(
                {
                    "normalized_name": row.normalized_name,
                    "inci_name": row.inci_name or "",
                    "canonical_name": row.canonical_name,
                    "thai_names": encode_json(row.thai_names, []),
                    "synonyms": encode_json(row.synonyms, []),
                    "cas_number": row.cas_number or "",
                    "pubchem_cid": row.pubchem_cid or "",
                    "canonical_smiles": row.canonical_smiles or "",
                    "inchi": row.inchi or "",
                    "inchikey": row.inchikey or "",
                    "molecular_formula": row.molecular_formula or "",
                    "molecular_weight": row.molecular_weight if row.molecular_weight is not None else "",
                    "substance_type": row.substance_type,
                    "structure_status": row.structure_status,
                    "qsar_eligible": "true" if row.qsar_eligible else "false",
                    "assessment_method": row.assessment_method,
                    "regulatory_status_th": encode_json(row.regulatory_status_th, None),
                    "provenance": encode_json(provenance, {}),
                    "verification_status": row.verification_status,
                    "registry_version": row.registry_version,
                }
            )

    print(f"exported={len(rows)} output={OUTPUT}")


if __name__ == "__main__":
    main()
