"""Ingredient registry request/response contracts."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


SubstanceType = Literal[
    "defined_single_substance",
    "salt",
    "polymer",
    "silicone",
    "botanical_extract",
    "mixture",
    "fragrance",
    "UVCB",
    "inorganic",
    "unknown_composition",
]


class RegistryLookupInput(BaseModel):
    name: str = Field(..., min_length=2, max_length=300)
    refresh: bool = False


class RegistryVerifyInput(BaseModel):
    action: Literal["verify", "reject"] = "verify"
    canonical_name: str | None = Field(None, min_length=1, max_length=300)
    canonical_smiles: str | None = Field(None, max_length=2000)
    substance_type: SubstanceType | None = None
    structure_status: str | None = Field(None, max_length=40)
    qsar_eligible: bool | None = None
    reviewer_note: str | None = Field(None, max_length=1000)


class EvidenceReviewInput(BaseModel):
    action: Literal["verify", "reject"]
    reviewer_note: str = Field(..., min_length=3, max_length=2000)


class PubChemEvidenceImportInput(BaseModel):
    refresh: bool = False


class PubChemEvidenceBulkInput(BaseModel):
    registry_ids: list[int] = Field(..., min_length=1, max_length=200)
    refresh: bool = False


class ExperimentalEvidenceOut(BaseModel):
    id: int
    ingredient_id: int
    pubchem_cid: int
    endpoint: Literal["skin", "eye", "sens", "acute"]
    candidate_label: int
    evidence_type: str
    hazard_codes: list[str]
    source_name: str
    source_id: str | None
    source_url: str | None
    source_quality: str
    raw_evidence: dict[str, Any]
    provenance: dict[str, Any]
    review_status: str
    reviewer_note: str | None
    imported_at: datetime
    reviewed_at: datetime | None
    updated_at: datetime


class EvidenceImportSummary(BaseModel):
    ingredient_id: int
    pubchem_cid: int
    imported: int
    existing: int
    by_endpoint: dict[str, int]
    evidence: list[ExperimentalEvidenceOut]


class TrainingExportSummary(BaseModel):
    endpoint: Literal["skin", "eye", "sens", "acute"]
    verified_rows: int
    unique_structures: int
    skipped_conflicts: int
    skipped_ineligible: int
    rows: list[dict[str, Any]]


class IngredientRegistryOut(BaseModel):
    id: int
    inci_name: str | None
    canonical_name: str
    thai_names: list[str]
    synonyms: list[str]
    cas_number: str | None
    pubchem_cid: int | None
    canonical_smiles: str | None
    inchi: str | None
    inchikey: str | None
    molecular_formula: str | None
    molecular_weight: float | None
    substance_type: str
    structure_status: str
    qsar_eligible: bool
    assessment_method: str
    regulatory_status_th: dict[str, Any] | None
    provenance: dict[str, Any]
    verification_status: str
    registry_version: int
    observation_count: int
    reason_code: str | None = None
    reason_th: str | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    updated_at: datetime


class SubstanceHazardSummary(BaseModel):
    endpoint: Literal["skin", "eye", "sens", "acute"]
    hazard_codes: list[str]
    source_count: int
    verification: Literal["pending", "consensus_verified", "verified"]


class SubstanceProfileOut(BaseModel):
    """Read-only, evidence-backed information used by ingredient hover cards."""

    found_in_registry: bool
    canonical_name: str
    inci_name: str | None = None
    pubchem_cid: int | None = None
    canonical_smiles: str | None = None
    molecular_formula: str | None = None
    molecular_weight: float | None = None
    substance_type: str
    structure_status: str
    qsar_eligible: bool | None = None
    assessment_method: str
    verification_status: str
    description: str | None = None
    description_source: str | None = None
    description_url: str | None = None
    hazards: list[SubstanceHazardSummary] = Field(default_factory=list)
