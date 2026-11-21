# RalphGuard — Model Improvement Plan (Current)

เอกสารนี้อัปเดตให้ตรงกับ production model ปัจจุบันและ workflow `candidate_v2`

## 1. สิ่งที่ production ทำอยู่แล้ว

Production ปัจจุบันไม่ใช่ RF เดี่ยวแล้ว แต่เป็น `Ensemble v2`:

- Random Forest
- Extra Trees
- Logistic Regression
- HistGradientBoosting
- Soft-voting probability average
- endpoint-specific feature mode
- balanced class handling
- endpoint-specific Youden threshold
- Applicability Domain
- structural alerts
- ensemble disagreement / confidence

Feature mode:

| Endpoint | Features |
|---|---|
| Skin | MACCS + descriptors |
| Eye | MACCS + descriptors |
| Sensitization | Morgan |
| Acute | Morgan + MACCS + descriptors |

ดังนั้นงานรอบชิงไม่ใช่ “เอา Ensemble v2 ไปแทนโมเดลเดิม” อีกแล้ว เพราะ production ใช้ ensemble นี้อยู่แล้ว

## 2. Production metrics ปัจจุบัน

จาก `scientific/models/validation_report.json`:

| Endpoint | N | AUC | Balanced Acc | Sensitivity | Specificity | MCC |
|---|---:|---:|---:|---:|---:|---:|
| Skin | 96 | 0.926 | 0.896 | 0.947 | 0.845 | 0.776 |
| Eye | 107 | 0.886 | 0.816 | 0.886 | 0.746 | 0.623 |
| Sensitization | 86 | 0.896 | 0.825 | 0.900 | 0.750 | 0.620 |
| Acute | 81 | 0.903 | 0.873 | 0.862 | 0.885 | 0.736 |

ตัวเลขนี้เป็น 5-fold OOF internal validation

## 3. ปัญหาที่เหลือจริง

### 3.1 Dataset size

ข้อมูลต่อ endpoint ยังมีเพียง 81–107 unique rows ใน production validation report จึงมีโอกาส variance สูง

### 3.2 Evidence quality

PubChem ช่วยขยาย chemical identity และ regulatory evidence ได้ แต่ supplemental evidence ปัจจุบันจำนวนมากเป็น positive consensus weak labels ไม่ใช่ direct experimental result

### 3.3 Validation strength

Random stratified OOF ช่วยป้องกัน sample เดียวกันเข้า `.fit()` และถูกทำนายใน fold เดียวกัน แต่ยังไม่ตอบคำถาม structural novelty เต็มที่

ต้องเพิ่ม:

- exact identity audit
- nested threshold evaluation
- scaffold-grouped CV
- independent external set ที่ overlap = 0

### 3.4 Data provenance

base raw CSV ถูก gitignore จึงต้องสร้าง manifest/provenance จากเครื่องที่ใช้ train เพื่อให้กรรมการตรวจสอบที่มาของ label ได้

## 4. Candidate v2 strategy

### Phase A — เพิ่ม reviewed evidence

```powershell
python scripts/export_verified_pubchem_training.py
```

Reviewed supplemental unique structures ปัจจุบัน:

- Skin 14
- Eye 18
- Sens 9
- Acute 19

จำนวนที่เพิ่มจริงหลัง merge ต้องตรวจ deduplicate กับ base dataset ก่อน

### Phase B — Integrity audit

```powershell
python scripts/check_training_integrity.py --strict-conflicts --require-all
```

ตรวจ:

- invalid SMILES
- canonical identity
- InChIKey duplicate
- contradictory label
- scaffold distribution
- external overlap

### Phase C — Non-destructive retraining

```powershell
python scripts/train_candidate_v2.py
```

Candidate ถูกเขียนที่:

```text
scientific/models/candidate_v2/
```

production `.pkl` ไม่ถูกแก้

## 5. Validation รุ่นใหม่

Candidate v2 แยก 4 protocol:

### Like-for-like OOF

เอาไว้เทียบกับ production table เดิม

### Nested Stratified CV

outer test fold ไม่ถูกใช้เลือก threshold ของ fold นั้น

### Scaffold-grouped CV

แยก outer folds ตาม Bemis–Murcko scaffold เพื่อ stress-test chemical-space generalization

### Independent External

คำนวณเฉพาะเมื่อ exact molecular overlap เป็นศูนย์

## 6. การตัดสิน Model v2

ตัวอย่างการอ่านผล:

```text
Candidate OOF AUC ↑
Candidate Sensitivity ↑
แต่ Specificity ↓ มาก
```

อาจเกิดจากการเพิ่ม positive weak labels มากเกินไป จึงยังไม่ควร promote อัตโนมัติ

ต้องพิจารณา:

- AUC
- MCC
- Balanced Accuracy
- Sensitivity
- Specificity
- nested-CV gap
- scaffold-CV gap
- external result
- AD coverage

## 7. เป้าหมายข้อมูลถัดไป

สิ่งที่มีค่ามากกว่าการดึง PubChem structure เพิ่มอย่างเดียวคือ **endpoint-specific labeled evidence ที่เชื่อถือได้ โดยเฉพาะ negative evidence**

เหตุผล: PubChem GHS mapping ปัจจุบันออกแบบให้สร้าง positive candidates และตั้งใจไม่อนุมาน negative จากการไม่มี hazard statement

ดังนั้นการเพิ่มข้อมูลควรหา balance ระหว่าง:

```text
Verified Positive Evidence
        +
Verified Negative Evidence
        +
Chemical-space diversity
```

ไม่ใช่เพิ่มจำนวน molecule โดยไม่มี label

## 8. ความใหม่ที่ควรนำเสนอ

อย่าอ้างว่า RalphGuard คิดค้น ML classifier ใหม่

ความใหม่ที่ป้องกันได้ทางวิชาการคือ integration:

- endpoint-specific QSAR ensembles
- shared train/inference featurizer
- applicability domain
- uncertainty/confidence
- structural alerts
- evidence-gated PubChem integration
- formula aggregation
- OCR/AI workflow
- 3D visualization

## 9. ประโยคตอบกรรมการ

> “รอบก่อนเราเน้นค่า cross-validation ของโมเดลครับ รอบนี้เราเพิ่ม data-integrity layer ให้ตรวจ molecular identity ด้วย InChIKey, แยก weak regulatory evidence ออกจาก direct evidence, train candidate model แยกจาก production และเพิ่ม nested กับ scaffold validation เพื่อดูว่าโมเดลยัง generalize เมื่อเจอโครงสร้างที่ต่างจากชุดฝึกหรือไม่”

ดูรายละเอียด `docs/MODEL_V2_WORKFLOW.md`
