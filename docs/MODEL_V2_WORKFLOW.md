# RalphGuard QSAR Model v2 — Workflow สำหรับรอบชิง

เอกสารนี้กำหนดขั้นตอนเพิ่มข้อมูลฝึกและตรวจความน่าเชื่อถือโดย **ไม่เขียนทับ production model เดิม** จนกว่าจะเห็นผลเปรียบเทียบครบ

## 1. สถานะปัจจุบัน

Production validation report ปัจจุบันมีจำนวนข้อมูล:

| Endpoint | N | Positive | Negative | AUC | MCC |
|---|---:|---:|---:|---:|---:|
| Skin irritation | 96 | 38 | 58 | 0.926 | 0.776 |
| Eye irritation | 107 | 44 | 63 | 0.886 | 0.623 |
| Skin sensitization | 86 | 30 | 56 | 0.896 | 0.620 |
| Acute toxicity | 81 | 29 | 52 | 0.903 | 0.736 |

ตัวเลขชุดนี้เป็น **5-fold out-of-fold internal validation** ไม่ใช่ independent external validation

## 2. PubChem data ที่เตรียมไว้แล้ว

ไฟล์ `data/curated/pubchem_verified_<endpoint>.csv` เป็น supplemental evidence ที่ผ่าน review/consensus gate แล้ว

จาก `pubchem_verified_manifest.json` ปัจจุบันมี unique structures:

| Endpoint | Supplemental unique structures |
|---|---:|
| Skin | 14 |
| Eye | 18 |
| Sensitization | 9 |
| Acute | 19 |

ข้อมูลกลุ่มนี้ส่วนใหญ่เป็น **positive regulatory-consensus weak labels** และใช้ `sample_weight=0.5` จึงไม่ควรอธิบายว่าเป็นผลทดลองตรงทั้งหมด

สำคัญ: จำนวนนี้ไม่ได้หมายความว่า production model ปัจจุบันถูก retrain ด้วยข้อมูลเหล่านี้แล้ว ต้องรัน candidate-v2 pipeline และดูจำนวนหลัง deduplicate กับ base dataset ก่อน

## 3. เพิ่ม reference evidence จาก NICEATM ICE

PubChem/GHS ช่วยเรื่องโครงสร้างและ regulatory hazard evidence แต่ถ้าต้องการเพิ่มหลักฐานที่ใกล้กับ reference test ของแต่ละ endpoint มากขึ้น โครงการมี staging collector สำหรับ **NICEATM Integrated Chemical Environment (ICE)**:

```powershell
docker compose exec backend python scripts/collect_nice_reference_evidence.py --endpoint all --limit 1500
```

Collector ใช้ InChIKey ของสารใน Ingredient Registry query ทีละโมเลกุลไปยัง ICE search API และเก็บเฉพาะ assay ที่สัมพันธ์กับ endpoint:

| RalphGuard endpoint | ICE reference assay ที่เก็บ |
|---|---|
| Skin | Rabbit Draize Skin Irritation/Corrosion Test |
| Eye | Rabbit Draize Eye Irritation/Corrosion Test |
| Sensitization | Murine Local Lymph Node Assay (LLNA), Guinea Pig Maximization/Buehler |
| Acute | Rat Acute Oral Toxicity |

ระบบตั้งใจ **ไม่เก็บ `CATMoS, Rat Acute Oral Toxicity` เป็น experimental label** เพราะ CATMoS เป็นแบบจำลอง in-silico อยู่แล้ว การเอาผล prediction ของโมเดลอื่นมาเป็น label โดยไม่แยกชั้นจะกลายเป็น pseudo-label/model-on-model leakage

ผลถูกเขียนเป็น staging เท่านั้น:

```text
data/staging/nice_reference_evidence.jsonl
data/staging/nice_reference_summary.json
```

ทุก record มี:

- `query_inchikey`
- registry id/name/SMILES
- assay
- ICE CASRN/DTXSID/name
- ICE endpoint/value
- raw source record
- `training_label = null`
- `review_status = staging_unmapped`

ดังนั้น collector **ไม่เปลี่ยนผล ICE เป็น 0/1 อัตโนมัติ** ต้องสร้าง endpoint mapping + review rule ก่อนนำเข้าชุดฝึกจริง

## 4. ลำดับการสร้าง Candidate v2

### Step A — Export reviewed PubChem evidence

```powershell
python scripts/export_verified_pubchem_training.py
```

### Step B — Collect/Review NICE reference evidence

```powershell
docker compose exec backend python scripts/collect_nice_reference_evidence.py --endpoint all --limit 1500
```

ขั้นนี้ยังเป็น staging จนกว่า endpoint/value mapping จะถูกตรวจสอบและมี provenance ครบ

### Step C — ตรวจ molecular identity / data leakage

```powershell
python scripts/check_training_integrity.py --strict-conflicts --require-all
```

ระบบตรวจ:

- valid SMILES
- canonical SMILES
- InChI / InChIKey
- exact duplicate structure
- same molecule + conflicting label
- Positive / Negative หลัง deduplicate
- Bemis–Murcko scaffold
- exact overlap กับ external dataset ถ้ามี

ผลลัพธ์ local:

```text
scientific/models/training_integrity_report.json
scientific/models/training_manifests/skin.csv
scientific/models/training_manifests/eye.csv
scientific/models/training_manifests/sens.csv
scientific/models/training_manifests/acute.csv
```

### Step D — Train Candidate v2 โดยไม่แตะ production

```powershell
python scripts/train_candidate_v2.py
```

หรือทดสอบ endpoint เดียว:

