"""Promote human-reviewed NICE/ICE evidence into curated supplemental CSVs.

A row is eligible only when all review fields are explicit:
- review_status=verified
- reviewed_label in {0,1}
- reviewed_by is non-empty
- reviewer_note is non-empty
- reviewed_at is non-empty

The exporter refuses exact identities with contradictory reviewed labels.
Candidate/production model files are never modified by this script.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import json
from pathlib import Path

DEFAULT_QUEUE = Path("/data/staging/nice_review_queue.csv")
DEFAULT_OUT = Path("/data/curated")
ENDPOINTS = ("skin", "eye", "sens", "acute")


def parse_binary(value: str) -> int | None:
    text = str(value or "").strip()
    if text in {"0", "0.0"}:
        return 0
    if text in {"1", "1.0"}:
        return 1
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if not args.queue.exists():
        raise FileNotFoundError(f"review queue not found: {args.queue}")

    reviewed: dict[str, list[dict]] = defaultdict(list)
    pending = 0
    rejection_reasons: Counter[str] = Counter()
    with args.queue.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            status = str(row.get("review_status") or "").strip().casefold()
            if status != "verified":
                pending += 1
                continue

            label = parse_binary(row.get("reviewed_label") or "")
            endpoint = str(row.get("endpoint") or "").strip()
            reviewed_by = str(row.get("reviewed_by") or "").strip()
            reviewer_note = str(row.get("reviewer_note") or "").strip()
            reviewed_at = str(row.get("reviewed_at") or "").strip()

            if label is None:
                rejection_reasons["missing_or_invalid_reviewed_label"] += 1
                continue
            if endpoint not in ENDPOINTS:
                rejection_reasons["invalid_endpoint"] += 1
                continue
            if not reviewed_by:
                rejection_reasons["missing_reviewed_by"] += 1
                continue
            if not reviewer_note:
                rejection_reasons["missing_reviewer_note"] += 1
                continue
            if not reviewed_at:
                rejection_reasons["missing_reviewed_at"] += 1
                continue

            row["label"] = label
            reviewed[endpoint].append(row)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict] = {}
    conflicts: list[dict] = []

    for endpoint in ENDPOINTS:
        rows = reviewed.get(endpoint, [])
        by_identity: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            key = str(row.get("inchikey") or "").strip() or str(row.get("smiles") or "").strip()
            if key:
                by_identity[key].append(row)
            else:
                rejection_reasons["missing_molecular_identity"] += 1

        clean: list[dict] = []
        for identity, identity_rows in sorted(by_identity.items()):
            labels = {int(item["label"]) for item in identity_rows}
            if len(labels) != 1:
                conflicts.append({"endpoint": endpoint, "identity": identity, "labels": sorted(labels)})
                continue

            first = identity_rows[0]
            clean.append(
                {
                    "smiles": first.get("smiles") or "",
                    "name": first.get("name") or "",
                    "label": int(first["label"]),
                    "source": "NICEATM ICE in-vivo reference evidence (human reviewed)",
                    "inchikey": identity,
                    "evidence_ids": first.get("staging_lines") or "[]",
                    "assays": first.get("assays") or "[]",
                    "reviewer_note": " | ".join(
                        sorted(
                            {
                                str(item.get("reviewer_note") or "").strip()
                                for item in identity_rows
                                if str(item.get("reviewer_note") or "").strip()
                            }
                        )
                    ),
                    "reviewed_by": " | ".join(
                        sorted(
                            {
                                str(item.get("reviewed_by") or "").strip()
                                for item in identity_rows
                                if str(item.get("reviewed_by") or "").strip()
                            }
                        )
                    ),
                    "reviewed_at": " | ".join(
                        sorted(
                            {
                                str(item.get("reviewed_at") or "").strip()
                                for item in identity_rows
                                if str(item.get("reviewed_at") or "").strip()
                            }
                        )
                    ),
                    "label_quality": "direct_in_vivo_reviewed",
                    "sample_weight": 1.0,
                }
            )

        out_path = args.out_dir / f"nice_verified_{endpoint}.csv"
        fields = [
            "smiles",
            "name",
            "label",
            "source",
            "inchikey",
            "evidence_ids",
            "assays",
            "reviewer_note",
            "reviewed_by",
            "reviewed_at",
            "label_quality",
            "sample_weight",
        ]
        with out_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(clean)

        manifest[endpoint] = {
            "verified_rows_after_review_gate": len(rows),
            "unique_reviewed_structures_exported": len(clean),
            "file": str(out_path),
        }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "queue": str(args.queue),
        "pending_or_unverified_rows": pending,
        "rejected_verified_rows_by_reason": dict(sorted(rejection_reasons.items())),
        "conflicting_reviewed_identities_excluded": conflicts,
        "endpoints": manifest,
        "review_gate": {
            "required_status": "verified",
            "required_fields": ["reviewed_label", "reviewed_by", "reviewer_note", "reviewed_at"],
        },
        "production_models_modified": False,
    }
    report_path = args.out_dir / "nice_verified_manifest.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if conflicts else 0


if __name__ == "__main__":
    raise SystemExit(main())
