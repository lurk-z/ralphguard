"""Evidence gate for the experimental continual-learning queue.

Queueing is explicit and never trains or promotes a model.  User observations
and RalphGuard predictions are deliberately ineligible evidence sources.
"""
from __future__ import annotations

from dataclasses import dataclass
import csv
from pathlib import Path

from rdkit import Chem

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ingredient_registry import (
    ContinualLearningQueue,
    ExperimentalEvidence,
    IngredientRegistry,
)


VERIFIED_STATUSES = {"verified", "consensus_verified"}
DISALLOWED_LABEL_SOURCES = {"model_prediction", "ralphguard_prediction", "user_prediction"}
TIER_WEIGHTS = {"A": 1.0, "B": 0.9, "C": 0.5, "D": 0.25}


@dataclass(frozen=True)
class QueueDecision:
    eligible: bool
    reason: str
    evidence_tier: str
    sample_weight: float


def external_holdout_identity_keys(endpoint: str) -> set[str]:
    """Load exact InChIKeys reserved for final/external validation."""
    repository_root = Path(__file__).resolve().parents[3]
    candidates = (
        Path("/data/external") / f"{endpoint}.csv",
        repository_root / "data" / "external" / f"{endpoint}.csv",
    )
    path = next((item for item in candidates if item.exists()), None)
    if path is None:
        return set()
    identities: set[str] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            smiles = str(row.get("smiles") or row.get("canonical_smiles") or "").strip()
            molecule = Chem.MolFromSmiles(smiles) if smiles else None
            if molecule is None:
                continue
            try:
                inchi = Chem.MolToInchi(molecule)
                key = Chem.InchiToInchiKey(inchi) if inchi else ""
            except Exception:
                key = ""
            if key:
                identities.add(key)
    return identities


def classify_evidence_tier(evidence: ExperimentalEvidence) -> str:
    kind = str(evidence.evidence_type or "").casefold()
    quality = str(evidence.source_quality or "").casefold()
    if any(token in kind for token in ("direct_experimental", "hydration", "tewl", "barrier")):
        return "A"
    if quality == "expert_curated":
        return "B"
    if evidence.review_status == "consensus_verified":
        return "C"
    return "D"


def queue_decision(
    evidence: ExperimentalEvidence,
    ingredient: IngredientRegistry | None,
    *,
    conflicting_verified_label: bool = False,
    reserved_holdout: bool = False,
) -> QueueDecision:
    tier = classify_evidence_tier(evidence)
    weight = TIER_WEIGHTS[tier]
    provenance = evidence.provenance or {}
    label_source = str(provenance.get("label_source") or provenance.get("source") or "").casefold()
    if evidence.review_status not in VERIFIED_STATUSES:
        return QueueDecision(False, "evidence_not_verified", tier, weight)
    if label_source in DISALLOWED_LABEL_SOURCES:
        return QueueDecision(False, "prediction_is_not_training_evidence", tier, weight)
    if ingredient is None or not ingredient.canonical_smiles or not ingredient.inchikey:
        return QueueDecision(False, "missing_exact_molecular_identity", tier, weight)
    if not ingredient.qsar_eligible or ingredient.substance_type != "defined_single_substance":
        return QueueDecision(False, "not_qsar_eligible_single_substance", tier, weight)
    if conflicting_verified_label:
        return QueueDecision(False, "conflicting_verified_label", tier, weight)
    if reserved_holdout:
        return QueueDecision(False, "reserved_holdout_identity", tier, weight)
    return QueueDecision(True, "verified_evidence_eligible", tier, weight)


def enqueue_verified_evidence(
    db: Session,
    evidence: ExperimentalEvidence,
    *,
    reserved_holdout_identities: set[str] | None = None,
) -> tuple[ContinualLearningQueue | None, QueueDecision]:
    """Apply the evidence gate and stage one row; never update a model."""
    ingredient = db.get(IngredientRegistry, evidence.ingredient_id)
    conflicting = db.scalar(
        select(ExperimentalEvidence.id).where(
            ExperimentalEvidence.ingredient_id == evidence.ingredient_id,
            ExperimentalEvidence.endpoint == evidence.endpoint,
            ExperimentalEvidence.review_status.in_(VERIFIED_STATUSES),
            ExperimentalEvidence.candidate_label != evidence.candidate_label,
        ).limit(1)
    ) is not None
    reserved = bool(
        ingredient
        and ingredient.inchikey
        and ingredient.inchikey in (reserved_holdout_identities or set())
    )
    decision = queue_decision(
        evidence,
        ingredient,
        conflicting_verified_label=conflicting,
        reserved_holdout=reserved,
    )
    if not decision.eligible:
        return None, decision

    existing = db.scalar(
        select(ContinualLearningQueue).where(
            ContinualLearningQueue.evidence_id == evidence.id
        ).limit(1)
    )
    if existing is not None:
        return existing, QueueDecision(True, "already_queued", existing.evidence_tier, existing.sample_weight)

    assert ingredient is not None and ingredient.canonical_smiles and ingredient.inchikey
    base_version = "candidate_v3" if evidence.endpoint == "skin_dryness" else "production"
    row = ContinualLearningQueue(
        endpoint=evidence.endpoint,
        canonical_smiles=ingredient.canonical_smiles,
        inchikey=ingredient.inchikey,
        label=int(evidence.candidate_label),
        evidence_id=evidence.id,
        evidence_tier=decision.evidence_tier,
        sample_weight=decision.sample_weight,
        review_status="queued",
        base_model_version=base_version,
        eligibility_reason=decision.reason,
    )
    db.add(row)
    db.flush()
    return row, decision
