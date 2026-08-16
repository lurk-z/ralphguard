# RalphGuard QSAR Model v2 — Workflow สำหรับรอบชิง

เอกสารนี้กำหนด workflow เพิ่มข้อมูลฝึก, ตรวจ provenance/data leakage และสร้าง **Candidate v2** โดยไม่เขียนทับ production model เดิมจนกว่าจะ review ผลครบ

## 1. Production baseline ปัจจุบัน

ค่าที่อยู่ใน `scientific/models/validation_report.json` เป็น **5-fold out-of-fold internal validation** ไม่ใช่ independent external validation

| Endpoint | N | Positive | Negative | AUC | MCC |
|---|---:|---:|---:|---:|---:|
| Skin irritation | 96 | 38 | 58 | 0.926 | 0.776 |
| Eye irritation | 107 | 44 | 63 | 0.886 | 0.623 |
| Skin sensitization | 86 | 30 | 56 | 0.896 | 0.620 |
| Acute toxicity | 81 | 29 | 52 | 0.903 | 0.736 |

Production `.pkl` ทั้ง 4 ไฟล์ยังคงเป็น baseline จนกว่าจะมีการ promote แบบตั้งใจภายหลัง

## 2. แยกบทบาทของข้อมูลให้ชัด

RalphGuard แยกข้อมูลเป็นคนละชั้น:

1. **Chemical identity / structure** — PubChem PUG REST, RDKit, InChIKey
2. **Regulatory hazard evidence** — PubChem PUG-View GHS Classification
3. **Endpoint-specific reference/in-vivo evidence** — NICEATM Integrated Chemical Environment (ICE)
4. **Training dataset** — เฉพาะแถวที่ผ่าน review gate และ exact-identity audit แล้ว

ดังนั้น:

- พบโครงสร้างใน PubChem **ไม่เท่ากับ** มี toxicity label
- ไม่พบ GHS hazard **ไม่เท่ากับ** label 0
- ผลจากโมเดลอื่น เช่น CATMoS prediction **ไม่ถูกใช้เป็น direct experimental label**

## 3. PubChem supplemental evidence

ไฟล์ `data/curated/pubchem_verified_<endpoint>.csv` เป็น supplemental evidence ที่ผ่าน review/consensus gate ของระบบแล้ว

จาก manifest ที่ commit อยู่ปัจจุบันมี unique structures:

| Endpoint | PubChem supplemental unique structures |
|---|---:|
| Skin | 14 |
| Eye | 18 |
| Sensitization | 9 |
| Acute | 19 |

กลุ่ม regulatory-consensus weak label ใช้ `sample_weight=0.5` และไม่อธิบายว่าเป็น direct in-vivo result

## 4. NICEATM ICE direct/reference evidence pipeline

### 4.1 Collect — ยังไม่สร้าง label

เปิด backend/database ก่อน:

```powershell
docker compose up -d postgres redis backend
```

ดึง endpoint-specific records โดย query **ทีละ InChIKey** เพื่อผูก evidence กับ exact molecular identity:

```powershell
docker compose exec backend python scripts/collect_nice_reference_evidence.py --endpoint all --limit 1500
```

Assay ที่ whitelist:

| RalphGuard endpoint | NICE/ICE assay |
|---|---|
| Skin | Rabbit Draize Skin Irritation/Corrosion Test |
| Eye | Rabbit Draize Eye Irritation/Corrosion Test |
| Sensitization | Murine Local Lymph Node Assay (LLNA) |
| Sensitization | Guinea Pig Maximization/Buehler |
| Acute | Rat Acute Oral Toxicity |

`CATMoS, Rat Acute Oral Toxicity` ถูกตัดออกจาก collector นี้ เพราะเป็น in-silico prediction ไม่ใช่ direct in-vivo reference result

ผล collector ถูกเก็บที่:

```text
data/staging/nice_reference_evidence.jsonl
data/staging/nice_reference_summary.json
```

ทุก record ยังมี `training_label=null` และ `review_status=staging_unmapped`

> `docker-compose.yml` mount `./data:/data` ให้ backend แล้ว ดังนั้น staging/curated files persist กลับมาที่ repository ไม่หายเมื่อ container ถูกสร้างใหม่

