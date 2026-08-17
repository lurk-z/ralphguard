# Experimental irritation-negative pipeline

RalphGuard supplements the ICE training tables with explicit experimental
non-irritant records from the peer-reviewed STopTox skin and eye irritation
datasets. The source SDF files are pinned to author-repository commit
`6ba3a7f82ab9fda8534f120114a566eec296e8ae` and verified by SHA-256 before any
row is accepted.

Sources:

- Paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC8863177/
- Author dataset repository: https://github.com/joyvb/stoptox
- ICE download index: https://ice.ntp.niehs.nih.gov/downloads/DataonICE/

## Label policy

- Accept only an explicit curated experimental `Outcome = 0`.
- Never infer a negative label from a missing H315/H319 statement.
- Skin records must identify an accepted in-vivo guideline or equivalent
  (`OECD TG 404`, `EU B.4`, or the supported EPA equivalents) and an accepted
  species.
- Eye records use the paper's curated Draize/OECD experimental endpoint. The
  public balanced SDF does not expose a per-record Klimisch score, so the
  exported rows state `reliability = not_reported_per_record_in_public_sdf`
  and receive weight `0.9`; they are not represented as reliability 1/2.
- Salts, mixtures, unsupported elements, invalid structures, and structures
  outside the configured molecular domain are rejected or sent to review.
- Exact identities are canonicalized, deduplicated, checked against stronger
  positive labels, and quarantined when they overlap an external holdout.
- Same-priority label conflicts are excluded from training. Lower-priority
  regulatory weak-label conflicts are overridden by experimental evidence.

## Reproducible command

```powershell
docker compose --profile training run --rm -T trainer `
  python scripts/prepare_experimental_negatives.py
```

The command writes:

- `data/curated/skin_negative_clean.csv`
- `data/curated/eye_negative_clean.csv`
- `data/curated/experimental_negative_manifest.json`
- `data/staging/experimental_negative_review_queue.csv`

The current manifest contains 216 new Skin negatives and 1,045 new Eye
negatives. Another 140 records are retained in the review queue with explicit
rejection reasons instead of being silently discarded.

## Training behavior

`scripts/train_candidate_v2.py` treats these rows as
`external_experimental`. They share the highest evidence-priority tier with
the base ICE experimental data and rank above reviewed NICE rows and PubChem
regulatory weak labels. Candidate artifacts are written under
`scientific/models/candidate_v2`; production models are not promoted or
overwritten automatically.
