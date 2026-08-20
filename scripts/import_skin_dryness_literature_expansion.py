"""Build reviewed Skin Dryness literature evidence and a source-held-out test set.

Only PubMed records with explicit endpoint language are mapped to binary labels.
Ambiguous observations remain review candidates.  A complete PubMed source is
assigned to either development or external validation, never both.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from rdkit import Chem
from rdkit.Chem import Descriptors


BASE = Path(__file__).resolve().parents[1]
TRAINING_OUTPUT = BASE / "data" / "staging" / "skin_dryness_literature_expansion.csv"
EXTERNAL_OUTPUT = BASE / "data" / "external" / "skin_dryness.csv"
REPORT_OUTPUT = BASE / "data" / "staging" / "skin_dryness_literature_expansion_report.json"
EXTERNAL_MANIFEST = BASE / "data" / "external" / "skin_dryness_manifest.json"
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
USER_AGENT = "RalphGuard/0.1 source-attributed Skin Dryness evidence importer"
MAPPING_VERSION = "skin-dryness-literature-v2.2"
ALLOWED_ATOMIC_NUMBERS = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 35, 53}

EVIDENCE_COLUMNS = (
    "record_id", "compound_name", "pubchem_cid", "cas_number",
    "raw_smiles", "canonical_smiles", "smiles", "inchi", "inchikey",
    "endpoint", "candidate_label", "label_status", "label_quality",
    "evidence_type", "evidence_subtype", "hazard_codes", "measurement_type",
    "measurement_value", "measurement_unit", "baseline_value", "control_value",
    "statistical_significance", "exposure_route", "exposure_concentration",
    "concentration_unit", "exposure_duration", "duration_unit",
    "exposure_frequency", "test_system", "species", "model_name",
    "source_name", "source_id", "source_url", "doi", "publication_year",
    "source_quality", "evidence_tier", "sample_weight", "review_status",
    "reviewer", "reviewer_note", "reviewed_at", "retrieved_at", "raw_file",
    "raw_sha256", "evidence_fingerprint", "raw_evidence", "qsar_eligible",
)

SOURCE_SPECS = {
    "31945817": {
        "role": "development",
        "title": "Effects of ingredients of dermatological vehicles on transepidermal water loss and percutaneous penetration: I. Oils and emulsifiers",
        "journal": "Journal of Dermatological Treatment",
        "year": "1992",
        "doi": "10.3109/09546639209092741",
        "required_phrases": (
            "2% cholesterol in ether",
            "other substances tested did not influence tewl significantly",
        ),
    },
    "18498456": {
        "role": "development",
        "title": "The influence of a cream containing 20% glycerin and its vehicle on skin barrier properties",
        "journal": "International Journal of Cosmetic Science",
        "year": "2001",
        "doi": "10.1046/j.1467-2494.2001.00060.x",
        "required_phrases": (
            "20% glycerin",
            "failed to show an influence of glycerin on human skin, in terms of tewl",
        ),
    },
    "29577586": {
        "role": "development",
        "title": "In vivo efficacy and properties of semisolid formulations containing panthenol",
        "journal": "Journal of Cosmetic Dermatology",
        "year": "2019",
        "doi": "10.1111/jocd.12527",
        "required_phrases": (
            "formulations without any content of panthenol",
            "transepidermal water loss decreased",
        ),
    },
    "37699769": {
        "role": "development",
        "title": "Effects of 1,3-propanediol associated, or not, with butylene glycol and/or glycerol on skin hydration and skin barrier function",
        "journal": "International Journal of Cosmetic Science",
        "year": "2024",
        "doi": "10.1111/ics.12911",
        "required_phrases": (
            "1,3-propanediol at different concentrations",
            "reduced tewl throughout the 8-h time course",
        ),
    },
    "8409532": {
        "role": "development",
        "title": "Effect of acetone, ethanol, and other solvents on human skin barrier",
        "journal": "Journal of Investigative Dermatology",
        "year": "1993",
        "doi": "",
        "required_phrases": ("acetone", "no difference in tewl"),
    },
    "8800298": {
        "role": "development",
        "title": "Patch test study with calcipotriol ointment",
        "journal": "Acta Dermato-Venereologica",
        "year": "1996",
        "doi": "10.2340/0001555576194202",
        "required_phrases": (
            "calcipotriol induced no increase of transepidermal water loss",
            "with no influence on the skin barrier",
        ),
    },
    "28117757": {
        "role": "review_only",
        "title": "Alkylglycerol Derivatives, a New Class of Skin Penetration Modulators",
        "journal": "Molecules",
        "year": "2017",
        "doi": "10.3390/molecules22010185",
        "required_phrases": ("a reduction in tewl", "alkylglycerols"),
    },
    "8746332": {
        "role": "review_only",
        "title": "Effect of topically applied lipids on surfactant-irritated skin",
        "journal": "British Journal of Dermatology",
        "year": "1996",
        "doi": "",
        "required_phrases": (
            "on normal skin, no significant differences",
            "hydrocortisone",
        ),
    },
    "4028973": {
        "role": "external",
        "title": "The influence of low concentrations of irritants on skin barrier function",
        "journal": "Derm Beruf Umwelt",
        "year": "1985",
        "doi": "",
        "required_phrases": (
            "dimethyl sulfoxide (50%) markedly influenced water vapour loss",
            "phenol (5%)",
            "did not significantly influence the loss of water",
        ),
    },
    "37950377": {
        "role": "external",
        "title": "Time-Dependent Differences in the Effects of Oleic Acid and Oleyl Alcohol",
        "journal": "Molecular Pharmaceutics",
        "year": "2023",
        "doi": "10.1021/acs.molpharmaceut.3c00648",
        "required_phrases": (
            "contrary to oleyl alcohol, oleic acid adversely affected",
            "transepidermal water loss",
        ),
    },
    "8565486": {
        "role": "external",
        "title": "Skin irritation in man: a comparative bioengineering study",
        "journal": "Contact Dermatitis",
        "year": "1995",
        "doi": "10.1111/j.1600-0536.1995.tb02045.x",
        "required_phrases": (
            "nonanoic acid",
            "no significant increase in tewl was found",
        ),
    },
    "15941007": {
        "role": "external",
        "title": "Percutaneous absorption and skin irritation upon low-level prolonged dermal exposure",
        "journal": "Toxicology and Industrial Health",
        "year": "2004",
        "doi": "10.1191/0748233704th197oa",
        "required_phrases": (
            "15 microl every 2 h for 8 h a day for four days",
            "induced cumulative irritation",
        ),
    },
}


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _fetch_pubmed(pmid: str, attempts: int = 4) -> bytes:
    url = f"{EFETCH}?db=pubmed&id={pmid}&rettype=abstract&retmode=xml"
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=60) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(1.5 * (2**attempt))
    raise RuntimeError("unreachable")


def _xml_text(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&")


def _structure(smiles: str) -> dict[str, object]:
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        raise ValueError(f"Invalid curated SMILES: {smiles}")
    canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
    inchi = Chem.MolToInchi(molecule)
    eligible = bool(
        "." not in canonical
        and all(atom.GetAtomicNum() in ALLOWED_ATOMIC_NUMBERS for atom in molecule.GetAtoms())
        and 2 <= molecule.GetNumHeavyAtoms() <= 36
        and 30 <= Descriptors.MolWt(molecule) <= 500
    )
    return {
        "raw_smiles": smiles,
        "canonical_smiles": canonical,
        "smiles": canonical,
        "inchi": inchi,
        "inchikey": Chem.InchiToInchiKey(inchi),
        "qsar_eligible": eligible,
    }


def _base_record(
    *,
    key: str,
    name: str,
    cid: int,
    cas: str,
    smiles: str,
    pmid: str,
    label: int | None,
    subtype: str,
    concentration: str,
    concentration_unit: str,
    duration: str,
    duration_unit: str,
    frequency: str,
    test_system: str,
    species: str,
    statistical_result: str,
    measurement_value: str,
    control: str,
    review_status: str,
    reviewer_note: str,
    label_quality: str = "direct_experimental",
    evidence_type: str = "direct_experimental",
    evidence_tier: str = "A",
    sample_weight: float = 1.0,
) -> dict[str, object]:
    source = SOURCE_SPECS[pmid]
    structure = _structure(smiles)
    fingerprint = _sha256_bytes(
        json.dumps(
            {
                "mapping": MAPPING_VERSION,
                "pmid": pmid,
                "key": key,
                "label": label,
                "exposure": [concentration, concentration_unit, duration, duration_unit, frequency],
            },
            sort_keys=True,
        ).encode("utf-8")
    )
    labeled = label in {0, 1}
    return {
        "record_id": f"literature:pmid{pmid}:{key}",
        "compound_name": name,
        "pubchem_cid": cid,
        "cas_number": cas,
        **structure,
        "endpoint": "skin_dryness",
        "candidate_label": label if labeled else "",
        "label_status": "direct_verified" if labeled else "review_required",
        "label_quality": label_quality if labeled else "experimental_context_incomplete",
        "evidence_type": evidence_type if labeled else "literature_review_candidate",
        "evidence_subtype": subtype,
        "hazard_codes": "",
        "measurement_type": "TEWL / skin barrier function",
        "measurement_value": measurement_value,
        "measurement_unit": "study-reported",
        "baseline_value": "study baseline",
        "control_value": control,
        "statistical_significance": statistical_result,
        "exposure_route": "dermal",
        "exposure_concentration": concentration,
        "concentration_unit": concentration_unit,
        "exposure_duration": duration,
        "duration_unit": duration_unit,
        "exposure_frequency": frequency,
        "test_system": test_system,
        "species": species,
        "model_name": "",
        "source_name": source["journal"],
        "source_id": f"PMID:{pmid}",
        "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "doi": source["doi"],
        "publication_year": source["year"],
        "source_quality": "primary_article",
        "evidence_tier": evidence_tier if labeled else "A",
        "sample_weight": sample_weight if labeled else 0.0,
        "review_status": review_status,
        "reviewer": "RalphGuard evidence mapping v2",
        "reviewer_note": reviewer_note,
        "reviewed_at": "2026-08-20",
        "retrieved_at": "",
        "raw_file": "not_committed_pubmed_xml",
        "raw_sha256": "",
        "evidence_fingerprint": fingerprint,
        "raw_evidence": statistical_result,
    }


def _development_records() -> list[dict[str, object]]:
    records = [
        _base_record(
            key="cholesterol", name="Cholesterol", cid=5997, cas="57-88-5",
            smiles="C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C",
            pmid="31945817", label=0, subtype="no_significant_tewl_increase",
            concentration="2", concentration_unit="% in ether",
            duration="3-7", duration_unit="days", frequency="twice daily",
            test_system="human back skin; atopic and non-atopic subjects", species="human",
            statistical_result="The article states that the other tested substances, including 2% cholesterol in ether, did not influence TEWL significantly.",
            measurement_value="no significant TEWL influence", control="study baseline and vehicle comparison",
            review_status="verified",
            reviewer_note="Molecule-specific negative is limited to the stated 2% formulation and repeated-exposure context; oils and mixed emulsifiers in the same paper were not mapped as defined molecules.",
        ),
        _base_record(
            key="glyceryl-monostearate", name="Glyceryl monostearate", cid=24699,
            cas="123-94-4", smiles="CCCCCCCCCCCCCCCCCC(=O)OCC(CO)O",
            pmid="31945817", label=0, subtype="no_significant_tewl_increase",
            concentration="2", concentration_unit="% in ether",
            duration="3-7", duration_unit="days", frequency="twice daily",
            test_system="human back skin; atopic and non-atopic subjects", species="human",
            statistical_result="The article reports no significant TEWL influence for the tested 2% glycerol monostearate preparation.",
            measurement_value="no significant TEWL influence", control="study baseline and vehicle comparison",
            review_status="verified",
            reviewer_note="Mapped to the defined 1-monostearin structure; commercial glyceryl-stearate mixtures are outside this molecule-specific label.",
        ),
        _base_record(
            key="glycerol", name="Glycerol", cid=753, cas="56-81-5", smiles="OCC(O)CO",
            pmid="18498456", label=0, subtype="no_significant_tewl_increase",
            concentration="20", concentration_unit="% in cream",
            duration="10", duration_unit="days", frequency="study treatment schedule",
            test_system="bilateral double-blind vehicle-controlled study (n=17)", species="human",
            statistical_result="Glycerol increased corneometer hydration but showed no influence on TEWL versus the placebo cream.",
            measurement_value="no attributable TEWL increase", control="matched placebo cream",
            review_status="verified",
            reviewer_note="Direct vehicle-controlled human evidence at 20%; this does not claim safety for every concentration or formulation.",
        ),
        _base_record(
            key="dl-panthenol", name="DL-Panthenol", cid=4678, cas="16485-10-2",
            smiles="CC(C)(CO)C(C(=O)NCCCO)O", pmid="29577586", label=0,
            subtype="no_skin_barrier_impairment", concentration="5-13",
            concentration_unit="wt% in semisolid formulations", duration="48",
            duration_unit="hours", frequency="study application schedule",
            test_system="vehicle-comparative in-vivo study in 40 women", species="human",
            statistical_result="Panthenol-containing formulations increased hydration and decreased TEWL compared with formulations without panthenol.",
            measurement_value="TEWL decreased", control="matched formulations without panthenol",
            review_status="verified",
            reviewer_note="The molecule is attributable through a with/without-panthenol comparison, but remains Tier B because the tested matrix was a formulation.",
            label_quality="formulation_attributed_experimental",
            evidence_type="controlled_formulation_attribution", evidence_tier="B", sample_weight=0.9,
        ),
        _base_record(
            key="1-3-propanediol", name="1,3-Propanediol", cid=10442, cas="504-63-2",
            smiles="OCCCO", pmid="37699769", label=0,
            subtype="no_skin_barrier_impairment", concentration="5; 10; 15",
            concentration_unit="%", duration="15 minutes; 2; 8",
            duration_unit="hours after application", frequency="single application",
            test_system="in-vivo forearm study in 30 healthy women", species="human",
            statistical_result="1,3-Propanediol applied alone at all tested concentrations increased hydration and improved barrier function; 15% produced the largest TEWL reduction.",
            measurement_value="TEWL reduced and hydration increased", control="pre-application baseline and study comparators",
            review_status="verified",
            reviewer_note="Only the molecule-alone study arms are mapped; combination arms are not converted into additional labels.",
        ),
        _base_record(
            key="acetone", name="Acetone", cid=180, cas="67-64-1", smiles="CC(=O)C",
            pmid="8409532", label=0, subtype="no_significant_tewl_increase",
            concentration="neat solvent", concentration_unit="not applicable",
            duration="1-12", duration_unit="minutes", frequency="single exposure",
            test_system="excised human skin", species="human",
            statistical_result="No TEWL difference from water-treated and unexposed controls was reported.",
            measurement_value="no significant difference", control="water and unexposed skin",
            review_status="verified",
            reviewer_note="Explicit experimental negative at the stated short exposure; absence of other evidence was not used.",
        ),
        _base_record(
            key="calcipotriol", name="Calcipotriol", cid=5288783, cas="112965-21-6",
            smiles="C[C@H](/C=C/[C@H](C1CC1)O)[C@H]2CC[C@@H]\\3[C@@]2(CCC/C3=C\\C=C/4\\C[C@H](C[C@@H](C4=C)O)O)C",
            pmid="8800298", label=0, subtype="no_significant_tewl_increase",
            concentration="50; 10; 2; 0.4", concentration_unit="microgram/g ointment",
            duration="48", duration_unit="hours", frequency="occlusive patch; separate 1-week ROAT",
            test_system="human multicentre patch test and repeated open application test",
            species="human",
            statistical_result="No increase in TEWL versus vehicle and no molecular influence on the skin barrier were reported.",
            measurement_value="no attributable TEWL increase", control="ointment vehicle",
            review_status="verified",
            reviewer_note="Negative is limited to barrier/TEWL under tested doses; the article still describes mild non-corrosive irritation.",
        ),
        _base_record(
            key="batyl-alcohol-review", name="Batyl alcohol", cid=3681, cas="544-62-7",
            smiles="CCCCCCCCCCCCCCCCCCOCC(CO)O", pmid="28117757", label=None,
            subtype="negative_control_not_established", concentration="1", concentration_unit="% w/v",
            duration="3", duration_unit="hours", frequency="single Franz-cell exposure",
            test_system="ex vivo porcine ear skin", species="swine",
            statistical_result="TEWL decreased relative to Transcutol vehicle, but the vehicle increased TEWL versus untreated skin.",
            measurement_value="20% below vehicle", control="Transcutol P vehicle and untreated skin",
            review_status="pending",
            reviewer_note="Not eligible as label 0: reduction versus an impairing vehicle is not proof of no barrier impairment versus normal skin.",
        ),
        _base_record(
            key="chimyl-alcohol-review", name="Chimyl alcohol", cid=10448487, cas="506-03-6",
            smiles="CCCCCCCCCCCCCCCCOC[C@H](CO)O", pmid="28117757", label=None,
            subtype="negative_control_not_established", concentration="1", concentration_unit="% w/v",
            duration="3", duration_unit="hours", frequency="single Franz-cell exposure",
            test_system="ex vivo porcine ear skin", species="swine",
            statistical_result="TEWL decreased relative to Transcutol vehicle, but the vehicle increased TEWL versus untreated skin.",
            measurement_value="16.6% below vehicle", control="Transcutol P vehicle and untreated skin",
            review_status="pending",
            reviewer_note="Not eligible as label 0: reduction versus an impairing vehicle is not proof of no barrier impairment versus normal skin.",
        ),
        _base_record(
            key="hydrocortisone-review", name="Hydrocortisone", cid=5754, cas="50-23-7",
            smiles="C[C@]12CCC(=O)C=C1CC[C@@H]3[C@@H]2[C@H](C[C@]4([C@H]3CC[C@@]4(C(=O)CO)O)C)O",
            pmid="8746332", label=None, subtype="baseline_change_not_explicit",
            concentration="not stated in abstract", concentration_unit="",
            duration="single application", duration_unit="", frequency="single application",
            test_system="normal and SLS-irritated human skin", species="human",
            statistical_result="Lower TEWL was reported on SLS-irritated skin; change versus baseline normal skin was not explicit.",
            measurement_value="lower than water on irritated skin", control="water-treated SLS-irritated skin",
            review_status="pending",
            reviewer_note="Not eligible as label 0 until the normal-skin baseline comparison is verified from full data.",
        ),
    ]
    return records


def _external_records() -> list[dict[str, object]]:
    records = [
        _base_record(
            key="dimethyl-sulfoxide", name="Dimethyl sulfoxide", cid=679, cas="67-68-5",
            smiles="CS(C)=O", pmid="4028973", label=1, subtype="water_vapour_loss_increase",
            concentration="50", concentration_unit="% aqueous", duration="48", duration_unit="hours",
            frequency="single occluded exposure", test_system="human Finn chamber panel (n=42)", species="human",
            statistical_result="Marked influence/increase in water vapour loss was reported.",
            measurement_value="marked increase", control="distilled-water vehicle",
            review_status="verified", reviewer_note="Reserved source-level external positive; never used for model development.",
        ),
        _base_record(
            key="phenol", name="Phenol", cid=996, cas="108-95-2", smiles="Oc1ccccc1",
            pmid="4028973", label=0, subtype="no_significant_tewl_increase",
            concentration="5", concentration_unit="% aqueous", duration="48", duration_unit="hours",
            frequency="single occluded exposure", test_system="human Finn chamber panel (n=42)", species="human",
            statistical_result="No significant influence on water loss through skin was reported.",
            measurement_value="no significant effect", control="distilled-water vehicle",
            review_status="verified", reviewer_note="Reserved source-level external negative; deeper-cell toxicity is outside this endpoint label.",
        ),
        _base_record(
            key="oleic-acid", name="Oleic acid", cid=445639, cas="112-80-1",
            smiles="CCCCCCCC/C=C\\CCCCCCCC(=O)O", pmid="37950377", label=1,
            subtype="tewl_and_impedance_barrier_impairment", concentration="0.75", concentration_unit="%",
            duration="24", duration_unit="hours", frequency="single and 4 doses every 12 h",
            test_system="ex vivo human skin", species="human",
            statistical_result="Adverse effects on TEWL and electrical impedance were reported.",
            measurement_value="adverse barrier change", control="matched vehicle without enhancer",
            review_status="verified", reviewer_note="Reserved source-level external positive; never used for model development.",
        ),
        _base_record(
            key="oleyl-alcohol", name="Oleyl alcohol", cid=5284499, cas="143-28-2",
            smiles="CCCCCCCC/C=C\\CCCCCCCCO", pmid="37950377", label=0,
            subtype="no_skin_barrier_impairment", concentration="0.75", concentration_unit="%",
            duration="24", duration_unit="hours", frequency="single and 4 doses every 12 h",
            test_system="ex vivo human skin", species="human",
            statistical_result="Unlike oleic acid, no adverse effect on the two barrier-integrity indicators was reported.",
            measurement_value="no adverse barrier change", control="matched vehicle without enhancer",
            review_status="verified", reviewer_note="Reserved source-level external negative; never used for model development.",
        ),
        _base_record(
            key="nonanoic-acid", name="Nonanoic acid", cid=8158, cas="112-05-0",
            smiles="CCCCCCCCC(=O)O", pmid="8565486", label=1, subtype="tewl_increase",
            concentration="increasing study concentrations", concentration_unit="%",
            duration="study patch exposure", duration_unit="", frequency="single exposure",
            test_system="human volunteer irritation panel (n=8)", species="human",
            statistical_result="TEWL rose with increasing concentration.", measurement_value="concentration-related increase",
            control="uninvolved skin", review_status="verified",
            reviewer_note="Reserved source-level external positive; concentration-specific raw data remain publication-defined.",
        ),
        _base_record(
            key="imipramine", name="Imipramine", cid=3696, cas="50-49-7",
            smiles="CN(C)CCCN1C2=CC=CC=C2CCC3=CC=CC=C31", pmid="8565486", label=0,
            subtype="no_significant_tewl_increase", concentration="2.5", concentration_unit="%",
            duration="study patch exposure", duration_unit="", frequency="single exposure",
            test_system="human volunteer irritation panel (n=8)", species="human",
            statistical_result="No significant TEWL increase was found at 2.5%, despite a clinical irritation score.",
            measurement_value="no significant increase", control="uninvolved skin",
            review_status="verified", reviewer_note="Barrier-specific external negative; not a general skin-irritation negative.",
        ),
    ]
    for name, cid, cas, smiles in (
        ("Nonane", 8141, "111-84-2", "CCCCCCCCC"),
        ("Dodecane", 8182, "112-40-3", "CCCCCCCCCCCC"),
        ("Tetradecane", 12389, "629-59-4", "CCCCCCCCCCCCCC"),
    ):
        records.append(
            _base_record(
                key=name.casefold(), name=name, cid=cid, cas=cas, smiles=smiles,
                pmid="15941007", label=1, subtype="repeated_exposure_tewl_and_irritation",
                concentration="15", concentration_unit="microlitre per application",
                duration="8 h/day for 4", duration_unit="days", frequency="every 2 hours",
                test_system="unoccluded dermal exposure in CD hairless rats", species="rat",
                statistical_result="TEWL/erythema response and cumulative irritation were reported after repeat exposure.",
                measurement_value="compound-specific cumulative irritation", control="untreated control",
                review_status="verified", reviewer_note="Reserved source-level external positive; animal-to-human shift is reported, not hidden.",
            )
        )
    return records


def _write_csv(path: Path, rows: list[dict[str, object]], *, external: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = list(EVIDENCE_COLUMNS)
    if external:
        columns.insert(columns.index("candidate_label") + 1, "label")
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            output = dict(row)
            if external:
                output["label"] = output["candidate_label"]
            writer.writerow(output)


def import_literature(*, refresh: bool = False) -> dict[str, object]:
    if all(path.exists() for path in (TRAINING_OUTPUT, EXTERNAL_OUTPUT, REPORT_OUTPUT, EXTERNAL_MANIFEST)) and not refresh:
        cached = json.loads(REPORT_OUTPUT.read_text(encoding="utf-8"))
        if cached.get("mapping_version") == MAPPING_VERSION:
            return cached

    fetched: dict[str, dict[str, str]] = {}
    for pmid, spec in SOURCE_SPECS.items():
        raw = _fetch_pubmed(pmid)
        text = _xml_text(raw).casefold()
        missing = [phrase for phrase in spec["required_phrases"] if phrase.casefold() not in text]
        if missing:
            raise RuntimeError(f"PMID:{pmid} source verification failed; missing {missing}")
        fetched[pmid] = {"sha256": _sha256_bytes(raw), "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"}
        time.sleep(0.34)

    retrieved_at = datetime.now(timezone.utc).isoformat()
    development = _development_records()
    external = _external_records()
    for row in development + external:
        pmid = str(row["source_id"]).split(":", 1)[1]
        row["retrieved_at"] = retrieved_at
        row["raw_sha256"] = fetched[pmid]["sha256"]

    development_sources = {str(row["source_id"]) for row in development}
    external_sources = {str(row["source_id"]) for row in external}
    source_overlap = sorted(development_sources.intersection(external_sources))
    if source_overlap:
        raise RuntimeError(f"Source-level development/external leakage: {source_overlap}")
    development_ids = {str(row["inchikey"]) for row in development if row["candidate_label"] in {0, 1}}
    external_ids = {str(row["inchikey"]) for row in external}
    exact_overlap = sorted(development_ids.intersection(external_ids))
    if exact_overlap:
        raise RuntimeError(f"Exact development/external molecular overlap: {exact_overlap}")
    if any(not bool(row["qsar_eligible"]) for row in external):
        raise RuntimeError("External set contains a structure outside the molecular QSAR domain")

    _write_csv(TRAINING_OUTPUT, development)
    _write_csv(EXTERNAL_OUTPUT, external, external=True)
    external_manifest = {
        "dataset": "skin_dryness_source_held_out_external_v2",
        "generated_at": retrieved_at,
        "mapping_version": MAPPING_VERSION,
        "freeze_policy": "source-held-out; not used for feature, threshold, hyperparameter, class-weight, or evidence-weight selection",
        "source_ids": sorted(external_sources),
        "unique_identities": len(external_ids),
        "positive": sum(int(row["candidate_label"] == 1) for row in external),
        "negative": sum(int(row["candidate_label"] == 0) for row in external),
        "development_source_overlap": source_overlap,
        "development_exact_identity_overlap": exact_overlap,
        "file": str(EXTERNAL_OUTPUT.relative_to(BASE)),
        "sha256": _sha256_file(EXTERNAL_OUTPUT),
        "sources": {f"PMID:{pmid}": metadata for pmid, metadata in fetched.items() if SOURCE_SPECS[pmid]["role"] == "external"},
    }
    EXTERNAL_MANIFEST.write_text(
        json.dumps(external_manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report = {
        "generated_at": retrieved_at,
        "mapping_version": MAPPING_VERSION,
        "runtime": {"python": platform.python_version(), "rdkit": Chem.rdBase.rdkitVersion},
        "label_policy": "explicit experimental result only; no missing-evidence negatives; ambiguous comparator findings remain pending",
        "identity_policy": "RDKit canonical isomeric SMILES and InChIKey; chemical name is not a deduplication key",
        "source_split_policy": "complete PMID assigned to development, review-only, or external",
        "development": {
            "rows": len(development),
            "training_eligible": sum(row["candidate_label"] in {0, 1} and row["review_status"] == "verified" for row in development),
            "explicit_negatives": sum(row["candidate_label"] == 0 and row["review_status"] == "verified" for row in development),
            "positives": sum(row["candidate_label"] == 1 and row["review_status"] == "verified" for row in development),
            "review_required": sum(row["review_status"] != "verified" for row in development),
            "file": str(TRAINING_OUTPUT.relative_to(BASE)),
            "sha256": _sha256_file(TRAINING_OUTPUT),
        },
        "external": external_manifest,
        "sources": {f"PMID:{pmid}": {**metadata, "role": SOURCE_SPECS[pmid]["role"]} for pmid, metadata in fetched.items()},
        "raw_data_policy": "PubMed XML is retrieved from NCBI at import time; URL and SHA-256 are retained, raw XML is not committed",
    }
    REPORT_OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    print(json.dumps(import_literature(refresh=args.refresh), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
