# Skin Dryness Endpoint

`skin_dryness` is an optional fifth RalphGuard endpoint. Production readiness
still requires only the original four artifacts. A Candidate-v3 file can be
hot-loaded by the long-running worker only when it contains the explicit
`research_preview` marker; API/UI output labels it as experimental.

## Evidence policy

- Direct TEWL/skin-hydration positives and explicit negatives retain study and
  exposure context.
- EUH066 is a weighted regulatory weak positive (tier C), not direct
  experimental ground truth.
- Absence of EUH066/AUH066 is never a negative label.
- Whole herbs, extracts, essential oils, and variable formulations never enter
  single-molecule QSAR as one surrogate SMILES.
- Exact external identities are removed before training; same-tier conflicts
  are excluded.

## Training workflow

The Run All notebook benchmarks Morgan, MACCS+descriptors, and their combined
representation. Selection prioritizes scaffold MCC and balanced accuracy over
random OOF AUC. It then fits the four-member soft-voting ensemble and reports
OOF, scaffold-grouped, and external validation separately.

Current feature selection chose `maccs_descr`. The candidate remains
`research_only_blocked` because there are only five training negatives, six
external structures, scaffold MCC is 0.392, and external AUC is 0.125.

## Running

Rebuild the trainer image after dependency changes:

```powershell
docker compose build trainer
```

Open `notebooks/RalphGuard_Candidate_v2_Training_and_Validation.ipynb`, select
the trainer/scientific Python kernel, and press **Run All**. Outputs are written
under `scientific/models/candidate_v2/` and `candidate_v3/`; production files
are unchanged.
