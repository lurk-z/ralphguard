"""Copy a bounded, endpoint-balanced slice of the ingredient registry to another database.

The development database holds ~189,000 verified structures with ~468,000
evidence rows (about 940 MB), which does not fit a Render free-tier instance.
This script selects a fixed number of substances, keeps the four endpoints as
evenly represented as the data allows, and copies those substances together
with their evidence so hover cards keep their sourced hazard context.

Endpoint balance is limited by the data itself: skin, eye and acute each have
over 119,000 substances, but sensitisation has only ~8,400. The selector takes
the scarcest endpoint first and then fills the remaining budget round-robin, so
sensitisation is never crowded out by the abundant endpoints.

Safety
------
* the target is taken from the ``TARGET_DATABASE_URL`` environment variable so
  a production connection string is never typed on a command line or committed
* nothing is deleted or overwritten: existing target rows are left untouched
  and matching substances are skipped
* ``--confirm`` is required to write; without it the script only reports what
  it would do
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from typing import Any

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = (
        "postgresql://ralphguard:ralphguard_dev@localhost:5432/ralphguard"
    )

from app.models.ingredient_registry import (  # noqa: E402
    ExperimentalEvidence,
    IngredientRegistry,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = REPO_ROOT / "data" / "curated" / "registry_sync_report.json"

REGISTRY_FIELDS = (
    "normalized_name", "inci_name", "canonical_name", "thai_names", "synonyms",
    "cas_number", "pubchem_cid", "canonical_smiles", "inchi", "inchikey",
    "molecular_formula", "molecular_weight", "substance_type", "structure_status",
    "qsar_eligible", "assessment_method", "regulatory_status_th", "provenance",
    "verification_status", "registry_version", "observation_count",
)
EVIDENCE_FIELDS = (
    "pubchem_cid", "endpoint", "candidate_label", "evidence_type", "hazard_codes",
    "source_name", "source_id", "source_url", "source_quality",
    "evidence_fingerprint", "raw_evidence", "provenance", "review_status",
    "reviewer_note",
)


def select_balanced_substances(source: Session, budget: int) -> tuple[list[int], dict[str, int]]:
    """Choose ``budget`` substance ids keeping endpoint coverage as even as possible."""
    rows = source.execute(
        select(ExperimentalEvidence.endpoint, ExperimentalEvidence.ingredient_id)
        .distinct()
        .join(IngredientRegistry, IngredientRegistry.id == ExperimentalEvidence.ingredient_id)
        .where(
            IngredientRegistry.verification_status == "verified",
            IngredientRegistry.canonical_smiles.is_not(None),
            func.length(func.trim(IngredientRegistry.canonical_smiles)) > 0,
        )
        # A stable order makes the selection reproducible across runs.
        .order_by(ExperimentalEvidence.endpoint, ExperimentalEvidence.ingredient_id)
    ).all()

    by_endpoint: dict[str, list[int]] = defaultdict(list)
    for endpoint, ingredient_id in rows:
        by_endpoint[endpoint].append(ingredient_id)

    # Scarcest endpoint first: it would otherwise lose every round-robin turn
    # to endpoints holding twenty times more substances.
    order = sorted(by_endpoint, key=lambda name: len(by_endpoint[name]))
    cursors = {name: 0 for name in order}
    selected: list[int] = []
    seen: set[int] = set()

    while len(selected) < budget:
        progressed = False
        for endpoint in order:
            if len(selected) >= budget:
                break
            pool = by_endpoint[endpoint]
            index = cursors[endpoint]
            while index < len(pool) and pool[index] in seen:
                index += 1
            cursors[endpoint] = index
            if index >= len(pool):
                continue
            ingredient_id = pool[index]
            cursors[endpoint] = index + 1
            seen.add(ingredient_id)
            selected.append(ingredient_id)
            progressed = True
        if not progressed:
            break  # every endpoint pool is exhausted

    coverage = {
        endpoint: sum(1 for ingredient_id in pool if ingredient_id in seen)
        for endpoint, pool in by_endpoint.items()
    }
    return selected, coverage


def copy_batch(
    source: Session,
    target: Session,
    ingredient_ids: list[int],
    *,
    write: bool,
    totals: dict[str, int],
) -> None:
    rows = source.scalars(
        select(IngredientRegistry).where(IngredientRegistry.id.in_(ingredient_ids))
    ).all()
    if not rows:
        return

    # Existing target rows win: this script adds coverage, it never rewrites a
    # substance an operator may already have curated on the target.
    names = [row.normalized_name for row in rows]
    new_rows_by_source_id: dict[int, IngredientRegistry] = {}

    id_map: dict[int, int] = {}
    # Existing ids come back in the same single round trip as the presence
    # check. Asking per row costs one internet round trip per substance, which
    # dominates the runtime once the target is a remote database.
    existing_ids = dict(
        target.execute(
            select(IngredientRegistry.normalized_name, IngredientRegistry.id).where(
                IngredientRegistry.normalized_name.in_(names)
            )
        ).all()
    )
    present = set(existing_ids)

    fresh_parents: set[int] = set()
    for row in rows:
        if row.normalized_name in present:
            totals["substances_already_present"] += 1
            id_map[row.id] = existing_ids[row.normalized_name]
            continue
        if not write:
            totals["substances_copied"] += 1
            continue
        new_row = IngredientRegistry(
            **{field: getattr(row, field) for field in REGISTRY_FIELDS}
        )
        target.add(new_row)
        id_map[row.id] = -row.id  # placeholder resolved by the flush below
        fresh_parents.add(row.id)
        totals["substances_copied"] += 1
        new_rows_by_source_id[row.id] = new_row

    if write and new_rows_by_source_id:
        target.flush()
        for source_id, new_row in new_rows_by_source_id.items():
            id_map[source_id] = new_row.id

    evidence_rows = source.scalars(
        select(ExperimentalEvidence).where(
            ExperimentalEvidence.ingredient_id.in_(ingredient_ids)
        )
    ).all()
    # A substance created in this batch cannot already own evidence on the
    # target, so only pre-existing parents need a duplicate check — and that
    # check is done once for the whole batch rather than once per row.
    reused_parent_ids = [
        target_id
        for source_id, target_id in id_map.items()
        if source_id not in fresh_parents and target_id > 0
    ]
    existing_keys: set[tuple[int, str, str]] = set()
    if reused_parent_ids:
        existing_keys = set(
            target.execute(
                select(
                    ExperimentalEvidence.ingredient_id,
                    ExperimentalEvidence.endpoint,
                    ExperimentalEvidence.evidence_fingerprint,
                ).where(ExperimentalEvidence.ingredient_id.in_(reused_parent_ids))
            ).all()
        )

    for evidence in evidence_rows:
        target_ingredient_id = id_map.get(evidence.ingredient_id)
        if target_ingredient_id is None or target_ingredient_id < 0:
            if not write:
                totals["evidence_copied"] += 1
            else:
                totals["evidence_skipped_no_parent"] += 1
            continue
        key = (target_ingredient_id, evidence.endpoint, evidence.evidence_fingerprint)
        if key in existing_keys:
            totals["evidence_already_present"] += 1
            continue
        if write:
            target.add(
                ExperimentalEvidence(
                    ingredient_id=target_ingredient_id,
                    **{field: getattr(evidence, field) for field in EVIDENCE_FIELDS},
                )
            )
        totals["evidence_copied"] += 1

    if write:
        target.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--substances", type=int, default=50_000)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="actually write to the target database; omit for a plan-only run",
    )
    parser.add_argument("--report", default=str(REPORT_PATH))
    args = parser.parse_args()
    if args.substances < 1:
        parser.error("--substances must be positive")
    if args.batch_size < 1:
        parser.error("--batch-size must be positive")

    target_url = os.environ.get("TARGET_DATABASE_URL", "").strip()
    if not target_url:
        print(
            "TARGET_DATABASE_URL is not set. Export the target connection string "
            "in the shell that runs this script so it is never passed as an argument.",
            file=sys.stderr,
        )
        return 2

    source_engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    target_engine = create_engine(target_url, pool_pre_ping=True)
    SourceSession = sessionmaker(bind=source_engine, autoflush=False, autocommit=False)
    TargetSession = sessionmaker(bind=target_engine, autoflush=False, autocommit=False)

    totals = {
        "substances_selected": 0,
        "substances_copied": 0,
        "substances_already_present": 0,
        "evidence_copied": 0,
        "evidence_already_present": 0,
        "evidence_skipped_no_parent": 0,
    }

    with SourceSession() as source, TargetSession() as target:
        before = target.scalar(select(func.count(IngredientRegistry.id))) or 0
        selected, coverage = select_balanced_substances(source, args.substances)
        totals["substances_selected"] = len(selected)

        print(f"target already holds {before} substances")
        print(f"selected {len(selected)} substances; endpoint coverage: {coverage}")
        if not args.confirm:
            print("\nplan-only run — pass --confirm to write to the target database")

        for start in range(0, len(selected), args.batch_size):
            batch = selected[start : start + args.batch_size]
            copy_batch(source, target, batch, write=args.confirm, totals=totals)
            done = min(start + args.batch_size, len(selected))
            print(f"  {done}/{len(selected)} substances processed", flush=True)

        after = target.scalar(select(func.count(IngredientRegistry.id))) or 0

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_write": bool(args.confirm),
        "requested_substances": args.substances,
        "target_substances_before": before,
        "target_substances_after": after,
        "endpoint_coverage": coverage,
        "totals": totals,
        "selection_policy": (
            "verified substances with a canonical structure, chosen round-robin "
            "across endpoints starting from the scarcest so sensitisation is not "
            "crowded out; existing target rows are never modified"
        ),
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    print(f"report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
