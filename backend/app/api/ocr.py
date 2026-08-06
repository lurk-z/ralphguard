"""
OCR ingredient-label reader.

POST an image of a product ingredient list → Tesseract extracts the text →
each token is matched (exact + fuzzy) against a curated INCI→SMILES table →
returns a ready-to-assess formula. This is RalphGuard's image-processing module:
it turns a photo of a label into an in-silico assessment input.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.services.ingredient_registry import (
    learn_ocr_ingredients,
    non_qsar_profile,
    normalize_ingredient_name,
    resolve_verified_registry,
)

router = APIRouter()

# ── Curated INCI / common-name → SMILES table ──────────────────────────────
# Keys are lowercased INCI names; several aliases can point to the same SMILES.
INCI_SMILES: dict[str, str] = {
    # solvents / humectants
    "glycerin": "OCC(O)CO", "glycerol": "OCC(O)CO",
    "alcohol": "CCO", "alcohol denat": "CCO", "ethanol": "CCO", "ethyl alcohol": "CCO",
    "isopropyl alcohol": "CC(C)O", "isopropanol": "CC(C)O",
    "propylene glycol": "CC(O)CO",
    "butylene glycol": "CC(O)CCO",
    "pentylene glycol": "CCCC(O)CO",
    "caprylyl glycol": "CCCCCCC(O)CO",
    "dipropylene glycol": "CC(O)COCC(C)O",
    "hexylene glycol": "CC(O)CC(C)(C)O",
    "ethylhexylglycerin": "CCCCC(CC)COCC(O)CO",
    "dimethyl sulfoxide": "CS(C)=O",
    "sorbitol": "OCC(O)C(O)C(O)C(O)CO", "xylitol": "OCC(O)C(O)C(O)CO",
    # actives
    "niacinamide": "O=C(N)c1cccnc1", "nicotinamide": "O=C(N)c1cccnc1",
    "caffeine": "Cn1cnc2c1c(=O)n(C)c(=O)n2C",
    "urea": "NC(N)=O",
    "panthenol": "OCC(C)(C)C(O)C(=O)NCCCO", "d-panthenol": "OCC(C)(C)C(O)C(=O)NCCCO",
    "allantoin": "NC(=O)NC1NC(=O)NC1=O",
    "adenosine": "Nc1ncnc2c1ncn2C1OC(CO)C(O)C1O",
    "arbutin": "OCC1OC(Oc2ccc(O)cc2)C(O)C(O)C1O",
    "ascorbic acid": "OCC(O)C1OC(=O)C(O)=C1O",
    "hydroxyacetophenone": "CC(=O)c1ccc(O)cc1",
    # acids
    "salicylic acid": "O=C(O)c1ccccc1O",
    "glycolic acid": "OCC(=O)O",
    "lactic acid": "CC(O)C(=O)O",
    "citric acid": "OC(=O)CC(O)(CC(=O)O)C(=O)O",
    "mandelic acid": "OC(C(=O)O)c1ccccc1",
    "malic acid": "OC(CC(=O)O)C(=O)O",
    "azelaic acid": "OC(=O)CCCCCCCC(=O)O",
    # preservatives
    "phenoxyethanol": "OCCOc1ccccc1",
    "methylparaben": "O=C(OC)c1ccc(O)cc1",
    "ethylparaben": "CCOC(=O)c1ccc(O)cc1",
    "propylparaben": "CCCOC(=O)c1ccc(O)cc1",
    "benzoic acid": "O=C(O)c1ccccc1",
    "sodium benzoate": "O=C([O-])c1ccccc1.[Na+]",
    "sorbic acid": "CC=CC=CC(=O)O",
    "potassium sorbate": "CC=CC=CC(=O)[O-].[K+]",
    # fragrance allergens
    "limonene": "CC(=C)C1CCC(C)=CC1", "d-limonene": "CC(=C)C1CCC(C)=CC1",
    "linalool": "CC(C)=CCCC(C)(O)C=C",
    "geraniol": "CC(C)=CCCC(C)=CCO",
    "citral": "CC(C)=CCCC(C)=CC=O",
    "citronellol": "CC(CCO)CCC=C(C)C",
    "coumarin": "O=c1ccc2ccccc2o1",
    "eugenol": "C=CCc1ccc(O)c(OC)c1",
    "cinnamal": "O=C/C=C/c1ccccc1", "cinnamaldehyde": "O=C/C=C/c1ccccc1",
    "benzyl alcohol": "OCc1ccccc1",
    # surfactants
    "sodium lauryl sulfate": "CCCCCCCCCCCCOS(=O)(=O)[O-].[Na+]",
    "sodium laureth sulfate": "CCCCCCCCCCCCOS(=O)(=O)[O-].[Na+]",
    "cocamidopropyl betaine": "CCCCCCCCCCCC(=O)NCCC[N+](C)(C)CC([O-])=O",
    # emollients
    "squalane": "CC(C)CCCC(C)CCCC(C)CCCC(C)CCCC(C)C",
    "isopropyl myristate": "CCCCCCCCCCCCCC(=O)OC(C)C",
    "cetyl alcohol": "CCCCCCCCCCCCCCCCO",
    "stearyl alcohol": "CCCCCCCCCCCCCCCCCCO",
    "stearic acid": "CCCCCCCCCCCCCCCCCC(=O)O",
    # UV filters
    "titanium dioxide": "O=[Ti]=O",
    "zinc oxide": "O=[Zn]",
    "benzophenone-3": "COc1ccc(C(=O)c2ccccc2)c(O)c1", "oxybenzone": "COc1ccc(C(=O)c2ccccc2)c(O)c1",
    "ethylhexyl methoxycinnamate": "CCCCC(CC)COC(=O)/C=C/c1ccc(OC)cc1", "octinoxate": "CCCCC(CC)COC(=O)/C=C/c1ccc(OC)cc1",
    "butyl methoxydibenzoylmethane": "COc1ccc(C(=O)CC(=O)c2ccc(C(C)(C)C)cc2)cc1", "avobenzone": "COc1ccc(C(=O)CC(=O)c2ccc(C(C)(C)C)cc2)cc1",
    # salts / misc
    "sodium chloride": "[Na+].[Cl-]",
}

# Names that carry no single SMILES (mixtures/polymers) — recognised but skipped.
KNOWN_NO_STRUCTURE = {
    "aqua", "water", "eau", "parfum", "fragrance", "dimethicone", "cyclopentasiloxane",
    "sodium hyaluronate", "hyaluronic acid", "xanthan gum", "carbomer", "cetearyl alcohol",
    "peg-100 stearate", "tocopherol", "tocopheryl acetate", "polysorbate 20", "polysorbate 60",
    "ci 77891", "mica", "silica", "sodium hydroxide", "caprylyl/capryl glucoside",
    "polyquaternium-67", "trisodium ethylenediaminedisuccinate",
}

_INCI_KEYS = list(INCI_SMILES.keys())


_STOP = {"ingredients", "ingredient", "and", "contains", "may", "of", "the", "in", "with"}

# Generic chemistry-family words that are NEVER a standalone INCI name — they are
# always part of a longer name ("Aluminum Stearates", "Citric Acid"). Matching one
# of these alone (e.g. grabbing "Alcohol" out of "Lanolin Alcohol") is a false hit.
_AMBIGUOUS = {
    "aluminum", "aluminium", "sodium", "potassium", "zinc", "magnesium", "calcium",
    "stearate", "stearates", "acid", "oil", "gum", "wax", "extract", "butter",
    "oxide", "chloride", "sulfate", "sulphate", "salt", "water", "seed", "leaf",
    "juice", "root", "flower", "powder", "hydroxide", "glycol", "pentylene",
}

_SLASH_ALIASES = {
    "aqua/water": "aqua",
    "water/aqua": "aqua",
    "parfum/fragrance": "parfum",
    "fragrance/parfum": "parfum",
}

_NO_STRUCTURE_ALIASES = {
    "water": "aqua",
    "eau": "aqua",
    "fragrance": "parfum",
}

# Words from the non-ingredient parts of a label (address / marketing / legal).
_NOISE = {
    "made", "italy", "thailand", "germany", "tel", "fax", "www", "http", "https",
    "batch", "lot", "exp", "net", "wt", "imported", "distributed", "manufactured",
    "produced", "hong", "kong", "singapore", "philippines", "malaysia", "hamburg",
    "registered", "eucerit", "creme", "cream", "moisturizer", "worldwide", "skin",
    "care", "wherever", "needs", "most", "sold", "company", "ltd", "srl", "gmbh",
    "beiersdorf", "nivea", "address", "warning", "warnings", "directions", "uso",
}

# Text after any of these markers is not part of the ingredient list.
_BOUNDARY = re.compile(
    r"(?i)\b(made in|imported|distributed|manufactured|produced|warning|avvertenz|"
    r"precaution|direction|modo\s*d|prodotto|non\s+ingerire|tenere|tel[:.\s]|fax|"
    r"www|http|batch|\blot\b|best before|net\s*wt|registered|hong\s*kong|"
    r"singapore|philippines|malaysia|address)\b"
)


def _ingredients_block(text: str) -> str:
    """Keep only the text between an 'Ingredients:' marker and the next section
    (address / warnings / marketing), so label noise never reaches the matcher."""
    m = re.search(r"(?i)ingredient[si]?\b\s*[:.\-]?", text)
    if m:
        text = text[m.end():]
    b = _BOUNDARY.search(text)
    if b:
        text = text[: b.start()]
    return text


def _known_phrases_from_unseparated_text(text: str) -> list[str]:
    """Recover curated INCI phrases when a sparse OCR pass loses all commas."""
    normalized = re.sub(r"[^a-z0-9 /\-]", " ", text.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = re.sub(r"\s*/\s*", "/", normalized)
    phrases = set(INCI_SMILES) | KNOWN_NO_STRUCTURE | set(_SLASH_ALIASES)
    found: list[tuple[int, int, str]] = []
    for phrase in sorted(phrases, key=len, reverse=True):
        pattern = rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])"
        for match in re.finditer(pattern, normalized):
            found.append((match.start(), match.end(), _SLASH_ALIASES.get(phrase, phrase)))
    selected: list[tuple[int, int, str]] = []
    for start, end, phrase in sorted(found, key=lambda item: (item[0], -(item[1] - item[0]))):
        if any(start < chosen_end and end > chosen_start for chosen_start, chosen_end, _ in selected):
            continue
        selected.append((start, end, phrase))
    selected.sort(key=lambda item: item[0])
    return [phrase for _, _, phrase in selected]


def _ingredient_phrase_matches(text: str) -> list[dict]:
    """Find whole INCI entities inside noisy OCR comma segments.

    Tesseract commonly removes spaces (``SODIUMHYDROXIDE``), changes one
    leading letter (``GAPRYLYL``) or merges two neighbouring ingredients into
    one comma segment.  Token-only fuzzy matching cannot recover those cases.
    This second, conservative entity-linking pass compares curated *whole
    ingredient names* with similarly-sized character spans.  Approximate hits
    are only promoted by :func:`_consensus_text` when independent OCR passes
    agree, so a single damaged reading cannot invent an ingredient.
    """
    try:
        from rapidfuzz import fuzz
    except Exception:
        return []

    block = _ingredients_block(text)
    block = re.sub(r"(?<=\w)-\s*\r?\n\s*(?=\w)", "", block)
    block = re.sub(r"\s*\r?\n\s*", " ", block)
    block_length = max(1, len(block))

    registry: list[tuple[str, str, str | None, str]] = []
    for name, smiles in INCI_SMILES.items():
        registry.append((name, "sub", smiles, name))
    for name in KNOWN_NO_STRUCTURE:
        registry.append((name, "no", None, _NO_STRUCTURE_ALIASES.get(name, name)))
    for alias, canonical in _SLASH_ALIASES.items():
        kind = "sub" if canonical in INCI_SMILES else "no"
        registry.append((alias, kind, INCI_SMILES.get(canonical), canonical))

    matches: list[dict] = []
    for segment_match in re.finditer(r"[^,;]+", block):
        segment = segment_match.group(0)
        normalized = re.sub(r"[^a-z0-9 /\-]", " ", segment.lower())
        normalized = re.sub(r"\s+", " ", normalized).strip()
        normalized = re.sub(r"\s*/\s*", "/", normalized)
        compact = re.sub(r"[^a-z0-9]", "", normalized)
        if len(compact) < 4:
            continue

        segment_candidates: list[dict] = []
        for phrase, kind, smiles, canonical in registry:
            phrase_normalized = re.sub(r"\s*/\s*", "/", phrase.lower())
            phrase_compact = re.sub(r"[^a-z0-9]", "", phrase_normalized)
            if not phrase_compact:
                continue

            boundary_exact = bool(
                re.search(
                    rf"(?<![a-z0-9]){re.escape(phrase_normalized)}(?![a-z0-9])",
                    normalized,
                )
            )
            alignment = fuzz.partial_ratio_alignment(phrase_compact, compact)
            if alignment is None:
                continue
            score = float(alignment.score)
            span_length = alignment.dest_end - alignment.dest_start
            coverage = span_length / len(phrase_compact)
            compact_exact = phrase_compact in compact

            # Short names are especially prone to coincidental matches.  Long
            # INCI names can tolerate more OCR damage, but still need most of
            # their expected character span to be present.
            name_length = len(phrase_compact)
            if name_length < 7 and not boundary_exact and "/" not in phrase:
                continue
            if name_length >= 15:
                threshold, min_coverage = 72.0, 0.65
            elif name_length >= 11:
                threshold, min_coverage = 80.0, 0.70
            elif name_length >= 8:
                threshold, min_coverage = 86.0, 0.78
            else:
                threshold, min_coverage = 94.0, 0.88
            if not compact_exact and (
                name_length < 7 or score < threshold or coverage < min_coverage
            ):
                continue

            segment_candidates.append(
                {
                    "kind": kind,
                    "name": canonical,
                    "smiles": smiles,
                    "score": int(round(score)),
                    "exact": compact_exact,
                    "boundary_exact": boundary_exact,
                    "start": alignment.dest_start,
                    "end": alignment.dest_end,
                    "length": name_length,
                    "position": (segment_match.start() + alignment.dest_start) / block_length,
                }
            )

        # Prefer an exact word-level name over aliases or shorter names inside
        # it (ASCORBIC ACID must not also become SORBIC ACID).  Separate,
        # non-overlapping entities in one damaged segment are all retained.
        selected: list[dict] = []
        for candidate in sorted(
            segment_candidates,
            key=lambda row: (
                row["boundary_exact"],
                row["exact"],
                row["score"],
                row["length"],
            ),
            reverse=True,
        ):
            if any(
                candidate["start"] < chosen["end"]
                and candidate["end"] > chosen["start"]
                for chosen in selected
            ):
                continue
            selected.append(candidate)
        matches.extend(selected)

    matches.sort(key=lambda row: row["position"])
    return matches


def _tokens(text: str) -> list[str]:
    """Isolate the ingredient block, drop parentheticals, split on commas → one
    clean token per ingredient (whole INCI name, never a fragment).

    Printed labels wrap long INCI names across lines. A newline is therefore
    whitespace, not an ingredient boundary. Likewise, slash is part of names
    such as Caprylyl/Capryl Glucoside and must not be used as a separator.
    """
    text = _ingredients_block(text)
    text = re.sub(r"(?<=\w)-\s*\r?\n\s*(?=\w)", "", text)  # de-hyphenate wrapped words
    text = re.sub(r"\s*\r?\n\s*", " ", text)              # join visual line wraps
    text = re.sub(r"\([^)]*\)", " ", text)          # drop "(Eucerit)", "(Aloe ...)"
    out: list[str] = []
    for p in re.split(r"[,;•·\|]+", text):
        t = re.sub(r"[^a-z0-9 /\-]", " ", p.lower())
        t = re.sub(r"\s+", " ", t).strip()
        t = re.sub(r"\s*/\s*", "/", t)
        if not (2 <= len(t) <= 50) or t in _STOP:
            continue
        words = t.split()
        if all(w in _NOISE or w in _STOP for w in words):
            continue
        out.append(t)
    return out or _known_phrases_from_unseparated_text(text)


def _plausible(tok: str) -> bool:
    words = tok.split()
    if not (1 <= len(words) <= 5) or tok in _AMBIGUOUS:
        return False
    if all(w in _NOISE or w in _STOP for w in words):
        return False
    letters = sum(c.isalpha() for c in tok)
    compact = tok.replace(" ", "").replace("/", "").replace("-", "")
    return letters >= max(3, int(0.6 * len(compact)))


def _canonicalize_token(tok: str) -> str:
    normalized = re.sub(r"\s*/\s*", "/", tok.lower().strip())
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = _SLASH_ALIASES.get(normalized, normalized)
    return _NO_STRUCTURE_ALIASES.get(normalized, normalized)


def _dict_match_detail(tok: str):
    """Return (kind, canonical name, smiles, score, exact) or None."""
    tok = _canonicalize_token(tok)
    if tok in _AMBIGUOUS:
        return None
    if tok in INCI_SMILES:
        return ("sub", tok, INCI_SMILES[tok], 100, True)
    if tok in KNOWN_NO_STRUCTURE:
        return ("no", _NO_STRUCTURE_ALIASES.get(tok, tok), None, 100, True)
    try:
        from rapidfuzz import process, fuzz

        c = process.extractOne(tok, _INCI_KEYS, scorer=fuzz.token_sort_ratio)
        if c and c[1] >= 90 and c[0] not in _AMBIGUOUS:
            return ("sub", c[0], INCI_SMILES[c[0]], int(round(c[1])), False)
        c2 = process.extractOne(tok, list(KNOWN_NO_STRUCTURE), scorer=fuzz.token_sort_ratio)
        if c2 and c2[1] >= 90:
            canonical = _NO_STRUCTURE_ALIASES.get(c2[0], c2[0])
            return ("no", canonical, None, int(round(c2[1])), False)
    except Exception:
        pass
    return None


def _dict_match(tok: str):
    """Whole-token match against the offline dict / no-structure list.
    Returns ("sub", name, smiles) | ("no", name, None) | None."""
    detail = _dict_match_detail(tok)
    return detail[:3] if detail else None


def resolve(text: str, online: bool = False):
    """Per-ingredient whole-token matching against the curated local index.

    ``online`` remains as a backward-compatible argument, but external lookup
    is intentionally handled by the persistent verified registry service. A
    raw PubChem name hit must never become a QSAR-ready item inside this helper.
    Guards against fragment/ambiguous/noise false hits.
    Returns matched[(name,smiles,score,source)], no_structure[str], unmatched[str]."""
    matched: list[tuple] = []
    no_struct: list[str] = []
    unmatched: list[str] = []
    seen: set[str] = set()

    for tok in _tokens(text):
        if tok in _AMBIGUOUS:
            continue
        detail = _dict_match_detail(tok)
        dm = detail[:3] if detail else None
        if dm:
            kind, name, smi = dm
            if kind == "sub" and smi and smi not in seen and smi.strip() != "O":
                seen.add(smi)
                matched.append((name.title(), smi, detail[3], "local"))
            elif kind == "no" and name not in no_struct:
                no_struct.append(name)
            continue
        if _plausible(tok) and tok not in unmatched:
            unmatched.append(tok)

    return matched, no_struct, unmatched[:25]


def _sort_matches_by_label_order(
    text: str,
    matches: list[tuple],
    registry_observed_by_smiles: dict[str, str] | None = None,
) -> list[tuple]:
    """Keep resolved ingredients in the order printed on the INCI label.

    Local matches can be positioned by their resolved SMILES. Registry matches
    may use a canonical display name that differs from the OCR text, so the
    registry resolver also returns the original observed label name.
    """
    tokens = _tokens(text)
    token_positions: dict[str, int] = {}
    smiles_positions: dict[str, int] = {}
    for position, token in enumerate(tokens):
        token_positions.setdefault(normalize_ingredient_name(token), position)
        detail = _dict_match_detail(token)
        if detail and detail[0] == "sub" and detail[2]:
            smiles_positions.setdefault(detail[2], position)

    for smiles, observed in (registry_observed_by_smiles or {}).items():
        position = token_positions.get(normalize_ingredient_name(observed))
        if position is not None:
            smiles_positions.setdefault(smiles, position)

    fallback_start = len(tokens)
    return [
        match
        for _position, _original_index, match in sorted(
            (
                smiles_positions.get(match[1], fallback_start + original_index),
                original_index,
                match,
            )
            for original_index, match in enumerate(matches)
        )
    ]


class OcrItem(BaseModel):
    name: str
    smiles: str
    # An INCI list normally provides ordering, not a quantitative percentage.
    # Never invent a dose here: the user must confirm it before assessment.
    concentration: float | None = None
    score: int
    source: str = "local"  # "local" curated index or verified "registry"
    ocr_confidence: float | None = None
    requires_concentration: bool = True
    recognized: bool = True
    resolved: bool = True
    qsar_eligible: bool = True
    assessment_method: str = "qsar"
    verification_status: str = "verified"


class OcrNonQsarItem(BaseModel):
    name: str
    recognized: bool = True
    resolved: bool
    structure_available: bool
    canonical_smiles: str | None = None
    pubchem_cid: int | None = None
    substance_type: str
    structure_status: str
    qsar_eligible: bool = False
    assessment_method: str
    reason_code: str
    reason_th: str
    verification_status: str = "verified"


class OcrRegistryCandidate(BaseModel):
    id: int
    inci_name: str | None = None
    canonical_name: str
    cas_number: str | None = None
    pubchem_cid: int | None = None
    canonical_smiles: str | None = None
    inchikey: str | None = None
    molecular_formula: str | None = None
    molecular_weight: float | None = None
    substance_type: str
    structure_status: str
    qsar_eligible: bool = False
    assessment_method: str
    verification_status: str
    observation_count: int
    reason_code: str | None = None
    reason_th: str | None = None


class OcrOut(BaseModel):
    raw_text: str
    consensus_text: str | None = None
    items: list[OcrItem]
    recognized_no_structure: list[str]
    non_qsar_items: list[OcrNonQsarItem] = Field(default_factory=list)
    registry_candidates: list[OcrRegistryCandidate] = Field(default_factory=list)
    registry_warning: str | None = None
    unmatched: list[str]
    ocr_confidence: float | None = None
    ocr_passes: int = 1
    preprocessing_variants: list[str] = Field(default_factory=list)
    selected_variant: str | None = None
    selected_psm: int | None = None
    concentration_notice_th: str = (
        "ฉลาก INCI ระบุลำดับส่วนผสม แต่ไม่ระบุเปอร์เซ็นต์ที่แน่นอน "
        "กรุณายืนยันความเข้มข้นก่อนประเมินสูตร"
    )


MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
OCR_PSM_MODES = (4, 6, 11)


@dataclass(frozen=True)
class OcrPass:
    text: str
    confidence: float
    variant: str
    psm: int
    quality: float


def _otsu_threshold(img):
    """Binarize a grayscale PIL image using Otsu's between-class variance."""
    histogram = img.histogram()[:256]
    total = sum(histogram)
    if total <= 0:
        return img.copy()
    weighted_total = sum(index * count for index, count in enumerate(histogram))
    background_weight = 0
    background_sum = 0.0
    best_variance = -1.0
    threshold = 127
    for index, count in enumerate(histogram):
        background_weight += count
        if background_weight == 0:
            continue
        foreground_weight = total - background_weight
        if foreground_weight == 0:
            break
        background_sum += index * count
        mean_background = background_sum / background_weight
        mean_foreground = (weighted_total - background_sum) / foreground_weight
        variance = background_weight * foreground_weight * (mean_background - mean_foreground) ** 2
        if variance > best_variance:
            best_variance = variance
            threshold = index
    return img.point(lambda value: 255 if value > threshold else 0, mode="1").convert("L")


