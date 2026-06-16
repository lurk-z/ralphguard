# Scientific Engine

วิทยาศาสตร์/ML pipeline ของ RalphGuard ใช้ Python + RDKit + scikit-learn

## Modules

| File | Purpose |
|------|---------|
| `descriptors.py` | คำนวณ molecular descriptors (MW, LogP, TPSA, H-bond, ...) |
| `fingerprints.py` | สร้าง Morgan (ECFP-like) fingerprint + Tanimoto similarity |
| `applicability.py` | Applicability Domain check (k-NN Tanimoto) |
| `confidence.py` | 3-Layer Confidence aggregator |
| `mixture.py` | สูตรผสม + region sensitivity + Day 1/3/7 expansion |
| `qsar/` | QSAR models สำหรับ 4 endpoints |
| `worker.py` | Redis Streams consumer |

## Quick Tests

```bash
# Inside the scientific container or local venv:
python descriptors.py
python fingerprints.py
```

## Pipeline Overview

```
SMILES → canonicalize → descriptors + fingerprint
   → AD check → QSAR predict (× 4 endpoints)
   → rule-based agreement check
   → 3-Layer Confidence
   → (mixture aggregation if formula)
   → temporal expansion (Day 1/3/7)
   → save to DB
```

## Datasets Expected (in `/data/raw/`)

- `catmos_acute_toxicity.csv` - EPA CATMoS
- `llna_sensitization.csv`    - ICCVAM LLNA
- `skin_irritation.csv`        - ECHA / literature
- `eye_irritation.csv`         - ECETOC

See `/data/raw/README.md` for download instructions.
