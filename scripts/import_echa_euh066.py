"""Extract source-attributed EUH066 weak positives from CLP Annex VI.

The source PDF is retained in ``data/raw`` and every resolved structure keeps
the Annex VI index number, CAS number, source URL, and raw-file SHA-256.  An
EUH066 entry is a regulatory *weak positive* for repeated skin dryness or
cracking; it is never treated as direct experimental evidence.  Absence of the
statement is not a negative label.

The checked-in curated CSV lets the training notebook run offline.  Rebuilding
that CSV requires ``pypdf`` and network access to PubChem for CAS-to-structure
resolution.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import pandas as pd

BASE = Path(__file__).resolve().parents[1]
SOURCE_PDF = (
    BASE
    / "data"
    / "raw"
    / "skin_dryness"
    / "regulatory"
    / "clp_annex_vi_table_3_1.pdf"
)
OUTPUT_CSV = BASE / "data" / "curated" / "skin_dryness_echa_euh066.csv"
REPORT_JSON = BASE / "data" / "curated" / "skin_dryness_echa_euh066_report.json"

SOURCE_NAME = "CLP Regulation Annex VI Table 3.1 (EUH066)"
SOURCE_URL = (
    "https://ust.is/library/Skrar/Atvinnulif/Efni/Flokkun-og-merkingar/"
    "CLP-annex_vi_tafla_3-1.pdf"
)
CURRENT_ECHA_URL = "https://echa.europa.eu/information-on-chemicals/annex-vi-to-clp"
ENTRY_RE = re.compile(r"(?=\b\d{3}-\d{3}-\d{2}-[0-9X]\b)")
INDEX_RE = re.compile(r"\b(\d{3}-\d{3}-\d{2}-[0-9X])\b")
IDENTIFIER_RE = re.compile(r"\b(\d{2,7}-\d{2}-\d)\b(?:\s*\[\d+\])?")
EC_RE = re.compile(r"\b\d{3}-\d{3}-\d\b(?:\s*\[\d+\])?")
HAZARD_MARKERS = (
    " Flam.", " Acute ", " Skin ", " Eye ", " Asp. ", " STOT ",
    " Aquatic ", " Press. ", " Carc. ", " Muta. ", " Repr. ",
    " Ozone", " Self-", " Lact.", " Resp. ", " Ox. ", " Org. ",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _header(block: str) -> str:
    positions = [block.find(marker) for marker in HAZARD_MARKERS if marker in block]
    return block[: min(positions)] if positions else block[:1200]


def extract_euh066_entries(pdf_path: Path = SOURCE_PDF) -> list[dict[str, Any]]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - exercised only on rebuild
        raise RuntimeError(
            "Rebuilding EUH066 evidence requires pypdf; use the scientific "
            "environment or install scientific/requirements.txt"
        ) from exc

    reader = PdfReader(str(pdf_path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    blocks = ENTRY_RE.split(text)
    entries: list[dict[str, Any]] = []
    for block in blocks:
        if "EUH066" not in block:
            continue
        index_match = INDEX_RE.search(block)
        if not index_match:
            continue
        header = _header(block)
        entry_header = header[index_match.end() :]
        cas_numbers = IDENTIFIER_RE.findall(entry_header)
        if not cas_numbers:
            # Group entries without a discrete CAS are retained in the raw PDF
            # but cannot enter a single-molecule QSAR dataset.
            continue
        # CAS uses a two-digit middle block; EC numbers use three digits.  Start
        # after the Annex index so its trailing ``130-00-2``-like substring can
        # never be mistaken for a CAS number.
        name_text = entry_header
        first_identifier = EC_RE.search(name_text) or IDENTIFIER_RE.search(name_text)
        if first_identifier:
            name_text = name_text[: first_identifier.start()]
        annex_name = " ".join(name_text.split()).strip(" ;")
        for cas in cas_numbers:
            entries.append(
                {
                    "annex_index": index_match.group(1),
                    "annex_name": annex_name,
                    "cas_number": cas,
                }
            )
    # A grouped entry can repeat a CAS through PDF line wrapping.  Preserve one
    # deterministic index/CAS record before PubChem resolution.
    return list({(row["annex_index"], row["cas_number"]): row for row in entries}.values())


def resolve_pubchem(cas_number: str, *, attempts: int = 4) -> dict[str, Any] | None:
    fields = "Title,IsomericSMILES,CanonicalSMILES,InChIKey"
    url = (
        "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/"
        f"{quote(cas_number, safe='')}/property/{fields}/JSON"
    )
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": "RalphGuard-evidence-import/1.0"})
            with urlopen(request, timeout=45) as response:  # noqa: S310 - fixed PubChem host
                payload = json.load(response)
            prop = payload["PropertyTable"]["Properties"][0]
            smiles = (
                prop.get("SMILES")
                or prop.get("ConnectivitySMILES")
                or prop.get("IsomericSMILES")
                or prop.get("CanonicalSMILES")
            )
            if not smiles or "." in str(smiles):
                return None
            return {
                "compound_name": prop.get("Title") or cas_number,
                "smiles": str(smiles),
                "inchikey": prop.get("InChIKey"),
                "pubchem_cid": prop.get("CID"),
                "pubchem_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{prop.get('CID')}",
            }
        except HTTPError as exc:
            if exc.code == 404:
                return None
            if attempt == attempts - 1:
                raise
        except (TimeoutError, URLError, ConnectionError):
            if attempt == attempts - 1:
                raise
        time.sleep(1.5 * (attempt + 1))
    return None


def build_evidence(*, refresh: bool = False) -> tuple[pd.DataFrame, dict[str, Any]]:
    if not refresh and OUTPUT_CSV.exists() and REPORT_JSON.exists():
        return (
            pd.read_csv(OUTPUT_CSV),
            json.loads(REPORT_JSON.read_text(encoding="utf-8")),
        )
    if not SOURCE_PDF.exists():
        raise FileNotFoundError(
            f"Missing {SOURCE_PDF.relative_to(BASE)}; retain the source PDF before rebuilding"
        )

    entries = extract_euh066_entries(SOURCE_PDF)
    rows: list[dict[str, Any]] = []
    unresolved: list[dict[str, str]] = []
    for entry in entries:
        resolved = resolve_pubchem(entry["cas_number"])
        if resolved is None:
            unresolved.append(entry)
            continue
        rows.append(
            {
                "record_id": f"clp:{entry['annex_index']}:{entry['cas_number']}",
                "compound_name": resolved["compound_name"],
                "cas_number": entry["cas_number"],
                "smiles": resolved["smiles"],
                "inchikey": resolved["inchikey"],
                "pubchem_cid": resolved["pubchem_cid"],
                "endpoint": "skin_dryness",
                "candidate_label": 1,
                "label_status": "weak_positive",
                "label_quality": "regulatory_weak_positive",
                "evidence_type": "regulatory_skin_dryness",
                "evidence_subtype": "regulatory_euh066",
                "source_name": SOURCE_NAME,
                "source_id": entry["annex_index"],
                "source_url": SOURCE_URL,
                "source_quality": "regulatory_annex",
                "evidence_tier": "C",
                "review_status": "verified",
                "exposure_duration": "repeated exposure; concentration not encoded by EUH066",
                "measurement_type": "regulatory dryness/cracking statement",
                "review_note": (
                    "EUH066 is retained as a weighted regulatory weak positive, "
                    "not direct experimental ground truth."
                ),
                "annex_name": entry["annex_name"],
                "pubchem_url": resolved["pubchem_url"],
            }
        )
        time.sleep(0.12)

    frame = pd.DataFrame(rows).drop_duplicates("inchikey").sort_values(
        ["cas_number", "source_id"], kind="stable"
    )
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUTPUT_CSV, index=False)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(SOURCE_PDF.relative_to(BASE)),
        "source_sha256": sha256_file(SOURCE_PDF),
        "source_url": SOURCE_URL,
        "current_echa_table_url": CURRENT_ECHA_URL,
        "label_policy": "EUH066 only -> regulatory weak positive (tier C, weight 0.5); absence is never negative",
        "annex_index_cas_pairs": len(entries),
        "resolved_unique_structures": int(len(frame)),
        "unresolved_count": len(unresolved),
        "unresolved": unresolved,
        "output_file": str(OUTPUT_CSV.relative_to(BASE)),
        "output_sha256": sha256_file(OUTPUT_CSV),
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return frame, report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    _frame, report = build_evidence(refresh=args.refresh)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