def _deskew_image(img):
    """Find the small rotation that maximizes horizontal text-line alignment."""
    from PIL import Image

    try:
        import numpy as np
    except Exception:
        return img

    preview = img.copy()
    preview.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
    binary = _otsu_threshold(preview)
    ink = np.asarray(binary, dtype=np.uint8) < 128
    density = float(ink.mean())
    if density < 0.002 or density > 0.55:
        return img

    best_angle = 0.0
    best_score = -1.0
    for half_degree in range(-12, 13):  # -6° .. +6°
        angle = half_degree / 2
        rotated = binary.rotate(
            angle,
            resample=Image.Resampling.BILINEAR,
            expand=True,
            fillcolor=255,
        )
        row_ink = (np.asarray(rotated, dtype=np.uint8) < 128).sum(axis=1).astype(float)
        score = float(np.square(np.diff(row_ink)).sum())
        if score > best_score:
            best_score = score
            best_angle = angle

    if abs(best_angle) < 0.25:
        return img
    return img.rotate(
        best_angle,
        resample=Image.Resampling.BICUBIC,
        expand=True,
        fillcolor=255,
    )


def _prepare_image_variants(data: bytes):
    """Create complementary pixel views for ensemble OCR.

    No single preprocessing recipe works for glossy, curved and low-contrast
    labels. The ensemble therefore sees a conservative grayscale image, a
    sharpened/contrast-enhanced image and an Otsu-binarized image.
    """
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("invalid or corrupted image") from exc
    if img.width * img.height > MAX_IMAGE_PIXELS:
        raise ValueError("image dimensions are too large")

    gray = ImageOps.exif_transpose(img).convert("L")
    gray = _deskew_image(gray)

    # Normalize both tiny phone crops and unnecessarily large camera frames.
    target_width = 2200
    if gray.width < target_width:
        scale = min(4.0, target_width / max(1, gray.width))
    elif gray.width > 3200:
        scale = 3200 / gray.width
    else:
        scale = 1.0
    if scale != 1.0:
        gray = gray.resize(
            (max(1, int(gray.width * scale)), max(1, int(gray.height * scale))),
            Image.Resampling.LANCZOS,
        )

    base = ImageOps.autocontrast(gray, cutoff=1)
    sharpened = ImageEnhance.Contrast(base).enhance(1.35).filter(
        ImageFilter.UnsharpMask(radius=1.2, percent=180, threshold=2)
    )
    denoised = base.filter(ImageFilter.MedianFilter(size=3))
    binary = _otsu_threshold(ImageEnhance.Contrast(denoised).enhance(1.2))
    return [
        ("autocontrast", base),
        ("sharpened", sharpened),
        ("binary_otsu", binary),
    ]