### 4.2 Harmonize — สร้าง candidate เท่านั้น

```powershell
docker compose exec backend python scripts/harmonize_nice_reference_evidence.py
```

ได้:

```text
data/staging/nice_review_queue.csv
data/staging/nice_harmonization_summary.json
```

กติกา mapping เป็นแบบ conservative:

- **Skin/Eye Draize** — ถ้ามี explicit classification ที่ชัดเจนจึงสร้าง candidate; numeric lesion score เดี่ยวไม่ถูก auto-binarize เพราะต้องดู severity/reversibility ประกอบ
- **LLNA** — `Stimulation Index (SI) >= 3` สนับสนุน positive candidate; `SI < 3` หนึ่ง record ไม่ถูกใช้เป็น negative label โดยอัตโนมัติ
- **Guinea Pig sensitization** — ต้องมี explicit positive/negative call ไม่เช่นนั้นส่ง review
- **Acute oral** — LD50 ถูก normalize เป็น mg/kg แล้วเทียบกับ binary boundary ปัจจุบันของ RalphGuard (`<= 2000` positive hazard candidate, `> 2000` negative candidate); operator/unit ที่กำกวมถูกส่ง review
- ถ้า evidence ของ exact molecule + endpoint ให้ทั้ง 0 และ 1 จะเป็น `conflict_review_required`

candidate จากขั้นนี้ **ยังเข้า training ไม่ได้**

### 4.3 Human review gate

ผู้ตรวจแก้ `data/staging/nice_review_queue.csv` เฉพาะแถวที่ตรวจ evidence แล้ว โดยต้องกรอกครบ:

```text
review_status = verified
reviewed_label = 0 หรือ 1
reviewed_by = ชื่อผู้ตรวจ
reviewer_note = เหตุผล/หลักฐานที่ตรวจ
reviewed_at = วันเวลา review
```

การตั้ง `verified` อย่างเดียวไม่พอ

### 4.4 Promote reviewed NICE evidence

```powershell
docker compose exec backend python scripts/promote_nice_review_queue.py
```

ระบบ export เฉพาะแถวที่ผ่าน review gate ไปที่:

```text
data/curated/nice_verified_skin.csv
data/curated/nice_verified_eye.csv
data/curated/nice_verified_sens.csv
data/curated/nice_verified_acute.csv
data/curated/nice_verified_manifest.json
```

NICE rows ที่ผ่าน review ใช้:

```text
label_quality = direct_in_vivo_reviewed
sample_weight = 1.0
```

ถ้า exact InChIKey เดียวมี reviewed label ขัดแย้ง ระบบ exclude และคืน non-zero exit code

## 5. Refresh PubChem reviewed export

เมื่อ backend เปิดอยู่ สามารถ refresh reviewed PubChem exports ผ่าน trainer image โดยไม่ต้องติดตั้ง Python package เพิ่มบนเครื่อง:

```powershell
docker compose --profile training run --rm trainer python scripts/export_verified_pubchem_training.py --api http://backend:8000
```

## 6. Training-integrity / Data-leakage audit

Raw base datasets ต้องอยู่ใน:

```text
data/raw/skin_irritation.csv
data/raw/eye_irritation.csv
data/raw/llna_sensitization.csv
data/raw/catmos_acute_toxicity.csv
```

จากนั้นรันด้วย scientific image เดียวกับ model runtime:

```powershell
docker compose --profile training run --rm trainer python scripts/check_training_integrity.py --strict-conflicts --require-all
```

Audit ตรวจ:

- valid SMILES
- canonical isomeric SMILES
- InChI / InChIKey
- exact duplicate identity
- exact identity + conflicting label
- Positive / Negative หลัง deduplicate
- training origin: base / NICE reviewed / PubChem reviewed
- Bemis–Murcko scaffold diversity
- exact overlap กับ external dataset ถ้ามี

Evidence priority เมื่อ molecule เดียวกันมี label ตรงกัน:

```text
base evidence
    > human-reviewed direct in-vivo NICE/ICE
    > PubChem regulatory-consensus weak label
```

หาก exact identity เดียวมีทั้ง label 0 และ 1 จะ **ไม่เลือกตาม priority** แต่ exclude ทั้ง identity เพื่อ review

