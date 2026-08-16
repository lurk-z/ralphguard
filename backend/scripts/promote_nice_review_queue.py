"""Promote human-reviewed NICE/ICE evidence into curated supplemental CSVs.

Only rows with review_status=verified and reviewed_label in {0,1} are exported.
The exporter refuses duplicate InChIKeys with conflicting reviewed labels.

Input:
    /data/staging/nice_review_queue.csv

Output:
    /data/curated/nice_verified_<endpoint>.csv

These files are consumed by the candidate-v2 trainer only. Production model
artifacts are never modified by this script.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import csv
from datetime import datetime, timezone
import json
from pathlib import Path

DEFAULT_QUEUE = Path("/data/staging/nice_review_queue.csv")
DEFAULT_OUT = Path("/data/curated")


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
    rejected = 0
    pending = 0
    with args.queue.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            status = str(row.get("review_status") or "").strip().casefold()
            if status != "verified":
                pending += 1
                continue
            label = parse_binary(row.get("reviewed_label") or "")
            endpoint = str(row.get("endpoint") or "").strip()
            if label is None or endpoint not in {"skin", "eye", "sens", "acute"}:
                rejected += 1
                continue
            row["label"] = label
            reviewed[endpoint].append(row)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict] = {}
    conflicts: list[dict] = []

    for endpoint in ("skin", "eye", "sens", "acute"):
        rows = reviewed.get(endpoint, [])
        by_identity: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            key = str(row.get("inchikey") or "").strip() or str(row.get("smiles") or "").strip()
            if key:
                by_identity[key].append(row)

        clean: list[dict] = []
        for identity, identity_rows in sorted(by_identity.items()):
            labels = {int(item["label"]) for item in identity_rows}
            if len(labels) != 1:
                conflicts.append({"endpoint": endpoint, "identity": identity, "labels": sorted(labels)})
                continue
            # Keep one reviewed identity per endpoint. Preserve audit provenance
            # by aggregating the staging-line references and reviewer notes.
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
                        sorted({str(item.get("reviewer_note") or "").strip() for item in identity_rows if str(item.get("reviewer_note") or "").strip()})
                    ),
                    "reviewed_by": " | ".join(
                        sorted({str(item.get("reviewed_by") or "").strip() for item in identity_rows if str(item.get("reviewed_by") or "").strip()})
                    ),
                    "reviewed_at": " | ".join(
                        sorted({str(item.get("reviewed_at") or "").strip() for item in identity_rows if str(item.get("reviewed_at") or "").strip()})
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
            "verified_rows": len(rows),
            "unique_reviewed_structures_exported": len(clean),
            "file": str(out_path),
        }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "queue": str(args.queue),
        "pending_or_unverified_rows": pending,
        "invalid_verified_rows": rejected,
        "conflicting_reviewed_identities_excluded": conflicts,
        "endpoints": manifest,
        "production_models_modified": False,
    }
    report_path = args.out_dir / "nice_verified_manifest.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if conflicts else 0


if __name__ == "__main__":
    raise SystemExit(main())