def _prepare_image(data: bytes):
    """Backward-compatible single-view helper used by older callers/tests."""
    return _prepare_image_variants(data)[0][1]


def _ocr_candidate(pytesseract, img, psm: int) -> tuple[str, float]:
    """Return OCR text and length-weighted confidence from one Tesseract call."""
    from pytesseract import Output

    config = f"--oem 3 --psm {psm} -c preserve_interword_spaces=1"
    data = pytesseract.image_to_data(
        img,
        lang="eng",
        config=config,
        output_type=Output.DICT,
        timeout=12,
    )
    lines: dict[tuple, list[str]] = {}
    confidence_total = 0.0
    confidence_weight = 0
    count = len(data.get("text", []))
    for index in range(count):
        token = str(data["text"][index]).strip()
        if not token:
            continue
        try:
            value = float(data.get("conf", [])[index])
        except (TypeError, ValueError):
            value = -1
        key = tuple(
            data.get(field, [0] * count)[index]
            for field in ("page_num", "block_num", "par_num", "line_num")
        )
        lines.setdefault(key, []).append(token)
        if value >= 0:
            weight = max(1, sum(char.isalnum() for char in token))
            confidence_total += value * weight
            confidence_weight += weight
    text = "\n".join(" ".join(tokens) for tokens in lines.values()).strip()
    mean_conf = confidence_total / confidence_weight if confidence_weight else 0.0
    return text, round(mean_conf, 1)