```powershell
python scripts/train_candidate_v2.py --endpoint skin
```

Candidate v2 ใช้ exact identity เป็น **InChIKey ก่อน และ canonical isomeric SMILES เป็น fallback** เมื่อพบโมเลกุลเดียวกันซ้ำจะนับครั้งเดียว และถ้า exact identity เดียวมีทั้ง label 0/1 จะตัดออกจนกว่าจะ review

ถ้า base row กับ supplemental weak-label row เป็นโมเลกุลเดียวกันและ label ตรงกัน ระบบเลือก base evidence ก่อน เพื่อไม่ให้ weak label มาลดคุณภาพของหลักฐานเดิม

Candidate artifacts ถูกเขียนเฉพาะ:

```text
scientific/models/candidate_v2/
```

Production files เหล่านี้จะไม่ถูกแก้:

```text
scientific/models/skin_model.pkl
scientific/models/eye_model.pkl
scientific/models/sens_model.pkl
scientific/models/acute_model.pkl
scientific/models/validation_report.json
```

## 5. Validation ที่ Candidate v2 รายงาน

Candidate v2 รายงาน 4 ระดับแยกกัน

### 5.1 5-fold Stratified OOF

ใช้รูปแบบ metric เดียวกับ production ปัจจุบันเพื่อให้เปรียบเทียบ Old vs Candidate ได้ในเงื่อนไขใกล้เคียงกัน

ข้อจำกัด: random stratified folds ยังอาจมีสารโครงสร้างคล้ายกันมากอยู่คนละ fold

### 5.2 Nested Stratified CV

Outer fold ใช้ประเมินผล ส่วน threshold ของแต่ละ outer fold ถูกเลือกจากข้อมูลฝั่ง outer-training เท่านั้น

จุดประสงค์คือแก้ความ optimistic จากการเลือก threshold ด้วย prediction ชุดเดียวกับที่ใช้รายงาน metric

### 5.3 Scaffold-grouped CV

ใช้ Bemis–Murcko scaffold แบ่ง outer folds เพื่อ stress-test การ generalize ไปยัง chemical scaffold ที่ต่างขึ้น

สำหรับโมเลกุล acyclic ที่ไม่มี Murcko scaffold ระบบใช้ exact structure เป็น group แยก เพื่อไม่รวมสาร acyclic ทั้งหมดเป็น group เดียวจน 5-fold ใช้งานไม่ได้

### 5.4 Independent External Validation

ถ้ามีไฟล์:

```text
data/external/skin.csv
data/external/eye.csv
data/external/sens.csv
data/external/acute.csv
```

ระบบจะตรวจก่อนว่า:

```text
Train exact molecular identity ∩ External exact molecular identity = 0
```

ถ้า overlap มากกว่า 0 จะ **ไม่คำนวณ external metrics** และจะไม่เรียกชุดนั้นว่า independent external validation

## 6. เกณฑ์ตัดสินใจว่าจะ Promote หรือไม่

ห้ามเลือกโมเดลใหม่จาก Accuracy ตัวเดียว

ให้ดูอย่างน้อย:

- ROC-AUC
- MCC
- Balanced Accuracy
- Sensitivity
- Specificity
- จำนวน Positive / Negative
- Nested-CV performance
- Scaffold-CV performance
- External performance ถ้ามี
- Applicability Domain coverage

ตัวอย่าง: ถ้า AUC เพิ่มแต่ Specificity ตกมาก อาจหมายถึงโมเดลเริ่มทำนาย Positive มากเกินไปจากการเพิ่ม weak positive labels

ดังนั้น Candidate v2 ไม่มี auto-promote ต้อง review ก่อนเสมอ

## 7. สิ่งที่ตอบกรรมการได้หลัง workflow นี้

เมื่อรันครบ เราจะสามารถตอบด้วยหลักฐานว่า:

1. ข้อมูลแต่ละสารมาจาก source ใด
2. PubChem ใช้เป็น structure/identity และ regulatory evidence aggregator อย่างไร
3. NICEATM ICE ใช้เพิ่ม reference endpoint records อย่างไรโดยไม่สร้าง label แบบเดา
4. ทำไม absence of hazard ไม่ถูกใช้เป็น negative label
5. มีสารซ้ำหรือ label conflict เท่าไร
6. Train/Test exact identity overlap เป็นอย่างไร
7. 5-fold OOF ต่างจาก external validation อย่างไร
8. Model v2 ดีขึ้นหรือแย่ลงจาก production ตรง metric ใด
9. เมื่อเจอสารโครงสร้างใหม่ โมเดลยังทำงานได้ดีแค่ไหนจาก scaffold/external test

## 8. คำที่ควรใช้ในการนำเสนอ

ควรพูด:

> “เราเพิ่ม curated evidence จาก PubChem และกำลังดึง endpoint-specific reference evidence จาก NICEATM ICE โดยผูกข้อมูลด้วย InChIKey จากนั้นสร้าง candidate model แยกจาก production และตรวจ exact molecular identity, label conflict, nested validation และ scaffold validation ก่อนพิจารณา promote”

ไม่ควรพูดจนกว่าจะมีหลักฐาน:

> “เราเอาข้อมูลทั้งหมดใน PubChem มา train แล้ว”

หรือ

> “โมเดลผ่าน external validation แล้ว”

เพราะ PubChem มีโครงสร้างสารจำนวนมากแต่ไม่ได้มี endpoint-specific experimental label ที่ใช้ train ได้ทุกสาร และ production report ปัจจุบันยังเป็น internal OOF validation