ผล audit local:

```text
scientific/models/training_integrity_report.json
scientific/models/training_manifests/skin.csv
scientific/models/training_manifests/eye.csv
scientific/models/training_manifests/sens.csv
scientific/models/training_manifests/acute.csv
```

ไฟล์ derived เหล่านี้ถูก gitignore โดยตั้งใจ

## 7. Train Candidate v2

```powershell
docker compose --profile training run --rm trainer python scripts/train_candidate_v2.py
```

หรือ endpoint เดียว:

```powershell
docker compose --profile training run --rm trainer python scripts/train_candidate_v2.py --endpoint skin
```

Candidate artifacts เขียนเฉพาะ:

```text
scientific/models/candidate_v2/
```

Production files ต่อไปนี้ **ไม่ถูกแตะ**:

```text
scientific/models/skin_model.pkl
scientific/models/eye_model.pkl
scientific/models/sens_model.pkl
scientific/models/acute_model.pkl
scientific/models/validation_report.json
```

## 8. Validation ที่ Candidate v2 รายงาน

### 8.1 5-fold Stratified OOF
ใช้ metric style เดียวกับ production เพื่อเทียบ Old vs Candidate แบบใกล้เคียงกัน

### 8.2 Nested Stratified CV
Outer test fold ไม่ถูกใช้เลือก threshold; threshold เลือกจาก outer-training data เท่านั้น

### 8.3 Scaffold-grouped CV
ใช้ Bemis–Murcko scaffold แยก outer folds เพื่อ stress-test structural generalization

### 8.4 Independent External Validation
ถ้ามี:

```text
data/external/skin.csv
data/external/eye.csv
data/external/sens.csv
data/external/acute.csv
```

ต้องผ่าน:

```text
Train exact molecular identity ∩ External exact molecular identity = 0
```

ถ้า overlap > 0 ระบบปฏิเสธ external metrics และห้ามเรียกชุดนั้นว่า independent external validation

## 9. เกณฑ์ Promote Model

ห้ามตัดสินจาก Accuracy ตัวเดียว ให้ดูอย่างน้อย:

- ROC-AUC
- MCC
- Balanced Accuracy
- Sensitivity
- Specificity
- Positive / Negative count
- Nested-CV
- Scaffold-CV
- External performance ถ้ามี
- Applicability Domain coverage
- จำนวน NICE direct evidence เทียบ PubChem weak labels

Candidate v2 ไม่มี auto-promote

## 10. สิ่งที่ตอบกรรมการได้หลังรันครบ

1. โครงสร้างสารมาจากไหน
2. toxicity/reference evidence มาจากไหน
3. ทำไม PubChem structure ไม่ใช่ label
4. ทำไม `Not Classified` / ไม่มี hazard code ไม่ถูกแปลงเป็น 0
5. NICE/ICE record ถูกแปลงเป็น label ด้วย rule ใดและใคร review
6. exact duplicate / conflicting label ถูกจัดการอย่างไร
7. train/external exact identity overlap เท่าไร
8. OOF, Nested CV, Scaffold CV และ External ต่างกันอย่างไร
9. Candidate v2 ดีขึ้นหรือแย่ลงจาก production metric ใด

## 11. ข้อความที่ใช้ในการนำเสนอได้

> “เราแยก chemical identity ออกจาก toxicity evidence อย่างชัดเจน PubChem ใช้ทั้ง structure และ regulatory evidence ส่วน NICEATM ICE ใช้เพิ่ม endpoint-specific reference evidence ซึ่งต้องผ่าน conservative mapping และ human review ก่อนเข้าสู่ candidate training จากนั้นเราตรวจ InChIKey duplicate/conflict, nested CV และ scaffold CV โดยโมเดลใหม่ถูกสร้างแยกจาก production จนกว่าจะผ่านการเปรียบเทียบครบ”

ยังไม่ควรพูดจนกว่าจะรันและมีผลจริง:

> “เราเอาข้อมูลทั้งหมดของ PubChem มา train แล้ว”

> “Candidate v2 แม่นกว่า production แล้ว”

> “โมเดลผ่าน independent external validation แล้ว”
