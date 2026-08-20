"""Export a traceable Skin Dryness evidence/discovery pool from PostgreSQL.

The export includes source-attributed EUH066/AUH066 candidates when present
and fills the requested discovery-pool size with verified structure-only
registry identities marked unlabeled. Missing evidence is never label 0.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal
from app.models.ingredient_registry import ExperimentalEvidence, IngredientRegistry


def evidence_tier(row: ExperimentalEvidence) -> tuple[str, str, str]:
    if row.review_status == "verified":
        return "B", "curated_positive", "reviewed_positive"
    if row.review_status == "consensus_verified":
        return "C", "regulatory_weak_positive", "consensus_verified"
    return "D", "regulatory_weak_positive", "pending"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=10_000)
    parser.add_argument("--output", default="/data/staging/skin_dryness_candidates.csv")
    args = parser.parse_args()
    if args.target < 1:
        parser.error("--target must be positive")

    with SessionLocal() as db:
        evidence_rows = db.scalars(
            select(ExperimentalEvidence)
            .where(ExperimentalEvidence.endpoint == "skin_dryness")
            .order_by(ExperimentalEvidence.id)
        ).all()
        evidence_by_ingredient: dict[int, list[ExperimentalEvidence]] = {}
        for row in evidence_rows:
            evidence_by_ingredient.setdefault(row.ingredient_id, []).append(row)
        evidence_ids = set(evidence_by_ingredient)
        ingredients = db.scalars(
            select(IngredientRegistry)
            .where(
                IngredientRegistry.verification_status == "verified",
                IngredientRegistry.qsar_eligible.is_(True),
                IngredientRegistry.canonical_smiles.is_not(None),
                IngredientRegistry.inchikey.is_not(None),
            )
            .order_by(IngredientRegistry.id)
        ).all()

        selected = [row for row in ingredients if row.id in evidence_ids]
        selected_ids = {row.id for row in selected}
        selected.extend(row for row in ingredients if row.id not in selected_ids)
        selected = selected[: max(args.target, len(selected_ids))]
        records: list[dict] = []
        retrieved_at = datetime.now(timezone.utc).isoformat()
        for ingredient in selected:
            linked = evidence_by_ingredient.get(ingredient.id, [])
            if linked:
                for evidence in linked:
                    tier, quality, review_status = evidence_tier(evidence)
                    records.append({
                        "record_id": f"evidence:{evidence.id}",
                        "compound_name": ingredient.canonical_name,
                        "pubchem_cid": ingredient.pubchem_cid,
                        "cas_number": ingredient.cas_number,
                        "smiles": ingredient.canonical_smiles,
                        "endpoint": "skin_dryness",
                        "candidate_label": 1,
                        "label_status": "labeled",
                        "label_quality": quality,
                        "evidence_type": evidence.evidence_type,
                        "evidence_subtype": "regulatory_skin_dryness",
                        "hazard_codes": "|".join(evidence.hazard_codes or []),
                        "source_name": evidence.source_name,
                        "source_id": evidence.source_id,
                        "source_url": evidence.source_url,
                        "source_quality": evidence.source_quality,
                        "evidence_tier": tier,
                        "review_status": review_status,
                        "retrieved_at": retrieved_at,
                    })
            else:
                provenance = ingredient.provenance or {}
                records.append({
                    "record_id": f"registry:{ingredient.id}",
                    "compound_name": ingredient.canonical_name,
                    "pubchem_cid": ingredient.pubchem_cid,
                    "cas_number": ingredient.cas_number,
                    "smiles": ingredient.canonical_smiles,
                    "endpoint": "skin_dryness",
                    "candidate_label": None,
                    "label_status": "unlabeled",
                    "label_quality": "unlabeled",
                    "evidence_type": "structure_discovery_only",
                    "evidence_subtype": "",
                    "hazard_codes": "",
                    "source_name": str(provenance.get("provider") or "Ingredient Registry"),
                    "source_id": ingredient.pubchem_cid,
                    "source_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{ingredient.pubchem_cid}" if ingredient.pubchem_cid else "",
                    "source_quality": "identity_only",
                    "evidence_tier": "D",
                    "review_status": "pending",
                    "retrieved_at": retrieved_at,
                })

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "record_id", "compound_name", "pubchem_cid", "cas_number", "smiles",
        "endpoint", "candidate_label", "label_status", "label_quality",
        "evidence_type", "evidence_subtype", "hazard_codes", "source_name",
        "source_id", "source_url", "source_quality", "evidence_tier",
        "review_status", "retrieved_at",
    ]
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    report = {
        "generated_at": retrieved_at,
        "target": args.target,
        "rows": len(records),
        "unique_registry_ingredients": len(selected),
        "regulatory_candidate_rows": sum(row["candidate_label"] is not None for row in records),
        "unlabeled_rows": sum(row["candidate_label"] is None for row in records),
        "negative_rows": 0,
        "negative_policy": "absence of EUH066/AUH066 remains unlabeled",
        "output": str(output),
        "sha256": digest,
    }
    report_path = output.with_name("skin_dryness_pool_export_report.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
