# RalphGuard — การเตรียมข้อมูลและความใหม่ของระบบ QSAR

เอกสารนี้อธิบายสถานะ **ปัจจุบันของ branch `codex/main-logic-completion`** และแทนข้อมูลรุ่นเก่าที่เคยระบุ `n=144/147` ทุก endpoint

## 1. ชุดข้อมูลที่ใช้โดย training pipeline

`data_prep.py` อ้างอิงไฟล์ base dataset ที่เครื่องผู้พัฒนาภายใต้ `data/raw/`:

| Endpoint | Base file |
|---|---|
| Skin irritation | `data/raw/skin_irritation.csv` |
| Eye irritation | `data/raw/eye_irritation.csv` |
| Skin sensitization | `data/raw/llna_sensitization.csv` |
| Acute toxicity | `data/raw/catmos_acute_toxicity.csv` |

ไฟล์ `data/raw/*` ถูก `.gitignore` จึง **ไม่สามารถตรวจ raw row count หรือ provenance รายแถวจาก clone ของ GitHub เพียงอย่างเดียวได้** ต้องใช้ไฟล์ต้นฉบับบนเครื่องที่ใช้ train

ตัวเลขที่ยืนยันได้จาก production `scientific/models/validation_report.json` หลัง preprocessing ปัจจุบันคือ:

| Endpoint | N | Positive | Negative |
|---|---:|---:|---:|
| Skin | 96 | 38 | 58 |
| Eye | 107 | 44 | 63 |
| Sensitization | 86 | 30 | 56 |
| Acute | 81 | 29 | 52 |

ดังนั้นเอกสารเก่าที่เคยระบุว่า skin/eye มี 144 ตัวและเป็นชุดเดียวกัน **ไม่ใช่สถานะ production ปัจจุบัน** และไม่ควรใช้อ้างอิงในการนำเสนอรอบชิง

## 2. Supplemental PubChem-reviewed evidence

ระบบมีไฟล์เสริม:

```text
data/curated/pubchem_verified_skin.csv
data/curated/pubchem_verified_eye.csv
data/curated/pubchem_verified_sens.csv
data/curated/pubchem_verified_acute.csv
```

จาก `pubchem_verified_manifest.json` ปัจจุบันมี unique structures ที่พร้อมเป็น supplemental candidate:

- Skin: 14
- Eye: 18
- Sensitization: 9
- Acute: 19

ข้อมูลกลุ่มนี้เป็นหลักฐานที่ผ่าน review/consensus gate แล้ว แต่หลายรายการเป็น `regulatory_consensus_weak_label` และใช้ `sample_weight=0.5`

**ห้ามตีความว่า PubChem structure ทุกตัวเป็น training label** และห้ามตีความ “ไม่พบ hazard” เป็น label 0

## 3. Current cleaning pipeline (`data_prep.py`)

ต่อ endpoint ระบบทำ:

1. โหลด base dataset
2. ถ้ามี reviewed PubChem supplemental file ให้ append เข้า training pool
3. canonicalize SMILES ด้วย RDKit
4. ตัด invalid structure
5. ตรวจโมเลกุลที่มี label ขัดแย้งและ exclude จนกว่าจะ review
6. deduplicate ตาม canonical structure
7. สร้าง molecular features ด้วย shared `scientific/featurizer.py`
8. ใช้ sample weight สำหรับ supplemental weak labels
9. train Soft-Voting Ensemble
10. สร้าง 5-fold out-of-fold prediction สำหรับ production validation metrics

ก่อน candidate-v2 retraining ต้องรันเพิ่ม:

```powershell
python scripts/check_training_integrity.py --strict-conflicts --require-all
```

สคริปต์นี้เพิ่มการตรวจระดับ InChIKey, exact molecular duplicate, label conflict และ external exact overlap

## 4. Molecular representation

Shared featurizer ใช้เหมือนกันทั้ง train และ inference:

