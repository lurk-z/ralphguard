# RalphGuard — Model Evaluation (สถานะ Production ปัจจุบัน)

เอกสารนี้อ้างอิง `scientific/models/validation_report.json` ของ branch `codex/main-logic-completion` โดยตรง และแทนรายงานรุ่นเก่าที่เคยใช้ `n=144/endpoint`

## 1. Validation protocol ปัจจุบัน

Production metrics เป็น **5-fold stratified out-of-fold (OOF) internal validation**

แนวคิด:

```text
Dataset
  ↓
แบ่ง 5 folds
  ↓
Train 4 folds / Predict 1 fold
  ↓
ทำซ้ำจนครบทุก fold
  ↓
ทุกสารมี OOF prediction ที่เกิดจากโมเดลซึ่งไม่ได้ fit สารนั้น
  ↓
คำนวณ metrics
```

ข้อจำกัดสำคัญ:

- เป็น internal validation ไม่ใช่ independent external validation
- random stratified folds ยังอาจมีโมเลกุลที่โครงสร้างคล้ายกันมากอยู่คนละ fold
- current production threshold ถูกเลือกจาก OOF predictions จึงควรใช้ nested/scaffold validation เป็น stress test เพิ่มใน candidate v2

## 2. Production metrics ปัจจุบัน

| Endpoint | N | Pos | Neg | Accuracy | Balanced Acc | Sensitivity | Specificity | ROC-AUC | MCC | Threshold |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Skin irritation | 96 | 38 | 58 | 0.885 | 0.896 | 0.947 | 0.845 | 0.926 | 0.776 | 0.40 |
| Eye irritation | 107 | 44 | 63 | 0.804 | 0.816 | 0.886 | 0.746 | 0.886 | 0.623 | 0.35 |
| Skin sensitization | 86 | 30 | 56 | 0.802 | 0.825 | 0.900 | 0.750 | 0.896 | 0.620 | 0.30 |
| Acute toxicity | 81 | 29 | 52 | 0.877 | 0.873 | 0.862 | 0.885 | 0.903 | 0.736 | 0.45 |

## 3. วิธีอ่านตัวเลข

### Accuracy

สัดส่วน prediction ที่ถูกทั้งหมด แต่ไม่ควรใช้ตัวเดียวเมื่อ class imbalance

### Balanced Accuracy

เฉลี่ย sensitivity และ specificity จึงเหมาะกับ dataset ที่จำนวน Positive/Negative ไม่เท่ากันมากกว่า accuracy อย่างเดียว

### Sensitivity

ความสามารถจับ Positive/Hazard

สำหรับ screening tool ค่านี้สำคัญเพราะ false negative หมายถึง hazard จริงที่โมเดลพลาด

### Specificity

ความสามารถระบุ Negative ได้ถูกต้อง ถ้าต่ำเกินไปจะเกิด false positive/เตือนเกินมาก

### ROC-AUC

วัดความสามารถในการจัดอันดับ Positive เหนือ Negative โดยไม่ผูกกับ threshold เดียว

**AUC 0.926 ไม่เท่ากับ Accuracy 92.6%**

### MCC

Matthews Correlation Coefficient ใช้ทั้ง TP/TN/FP/FN และมีประโยชน์กับ binary classification ที่ class ไม่สมดุล

## 4. สิ่งที่ production report นี้พิสูจน์ได้

พูดได้ว่า:

> “ใน 5-fold internal OOF evaluation ปัจจุบัน โมเดลทั้ง 4 endpoint ได้ AUC ประมาณ 0.886–0.926 และ sensitivity ประมาณ 0.862–0.947”

ไม่ควรพูดว่า:

> “โมเดลแม่น 90% กับสารใหม่ทุกชนิด”

หรือ

> “ผ่าน independent external validation แล้ว”

เพราะ OOF ยังอยู่ภายใน dataset เดียวกัน

## 5. Applicability Domain / Confidence

ค่าความแม่นยำในตารางเป็น performance ระดับ dataset แต่ prediction รายสารยังต้องดู:

- Applicability Domain
- Tanimoto similarity
- prediction probability
- structural alerts
- ensemble disagreement

ดังนั้นสาร Out-of-Domain ต้องถูกตีความด้วย confidence ต่ำกว่าสารที่อยู่ใน training chemical space

## 6. Supplemental PubChem data

โครงการมี reviewed supplemental structures ใน `data/curated/`:

- Skin 14 unique structures
- Eye 18
- Sensitization 9
- Acute 19

แต่ตัวเลข production table ด้านบน **ไม่ควรถูกอธิบายว่าเป็นผลหลัง retrain PubChem v2** จนกว่าจะรัน candidate pipeline และยืนยันจำนวนหลัง deduplicate

## 7. Candidate-v2 evaluation

รัน:

```powershell
python scripts/check_training_integrity.py --strict-conflicts --require-all
python scripts/train_candidate_v2.py
```

Candidate report จะอยู่ใน:

```text
scientific/models/candidate_v2/validation_report.json
```

และแยกผลเป็น:

1. 5-fold OOF — เปรียบเทียบกับ production แบบใกล้เคียงกัน
2. nested stratified CV — threshold ไม่เห็น outer-test labels
3. scaffold-grouped CV — stress test structural novelty
4. independent external validation — เฉพาะเมื่อ exact identity overlap = 0

## 8. เกณฑ์ Promote

ห้าม promote เพราะ metric ใด metric หนึ่งดีขึ้น

ต้องดูร่วมกัน:

- AUC
- MCC
- Balanced Accuracy
- Sensitivity
- Specificity
- class balance
- nested-CV
- scaffold-CV
- external metrics ถ้ามี
- Applicability Domain coverage

โดยเฉพาะ PubChem supplemental ปัจจุบันมี weak positive labels หลายรายการ จึงต้องเฝ้าดูว่า sensitivity เพิ่มแต่ specificity ตกหรือไม่

## 9. สถานะ External Validation

ยังไม่มีหลักฐานใน production report ปัจจุบันที่ควรเรียกว่า **independent external validation**

ชุดทดสอบ 24 สารในเอกสารรุ่นเก่าเป็น historical sanity check และมี training overlap จึงถูกจัดสถานะใหม่ใน `docs/EXTERNAL_VALIDATION.md`
