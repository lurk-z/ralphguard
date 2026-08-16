"""Build a reviewer-facing queue from staged NICE/ICE in-vivo evidence.

Input:
    /data/staging/nice_reference_evidence.jsonl

Outputs:
    /data/staging/nice_review_queue.csv
    /data/staging/nice_harmonization_summary.json

The queue contains *candidate* labels only. Nothing is promoted to model
training until a reviewer explicitly sets review_status=verified and supplies
reviewed_label (0/1), then runs promote_nice_review_queue.py.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.nice_evidence import aggregate_endpoint

DEFAULT_INPUT = Path("/data/staging/nice_reference_evidence.jsonl")
DEFAULT_QUEUE = Path("/data/staging/nice_review_queue.csv")
DEFAULT_SUMMARY = Path("/data/staging/nice_harmonization_summary.json")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()

    if not args.input.exists():
        raise FileNotFoundError(f"staged NICE evidence not found: {args.input}")

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    invalid_json = 0
    with args.input.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                record = json.loads(text)
            except json.JSONDecodeError:
                invalid_json += 1
                continue
            inchikey = str(record.get("query_inchikey") or record.get("registry_inchikey") or "").strip()
            endpoint = str(record.get("ralphguard_endpoint") or "").strip()
            if not inchikey or endpoint not in {"skin", "eye", "sens", "acute"}:
                continue
            record["staging_line"] = line_number
            grouped[(inchikey, endpoint)].append(record)

    rows: list[dict] = []
    status_counts: Counter[str] = Counter()
    candidate_counts: Counter[str] = Counter()

    for (inchikey, endpoint), records in sorted(grouped.items()):
        result = aggregate_endpoint(records)
        first = records[0]
        candidate = result.get("candidate_label")
        status = str(result.get("mapping_status"))
        status_counts[status] += 1
        candidate_counts[str(candidate)] += 1

        mapped_records = result.get("records") or []
        rules = sorted({str(item.get("mapping_rule")) for item in mapped_records if item.get("mapping_rule")})
        assays = sorted({str(item.get("assay")) for item in records if item.get("assay")})
        source_ids = sorted({
            str(item.get("ice_dtxsid") or item.get("ice_casrn") or "").strip()
            for item in records
            if str(item.get("ice_dtxsid") or item.get("ice_casrn") or "").strip()
        })
        line_ids = [str(item.get("staging_line")) for item in records]

        rows.append(
            {
                "inchikey": inchikey,
                "smiles": first.get("registry_canonical_smiles") or "",
                "name": first.get("registry_name") or "",
                "endpoint": endpoint,
                "candidate_label": "" if candidate is None else int(candidate),
                "mapping_status": status,
                "mapping_reason": result.get("mapping_reason") or "",
                "mapping_rules": json.dumps(rules, ensure_ascii=False),
                "assays": json.dumps(assays, ensure_ascii=False),
                "record_count": int(result.get("record_count") or len(records)),
                "mapped_record_count": int(result.get("mapped_record_count") or 0),
                "source_identifiers": json.dumps(source_ids, ensure_ascii=False),
                "staging_lines": json.dumps(line_ids),
                # Human-review gate. Reviewer must fill these explicitly.
                "review_status": "pending",
                "reviewed_label": "",
                "reviewer_note": "",
                "reviewed_by": "",
                "reviewed_at": "",
            }
        )

    args.queue.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "inchikey",
        "smiles",
        "name",
        "endpoint",
        "candidate_label",
        "mapping_status",
        "mapping_reason",
        "mapping_rules",
        "assays",
        "record_count",
        "mapped_record_count",
        "source_identifiers",
        "staging_lines",
        "review_status",
        "reviewed_label",
        "reviewer_note",
        "reviewed_by",
        "reviewed_at",
    ]
    with args.queue.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input": str(args.input),
        "queue": str(args.queue),
        "raw_endpoint_groups": len(grouped),
        "review_queue_rows": len(rows),
        "invalid_json_lines": invalid_json,
        "mapping_status": dict(sorted(status_counts.items())),
        "candidate_label": dict(sorted(candidate_counts.items())),
        "verified_training_rows_created": 0,
        "human_review_required_before_promotion": True,
    }
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
