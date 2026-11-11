# RalphGuard — Algorithm, Machine Learning และการตรวจสอบความแม่นยำ

เอกสารนี้อธิบายเส้นทางตั้งแต่ข้อมูลดิบจนถึง Candidate Model v2 โดยแยกสิ่งที่ระบบทำจริง หลักฐานที่ต้องมี และผลลัพธ์ที่ใช้ตรวจสอบย้อนกลับได้

> สถานะสำคัญ: pipeline พร้อมใช้งาน แต่ห้ามอ้างผล Candidate v2 จนกว่า Raw Dataset จริงทั้ง 4 endpoint จะอยู่ใน `data/raw/` และการรันเสร็จสมบูรณ์

## 1. ปัญหาที่โมเดลแก้

RalphGuard เป็นระบบ **QSAR screening** แบบ binary classification แยก 4 endpoint:

| Key | Endpoint | Label 1 | Label 0 |
|---|---|---|---|
| `skin` | Skin irritation | มีหลักฐานเข้ากลุ่มระคายเคือง | มีหลักฐานเข้ากลุ่มไม่ระคายเคืองตามนิยาม dataset |
| `eye` | Eye irritation | มีหลักฐานเข้ากลุ่มระคายเคืองตา | มีหลักฐานเข้ากลุ่มไม่ระคายเคืองตามนิยาม dataset |
| `sens` | Skin sensitization | Sensitizer | Non-sensitizer |
| `acute` | Acute oral toxicity | เข้ากลุ่ม acute-toxic ตามเกณฑ์ dataset | ไม่เข้ากลุ่มตามเกณฑ์ dataset |

การไม่มีข้อมูลไม่ถูกเปลี่ยนเป็น Label 0 และผลของโมเดลไม่ใช่ผลวินิจฉัยทางคลินิก

## 2. ข้อมูลที่ใช้

### 2.1 Base endpoint datasets

ไฟล์ที่ต้องมีบนเครื่องเทรน:

```text
data/raw/skin_irritation.csv
data/raw/eye_irritation.csv
data/raw/skin_sensitization.csv
data/raw/acute_oral_toxicity.csv
```

แต่ละแถวต้องมีอย่างน้อย:

```text
smiles,label
```

สำหรับผลที่ใช้อ้างต่อกรรมการ ควรมี metadata เพิ่มเติม เช่น `source`, `evidence_id`, `assay`, `species`, `guideline`, `original_label`, `curation_note` และวันที่ดาวน์โหลด

### 2.2 Reviewed supplemental evidence

- NICEATM/ICE direct evidence ที่ผ่าน Human Review: น้ำหนัก `1.0`
- PubChem regulatory-consensus weak evidence: น้ำหนัก `0.5`; positive H-code จาก regulatory source เดียว: น้ำหนัก `0.25`
- PubChem ใช้ช่วย resolve โครงสร้างสาร ไม่ถือว่าโครงสร้างที่ค้นเจอเป็น toxicity label โดยอัตโนมัติ

### 2.3 External validation data

External set ต้องไม่ใช่ข้อมูลที่ใช้ train หรือเลือก threshold และต้องผ่านเงื่อนไข:

```text
Train InChIKeys ∩ External InChIKeys = 0
```

หากมี exact molecular overlap ระบบจะปฏิเสธการคำนวณ External metrics แทนการรายงานตัวเลขที่รั่วไหล

## 3. ขั้นตอนเตรียมข้อมูล

```text
Raw rows
  ↓
ตรวจ SMILES ด้วย RDKit
  ↓
Canonical isomeric SMILES
  ↓
InChI / InChIKey
  ↓
ตรวจ Label 0/1
  ↓
ตรวจ exact duplicate
  ↓
ตรวจ label conflict
  ↓
เลือกหนึ่งแถวต่อ exact molecule
  ↓
สร้าง clean training set
```

กฎสำคัญ:

