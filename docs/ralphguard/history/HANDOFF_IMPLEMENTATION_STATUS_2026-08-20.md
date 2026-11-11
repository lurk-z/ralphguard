# RalphGuard Handoff Implementation Status — 2026-08-20

## Outcome

The five-endpoint architecture, one-click candidate-training notebook,
evidence-gated continual-learning foundation, training-exposure index, and Thai
herbal registry are implemented without overwriting production models.

Skin Dryness can now be fitted as a clearly marked **research preview**. It is
not eligible for production: the direct negative class and independent
external set remain too small, scaffold MCC is below the gate, and external
performance is poor. The UI/API must preserve this status instead of presenting
the score as validated clinical risk.

## Current data counts

| Item | Count |
|---|---:|
| Total Skin Dryness evidence rows | 10,035 |
| Unique molecular identities | 10,020 |
| Training eligible | 31 |
| Positive labels | 26 |
| Explicit negative labels | 5 |
| Unlabeled discovery pool | 10,000 |
| External structures | 6 |
| Thai herbal botanical records | 30 |

Machine-readable reports:

- `data/curated/skin_dryness_manifest.json`
- `scientific/models/candidate_v3/skin_dryness_validation_report.json`
- `data/curated/skin_dryness_echa_euh066_report.json`

## Skin Dryness validation

| Validation | AUC | MCC | Balanced accuracy |
|---|---:|---:|---:|
| 5-fold OOF | 0.823 | 0.398 | 0.769 |
| Scaffold-grouped CV | 0.723 | 0.392 | 0.723 |
| External (n=6) | 0.125 | -0.250 | 0.375 |

Promotion status: `research_only_blocked`.

## Run All

Open `notebooks/RalphGuard_Candidate_v2_Training_and_Validation.ipynb`, choose
the scientific Python kernel, and press **Run All**. The notebook:

1. verifies cached/raw evidence and provenance;
2. imports NICEATM HPPT and seeds 30 Thai herbal records;
3. audits identity, conflict, explicit negatives, and external leakage;
4. retrains all four existing endpoints into `candidate_v2`;
5. benchmarks and trains Skin Dryness into `candidate_v3`;
6. writes validation plots, model cards, and the deployment gate summary.

Candidate artifacts are never copied over production model files.
