# RalphGuard — PubChem Online Resolver + Training Dataset v2

เอกสารนี้กำหนดแนวทางขยาย RalphGuard ให้ค้นสารจาก PubChem แบบออนไลน์ โดย **ไม่ทำให้ PubChem กลายเป็น training label อัตโนมัติ** และไม่เขียนทับโมเดลเดิมก่อนมี benchmark ที่ดีกว่า

## 1. แยกสองปัญหาออกจากกัน

### A. Chemical coverage
ใช้ PubChem เพื่อค้นหา identity/structure ของสารที่ผู้ใช้พิมพ์ เช่น

- PubChem CID
- canonical name
- Canonical SMILES
- InChI / InChIKey
- molecular formula / molecular weight

สารที่ resolve ได้ต้องผ่าน RDKit validation และ QSAR eligibility ก่อนส่งเข้าโมเดล

### B. Training evidence
ใช้เฉพาะข้อมูลที่มี endpoint label และ provenance ตรวจสอบได้เท่านั้น เช่น base datasets และ `data/curated/pubchem_verified_<endpoint>.csv`

ข้อห้าม:

- ไม่แปลงการไม่พบ GHS hazard code เป็น label 0
- ไม่ใช้ model prediction เป็น label เพื่อ retrain โมเดลเดิม
- ไม่ promote candidate จาก PubChem เป็น verified training row โดยอัตโนมัติ

## 2. Online search flow

```text
User search
    ↓
Verified local registry
    ↓ not found
POST /api/substances/registry/lookup
    ↓
PubChem read-through cache
    ↓
CID + canonical SMILES + InChIKey
    ↓
RDKit / chemical eligibility checks
    ↓
Candidate registry row
    ↓
QSAR prediction only when structure is eligible
```

Backend มี endpoint นี้อยู่แล้ว:

```http
POST /api/substances/registry/lookup
Content-Type: application/json

{"name": "Azelaic acid", "refresh": false}
```

Frontend API client มี `api.lookupIngredientOnline(...)` เพื่อเรียก endpoint ดังกล่าว

คำแนะนำ UI: ค้น local ก่อน และเมื่อไม่พบให้มีปุ่ม **ค้นจาก PubChem** แทนการยิง API ทุก keystroke เพื่อควบคุม rate และทำ provenance ให้ผู้ใช้เห็นชัด

## 3. สถานะของข้อมูลออนไลน์

Candidate ที่มาจาก PubChem ควรแสดงอย่างน้อย:

- `pubchem_cid`
- `canonical_smiles`
- `inchikey`
- `structure_status`
- `qsar_eligible`
- `verification_status`
- `reason_th` เมื่อไม่เข้า QSAR

ตัวสารสามารถใช้เป็น structure resolver สำหรับการประเมินได้เมื่อผ่าน eligibility แต่ **ยังไม่ควรเข้า training export** จนผ่าน review/consensus ตาม policy ของ registry

## 4. Training Dataset v2

```text
Base experimental datasets
        +
Reviewed PubChem evidence
        ↓
Canonicalize with RDKit
        ↓
Remove invalid structures
        ↓
Detect label conflicts
        ↓
Deduplicate canonical structure
        ↓
Feature engineering
        ↓
OOF validation + benchmark
        ↓
Candidate v2 model artifacts
```

`data_prep.py` ปัจจุบันรองรับ reviewed PubChem supplemental rows และ sample weights แล้ว:

- manual verified evidence → weight 1.0
- regulatory consensus weak label → weight 0.5

## 5. Integrity audit ก่อนเทรน

รัน:

```powershell
python scripts/check_training_integrity.py
```

รายงานจะตรวจ:

- invalid SMILES
- duplicate canonical structures
- contradictory labels ของ structure เดียวกัน
- exact canonical-SMILES overlap กับ `data/external_validation.csv` (ถ้ามี)

ไฟล์ผล:

```text
data/curated/training_integrity_report.json
```

ถ้าพบ exact overlap กับ external-validation set script จะออกด้วย error เพื่อไม่ให้รายงาน external validation ที่มี leakage

> หมายเหตุ: exact identity audit ยังไม่เท่ากับ scaffold split; การทดสอบ generalization ต่อ scaffold ใหม่ควรเพิ่มเป็น benchmark แยก

## 6. กฎสำหรับ model v2

1. ห้าม overwrite `skin_model.pkl`, `eye_model.pkl`, `sens_model.pkl`, `acute_model.pkl` โดยอัตโนมัติ
2. สร้าง candidate artifacts เช่น `skin_model_v2.pkl`
3. เปรียบเทียบอย่างน้อย Accuracy, Balanced Accuracy, Sensitivity, Specificity, ROC-AUC และ MCC
4. ตรวจ class balance และจำนวน unique structures ต่อ endpoint
5. เพิ่ม scaffold-split benchmark ก่อนอ้าง generalization ที่แข็งแรงกว่า random OOF
6. ทำ independent external validation ด้วย frozen model เมื่อมีชุดข้อมูลอิสระ และต้องมี structure overlap = 0
7. Promote v2 เป็น production เฉพาะเมื่อผลรวมดีกว่าและไม่มี regression สำคัญ เช่น sensitivity ลดลงมาก

## 7. สิ่งที่ยังต้องมีเพื่อ retrain จริง

ไฟล์ base raw datasets ใน `data/raw/` ถูกออกแบบให้ไม่ commit เข้า Git ดังนั้นเครื่องที่ทำ retraining ต้องมี:

```text
data/raw/skin_irritation.csv
data/raw/eye_irritation.csv
data/raw/llna_sensitization.csv
data/raw/catmos_acute_toxicity.csv
```

หากไม่มีไฟล์เหล่านี้ `data_prep.py` จะปฏิเสธการ overwrite model artifacts เพื่อป้องกันการสร้างโมเดลจากข้อมูลเสริมเพียงบางส่วนโดยไม่ตั้งใจ

## 8. สิ่งที่ควรพูดกับกรรมการ

> RalphGuard ใช้ PubChem เพื่อขยาย chemical coverage และ resolve โครงสร้างแบบออนไลน์ แต่ PubChem structure ไม่ถูกใช้เป็น toxicity label โดยอัตโนมัติ การ retrain จะใช้เฉพาะ experimental/curated evidence ที่ตรวจสอบ provenance แล้ว จากนั้นทำ canonical deduplication, leakage audit, cross-validation และ external validation ก่อนเปลี่ยนโมเดล production
