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
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

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
    "ci 77891", "mica", "silica",
}

_INCI_KEYS = list(INCI_SMILES.keys())

# ── PubChem runtime resolver (covers ingredients not in the offline dict) ──
_PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
_pubchem_cache: dict[str, str | None] = {}


def pubchem_smiles(name: str) -> str | None:
    """Look up a compound name on PubChem → canonical SMILES (RDKit-validated).
    Cached; returns None on miss/offline so the caller degrades gracefully."""
    key = name.lower().strip()
    if not key or len(key) < 3:
        return None
    if key in _pubchem_cache:
        return _pubchem_cache[key]
    smi: str | None = None
    try:
        import httpx
        from rdkit import Chem

        # PubChem renamed SMILES properties across versions — try several.
        for prop in ("SMILES", "IsomericSMILES", "CanonicalSMILES", "ConnectivitySMILES"):
            url = f"{_PUBCHEM}/compound/name/{quote(name)}/property/{prop}/JSON"
            try:
                r = httpx.get(url, timeout=6.0)
            except Exception:
                break  # network/offline — stop trying, degrade to dict-only
            if r.status_code != 200:
                continue
            props = r.json().get("PropertyTable", {}).get("Properties", [])
            cand = props[0].get(prop) if props else None
            if cand:
                m = Chem.MolFromSmiles(cand)
                if m is not None:
                    smi = Chem.MolToSmiles(m)
                    break
    except Exception:
        smi = None
    _pubchem_cache[key] = smi
    return smi


_STOP = {"ingredients", "ingredient", "and", "contains", "may", "of", "the", "in", "with"}

# Generic chemistry-family words that are NEVER a standalone INCI name — they are
# always part of a longer name ("Aluminum Stearates", "Citric Acid"). Matching one
# of these alone (e.g. grabbing "Alcohol" out of "Lanolin Alcohol") is a false hit.
_AMBIGUOUS = {
    "aluminum", "aluminium", "sodium", "potassium", "zinc", "magnesium", "calcium",
    "stearate", "stearates", "acid", "oil", "gum", "wax", "extract", "butter",
    "oxide", "chloride", "sulfate", "sulphate", "salt", "water", "seed", "leaf",
    "juice", "root", "flower", "powder", "hydroxide",
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


def _tokens(text: str) -> list[str]:
    """Isolate the ingredient block, drop parentheticals, split on commas → one
    clean token per ingredient (whole INCI name, never a fragment)."""
    text = _ingredients_block(text)
    text = re.sub(r"\([^)]*\)", " ", text)          # drop "(Eucerit)", "(Aloe ...)"
    out: list[str] = []
    for p in re.split(r"[,\n;•·\|/]+", text):
        t = re.sub(r"[^a-z0-9 \-]", " ", p.lower())
        t = re.sub(r"\s+", " ", t).strip()
        if not (2 <= len(t) <= 50) or t in _STOP:
            continue
        words = t.split()
        if all(w in _NOISE or w in _STOP for w in words):
            continue
        out.append(t)
    return out


def _plausible(tok: str) -> bool:
    words = tok.split()
    if not (1 <= len(words) <= 5) or tok in _AMBIGUOUS:
        return False
    if all(w in _NOISE or w in _STOP for w in words):
        return False
    letters = sum(c.isalpha() for c in tok)
    return letters >= max(3, int(0.6 * len(tok.replace(" ", ""))))


def _dict_match(tok: str):
    """Whole-token match against the offline dict / no-structure list.
    Returns ("sub", name, smiles) | ("no", name, None) | None."""
    if tok in _AMBIGUOUS:
        return None
    if tok in INCI_SMILES:
        return ("sub", tok, INCI_SMILES[tok])
    if tok in KNOWN_NO_STRUCTURE:
        return ("no", tok, None)
    try:
        from rapidfuzz import process, fuzz
        c = process.extractOne(tok, _INCI_KEYS, scorer=fuzz.token_sort_ratio)
        if c and c[1] >= 90 and c[0] not in _AMBIGUOUS:
            return ("sub", c[0], INCI_SMILES[c[0]])
        c2 = process.extractOne(tok, list(KNOWN_NO_STRUCTURE), scorer=fuzz.token_sort_ratio)
        if c2 and c2[1] >= 90:
            return ("no", c2[0], None)
    except Exception:
        pass
    return None


def resolve(text: str, online: bool = True):
    """Per-ingredient (whole comma-token) matching: offline dict → PubChem →
    unmatched. Guards against fragment/ambiguous/noise false hits.
    Returns matched[(name,smiles,score,source)], no_structure[str], unmatched[str]."""
    matched: list[tuple] = []
    no_struct: list[str] = []
    unmatched: list[str] = []
    seen: set[str] = set()

    for tok in _tokens(text):
        if tok in _AMBIGUOUS:
            continue
        dm = _dict_match(tok)
        if dm:
            kind, name, smi = dm
            if kind == "sub" and smi and smi not in seen and smi.strip() != "O":
                seen.add(smi)
                matched.append((name.title(), smi, 95, "local"))
            elif kind == "no" and name not in no_struct:
                no_struct.append(name)
            continue
        if online and _plausible(tok):
            smi = pubchem_smiles(tok)
            if smi and smi not in seen and smi.strip() != "O":
                seen.add(smi)
                matched.append((tok.title(), smi, 88, "pubchem"))
                continue
        if _plausible(tok) and tok not in unmatched:
            unmatched.append(tok)

    return matched, no_struct, unmatched[:25]


class OcrItem(BaseModel):
    name: str
    smiles: str
    concentration: float
    score: int
    source: str = "local"  # "local" (offline dict) or "pubchem"


class OcrOut(BaseModel):
    raw_text: str
    items: list[OcrItem]
    recognized_no_structure: list[str]
    unmatched: list[str]


@router.post("/", response_model=OcrOut)
async def read_label(file: UploadFile = File(...), online: bool = True):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")

    # OCR (lazy imports so the app still boots if the libs are missing)
    try:
        import pytesseract
        from PIL import Image, ImageOps
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=503, detail=f"OCR libs not installed: {e}")

    try:
        img = Image.open(io.BytesIO(data)).convert("L")
        img = ImageOps.autocontrast(img)
        text = pytesseract.image_to_string(img, lang="eng")
    except pytesseract.TesseractNotFoundError:
        raise HTTPException(status_code=503, detail="tesseract binary not installed on server")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"OCR failed: {e}")

    matched_ranked, no_struct, unmatched = resolve(text, online=online)

    # dedupe by SMILES while keeping first (highest-%) occurrence
    items: list[OcrItem] = []
    seen: set[str] = set()
    rank = 0
    for name, smiles, score, source in matched_ranked:
        if smiles in seen:
            continue
        seen.add(smiles)
        # INCI lists are ordered high→low concentration; assign a decaying default %.
        conc = max(0.5, round(18 * (0.6 ** rank), 1))
        items.append(OcrItem(name=name.title(), smiles=smiles, concentration=conc, score=score, source=source))
        rank += 1

    return OcrOut(
        raw_text=text.strip(),
        items=items,
        recognized_no_structure=no_struct,
        unmatched=unmatched,
    )