def _candidate_quality(text: str, confidence: float) -> float:
    matched, no_structure, unmatched = resolve(text, online=False)
    token_count = len(_tokens(text))
    return (
        len(matched) * 20
        + len(no_structure) * 12
        + min(token_count, 30)
        - len(unmatched) * 2
        + confidence * 0.15
    )


def _consensus_text(passes: list[OcrPass]) -> str:
    """Vote at whole-INCI level and return an ordered consensus ingredient list."""
    evidence: dict[tuple[str, str], dict] = {}
    for pass_index, candidate in enumerate(passes):
        tokens = _tokens(candidate.text)
        denominator = max(1, len(tokens) - 1)
        seen_in_pass: set[tuple[str, str]] = set()
        has_ingredient_marker = bool(re.search(r"(?i)ingredient[si]?\b", candidate.text))
        for token_index, token in enumerate(tokens):
            detail = _dict_match_detail(token)
            if detail:
                kind, name, smiles, score, exact = detail
                key = (kind, smiles or name)
                display = name
            else:
                normalized = _canonicalize_token(token)
                if not _plausible(normalized) or normalized in _AMBIGUOUS:
                    continue
                key = ("raw", normalized)
                display = normalized
                score = 0
                exact = False
            row = evidence.setdefault(
                key,
                {
                    "display": display,
                    "votes": set(),
                    "positions": [],
                    "exact": False,
                    "exact_after_marker": False,
                    "match_score": 0,
                    "best_confidence": -1.0,
                },
            )
            if candidate.confidence > row["best_confidence"]:
                row["display"] = display
                row["best_confidence"] = candidate.confidence
            row["exact"] = row["exact"] or exact
            row["exact_after_marker"] = row["exact_after_marker"] or (
                exact and has_ingredient_marker
            )
            row["match_score"] = max(row["match_score"], score)
            row["positions"].append(token_index / denominator)
            if key not in seen_in_pass:
                row["votes"].add(pass_index)
                seen_in_pass.add(key)

        # Supplement comma-token matching with conservative phrase-level
        # linking.  This recovers entities when OCR removed a comma/space or
        # damaged one character; fuzzy hits still require multi-pass agreement.
        for phrase in _ingredient_phrase_matches(candidate.text):
            key = (phrase["kind"], phrase["smiles"] or phrase["name"])
            row = evidence.setdefault(
                key,
                {
                    "display": phrase["name"],
                    "votes": set(),
                    "positions": [],
                    "exact": False,
                    "exact_after_marker": False,
                    "match_score": 0,
                    "best_confidence": -1.0,
                },
            )
            if candidate.confidence > row["best_confidence"]:
                row["display"] = phrase["name"]
                row["best_confidence"] = candidate.confidence
            row["exact"] = row["exact"] or phrase["exact"]
            row["exact_after_marker"] = row["exact_after_marker"] or (
                phrase["exact"] and has_ingredient_marker
            )
            row["match_score"] = max(row["match_score"], phrase["score"])
            row["positions"].append(phrase["position"])
            if key not in seen_in_pass:
                row["votes"].add(pass_index)
                seen_in_pass.add(key)

    accepted = []
    for row in evidence.values():
        votes = len(row["votes"])
        # One exact curated hit is useful evidence; fuzzy and PubChem-bound raw
        # names require agreement from at least two independent OCR passes.
        if row["exact_after_marker"] or votes >= 2:
            average_position = sum(row["positions"]) / len(row["positions"])
            accepted.append((average_position, row["display"]))
    accepted.sort(key=lambda item: item[0])
    return ", ".join(display for _, display in accepted)


