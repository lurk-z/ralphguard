"""Conservative harmonization of NICE/ICE reference evidence.

This module converts *only clearly interpretable* in-vivo reference records into
candidate RalphGuard binary labels. It never marks a record as reviewed and it
never writes training data by itself.

Rules are intentionally conservative:
- skin/eye numeric Draize scores are not auto-classified because OECD 404/405
  require interpretation of lesion severity and reversibility, not one score.
- LLNA Stimulation Index (SI) >= 3 can support a positive sensitizer candidate;
  SI < 3 alone is not treated as a definitive negative.
- acute oral LD50 values are mapped to RalphGuard's current binary boundary:
  <= 2000 mg/kg -> positive hazard candidate, > 2000 mg/kg -> negative candidate.
- explicit Positive/Negative or GHS category text is accepted only when the
  wording is unambiguous for the endpoint.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Any, Iterable


SUPPORTED_ASSAYS = {
    "Rabbit Draize Skin Irritation/Corrosion Test": "skin",
    "Rabbit Draize Eye Irritation/Corrosion Test": "eye",
    "Murine Local Lymph Node Assay (LLNA)": "sens",
    "Guinea Pig Maximization/Buehler": "sens",
    "Rat Acute Oral Toxicity": "acute",
}


@dataclass(frozen=True)
class HarmonizedVote:
    label: int | None
    status: str
    rule: str
    reason: str
    value: float | None = None
    unit: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "candidate_label": self.label,
            "mapping_status": self.status,
            "mapping_rule": self.rule,
            "mapping_reason": self.reason,
            "normalized_value": self.value,
            "normalized_unit": self.unit,
        }


def _flatten_text(value: Any) -> list[str]:
    out: list[str] = []
    if value is None:
        return out
    if isinstance(value, dict):
        for item in value.values():
            out.extend(_flatten_text(item))
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            out.extend(_flatten_text(item))
    elif isinstance(value, (str, int, float, bool)):
        text = str(value).strip()
        if text:
            out.append(text)
    return out


def _record_text(record: dict[str, Any]) -> str:
    # Explicit positive/negative classification is intentionally limited to the
    # endpoint/value fields. Searching every raw field could mistake phrases such
    # as "negative control" for a chemical-level negative classification.
    fields = [record.get("ice_endpoint"), record.get("ice_value"), record.get("ice_unit")]
    return " | ".join(_flatten_text(fields)).casefold()


def _explicit_binary(text: str, endpoint: str) -> HarmonizedVote | None:
    negative_common = (
        "not classified",
        "not-classified",
        "no classification",
        "no category",
        "negative",
        "non-irritant",
        "non irritant",
        "not irritating",
        "non-sensitizer",
        "non sensitizer",
        "not sensitizing",
        "not sensitising",
    )
    if any(token in text for token in negative_common):
        return HarmonizedVote(0, "auto_candidate", "explicit_negative", "explicit endpoint-negative classification")

    if endpoint in {"skin", "eye"}:
        positive_tokens = (
            "corrosive",
            "irritant",
            "irritating",
            "category 1",
            "category 2",
            "category 2a",
            "category 2b",
            "cat 1",
            "cat 2",
            "positive",
        )
        if any(token in text for token in positive_tokens):
            return HarmonizedVote(1, "auto_candidate", "explicit_irritation_hazard", "explicit irritation/corrosion classification")

    if endpoint == "sens":
        if any(token in text for token in ("sensitizer", "sensitiser", "sensitizing", "sensitising", "positive")):
            return HarmonizedVote(1, "auto_candidate", "explicit_sensitizer", "explicit sensitization-positive classification")

    if endpoint == "acute":
        if re.search(r"\b(?:ghs\s*)?(?:category|cat)\s*[1-4]\b", text):
            return HarmonizedVote(1, "auto_candidate", "explicit_acute_category_1_4", "explicit acute oral GHS category 1-4")
        if re.search(r"\b(?:ghs\s*)?(?:category|cat)\s*5\b", text):
            return HarmonizedVote(0, "auto_candidate", "explicit_acute_category_5", "GHS category 5 is above RalphGuard's <=2000 mg/kg positive boundary")
        if "positive" in text:
            return HarmonizedVote(1, "auto_candidate", "explicit_acute_positive", "explicit acute-toxicity positive classification")

    return None


def _extract_number(text: str) -> float | None:
    match = re.search(r"(?<![\w.])([0-9]+(?:\.[0-9]+)?)", text.replace(",", ""))
    if not match:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _extract_operator(text: str) -> str:
    compact = text.replace(" ", "")
    for op in (">=", "<=", ">", "<", "="):
        if op in compact:
            return op
    return "="


def _normalize_mass_per_kg(value: float, text: str) -> tuple[float | None, str | None]:
    normalized = text.replace("μ", "u").replace("µ", "u").casefold()
    # Check micrograms before grams because the literal substring "g/kg" also
    # occurs inside "ug/kg".
    if "ug/kg" in normalized or "ug kg" in normalized or "ug·kg" in normalized:
        return value / 1000.0, "mg/kg"
    if "mg/kg" in normalized or "mg kg" in normalized or "mg·kg" in normalized:
        return value, "mg/kg"
    if "g/kg" in normalized or "g kg" in normalized or "g·kg" in normalized:
        return value * 1000.0, "mg/kg"
    return None, None


def _llna_vote(record: dict[str, Any]) -> HarmonizedVote:
    endpoint_text = str(record.get("ice_endpoint") or "").casefold()
    raw = record.get("raw_record") or {}
    combined = " | ".join(_flatten_text([record.get("ice_value"), raw]))
    if "stimulation index" not in endpoint_text and not re.search(r"\bsi\b", endpoint_text):
        return HarmonizedVote(None, "review_required", "llna_unmapped_endpoint", "LLNA record does not expose an explicit classification or Stimulation Index field")
    value = _extract_number(combined)
    if value is None:
        return HarmonizedVote(None, "review_required", "llna_si_missing", "LLNA Stimulation Index could not be parsed")
    if value >= 3.0:
        return HarmonizedVote(1, "auto_candidate", "llna_si_ge_3", "LLNA Stimulation Index >= 3 supports sensitizer classification", value=value, unit="SI")
    return HarmonizedVote(None, "supportive_negative_only", "llna_si_lt_3", "SI < 3 at one record/dose is not sufficient by itself for a definitive negative label", value=value, unit="SI")


def _acute_ld50_vote(record: dict[str, Any], text: str) -> HarmonizedVote:
    endpoint_text = str(record.get("ice_endpoint") or "").casefold()
    raw = record.get("raw_record") or {}
    value_text = " | ".join(_flatten_text([record.get("ice_value"), record.get("ice_unit"), raw]))
    if "ld50" not in endpoint_text and "ld50" not in text and "lethal dose" not in text:
        return HarmonizedVote(None, "review_required", "acute_unmapped_endpoint", "acute oral record is not an explicit classification and does not expose LD50")
    value = _extract_number(value_text)
    if value is None:
        return HarmonizedVote(None, "review_required", "acute_ld50_missing", "LD50 numeric value could not be parsed")
    mgkg, unit = _normalize_mass_per_kg(value, value_text)
    if mgkg is None:
        return HarmonizedVote(None, "review_required", "acute_ld50_unit_unknown", "LD50 unit is not clearly convertible to mg/kg")

    operator = _extract_operator(value_text)
    boundary = 2000.0
    if operator in {"<", "<="} and mgkg <= boundary:
        return HarmonizedVote(1, "auto_candidate", "acute_ld50_upper_le_2000", "oral LD50 upper bound is <= 2000 mg/kg", value=mgkg, unit=unit)
    if operator == ">" and mgkg >= boundary:
        return HarmonizedVote(0, "auto_candidate", "acute_ld50_lower_gt_2000", "oral LD50 is strictly > 2000 mg/kg", value=mgkg, unit=unit)
    if operator == ">=":
        if mgkg > boundary:
            return HarmonizedVote(0, "auto_candidate", "acute_ld50_lower_above_2000", "oral LD50 lower bound is above 2000 mg/kg", value=mgkg, unit=unit)
        if mgkg == boundary:
            return HarmonizedVote(None, "review_required", "acute_ld50_boundary_ambiguous", ">= 2000 mg/kg includes the positive boundary value 2000", value=mgkg, unit=unit)
    if operator == "=":
        return HarmonizedVote(
            1 if mgkg <= boundary else 0,
            "auto_candidate",
            "acute_ld50_exact_boundary",
            "oral LD50 mapped against RalphGuard <= 2000 mg/kg binary boundary",
            value=mgkg,
            unit=unit,
        )
    return HarmonizedVote(None, "review_required", "acute_ld50_ambiguous", "LD50 comparison cannot be mapped conservatively", value=mgkg, unit=unit)


def harmonize_record(record: dict[str, Any]) -> dict[str, Any]:
    assay = str(record.get("assay") or "").strip()
    endpoint = str(record.get("ralphguard_endpoint") or SUPPORTED_ASSAYS.get(assay) or "").strip()
    text = _record_text(record)

    if assay not in SUPPORTED_ASSAYS or endpoint != SUPPORTED_ASSAYS.get(assay):
        vote = HarmonizedVote(None, "unsupported", "unsupported_assay", "record is not from a whitelisted in-vivo reference assay")
    else:
        explicit = _explicit_binary(text, endpoint)
        if explicit is not None:
            vote = explicit
        elif endpoint in {"skin", "eye"}:
            vote = HarmonizedVote(
                None,
                "review_required",
                "draize_numeric_requires_context",
                "OECD 404/405 interpretation depends on lesion severity/reversibility; numeric Draize observations are not auto-binarized",
            )
        elif endpoint == "sens" and assay == "Murine Local Lymph Node Assay (LLNA)":
            vote = _llna_vote(record)
        elif endpoint == "sens":
            vote = HarmonizedVote(None, "review_required", "guinea_pig_requires_explicit_call", "Guinea-pig sensitization record needs an explicit positive/negative classification")
        elif endpoint == "acute":
            vote = _acute_ld50_vote(record, text)
        else:
            vote = HarmonizedVote(None, "review_required", "unmapped", "no conservative mapping rule matched")

    return {**record, **vote.as_dict()}


def aggregate_endpoint(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    mapped = [harmonize_record(record) for record in records]
    if not mapped:
        return {"candidate_label": None, "mapping_status": "no_records", "mapping_reason": "no records", "records": []}

    labels = {item["candidate_label"] for item in mapped if item.get("candidate_label") in {0, 1}}
    if labels == {0, 1}:
        status, label, reason = "conflict_review_required", None, "mapped records contain both positive and negative evidence"
    elif labels == {1}:
        status, label, reason = "candidate_requires_review", 1, "one or more conservative mapping rules support a positive candidate"
    elif labels == {0}:
        status, label, reason = "candidate_requires_review", 0, "one or more conservative mapping rules support a negative candidate"
    else:
        status, label, reason = "review_required", None, "no record is strong enough for an automatic binary candidate"

    return {
        "candidate_label": label,
        "mapping_status": status,
        "mapping_reason": reason,
        "record_count": len(mapped),
        "mapped_record_count": sum(item.get("candidate_label") in {0, 1} for item in mapped),
        "records": mapped,
    }
