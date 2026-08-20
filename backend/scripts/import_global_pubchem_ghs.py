"""Import and screen PubChem GHS compounds into RalphGuard.

Run inside the backend container so RDKit and the database connection are
identical to the API runtime:

    docker compose exec backend python scripts/import_global_pubchem_ghs.py --target 1000
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rdkit import RDLogger

RDLogger.DisableLog("rdApp.*")

from app.db.session import SessionLocal
from app.core.endpoints import ENDPOINT_META
from app.services.pubchem_evidence import (
    fetch_global_hazard_class_page,
    fetch_global_ghs_page,
    fetch_pubchem_properties_by_cids,
    parse_global_hazard_class_annotations,
    parse_global_ghs_annotations,
    promote_consensus_evidence,
    promote_single_regulatory_evidence,
    screen_pubchem_property,
    upsert_global_compound_evidence,
)


TARGET_ENDPOINTS = tuple(ENDPOINT_META)
RUN_HISTORY_FIELDS = (
    "generated_at",
    "annotation_heading",
    "start_page",
    "last_page_processed",
    "pages_processed",
    "screened_unique_structures",
    "screened_unique_structures_by_endpoint",
    "evidence_imported",
    "evidence_existing",
)


def endpoint_coverage(
    accepted_by_endpoint: dict[str, set[int]],
    target_per_endpoint: int,
) -> dict:
    """Return screened unique-structure coverage without inventing labels."""
    counts = {
        endpoint: len(accepted_by_endpoint.get(endpoint, set()))
        for endpoint in TARGET_ENDPOINTS
    }
    gaps = {
        endpoint: max(0, target_per_endpoint - count)
        for endpoint, count in counts.items()
    }
    return {
        "target_per_endpoint": target_per_endpoint,
        "screened_unique_structures_by_endpoint": counts,
        "gaps_by_endpoint": gaps,
        "minimum_met": target_per_endpoint <= 0 or all(gap == 0 for gap in gaps.values()),
    }


def prior_run_history(report_path: Path | None) -> list[dict]:
    """Preserve compact provenance when a continuation overwrites the report."""
    if report_path is None or not report_path.exists():
        return []
    try:
        previous = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    history = previous.get("prior_runs") if isinstance(previous, dict) else None
    compact = list(history) if isinstance(history, list) else []
    if isinstance(previous, dict):
        current = {
            key: previous[key]
            for key in RUN_HISTORY_FIELDS
            if key in previous
        }
        if current:
            compact.append(current)
    return compact[-20:]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=1000, help="minimum screened unique structures")
    parser.add_argument(
        "--target-per-endpoint",
        type=int,
        default=0,
        help=(
            "minimum screened unique structures carrying evidence for each of "
            "skin, eye, sens, acute, and skin_dryness; 0 disables this additional gate"
        ),
    )
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument(
        "--annotation-heading",
        choices=("ghs", "hazard-classes"),
        default="ghs",
        help=(
            "PubChem annotation collection to import: GHS hazard statements "
            "or explicit Hazard Classes and Categories"
        ),
    )
    parser.add_argument(
        "--process-all-pages",
        action="store_true",
        help="process the complete requested page window even if coverage targets are already met",
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="optional JSON path for a reproducible coverage/import report",
    )
    parser.add_argument("--min-consensus-sources", type=int, default=2)
    parser.add_argument(
        "--include-single-regulatory",
        action="store_true",
        help="export positive GHS codes from one regulatory source as weight-0.25 weak labels",
    )
    parser.add_argument(
        "--allow-under-target",
        action="store_true",
        help="write the coverage report and continue so the final training-integrity gate can decide",
    )
    args = parser.parse_args()
    if args.target < 1 or args.target_per_endpoint < 0 or args.start_page < 1 or args.max_pages < 1:
        parser.error("target/start-page/max-pages must be positive and target-per-endpoint cannot be negative")

    previous_runs = prior_run_history(args.report)
    accepted_registry_ids: set[int] = set()
    accepted_by_endpoint: dict[str, set[int]] = {
        endpoint: set() for endpoint in TARGET_ENDPOINTS
    }
    seen_cids: set[int] = set()
    filter_reasons: Counter[str] = Counter()
    evidence_by_endpoint: Counter[str] = Counter()
    totals = Counter()
    last_page_processed: int | None = None

    with SessionLocal() as db:
        for page in range(args.start_page, args.start_page + args.max_pages):
            last_page_processed = page
            if args.annotation_heading == "hazard-classes":
                payload = fetch_global_hazard_class_page(page)
                annotations = parse_global_hazard_class_annotations(payload)
            else:
                payload = fetch_global_ghs_page(page)
                annotations = parse_global_ghs_annotations(payload)
            annotation_root = payload.get("Annotations") or {}
            reported_total_pages = annotation_root.get("TotalPages")
            if reported_total_pages is not None:
                try:
                    totals["reported_total_pages"] = int(reported_total_pages)
                except (TypeError, ValueError):
                    pass
            grouped: dict[int, list[dict]] = defaultdict(list)
            for evidence in annotations:
                grouped[evidence["pubchem_cid"]].append(evidence)
            page_cids = sorted(set(grouped).difference(seen_cids))
            seen_cids.update(page_cids)
            totals["annotation_rows"] += len(annotations)
            totals["raw_unique_cids"] += len(page_cids)
            if not page_cids:
                print(f"page={page}: no new endpoint CIDs")
                if totals.get("reported_total_pages") and page >= totals["reported_total_pages"]:
                    print(
                        f"page={page}: reached PubChem-reported TotalPages={totals['reported_total_pages']}",
                        flush=True,
                    )
                    break
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
                    endpoint = evidence["endpoint"]
                    evidence_by_endpoint[endpoint] += 1
                    accepted_by_endpoint.setdefault(endpoint, set()).add(row.id)
            db.commit()
            totals["pages_processed"] += 1
            print(
                f"page={page} raw_cids={len(page_cids)} accepted_structures={len(page_accepted)} "
                f"evidence_imported={page_evidence} cumulative_structures={len(accepted_registry_ids)}",
                flush=True,
            )
            coverage = endpoint_coverage(accepted_by_endpoint, args.target_per_endpoint)
            if (
                not args.process_all_pages
                and len(accepted_registry_ids) >= args.target
                and coverage["minimum_met"]
            ):
                break
            if totals.get("reported_total_pages") and page >= totals["reported_total_pages"]:
                print(
                    f"page={page}: reached PubChem-reported TotalPages={totals['reported_total_pages']}",
                    flush=True,
                )
                break

        consensus = promote_consensus_evidence(
            db, min_sources=max(2, args.min_consensus_sources)
        )
        single_regulatory = (
            promote_single_regulatory_evidence(db)
            if args.include_single_regulatory
            else {"status": "not_requested"}
        )
        db.commit()

    coverage = endpoint_coverage(accepted_by_endpoint, args.target_per_endpoint)
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": args.target,
        "annotation_heading": args.annotation_heading,
        "start_page": args.start_page,
        "last_page_processed": last_page_processed,
        "process_all_pages": args.process_all_pages,
        "prior_runs": previous_runs,
        "screened_unique_structures": len(accepted_registry_ids),
        **coverage,
        **dict(totals),
        "evidence_by_endpoint": dict(sorted(evidence_by_endpoint.items())),
        "filtered": dict(filter_reasons.most_common()),
        "consensus_promotion": consensus,
        "single_regulatory_promotion": single_regulatory,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"report: {args.report}")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if len(accepted_registry_ids) < args.target or not coverage["minimum_met"]:
        message = (
            "PubChem coverage target was not met: "
            f"total={len(accepted_registry_ids)}/{args.target}, "
            f"endpoint_gaps={coverage['gaps_by_endpoint']}; increase --max-pages "
            "or lower the requested screened-evidence target. This importer does "
            "not fabricate negative labels from missing regulatory classifications."
        )
        if args.allow_under_target:
            print(f"WARNING: {message}", file=sys.stderr)
        else:
            raise SystemExit(message)


if __name__ == "__main__":
    main()