def _run_ocr_ensemble(pytesseract, data: bytes):
    variants = _prepare_image_variants(data)
    passes: list[OcrPass] = []
    for variant_name, image in variants:
        for psm in OCR_PSM_MODES:
            try:
                text, confidence = _ocr_candidate(pytesseract, image, psm)
            except RuntimeError:
                continue  # one timed-out segmentation mode must not fail the scan
            if not text:
                continue
            passes.append(
                OcrPass(
                    text=text,
                    confidence=confidence,
                    variant=variant_name,
                    psm=psm,
                    quality=_candidate_quality(text, confidence),
                )
            )
    if not passes:
        raise ValueError("no text recognized in any OCR pass")

    ranked = sorted(passes, key=lambda item: (item.quality, item.confidence, len(item.text)), reverse=True)
    best = ranked[0]
    top = ranked[: min(3, len(ranked))]
    ensemble_confidence = round(sum(item.confidence for item in top) / len(top), 1)
    consensus = _consensus_text(passes) or best.text
    return {
        "raw_text": best.text,
        "consensus_text": consensus,
        "confidence": ensemble_confidence,
        "pass_count": len(passes),
        "variants": [name for name, _ in variants],
        "selected_variant": best.variant,
        "selected_psm": best.psm,
    }


@router.post("/", response_model=OcrOut)
async def read_label(
    file: UploadFile = File(...),
    online: bool = True,
    db: Session = Depends(get_db),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image exceeds 10 MB")
    if file.content_type and file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="unsupported image type")

    # OCR (lazy imports so the app still boots if the libs are missing)
    try:
        import pytesseract
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=503, detail=f"OCR libs not installed: {e}")

    try:
        # Tesseract is CPU-bound. Run the multi-view ensemble outside FastAPI's
        # event loop so one difficult label does not stall unrelated requests.
        ensemble = await run_in_threadpool(_run_ocr_ensemble, pytesseract, data)
        text = ensemble["raw_text"]
        consensus_text = ensemble["consensus_text"]
        ocr_confidence = ensemble["confidence"]
    except pytesseract.TesseractNotFoundError:
        raise HTTPException(status_code=503, detail="tesseract binary not installed on server")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"OCR failed: {e}")

    # Entity recognition and external structure resolution are separate stages.
    # PubChem discoveries remain pending registry candidates and are never sent
    # directly into QSAR merely because a name lookup returned a molecule.
    matched_ranked, no_struct, unmatched = resolve(consensus_text, online=False)
    registry_observed_by_smiles: dict[str, str] = {}
    registry_candidates: list[dict] = []
    registry_non_qsar_profiles: dict[str, dict] = {}
    registry_warning: str | None = None
    try:
        (
            registry_matched,
            registry_no_qsar,
            registry_non_qsar_profiles,
            unmatched,
            registry_observed_by_smiles,
        ) = (
            await run_in_threadpool(
                resolve_verified_registry,
                db,
                unmatched,
                include_observed_names=True,
            )
        )
        matched_ranked.extend(registry_matched)
        for name in registry_no_qsar:
            if name not in no_struct:
                no_struct.append(name)
        registry_candidates = await run_in_threadpool(
            learn_ocr_ingredients,
            db,
            matched_ranked,
            no_struct,
            unmatched,
            ocr_confidence=ocr_confidence,
            online=online,
        )
    except Exception as exc:
        db.rollback()
        # Registry/PubChem availability must not erase a successful OCR result.
        registry_warning = f"ingredient registry unavailable: {str(exc)[:300]}"

    matched_ranked = _sort_matches_by_label_order(
        consensus_text,
        matched_ranked,
        registry_observed_by_smiles,
    )

    # Dedupe by SMILES while keeping the first occurrence printed on the label.
    items: list[OcrItem] = []
    seen: set[str] = set()
    for name, smiles, score, source in matched_ranked:
        if smiles in seen:
            continue
        seen.add(smiles)
        items.append(
            OcrItem(
                name=name.title(),
                smiles=smiles,
                concentration=None,
                score=score,
                source=source,
                ocr_confidence=ocr_confidence,
            )
        )

    non_qsar_items = [
        OcrNonQsarItem(**(registry_non_qsar_profiles.get(name) or non_qsar_profile(name)))
        for name in no_struct
    ]

    return OcrOut(
        raw_text=text.strip(),
        consensus_text=consensus_text.strip(),
        items=items,
        recognized_no_structure=no_struct,
        non_qsar_items=non_qsar_items,
        registry_candidates=[OcrRegistryCandidate(**item) for item in registry_candidates],
        registry_warning=registry_warning,
        unmatched=unmatched,
        ocr_confidence=ocr_confidence,
        ocr_passes=ensemble["pass_count"],
        preprocessing_variants=ensemble["variants"],
        selected_variant=ensemble["selected_variant"],
        selected_psm=ensemble["selected_psm"],
    )
