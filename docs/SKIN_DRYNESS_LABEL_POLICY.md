# Skin Dryness Label Policy v1.1

Endpoint: `skin_dryness` — Skin Dryness Potential (ศักยภาพทำให้ผิวแห้ง)

This endpoint is separate from skin irritation/corrosion. It screens a defined molecule for evidence-associated dryness, cracking, hydration loss, or skin-barrier impairment under stated exposure conditions. It is not a clinical diagnosis and does not establish finished-formulation safety.

## Observation schema

Evidence is stored as an exposure-specific observation before any molecule-level aggregation. Records preserve molecular identity, measurement, concentration, route, duration, frequency, test system, species, source identifier/URL, retrieval time, source hash, evidence tier, review status, and reviewer note. InChIKey is the primary identity; canonical isomeric SMILES is the fallback.

## Labels

Label 1 requires source-attributed evidence of at least one of:

- observed dryness, scaling, or cracking;
- significantly increased TEWL or other reviewed barrier impairment;
- significantly reduced skin/stratum-corneum hydration; or
- `EUH066`/`AUH066`, recorded only as a regulatory weak positive.

Label 0 requires explicit evidence under a stated exposure, such as:

- no observed dryness or cracking;
- no significant TEWL increase;
- no significant hydration decrease; or
- no skin-barrier impairment.

Missing `EUH066`, “Not Classified”, absent hazard text, an old prediction, or a low model score is unknown—not label 0. Unknown records may support discovery and applicability-domain analysis but are excluded from supervised training.

## Evidence tiers and centralized weights

| Tier | Evidence | Weight |
|---|---|---:|
| A | Direct experimental/reference evidence | 1.00 |
| B | Strong curated or expert-reviewed explicit evidence | 0.90 |
| C | Multi-source regulatory consensus | 0.50 |
| D | Single-source regulatory evidence | 0.25 |

The canonical implementation is `TIER_WEIGHT` in `scripts/skin_dryness_workflow.py`.

## Exposure-aware aggregation

Aggregation first selects the best available evidence tier for each exact molecular identity. It then compares route, concentration, duration, frequency, measurement type, test system, and species.

- Same-tier opposite labels under the same exposure context are quarantined.
- Opposite labels under different exposure contexts are marked `review_required`.
- No majority vote is allowed across incompatible exposure conditions.
- A higher-tier observation may supersede a contradictory lower-tier regulatory observation, while the lower-tier record remains in the audit trail.
- Evidence that cannot safely become one molecule-level label is excluded from fitting.

## Discovery sources

ICSC dryness phrases create Tier B review candidates only; keyword presence never auto-labels training data. EUH066/AUH066 records remain Tier C/D weak positives. Literature rows require phrase verification, source-level provenance, and a reproducible source hash. Comparator treatments that only improve a harmful vehicle, without establishing a non-drying baseline result, remain review-only.

## External holdout and promotion

External evidence is split by source before model development. Its identities are quarantined before conflict resolution and fitting. It is never used for feature, threshold, hyperparameter, class-weight, or evidence-weight selection. Exact training/external identity overlap must be zero; source and scaffold overlap are reported.

New artifacts are written only to `scientific/models/candidate_v3/`. Promotion fails closed when class counts, explicit negatives, independent external counts, validation metrics, manifest hashes, overlap checks, conflicts, or protected production-artifact checks fail. Manual promotion is required even when every gate passes.
