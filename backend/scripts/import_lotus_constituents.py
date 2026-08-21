"""Import referenced plant-constituent pairs for the Thai herbal catalogue.

Source
------
LOTUS (naturalproducts.net) publishes referenced structure-organism pairs into
Wikidata under CC0. Each pair is the statement ``compound (P703) found in
taxon`` carrying a literature reference, which is exactly the provenance the
herbal constituent layer needs.

Wikidata now serves this across **two** SPARQL endpoints: scholarly article
items were moved out of the main query service, so the occurrence statements
resolve on ``query.wikidata.org`` while the citation title/DOI/PMID for the
very same reference item only resolve on ``query-scholarly.wikidata.org``.
Querying one endpoint alone yields either structures without citations or
citations without structures.

What this script must never do
------------------------------
LOTUS records that a molecule was *reported in* a plant. That is an occurrence,
not a hazard measurement. This importer therefore:

* writes only ``HerbConstituent`` rows (``relationship_type='reported_constituent'``)
* never writes an endpoint label, score, or training row
* never creates ``IngredientRegistry`` entries and never sets ``qsar_eligible``;
  it only *links* to registry substances that were already verified elsewhere
* skips any pair that carries no literature reference

Treating "constituent X occurs in plant Y" as evidence that plant Y is
irritant would reintroduce exactly the surrogate-molecule reasoning the
project forbids for botanical extracts.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from typing import Any, Iterable

import httpx
from rdkit import Chem, RDLogger
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = (
        "postgresql://ralphguard:ralphguard_dev@localhost:5432/ralphguard"
    )

from app.models.herbal_registry import HerbalPlant, HerbConstituent  # noqa: E402
from app.models.ingredient_registry import IngredientRegistry  # noqa: E402

RDLogger.DisableLog("rdApp.*")

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = REPO_ROOT / "data" / "curated" / "lotus_constituents_import_report.json"

MAIN_SPARQL = "https://query.wikidata.org/sparql"
SCHOLARLY_SPARQL = "https://query-scholarly.wikidata.org/sparql"
SOURCE_NAME = "LOTUS referenced structure-organism pairs via Wikidata"
SOURCE_URL = "https://lotus.naturalproducts.net/"
SOURCE_LICENCE = "CC0 1.0 Universal"
# Wikidata asks automated clients to identify themselves with a contactable
# project name rather than a generic library user agent.
USER_AGENT = "RalphGuard/0.1 (NSC 2026 academic project; https://github.com/lurk-z/ralphguard)"

# Kept modest so the generated VALUES clause stays well inside the query
# service's URL length limit for GET requests.
REFERENCE_BATCH_SIZE = 100

OCCURRENCE_QUERY = """
SELECT DISTINCT ?compound ?compoundLabel ?smiles ?inchikey ?cid ?ref WHERE {
  ?taxon wdt:P225 %(taxon)s .
  ?compound p:P703 ?statement .
  ?statement ps:P703 ?taxon .
  ?compound wdt:P233 ?smiles .
  ?statement prov:wasDerivedFrom/pr:P248 ?ref .
  OPTIONAL { ?compound wdt:P235 ?inchikey . }
  OPTIONAL { ?compound wdt:P662 ?cid . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

REFERENCE_QUERY = """
SELECT ?ref ?title ?doi ?pmid ?published WHERE {
  VALUES ?ref { %(refs)s }
  OPTIONAL { ?ref rdfs:label ?title . FILTER(LANG(?title) = "en") }
  OPTIONAL { ?ref wdt:P356 ?doi . }
  OPTIONAL { ?ref wdt:P698 ?pmid . }
  OPTIONAL { ?ref wdt:P577 ?published . }
}
"""


def _sparql_literal(value: str) -> str:
    """Quote a taxon name for safe inclusion in a SPARQL query."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def run_sparql(client: httpx.Client, endpoint: str, query: str) -> list[dict[str, Any]]:
    response = client.get(
        endpoint,
        params={"query": query},
        headers={"Accept": "application/sparql-results+json"},
    )
    response.raise_for_status()
    payload = response.json()
    return payload.get("results", {}).get("bindings", [])


def _value(row: dict[str, Any], key: str) -> str | None:
    binding = row.get(key)
    if not binding:
        return None
    value = str(binding.get("value", "")).strip()
    return value or None


def canonical_structure(smiles: str) -> tuple[str, str] | None:
    """Return (canonical SMILES, InChIKey) or None when RDKit cannot parse it."""
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        return None
    try:
        return Chem.MolToSmiles(molecule, canonical=True), Chem.MolToInchiKey(molecule)
    except Exception:
        return None


def fetch_reference_metadata(
    client: httpx.Client, reference_uris: Iterable[str]
) -> dict[str, dict[str, str | None]]:
    """Resolve citation details from the scholarly subgraph.

    Article items are absent from the main query service, so this second call
    is what turns a bare reference URI into a checkable citation.
    """
    unique = sorted({uri for uri in reference_uris if uri})
    metadata: dict[str, dict[str, str | None]] = {}
    for start in range(0, len(unique), REFERENCE_BATCH_SIZE):
        batch = unique[start : start + REFERENCE_BATCH_SIZE]
        values = " ".join(
            "wd:" + uri.rsplit("/", 1)[-1] for uri in batch if uri.rsplit("/", 1)[-1]
        )
        try:
            rows = run_sparql(client, SCHOLARLY_SPARQL, REFERENCE_QUERY % {"refs": values})
        except httpx.HTTPError:
            # A citation lookup failure must not discard verified occurrences;
            # the pair is kept with its reference URI and flagged in the report.
            continue
        for row in rows:
            uri = _value(row, "ref")
            if not uri:
                continue
            metadata[uri] = {
                "title": _value(row, "title"),
                "doi": _value(row, "doi"),
                "pmid": _value(row, "pmid"),
                "published": _value(row, "published"),
            }
    return metadata


def format_citation(uri: str, meta: dict[str, str | None] | None) -> str:
    meta = meta or {}
    parts: list[str] = [SOURCE_NAME]
    if meta.get("title"):
        parts.append(str(meta["title"]))
    if meta.get("doi"):
        parts.append(f"doi:{meta['doi']}")
    if meta.get("pmid"):
        parts.append(f"PMID:{meta['pmid']}")
    parts.append(uri)
    return " | ".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--species-limit",
        type=int,
        default=0,
        help="process only the first N catalogued plants; 0 processes all",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="seconds to wait between taxon queries (be polite to Wikidata)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="query and report without writing any constituent row",
    )
    parser.add_argument("--report", default=str(REPORT_PATH))
    args = parser.parse_args()
    if args.delay < 0:
        parser.error("--delay cannot be negative")

    engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    per_species: list[dict[str, Any]] = []
    totals = {
        "species_queried": 0,
        "species_with_no_wikidata_taxon": 0,
        "pairs_returned": 0,
        "distinct_structures": 0,
        "pairs_without_parsable_structure": 0,
        "constituents_created": 0,
        "constituents_already_present": 0,
        "registry_links_made": 0,
        "references_resolved": 0,
        "references_unresolved": 0,
    }
    unmatched_species: list[str] = []

    with session_factory() as db, httpx.Client(
        timeout=120.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        plants = db.scalars(select(HerbalPlant).order_by(HerbalPlant.id)).all()
        if args.species_limit > 0:
            plants = plants[: args.species_limit]
        if not plants:
            print("No catalogued plants found. Run seed_thai_herbs.py first.", file=sys.stderr)
            return 2

        for plant in plants:
            taxon = plant.accepted_scientific_name.strip()
            # LOTUS keys on the bare binomial; the catalogue stores the full
            # name with its author citation ("Curcuma longa L.").
            binomial = " ".join(taxon.split()[:2])
            try:
                rows = run_sparql(
                    client,
                    MAIN_SPARQL,
                    OCCURRENCE_QUERY % {"taxon": _sparql_literal(binomial)},
                )
            except httpx.HTTPError as exc:
                per_species.append(
                    {"plant": taxon, "binomial": binomial, "error": str(exc)[:200]}
                )
                time.sleep(args.delay)
                continue

            totals["species_queried"] += 1
            totals["pairs_returned"] += len(rows)
            if not rows:
                totals["species_with_no_wikidata_taxon"] += 1
                unmatched_species.append(taxon)
                per_species.append({"plant": taxon, "binomial": binomial, "pairs": 0})
                time.sleep(args.delay)
                continue

            reference_metadata = fetch_reference_metadata(
                client, (_value(row, "ref") or "" for row in rows)
            )

            # A molecule reported by several papers comes back as one row per
            # citation. Collapse to one constituent per structure first: the
            # extra rows are additional *evidence for the same fact*, and the
            # session cannot deduplicate them itself because autoflush is off,
            # so pending inserts stay invisible to the lookup below.
            by_structure: dict[str, dict[str, Any]] = {}
            for row in rows:
                smiles = _value(row, "smiles")
                if not smiles:
                    continue
                structure = canonical_structure(smiles)
                if structure is None:
                    totals["pairs_without_parsable_structure"] += 1
                    continue
                canonical_smiles, inchikey = structure
                # Prefer the InChIKey RDKit derives from the structure we will
                # actually store over the one Wikidata reports for the item, so
                # the stored key always describes the stored molecule.
                cid = _value(row, "cid")
                entry = by_structure.setdefault(
                    inchikey,
                    {
                        "name": _value(row, "compoundLabel") or canonical_smiles,
                        "cid": int(cid) if cid and cid.isdigit() else None,
                        "citations": [],
                    },
                )
                reference_uri = _value(row, "ref") or ""
                meta = reference_metadata.get(reference_uri)
                if meta:
                    totals["references_resolved"] += 1
                else:
                    totals["references_unresolved"] += 1
                citation = format_citation(reference_uri, meta)
                if citation not in entry["citations"]:
                    entry["citations"].append(citation)

            created = 0
            existing = 0
            linked = 0
            for inchikey, entry in by_structure.items():
                # The table's unique constraint includes nullable columns, and
                # PostgreSQL treats NULLs as distinct, so it cannot make this
                # import idempotent on its own. Deduplicate explicitly.
                already = db.scalar(
                    select(HerbConstituent).where(
                        HerbConstituent.herb_id == plant.id,
                        HerbConstituent.inchikey == inchikey,
                    )
                )
                if already is not None:
                    existing += 1
                    continue

                registry_row = db.scalar(
                    select(IngredientRegistry).where(
                        IngredientRegistry.inchikey == inchikey
                    )
                )
                if registry_row is not None:
                    linked += 1

                citations = entry["citations"]
                if not args.dry_run:
                    db.add(
                        HerbConstituent(
                            herb_id=plant.id,
                            material_id=None,  # LOTUS reports species-level occurrence
                            compound_name=str(entry["name"])[:300],
                            ingredient_registry_id=registry_row.id if registry_row else None,
                            pubchem_cid=entry["cid"],
                            inchikey=inchikey,
                            relationship_type="reported_constituent",
                            evidence_source=" ;; ".join(citations),
                            evidence_strength=(
                                "multi_reference_occurrence"
                                if len(citations) > 1
                                else "referenced_occurrence"
                            ),
                        )
                    )
                created += 1
            totals["distinct_structures"] += len(by_structure)

            if not args.dry_run:
                db.commit()
            totals["constituents_created"] += created
            totals["constituents_already_present"] += existing
            totals["registry_links_made"] += linked
            per_species.append(
                {
                    "plant": taxon,
                    "binomial": binomial,
                    "pairs": len(rows),
                    "distinct_structures": len(by_structure),
                    "created": created,
                    "already_present": existing,
                    "registry_linked": linked,
                }
            )
            print(f"{taxon}: {len(rows)} pairs -> {created} new constituents")
            time.sleep(args.delay)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_name": SOURCE_NAME,
        "source_url": SOURCE_URL,
        "licence": SOURCE_LICENCE,
        "endpoints": {
            "occurrences": MAIN_SPARQL,
            "citations": SCHOLARLY_SPARQL,
            "note": (
                "Wikidata serves scholarly article items from a separate "
                "subgraph; citation metadata is unavailable from the main "
                "endpoint even though the reference URI resolves there."
            ),
        },
        "occurrence_query_sha256": hashlib.sha256(
            OCCURRENCE_QUERY.encode("utf-8")
        ).hexdigest(),
        "reference_query_sha256": hashlib.sha256(
            REFERENCE_QUERY.encode("utf-8")
        ).hexdigest(),
        "label_policy": (
            "occurrence evidence only; a reported constituent is never an "
            "endpoint label, a hazard score, or a training row, and no "
            "ingredient registry entry or QSAR eligibility is created here"
        ),
        "dry_run": bool(args.dry_run),
        "totals": totals,
        "species_without_wikidata_match": unmatched_species,
        "per_species": per_species,
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    print(f"report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