- Morgan/ECFP fingerprint: radius 2, 2048 bits
- MACCS keys: 167 bits
- Molecular descriptors 10 ตัว เช่น MW, logP, TPSA, HBD, HBA, rotatable bonds, aromatic rings, heavy atoms, FractionCSP3 และ ring count

Feature mode ปัจจุบัน:

| Endpoint | Feature mode |
|---|---|
| Skin | MACCS + descriptors |
| Eye | MACCS + descriptors |
| Sensitization | Morgan |
| Acute | Morgan + MACCS + descriptors |

## 5. Model algorithm

RalphGuard ไม่ได้คิดค้น Random Forest หรือ QSAR ขึ้นใหม่ แต่สร้าง **trained QSAR models ของโครงการเอง** จาก pipeline นี้

Ensemble ประกอบด้วย:

- Random Forest
- Extra Trees
- Logistic Regression
- HistGradientBoosting

ผล probability ของสมาชิกทั้ง 4 ถูกเฉลี่ยแบบ Soft Voting

Operating threshold ต่อ endpoint เลือกด้วย Youden's J

## 6. Validation terminology ที่ต้องใช้ให้ถูก

### Production ปัจจุบัน

ใช้ **5-fold stratified out-of-fold internal validation**

หมายความว่าแต่ละสารได้ prediction จาก fold model ที่ไม่ได้ `.fit()` สารนั้น แต่ยังไม่ใช่ independent external validation

### Candidate v2

`scripts/train_candidate_v2.py` เพิ่ม:

- like-for-like 5-fold OOF
- nested stratified CV
- scaffold-grouped CV
- optional independent external validation เมื่อ exact identity overlap = 0

## 7. Data leakage protection

ระดับ production เดิมมี canonical-SMILES dedup และ conflict exclusion

Candidate-v2 audit เพิ่ม:

```text
Canonical SMILES
      ↓
InChI / InChIKey
      ↓
Exact identity duplicate audit
      ↓
Label conflict audit
      ↓
Training manifest
      ↓
External exact-overlap audit
```

เกณฑ์สำหรับ external set:

```text
Train InChIKey ∩ External InChIKey = 0
```

## 8. Applicability Domain และ uncertainty

ระบบใช้ Morgan/Tanimoto similarity แบบ k-NN (`k=5`) สำหรับ Applicability Domain และรายงาน confidence จากหลายองค์ประกอบ:

1. Applicability Domain
2. prediction probability extremity
3. structural-alert agreement
4. ensemble-member disagreement

ค่าความเชื่อมั่นนี้เป็น **model confidence สำหรับ screening** ไม่ใช่ clinical probability

## 9. ความใหม่ของโครงการ

ความใหม่ของ RalphGuard อยู่ที่ **system-level integration** ไม่ใช่การเสนอ classifier ใหม่:

- molecular structure resolution
- endpoint-specific QSAR
- ensemble prediction
- applicability domain
- uncertainty/confidence
- structural alerts
- formula-level aggregation
- PubChem identity/evidence pipeline
- OCR และ AI-assisted workflow
- 3D risk visualization

ดังนั้นประโยคที่เหมาะกับกรรมการคือ:

> “เราไม่ได้คิดค้น QSAR algorithm ใหม่ แต่สร้างและ validate trained QSAR models ของ RalphGuard เอง และพัฒนาระบบที่รวม structure resolution, multiple endpoints, uncertainty, applicability domain และ formulation workflow ไว้ในเครื่องมือเดียว”

## 10. ข้อจำกัดที่ต้องรายงาน

- base raw datasets ไม่ถูก commit จึงต้องเก็บ provenance/manifest จากเครื่อง train ให้ครบ
- production validation ปัจจุบันเป็น internal OOF
- dataset ต่อ endpoint ยังมีขนาดเล็ก
- supplemental PubChem evidence ส่วนหนึ่งเป็น weak regulatory consensus ไม่ใช่ direct experiment
- independent external validation ที่ผ่าน exact-overlap audit ยังต้องดำเนินการ

ดู workflow รุ่นใหม่ที่ `docs/MODEL_V2_WORKFLOW.md`