1. Invalid structure และ invalid label ถูกตัดออกและนับจำนวนไว้
2. โมเลกุลเดียวกันที่มี Label 0 และ 1 จะถูก exclude ทั้ง identity เพื่อรอ review
3. Duplicate ที่ label ตรงกันเลือกตามลำดับ `Base > NICE reviewed > PubChem reviewed`
4. ทุกแถวที่ใช้จริงถูกส่งออกเป็น training manifest เพื่อตรวจย้อนกลับ

รัน audit:

```powershell
docker compose --profile training run --rm trainer `
  python scripts/check_training_integrity.py --strict-conflicts --require-all
```

ผลลัพธ์:

```text
scientific/models/training_integrity_report.json
scientific/models/training_manifests/{endpoint}.csv
```

## 4. Molecular features

โมเดลไม่ได้อ่านข้อความชื่อสาร แต่แปลงโครงสร้างโมเลกุลเป็นตัวเลข:

| Endpoint | Feature mode | เหตุผลเชิงระบบ |
|---|---|---|
| Skin | MACCS keys + descriptors | รวม structural keys กับคุณสมบัติกายภาพเคมี |
| Eye | MACCS keys + descriptors | ใช้ representation เดียวกับ irritation endpoint |
| Sensitization | Morgan fingerprint | เน้น local structural environments/substructures |
| Acute | Morgan + MACCS + descriptors | รวม substructure และ global molecular properties |

Descriptors ตัวอย่าง ได้แก่ molecular weight, LogP, TPSA, H-bond donors/acceptors, rotatable bonds และ ring information

## 5. Machine-learning algorithm

แต่ละ endpoint ใช้ Soft-Voting Ensemble 4 สมาชิก:

1. `RandomForestClassifier` — nonlinear decision trees แบบ bagging
2. `ExtraTreesClassifier` — เพิ่ม randomness ใน split เพื่อลด variance
3. `LogisticRegression` หลัง standardization — linear calibrated baseline
4. `HistGradientBoostingClassifier` — boosting สำหรับ nonlinear interactions

สมาชิกแต่ละตัวให้ความน่าจะเป็นของ Label 1:

```text
p_final = mean(p_RF, p_ExtraTrees, p_LogReg, p_HistGB)
```

ความเห็นไม่ตรงกันของสมาชิกเก็บเป็น model-disagreement uncertainty:

```text
uncertainty = std(p_RF, p_ExtraTrees, p_LogReg, p_HistGB)
```

Class imbalance จัดการด้วย evidence-quality weight ก่อน แล้ว normalize ให้ sum
of effective weights ของ Label 0 และ Label 1 เท่ากัน วิธีนี้รักษาลำดับความแข็งแรง
ของหลักฐานภายในแต่ละ class และหลีกเลี่ยง double balancing ระหว่าง
`class_weight` กับ sample weight

## 6. การเลือก Threshold

ระบบไม่บังคับใช้ `0.5` ทุก endpoint แต่เลือก operating threshold ด้วย Youden's J:

```text
J = Sensitivity + Specificity - 1
```

สำหรับ Nested CV และ Scaffold CV ค่า threshold ของแต่ละ outer fold ถูกเลือกจากข้อมูลฝั่ง training ของ fold นั้นเท่านั้น เพื่อไม่ใช้ข้อมูล test ในการเลือกเกณฑ์

## 7. การตรวจสอบความแม่นยำ

### 7.1 5-fold Out-of-Fold (OOF)

ทุกโมเลกุลได้รับ prediction จากโมเดลที่ไม่ได้ train ด้วยแถวนั้น ใช้เปรียบเทียบ Candidate กับ Production แบบเดียวกัน

### 7.2 Nested Stratified CV

Outer fold ใช้วัดผล ส่วน inner folds ใช้เลือก threshold ช่วยลด optimistic bias จากการเลือก threshold บนข้อมูลประเมิน

### 7.3 Bemis–Murcko Scaffold CV

แยก chemical scaffold ระหว่าง train/test เพื่อประเมินว่าระบบทำนาย chemical family ที่แตกต่างจากข้อมูล train ได้เพียงใด โดยรายงาน scaffold overlap ของทุก fold ซึ่งต้องเป็นศูนย์

### 7.4 Independent External Validation

คำนวณเฉพาะเมื่อ exact identity overlap เป็นศูนย์ External set ต้องมีที่มาและนิยาม label ที่ตรวจสอบได้ และไม่ถูกใช้ปรับ feature, hyperparameter หรือ threshold

## 8. Metrics ที่รายงาน

| Metric | ใช้ตอบคำถาม |
|---|---|
| Accuracy | ทายถูกโดยรวมเท่าใด |
| Balanced Accuracy | ทายสองคลาสได้สมดุลเพียงใด |
| Sensitivity | ตรวจสาร positive ได้กี่ส่วน |
| Specificity | แยกสาร negative ได้กี่ส่วน |
| ROC-AUC | จัดอันดับ positive เหนือ negative ได้ดีเพียงใดโดยไม่ยึด threshold เดียว |
| MCC | คุณภาพ binary classification ที่คำนึงทั้ง confusion matrix |

ไม่ควรใช้ Accuracy เพียงค่าเดียว โดยเฉพาะเมื่อข้อมูลสองคลาสไม่สมดุล

## 9. Plots และไฟล์หลักฐานจากการเทรน

รัน Candidate v2:

```powershell
docker compose --profile training run --rm trainer python scripts/train_candidate_v2.py
```

ผลลัพธ์ต่อ endpoint:

```text
scientific/models/candidate_v2/plots/{endpoint}/
├── 01_data_profile.png/.svg
├── 02_oof_validation.png/.svg
├── 03_nested_cv.png/.svg
├── 04_scaffold_cv.png/.svg
├── 05_external_validation.png/.svg
├── 06_model_comparison.png/.svg
├── oof_predictions.csv
├── nested_predictions.csv
├── scaffold_predictions.csv
└── external_predictions.csv
```

นอกจากนี้มี:

```text
scientific/models/candidate_v2/plots/00_algorithm_pipeline.png/.svg
scientific/models/candidate_v2/plots/00_data_preflight.png/.svg
scientific/models/candidate_v2/validation_report.json
scientific/models/candidate_v2/TRAINING_REPORT.md
```

Prediction CSV ทำให้ทุกจุดใน ROC curve และ confusion matrix ตรวจกลับไปยัง molecule, fold, probability และ threshold ได้

## 10. Promotion policy

Candidate v2 ไม่เขียนทับ Production และไม่มี automatic promotion ต้องเปรียบเทียบอย่างน้อย:

- Candidate OOF กับ Production OOF แบบ protocol เดียวกัน
- Nested CV
- Scaffold CV
- External validation ที่เป็นอิสระจริง
- Sensitivity/Specificity trade-off
- Applicability Domain และข้อผิดพลาดสำคัญ

หาก Candidate ดีขึ้นเฉพาะ random OOF แต่แย่ลงมากใน Scaffold หรือ External validation จะยังไม่ Promote

## 11. ประโยคตอบกรรมการแบบสั้น

> เราเริ่มจากข้อมูลทดลองที่แยกตาม 4 endpoint ตรวจโครงสร้างด้วย RDKit และระบุตัวโมเลกุลด้วย InChIKey เพื่อตัด duplicate, label conflict และ train-test overlap จากนั้นแปลงโครงสร้างเป็น Morgan fingerprint, MACCS keys และ molecular descriptors แล้วเทรน Soft-Voting Ensemble 4 โมเดล การวัดผลไม่ได้ใช้ Accuracy อย่างเดียว แต่ใช้ OOF, Nested CV, Scaffold CV และ External Validation พร้อม Balanced Accuracy, Sensitivity, Specificity, AUC และ MCC ทุก plot มี prediction CSV รองรับเพื่อให้ตรวจสอบย้อนกลับได้ และ Candidate จะไม่แทนที่ Production จนกว่าจะผ่าน benchmark ที่กำหนด
