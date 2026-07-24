"""Import and screen 1,000+ PubChem GHS compounds into RalphGuard.

Run inside the backend container so RDKit and the database connection are
identical to the API runtime:

    docker compose exec backend python scripts/import_global_pubchem_ghs.py --target 1000
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rdkit import RDLogger

RDLogger.DisableLog("rdApp.*")

from app.db.session import SessionLocal
from app.services.pubchem_evidence import (
    fetch_global_ghs_page,
    fetch_pubchem_properties_by_cids,
    parse_global_ghs_annotations,
    promote_consensus_evidence,
    screen_pubchem_property,
    upsert_global_compound_evidence,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=1000, help="minimum screened unique structures")
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--min-consensus-sources", type=int, default=2)
    args = parser.parse_args()
    if args.target < 1 or args.max_pages < 1:
        parser.error("target and max-pages must be positive")

    accepted_registry_ids: set[int] = set()
    seen_cids: set[int] = set()
    filter_reasons: Counter[str] = Counter()
    evidence_by_endpoint: Counter[str] = Counter()
    totals = Counter()

    with SessionLocal() as db:
        for page in range(args.start_page, args.start_page + args.max_pages):
            payload = fetch_global_ghs_page(page)
            annotations = parse_global_ghs_annotations(payload)
            grouped: dict[int, list[dict]] = defaultdict(list)
            for evidence in annotations:
                grouped[evidence["pubchem_cid"]].append(evidence)
            page_cids = sorted(set(grouped).difference(seen_cids))
            seen_cids.update(page_cids)
            totals["annotation_rows"] += len(annotations)
            totals["raw_unique_cids"] += len(page_cids)
            if not page_cids:
                print(f"page={page}: no new endpoint CIDs")
                continue

            property_rows = fetch_pubchem_properties_by_cids(page_cids)
            properties_by_cid = {int(row["CID"]): row for row in property_rows}
            totals["property_resolved"] += len(properties_by_cid)
            page_accepted: set[int] = set()
            page_evidence = 0
            for cid in page_cids:
                properties = properties_by_cid.get(cid)
                if properties is None:
                    filter_reasons["property_not_found"] += 1
                    continue
                profile, reason = screen_pubchem_property(properties)
                if profile is None:
                    filter_reasons[reason or "unknown"] += 1
                    continue
                row, imported, existing = upsert_global_compound_evidence(
                    db, profile, grouped[cid]
                )
                page_accepted.add(row.id)
                accepted_registry_ids.add(row.id)
                page_evidence += imported
                totals["evidence_imported"] += imported
                totals["evidence_existing"] += existing
                for evidence in grouped[cid]:
                    evidence_by_endpoint[evidence["endpoint"]] += 1
            db.commit()
            totals["pages_processed"] += 1
            print(
                f"page={page} raw_cids={len(page_cids)} accepted_structures={len(page_accepted)} "
                f"evidence_imported={page_evidence} cumulative_structures={len(accepted_registry_ids)}",
                flush=True,
            )
            if len(accepted_registry_ids) >= args.target:
                break

        consensus = promote_consensus_evidence(
            db, min_sources=max(2, args.min_consensus_sources)
        )
        db.commit()

    summary = {
        "target": args.target,
        "screened_unique_structures": len(accepted_registry_ids),
        **dict(totals),
        "evidence_by_endpoint": dict(sorted(evidence_by_endpoint.items())),
        "filtered": dict(filter_reasons.most_common()),
        "consensus_promotion": consensus,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if len(accepted_registry_ids) < args.target:
        raise SystemExit(
            f"Only {len(accepted_registry_ids)} structures passed; increase --max-pages"
        )


if __name__ == "__main__":
    main()
