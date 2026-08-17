"""Export reviewer-approved PubChem evidence for ``data_prep.py``."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


FIELDS = [
    "smiles",
    "name",
    "label",
    "source",
    "pubchem_cid",
    "evidence_ids",
    "hazard_codes",
    "source_count",
    "source_quality",
    "review_statuses",
    "label_quality",
    "sample_weight",
]


def request_json(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": "RalphGuard training export CLI"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--output-dir", type=Path, default=Path("data/curated"))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, dict] = {}
    for endpoint in ("skin", "eye", "sens", "acute"):
        query = urllib.parse.urlencode({"endpoint": endpoint})
        payload = request_json(
            f"{args.api.rstrip('/')}/api/substances/training-evidence/export?{query}"
        )
        output = args.output_dir / f"pubchem_verified_{endpoint}.csv"
        with output.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
            writer.writeheader()
            for row in payload["rows"]:
                serializable = dict(row)
                for field in ("evidence_ids", "hazard_codes", "source_quality", "review_statuses"):
                    serializable[field] = json.dumps(serializable[field], ensure_ascii=False, sort_keys=True)
                writer.writerow(serializable)
        manifest[endpoint] = {key: payload[key] for key in payload if key != "rows"}
        manifest[endpoint]["file"] = str(output)

    manifest_path = args.output_dir / "pubchem_verified_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Backend returned HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')}") from exc
