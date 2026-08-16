"""Collect endpoint-specific reference evidence from NICEATM ICE.

This is a staging collector. It does NOT turn an ICE response into a RalphGuard
training label automatically. RalphGuard queries one InChIKey per request so
all returned records are provenance-bound to one exact registry molecule.

Run inside backend container:
    python scripts/collect_nice_reference_evidence.py --endpoint all --limit 1500

Outputs (persisted through ./data:/data):
    /data/staging/nice_reference_evidence.jsonl
    /data/staging/nice_reference_summary.json
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from typing import Any

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.ingredient_registry import IngredientRegistry

ICE_SEARCH_URL = "https://ice.ntp.niehs.nih.gov/api/v1/search"
DEFAULT_OUTPUT = Path("/data/staging/nice_reference_evidence.jsonl")
DEFAULT_SUMMARY = Path("/data/staging/nice_reference_summary.json")

# Direct/reference assays only. CATMoS is intentionally excluded because it is
# itself an in-silico prediction and must not masquerade as direct in-vivo data.
ENDPOINT_ASSAYS: dict[str, tuple[str, ...]] = {
    "skin": ("Rabbit Draize Skin Irritation/Corrosion Test",),
    "eye": ("Rabbit Draize Eye Irritation/Corrosion Test",),
    "sens": ("Murine Local Lymph Node Assay (LLNA)", "Guinea Pig Maximization/Buehler"),
    "acute": ("Rat Acute Oral Toxicity",),
}


def _first(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = record.get(key)
        if value is not None and value != "":
            return value
    return None


def request_with_retry(client: httpx.Client, inchikey: str, assays: list[str], max_attempts: int = 5) -> dict[str, Any]:
    delay = 1.0
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.post(ICE_SEARCH_URL, json={"chemids": [inchikey], "assays": assays})
            if response.status_code == 429 or response.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"ICE temporary response {response.status_code}",
                    request=response.request,
                    response=response,
                )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("ICE response is not a JSON object")
            return payload
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            if attempt >= max_attempts:
                break
            time.sleep(delay)
            delay = min(delay * 2, 16.0)
    raise RuntimeError(f"ICE request failed after {max_attempts} attempts: {last_error}")


def endpoint_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Return endpoint records while tolerating harmless API key casing changes."""
    raw = payload.get("endPoints")
    if raw is None:
        raw = payload.get("endpoints")
    if raw is None:
        raw = payload.get("end_points")
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", choices=["all", *ENDPOINT_ASSAYS.keys()], default="all")
    parser.add_argument("--limit", type=int, default=1500)
    parser.add_argument("--timeout", type=float, default=45.0)
    parser.add_argument("--request-delay", type=float, default=0.10, help="polite delay in seconds between successful ICE queries")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()

    if args.limit < 1:
        raise ValueError("--limit must be >= 1")
    if args.request_delay < 0:
        raise ValueError("--request-delay must be >= 0")

    selected_endpoints = list(ENDPOINT_ASSAYS) if args.endpoint == "all" else [args.endpoint]
    selected_assays = sorted({assay for endpoint in selected_endpoints for assay in ENDPOINT_ASSAYS[endpoint]})
    assay_to_endpoint = {assay: endpoint for endpoint in selected_endpoints for assay in ENDPOINT_ASSAYS[endpoint]}

    with SessionLocal() as db:
        registry = list(
            db.scalars(
                select(IngredientRegistry)
                .where(
                    IngredientRegistry.inchikey.is_not(None),
                    IngredientRegistry.structure_status == "resolved",
                    IngredientRegistry.substance_type == "defined_single_substance",
                    IngredientRegistry.qsar_eligible.is_(True),
                )
                .order_by(IngredientRegistry.id.asc())
                .limit(args.limit)
            )
        )

    unique_registry: dict[str, IngredientRegistry] = {}
    for row in registry:
        inchikey = str(row.inchikey or "").strip()
        if inchikey and inchikey not in unique_registry:
            unique_registry[inchikey] = row
    ingredients = list(unique_registry.values())

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.summary.parent.mkdir(parents=True, exist_ok=True)

    collected_at = datetime.now(timezone.utc).isoformat()
    rows_written = 0
    unmatched_assay_records = 0
    records_without_assay = 0
    records_by_endpoint = {endpoint: 0 for endpoint in selected_endpoints}
    chemicals_with_records: set[str] = set()
    queries_total = 0
    queries_failed = 0
    failures: list[dict[str, Any]] = []

    headers = {
        "User-Agent": "RalphGuard-NSC2026/1.0 reference-evidence-collector",
        "Accept": "application/json",
    }
    timeout = httpx.Timeout(args.timeout)

    with args.output.open("w", encoding="utf-8") as handle, httpx.Client(
        timeout=timeout,
        headers=headers,
        follow_redirects=True,
    ) as client:
        for index, registry_row in enumerate(ingredients, start=1):
            query_inchikey = str(registry_row.inchikey or "").strip()
            if not query_inchikey:
                continue
            queries_total += 1
            try:
                payload = request_with_retry(client, query_inchikey, selected_assays)
            except RuntimeError as exc:
                queries_failed += 1
                failures.append({"registry_id": registry_row.id, "inchikey": query_inchikey, "error": str(exc)})
                continue

            chemical_record_count = 0
            for record in endpoint_records(payload):
                assay = str(_first(record, "assay", "assayName", "assay_name") or "").strip()
                if not assay:
                    records_without_assay += 1
                    continue
                endpoint = assay_to_endpoint.get(assay)
                if endpoint is None:
                    unmatched_assay_records += 1
                    continue

                normalized = {
                    "collected_at": collected_at,
                    "source_system": "NICEATM Integrated Chemical Environment (ICE)",
                    "source_api": ICE_SEARCH_URL,
                    "ralphguard_endpoint": endpoint,
                    "assay": assay,
                    "query_inchikey": query_inchikey,
                    "registry_id": registry_row.id,
                    "registry_name": registry_row.canonical_name,
                    "registry_canonical_smiles": registry_row.canonical_smiles,
                    "registry_inchikey": registry_row.inchikey,
                    "ice_casrn": _first(record, "casrn", "cas", "CASRN"),
                    "ice_dtxsid": _first(record, "dtxsid", "dsstoxsid", "DTXSID"),
                    "ice_substance_name": _first(record, "substanceName", "substance", "name", "chemicalName"),
                    "ice_endpoint": _first(record, "endpoint", "endpointName", "endpoint_name"),
                    "ice_value": _first(record, "value", "result", "endpointValue", "endpoint_value"),
                    "ice_unit": _first(record, "unit", "units", "unitName", "unit_name"),
                    "training_label": None,
                    "review_status": "staging_unmapped",
                    "raw_record": record,
                }
                handle.write(json.dumps(normalized, ensure_ascii=False) + "\n")
                rows_written += 1
                chemical_record_count += 1
                records_by_endpoint[endpoint] += 1

            if chemical_record_count:
                chemicals_with_records.add(query_inchikey)
            if args.request_delay:
                time.sleep(args.request_delay)
            if index % 100 == 0:
                print(
                    f"ICE progress {index}/{len(ingredients)} | records={rows_written} | failures={queries_failed}",
                    flush=True,
                )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": ICE_SEARCH_URL,
        "selected_endpoints": selected_endpoints,
        "selected_assays": selected_assays,
        "registry_candidates": len(ingredients),
        "queries_total": queries_total,
        "queries_failed": queries_failed,
        "records_written": rows_written,
        "records_by_endpoint": records_by_endpoint,
        "chemicals_with_records": len(chemicals_with_records),
        "records_without_assay": records_without_assay,
        "unmatched_assay_records": unmatched_assay_records,
        "training_labels_created": 0,
        "status": "staging_only_requires_endpoint_mapping_review",
        "identity_policy": "one ICE request per exact registry InChIKey",
        "excluded_prediction_assays": ["CATMoS, Rat Acute Oral Toxicity"],
        "failures": failures,
        "output": str(args.output),
    }
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if queries_failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
