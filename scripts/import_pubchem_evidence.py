"""Stage PubChem GHS evidence for ingredients already stored in the registry.

The backend must be running and migrated.  Imported rows remain ``pending``;
review them through the API before exporting any training data.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import urllib.error
import urllib.request


def request_json(url: str, *, method: str = "GET", payload: dict | None = None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", "User-Agent": "RalphGuard evidence CLI"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def catalog_items(path: Path) -> list[tuple[str, str]]:
    """Read the deliberately simple name/SMILES objects in catalog.ts."""
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    matches = re.findall(
        r'\{\s*name:\s*"([^"]+)"\s*,\s*smiles:\s*"([^"]+)"\s*,\s*conc:',
        text,
    )
    return list(dict.fromkeys(matches))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--registry-id", type=int, action="append", dest="registry_ids")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--catalog", type=Path, default=Path("frontend/src/lib/catalog.ts"))
    parser.add_argument("--skip-catalog", action="store_true")
    args = parser.parse_args()
    base = args.api.rstrip("/")

    registry = request_json(f"{base}/api/substances/registry?limit=500")
    seed_stats = {"catalog_items": 0, "verified_exact_structure": 0, "skipped": 0}
    if not args.skip_catalog and not args.registry_ids:
        existing_names = {
            str(row.get("inci_name") or row.get("canonical_name") or "").casefold(): row
            for row in registry
        }
        for name, smiles in catalog_items(args.catalog):
            seed_stats["catalog_items"] += 1
            lookup_name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
            existing = existing_names.get(lookup_name.casefold())
            if existing and existing.get("pubchem_cid"):
                continue
            try:
                candidate = request_json(
                    f"{base}/api/substances/registry/lookup",
                    method="POST",
                    payload={"name": lookup_name, "refresh": True},
                )
                local_structure = request_json(
                    f"{base}/api/substances/validate",
                    method="POST",
                    payload={"smiles": smiles},
                )
                if (
                    local_structure.get("valid")
                    and local_structure.get("canonical") == candidate.get("canonical_smiles")
                    and candidate.get("substance_type") == "defined_single_substance"
                    and candidate.get("structure_status") == "resolved"
                ):
                    candidate = request_json(
                        f"{base}/api/substances/registry/{candidate['id']}/verify",
                        method="PATCH",
                        payload={
                            "action": "verify",
                            "canonical_name": candidate["canonical_name"],
                            "canonical_smiles": local_structure["canonical"],
                            "substance_type": "defined_single_substance",
                            "structure_status": "resolved",
                            "qsar_eligible": True,
                            "reviewer_note": "Catalog seed accepted only after exact canonical structure match with PubChem",
                        },
                    )
                    existing_names[lookup_name.casefold()] = candidate
                    seed_stats["verified_exact_structure"] += 1
                else:
                    seed_stats["skipped"] += 1
            except (urllib.error.HTTPError, urllib.error.URLError):
                seed_stats["skipped"] += 1
        registry = request_json(f"{base}/api/substances/registry?limit=500")
    if args.registry_ids:
        selected = {value for value in args.registry_ids}
        registry = [row for row in registry if row["id"] in selected]

    # Existing curated OCR matches often have a verified SMILES but no CID yet.
    # Enrich their identity first; remember_pubchem_candidate only fills missing
    # metadata and preserves the reviewer-approved QSAR decision.
    enriched: list[dict] = []
    for row in registry:
        if (
            row.get("verification_status") == "verified"
            and row.get("qsar_eligible")
            and row.get("substance_type") == "defined_single_substance"
            and not row.get("pubchem_cid")
        ):
            row = request_json(
                f"{base}/api/substances/registry/lookup",
                method="POST",
                payload={"name": row.get("inci_name") or row["canonical_name"], "refresh": True},
            )
        enriched.append(row)
    registry_ids = [
        row["id"]
        for row in enriched
        if row.get("verification_status") == "verified"
        and row.get("qsar_eligible")
        and row.get("substance_type") == "defined_single_substance"
        and row.get("pubchem_cid")
    ]

    totals = {"ingredients": 0, "imported": 0, "existing": 0, "by_endpoint": {}}
    for offset in range(0, len(registry_ids), 50):
        chunk = registry_ids[offset : offset + 50]
        results = request_json(
            f"{base}/api/substances/registry/evidence/pubchem/bulk",
            method="POST",
            payload={"registry_ids": chunk, "refresh": args.refresh},
        )
        for result in results:
            totals["ingredients"] += 1
            totals["imported"] += result["imported"]
            totals["existing"] += result["existing"]
            for endpoint, count in result["by_endpoint"].items():
                totals["by_endpoint"][endpoint] = totals["by_endpoint"].get(endpoint, 0) + count
    totals["catalog_seed"] = seed_stats
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    print("Imported evidence is pending. Verify individual evidence rows before training export.")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Backend returned HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')}") from exc
