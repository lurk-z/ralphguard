# RalphGuard — External Validation Status

## สถานะปัจจุบัน

**Production model ปัจจุบันยังไม่มี independent external validation ที่ผ่านเกณฑ์ exact molecular-overlap audit**

เอกสารรุ่นเก่าเคยเรียกชุด 24 สารว่า “external validation” แต่ในบันทึกเดิมระบุเองว่า:

- มีทั้งหมด 24 สาร
- มีเพียง 10 สารที่ canonical SMILES ไม่อยู่ใน training set

ดังนั้นชุด 24 สารนั้นมี training overlap และ **ไม่ควรถูกเรียกว่า independent external validation**

## 1. Historical sanity check

ผลเดิมของชุด 24 สารถูกเก็บเป็นข้อมูลเชิงประวัติศาสตร์เท่านั้น:

| ขอบเขตเดิม | n | Accuracy | Sensitivity | Specificity |
|---|---:|---:|---:|---:|
| ทั้งชุด | 24 | 0.92 | 1.00 | 0.82 |
| subset ที่เคยระบุว่า novel | 10 | 0.90 | 1.00 | 0.80 |

ตัวเลขนี้ใช้ได้เพียงเป็น **sanity/reference check** ของระบบในช่วงพัฒนา ไม่ใช่หลักฐาน final generalization

เหตุผล:

1. ชุด 24 ตัวมีสารที่ overlap training
2. ป้ายเป็น literature/textbook/regulatory classification ที่รวบรวมขนาดเล็ก
3. ไม่ได้เป็น prospective wet-lab study ใหม่
4. ไม่มีหลักฐาน manifest ระดับ InChIKey ที่ยืนยัน train/external exact overlap = 0 สำหรับทั้งชุด
5. script เดิมอ้างถึง `/tmp/extval.py` ซึ่งไม่ใช่ reproducible source file ใน repository

## 2. นิยามที่ RalphGuard ใช้ต่อจากนี้

### Internal OOF validation

ข้อมูลทั้งหมดมาจาก training dataset เดียวกัน แต่แต่ละ sample ถูก predict โดย fold model ที่ไม่ได้ fit sample นั้น

Production ปัจจุบันอยู่ในระดับนี้

### Scaffold validation

แบ่งข้อมูลตาม Bemis–Murcko scaffold เพื่อดูว่าโมเดล generalize ไปยังแกนโครงสร้างที่ต่างขึ้นได้เพียงใด

Candidate v2 รองรับระดับนี้

### Independent external validation

ต้องผ่านเงื่อนไขอย่างน้อย:

```text
External dataset ไม่ถูกใช้ train
External dataset ไม่ถูกใช้เลือก features
External dataset ไม่ถูกใช้เลือก threshold
External dataset ไม่ถูกใช้ tune hyperparameters
Train exact identity ∩ External exact identity = 0
```

RalphGuard ใช้ InChIKey เป็น exact molecular identity หลัก และ canonical SMILES เป็น fallback

## 3. External dataset format ใหม่

วางไฟล์แยกต่อ endpoint:

```text
data/external/skin.csv
data/external/eye.csv
data/external/sens.csv
data/external/acute.csv
```

ขั้นต่ำ:

```csv
smiles,label
CCO,0
...
```

ควรมีเพิ่มเมื่อมีข้อมูล:

```text
name
source
source_id
evidence_type
reference_url
assay_or_guideline
```

เพื่อให้ trace provenance ได้

## 4. Audit ก่อนคำนวณ metrics

รัน:

```powershell
python scripts/check_training_integrity.py --strict-conflicts --require-all
```

ถ้ามี external files สคริปต์จะตรวจ:

```text
Train InChIKey ∩ External InChIKey = 0
```

หาก overlap มากกว่า 0 สคริปต์จะคืน non-zero exit code

## 5. Candidate v2 external evaluation

รัน:

```powershell
python scripts/train_candidate_v2.py
```

สคริปต์จะคำนวณ external metrics **เฉพาะ endpoint ที่ exact molecular overlap = 0**

ถ้ามี overlap จะบันทึกสถานะ:

```text
rejected_exact_overlap
```

และไม่สร้างตัวเลข external accuracy/AUC เพื่อป้องกันการนำไปอ้างผิด

## 6. สิ่งที่ควรรายงานกับกรรมการตอนนี้

พูดได้:

> “ผล production ปัจจุบันเป็น 5-fold internal out-of-fold validation ครับ ส่วน external set รุ่นเก่าของเราเป็นเพียง sanity check เพราะพบ training overlap เราจึงไม่เรียกผลนั้นว่า independent external validation และกำลังใช้ InChIKey overlap audit + scaffold validation สำหรับ candidate model รุ่นใหม่”

ประโยคนี้ตรงกับหลักฐานใน repository ปัจจุบันที่สุด

## 7. เป้าหมายรอบถัดไป

เพื่อยกระดับเป็น independent external validation ที่แข็งแรง ควร:

- ใช้ endpoint-specific experimental/reference dataset ที่ไม่อยู่ใน training pool
- freeze candidate model + threshold ก่อนเปิดผล external
- ตรวจ InChIKey overlap = 0
- รายงาน class distribution
- รายงาน Sensitivity, Specificity, Balanced Accuracy, MCC, ROC-AUC
- รายงาน Applicability Domain coverage ของ external set
- เก็บ source/provenance รายสารให้ reproduce ได้

ดูขั้นตอนรวมใน `docs/MODEL_V2_WORKFLOW.md`
