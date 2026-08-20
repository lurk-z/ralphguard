"""Discover source-attributed Skin Dryness candidates from official ICSC cards.

The importer deliberately does *not* make records training eligible.  Exact
standardized ICSC dryness/defatting language creates a Tier-B review candidate;
an independent reviewer must still approve the observation before supervised
training.  Missing language is never converted to a negative label.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
from datetime import datetime, timezone
import hashlib
from html import unescape
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, quote
from urllib.request import Request, urlopen

from rdkit import Chem
from rdkit.Chem import Descriptors


BASE = Path(__file__).resolve().parents[1]
OUTPUT = BASE / "data" / "staging" / "skin_dryness_icsc_candidates.csv"
REPORT = BASE / "data" / "staging" / "skin_dryness_icsc_import_report.json"
SEARCH_URL = "https://chemicalsafety.ilo.org/dyn/icsc/showcard.listCards3"
PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name"
USER_AGENT = "RalphGuard/0.1 scientific evidence importer (source-attributed ICSC review candidates)"
ALLOWED_ATOMIC_NUMBERS = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53}

STANDARDIZED_PATTERNS = (
    ("icsc_dry_skin_symptom", re.compile(r"\bdry skin\b", re.I)),
    (
        "icsc_defatting_dryness_or_cracking",
        re.compile(r"\bdefats? the skin\b[^.]{0,160}\bdryness or cracking\b", re.I),
    ),
)


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _fetch(url: str, *, data: bytes | None = None, attempts: int = 4) -> bytes:
    for attempt in range(attempts):
        try:
            request = Request(url, data=data, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=60) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(1.5 * (2**attempt))
    raise RuntimeError("unreachable")


def _plain_text(raw_html: bytes) -> str:
    text = raw_html.decode("utf-8", errors="replace")
    text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _discover_card_links() -> tuple[dict[str, dict[str, str]], str]:
    body = urlencode(
        {
            "p_lang": "en",
            "p_text": "dry",
            "p_synonym": "",
            "p_cas_number": "",
            "p_un_number": "",
            "p_icsc_number": "",
        }
    ).encode("ascii")
    raw = _fetch(SEARCH_URL, data=body)
    html = raw.decode("utf-8", errors="replace")
    rows: dict[str, dict[str, str]] = {}
    pattern = re.compile(
        r"(?is)<a\s+href=\"([^\"]*p_card_id=(\d{4})[^\"]*)\"[^>]*>\s*\d{4}\s*</a>\s*</td>\s*<td>(.*?)</td>"
    )
    for relative_url, card_id, name_html in pattern.findall(html):
        name = _plain_text(name_html.encode("utf-8"))
        rows[card_id] = {
            "card_id": card_id,
            "compound_name": name.split(";")[0].strip(),
            "source_url": urljoin(SEARCH_URL, relative_url.replace("&amp;", "&")),
        }
    return rows, _sha256(raw)


def _parse_card(meta: dict[str, str]) -> dict[str, str] | None:
    raw = _fetch(meta["source_url"])
    text = _plain_text(raw)
    matches = [(subtype, pattern.search(text)) for subtype, pattern in STANDARDIZED_PATTERNS]
    matches = [(subtype, match) for subtype, match in matches if match]
    if not matches:
        return None
    subtype, match = max(matches, key=lambda item: len(item[1].group(0)))
    cas_match = re.search(r"\bCAS\s*#?\s*:\s*([0-9]{2,7}-[0-9]{2}-[0-9])\b", text, re.I)
    if not cas_match:
        return None
    start = max(0, match.start() - 180)
    end = min(len(text), match.end() + 180)
    context = text[start:end]
    return {
        **meta,
        "cas_number": cas_match.group(1),
        "evidence_subtype": subtype,
        "raw_evidence": context,
        "raw_sha256": _sha256(raw),
    }


def _resolve_pubchem(cas_number: str) -> dict[str, str | int] | None:
    properties = "ConnectivitySMILES,SMILES,InChI,InChIKey"
    url = f"{PUBCHEM}/{quote(cas_number, safe='')}/property/{properties}/JSON"
    try:
        payload = json.loads(_fetch(url).decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return None
    records = payload.get("PropertyTable", {}).get("Properties", [])
    if not records:
        return None
    item = records[0]
    smiles = item.get("SMILES") or item.get("ConnectivitySMILES")
    molecule = Chem.MolFromSmiles(str(smiles or ""))
    if molecule is None:
        return None
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    return {
        "pubchem_cid": int(item.get("CID") or 0),
        "raw_smiles": str(smiles),
        "canonical_smiles": canonical,
        "inchi": str(item.get("InChI") or ""),
        "inchikey": str(item.get("InChIKey") or ""),
        "qsar_eligible": bool(
            "." not in canonical
            and all(atom.GetAtomicNum() in ALLOWED_ATOMIC_NUMBERS for atom in molecule.GetAtoms())
            and 2 <= molecule.GetNumHeavyAtoms() <= 36
            and 30 <= Descriptors.MolWt(molecule) <= 500
        ),
    }


def import_icsc(*, refresh: bool = False, max_cards: int = 0) -> tuple[list[dict], dict]:
    if OUTPUT.exists() and REPORT.exists() and not refresh:
        with OUTPUT.open("r", encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        return rows, json.loads(REPORT.read_text(encoding="utf-8"))

    cards, search_sha256 = _discover_card_links()
    selected = list(cards.values())[: max_cards or None]
    matched: list[dict[str, str]] = []
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(_parse_card, meta): meta["card_id"] for meta in selected}
        for future in as_completed(futures):
            try:
                record = future.result()
                if record:
                    matched.append(record)
            except Exception:
                failures.append(futures[future])

    retrieved_at = datetime.now(timezone.utc).isoformat()
    output_rows: list[dict] = []
    unresolved = 0
    for record in sorted(matched, key=lambda item: item["card_id"]):
        resolved = _resolve_pubchem(record["cas_number"])
        time.sleep(0.12)
        if not resolved:
            unresolved += 1
            resolved = {
                "pubchem_cid": "",
                "raw_smiles": "",
                "canonical_smiles": "",
                "inchi": "",
                "inchikey": "",
                "qsar_eligible": False,
            }
        fingerprint_payload = {
            "source_id": f"ICSC:{record['card_id']}",
            "cas": record["cas_number"],
            "subtype": record["evidence_subtype"],
            "raw_sha256": record["raw_sha256"],
        }
        output_rows.append(
            {
                "record_id": f"icsc:{record['card_id']}",
                "compound_name": record["compound_name"],
                "pubchem_cid": resolved["pubchem_cid"],
                "cas_number": record["cas_number"],
                "raw_smiles": resolved["raw_smiles"],
                "canonical_smiles": resolved["canonical_smiles"],
                "smiles": resolved["canonical_smiles"],
                "inchi": resolved["inchi"],
                "inchikey": resolved["inchikey"],
                "endpoint": "skin_dryness",
                "candidate_label": 1,
                "label_status": "review_required",
                "label_quality": "expert_curated_candidate",
                "evidence_type": "expert_curated_safety_card",
                "evidence_subtype": record["evidence_subtype"],
                "hazard_codes": "",
                "measurement_type": "clinical dryness/defatting statement",
                "measurement_value": "",
                "measurement_unit": "",
                "baseline_value": "",
                "control_value": "",
                "statistical_significance": "not reported by ICSC",
                "exposure_route": "dermal",
                "exposure_concentration": "",
                "concentration_unit": "",
                "exposure_duration": "repeated/prolonged or card-specific exposure",
                "duration_unit": "",
                "exposure_frequency": "",
                "test_system": "expert-curated occupational safety card",
                "species": "human relevance",
                "model_name": "",
                "source_name": "ILO/WHO International Chemical Safety Cards",
                "source_id": f"ICSC:{record['card_id']}",
                "source_url": record["source_url"],
                "doi": "",
                "publication_year": "",
                "source_quality": "expert_curated",
                "evidence_tier": "B",
                "sample_weight": 0.9,
                "review_status": "pending",
                "reviewer": "",
                "reviewer_note": "Exact standardized phrase discovered; independent review required before training.",
                "reviewed_at": "",
                "retrieved_at": retrieved_at,
                "raw_file": "not_committed_copyrighted_web_card",
                "raw_sha256": record["raw_sha256"],
                "evidence_fingerprint": hashlib.sha256(
                    json.dumps(fingerprint_payload, sort_keys=True).encode("utf-8")
                ).hexdigest(),
                "raw_evidence": record["raw_evidence"],
                "qsar_eligible": resolved["qsar_eligible"],
            }
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(output_rows[0]) if output_rows else ["record_id"]
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)
    report = {
        "generated_at": retrieved_at,
        "source": "ILO/WHO International Chemical Safety Cards",
        "source_url": SEARCH_URL,
        "search_term": "dry",
        "search_response_sha256": search_sha256,
        "cards_screened": len(selected),
        "standardized_phrase_matches": len(matched),
        "resolved_structures": sum(bool(row.get("canonical_smiles")) for row in output_rows),
        "qsar_eligible_structures": sum(str(row.get("qsar_eligible")).lower() == "true" for row in output_rows),
        "unresolved_structures": unresolved,
        "fetch_failures": failures,
        "training_eligible": 0,
        "label_policy": "exact standardized phrase -> Tier-B review candidate only; no automatic training label; absence is never negative",
        "raw_data_policy": "copyrighted pages are not committed; per-card URL and SHA-256 are retained",
        "output_file": str(OUTPUT.relative_to(BASE)),
        "output_sha256": _sha256(OUTPUT.read_bytes()),
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_rows, report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--max-cards", type=int, default=0)
    args = parser.parse_args()
    _, report = import_icsc(refresh=args.refresh, max_cards=args.max_cards)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
