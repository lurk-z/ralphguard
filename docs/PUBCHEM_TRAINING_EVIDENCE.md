# PubChem evidence สำหรับเพิ่มข้อมูลฝึก

ระบบนี้แยกข้อมูลออกเป็นสามชั้นเพื่อไม่ให้ PubChem กลายเป็น toxicity label โดยอัตโนมัติ:

1. `ingredient_registry` ระบุตัวตนและโครงสร้างสาร
2. `experimental_evidence` เก็บ GHS annotation แยกตาม endpoint และแหล่งอ้างอิง
3. `data/curated/pubchem_verified_<endpoint>.csv` มีเฉพาะหลักฐานที่ผู้ตรวจยืนยันแล้ว หรือ weak label ที่มีแหล่งอิสระตรงกันอย่างน้อยสองแหล่ง

> หลักสำคัญ: **PubChem ใช้ขยาย chemical identity/structure coverage แต่ PubChem structure เพียงอย่างเดียวไม่ใช่ toxicity training label** และการไม่พบ hazard code ไม่ถูกแปลงเป็น label 0

## Online PubChem fallback: Runtime screening ≠ Training eligibility

### Regulatory weak-label tiers used by candidate training

PubChem structure alone is never a toxicity label. Positive endpoint hazard
codes may enter candidate training only with retained source attribution:

| Evidence tier | Required evidence | `sample_weight` |
|---|---|---:|
| Manual review | Reviewer verified the exact identity, endpoint, route and source | 1.0 |
| Regulatory consensus | At least two independent regulatory/expert-curated sources agree | 0.5 |
| Single regulatory source | One source classified as regulatory, an explicit positive H-code, and a QSAR-eligible exact structure | 0.25 |

The single-source tier uses status `single_regulatory_weak_label` and label
quality `single_regulatory_source_weak_label`. It never converts `Not
Classified`, a missing H-code, or a third-party-only annotation to label 0.
These rows are counted only after RDKit canonicalization, conflict exclusion,
deduplication, and external-holdout quarantine.

หน้าเพิ่มสารรองรับลำดับการค้นหา:

```text
RalphGuard verified registry
        ↓ ไม่พบชื่อ
PubChem PUG REST lookup
        ↓
RDKit canonical structure + chemical eligibility guard
        ↓
provisional runtime screening candidate
```

เมื่อ PubChem คืนสารที่เป็น `defined_single_substance`, มีโครงสร้าง `resolved` และ backend บันทึก `provenance.pubchem.proposed_qsar_eligible=true` ระบบอนุญาตให้ใช้โครงสร้างนั้นสำหรับ **provisional runtime QSAR screening** ได้ เพื่อไม่ให้ local registry เป็นเพดานของสารที่ผู้ใช้ค้นหา

อย่างไรก็ตาม candidate ดังกล่าวยังคง:

```text
verification_status = pending
qsar_eligible = false
assessment_method = pending_verification
```

ความหมายคือ PubChem candidate สามารถใช้เป็น **input structure สำหรับการคัดกรอง** ได้ แต่ยังไม่ได้ถูก human-verify ให้เป็น registry training identity และไม่ได้กลายเป็น toxicity label

Runtime gate จะปฏิเสธ:

- mixture / UVCB / fragrance / variable-composition extract
- polymer
- salt หรือ multi-component structure
- inorganic/out-of-domain structure ตาม chemical eligibility rules
- record ที่ไม่มี canonical SMILES ที่ parse ได้
- PubChem candidate ที่ไม่มี `proposed_qsar_eligible=true`

การยอมให้ runtime screening **ไม่แก้** `verification_status`, **ไม่แก้** `qsar_eligible` ในฐานข้อมูล และ **ไม่ส่งข้อมูลเข้า training export** โดยอัตโนมัติ การฝึกโมเดลยังต้องผ่าน evidence review gate ตามส่วนด้านล่าง

ดังนั้นคำที่ใช้ในการนำเสนอควรแยกให้ชัด:

> “PubChem ขยาย chemical coverage สำหรับการค้นและ runtime screening ส่วน training dataset ใช้เฉพาะ evidence ที่ผ่าน review/consensus และ molecular-identity audit แล้ว”

## การจับคู่ endpoint

| Endpoint | GHS hazard code ที่สร้าง positive candidate |
|---|---|
| skin irritation | H314, H315 |
| eye irritation/damage | H314, H318, H319 |
| skin sensitization | H317 |
| acute oral toxicity | H300, H301, H302 |

โมเดล acute ปัจจุบันอ้างอิง CATMoS acute oral toxicity จึงไม่รวมรหัสทางผิวหนังหรือการสูดดม เช่น H311 และ H331

ระบบไม่แปลง `Not Classified` หรือการไม่พบรหัสเป็น label 0 เพราะไม่ใช่หลักฐานผลลบเฉพาะ endpoint

## ขั้นตอนใช้งาน

อัปเกรดฐานข้อมูลและเปิด backend:

```powershell
docker compose up -d postgres redis backend
docker compose exec backend alembic upgrade head
```

ดึง GHS evidence ของทุกสารใน registry ที่มี PubChem CID:

```powershell
python scripts/import_pubchem_evidence.py
```

### นำเข้า Global GHS ให้เกิน 1,000 สาร

```powershell
docker compose exec backend python scripts/import_global_pubchem_ghs.py --target 1000 --max-pages 20 --include-single-regulatory
```

หากต้องการวัด coverage แยกทุก endpoint ให้ใช้ `--target-per-endpoint` ด้วย
ตัวนำเข้าจะไม่หยุดเพียงเพราะยอดรวมถึงเป้า หาก endpoint ใดยังขาด:

```powershell
docker compose exec backend python scripts/import_global_pubchem_ghs.py `
  --target 10000 `
  --target-per-endpoint 20000 `
  --max-pages 200 `
  --allow-under-target `
  --include-single-regulatory
```

`target-per-endpoint` คือจำนวนโครงสร้างที่ผ่าน domain screening และมีหลักฐาน
ของ endpoint นั้น ไม่ใช่จำนวน training rows สุดท้าย หลัง promotion, conflict
removal, exact dedup และ external quarantine จำนวนจริงอาจต่ำกว่า จึงต้องใช้
integrity gate ตรวจอีกครั้ง
`--allow-under-target` ทำให้ importer บันทึกจำนวนที่หาได้จริงและไปต่อถึง final
audit; ไม่ได้ทำให้ 10,000-row gate อ่อนลง

ตัวนำเข้าจะหยุดเมื่อได้โครงสร้างไม่ซ้ำตามเป้าหมาย และคัดออกก่อนบันทึกเมื่อเป็น:

- salt หรือ multi-component structure
- inorganic หรือมีธาตุนอกชุด H/B/C/N/O/F/Si/P/S/Cl/Br/I
- canonical SMILES หรือ InChI สร้างไม่ได้
- molecular weight นอกช่วง 30–500
- heavy atoms นอกช่วง 2–36 ซึ่งครอบคลุมขอบเขตโมเดลปัจจุบัน

ผลการรันล่าสุดที่บันทึกไว้ในโครงการตรวจ 1,750 CID และผ่าน 1,302 โครงสร้าง โดยตัด salt 308, inorganic 52, MW นอกช่วง 50, unsupported element 36 และ heavy atoms นอกช่วง 2 รายการ

การเพิ่ม PubChem GHS ในปริมาณมากจะเพิ่มหลักฐาน positive เป็นหลัก ไม่ได้แก้
class imbalance โดยอัตโนมัติ ห้ามอ้างว่าโมเดลแม่นขึ้นจากจำนวนแถวเพียงอย่างเดียว
และต้องตรวจจำนวน positive/negative, scaffold CV และ independent external set
ทุกครั้ง

Registry API รองรับ pagination เมื่อมีข้อมูลเกิน 500 รายการ:

```http
GET /api/substances/registry?limit=500&offset=500
```

ดูรายการรอตรวจ:

```http
GET /api/substances/evidence?review_status=pending
```

เลื่อนเฉพาะกลุ่มที่แหล่ง regulatory/expert-curated อย่างน้อยสองแหล่งให้เป็น weak label:

```http
POST /api/substances/evidence/consensus-promote?min_sources=2
```

สถานะนี้ชื่อ `consensus_verified` ไม่ใช่ผลทดลองโดยตรง และถูก export ด้วย `label_quality=regulatory_consensus_weak_label` กับ `sample_weight=0.5` ขณะที่รายการที่ผู้ตรวจยืนยันเองใช้น้ำหนัก 1.0

ยืนยันหลักฐานหนึ่งรายการหลังตรวจแหล่งอ้างอิงและ endpoint:

```http
PATCH /api/substances/evidence/{evidence_id}/review
Content-Type: application/json

{
  "action": "verify",
  "reviewer_note": "ตรวจ hazard code, route และแหล่งอ้างอิงแล้ว"
}
```

ตัวสารใน Ingredient Registry ต้องเป็น `verified`, `defined_single_substance`, `resolved` และ `qsar_eligible=true` ด้วย จึงจะ export ได้

สร้างไฟล์เสริมสำหรับฝึก:

```powershell
python scripts/export_verified_pubchem_training.py
```

จากนั้น `python data_prep.py` จะรวมไฟล์ reviewed เข้ากับ raw dataset เดิม ลบโครงสร้างซ้ำ ตัดโครงสร้างที่ label ขัดแย้ง และบันทึกจำนวนแหล่งข้อมูลลงใน model bundle

## ตรวจ Data Leakage ก่อน Retrain

ก่อนสร้างโมเดลรุ่นใหม่ให้รัน:

```powershell
python scripts/check_training_integrity.py
```

สคริปต์จะตรวจแต่ละ endpoint ด้วยตัวตนระดับโมเลกุล ไม่ใช่ชื่อสารอย่างเดียว:

- parse และ canonicalize SMILES ด้วย RDKit
- สร้าง InChI / InChIKey
- ตรวจโครงสร้างซ้ำภายในชุดฝึก
- ตรวจโมเลกุลเดียวกันแต่มี label ขัดแย้ง
- สรุปจำนวน Positive / Negative หลังตัด conflict และ deduplicate
- สร้าง Bemis–Murcko scaffold เพื่อใช้ประเมิน structural novelty
- สร้าง manifest ที่ `scientific/models/training_manifests/<endpoint>.csv`
- สร้างรายงานรวม `scientific/models/training_integrity_report.json`

สำหรับ release candidate ใช้โหมดเข้มงวด:

```powershell
python scripts/check_training_integrity.py --strict-conflicts --require-all
```

หากมี independent external dataset ให้วางเป็น:

```text
data/external/skin.csv
data/external/eye.csv
data/external/sens.csv
data/external/acute.csv
```

แต่ละไฟล์ต้องมีอย่างน้อย `smiles,label` สคริปต์จะตรวจว่า:

```text
Train InChIKey ∩ External InChIKey = 0
```

ถ้ามี exact molecular overlap สคริปต์จะคืน non-zero exit code โดยอัตโนมัติ เพื่อป้องกันการเรียกผลนั้นว่า independent external validation

> Scaffold overlap ไม่เท่ากับ data leakage โดยตรง แต่ใช้บอกว่า external set มี chemical scaffold ใหม่จาก training set มากเพียงใด จึงควรรายงานควบคู่กับ exact identity overlap

## สถานะ Validation ที่ต้องใช้คำให้ถูกต้อง

- `5-fold OOF` = **internal validation** แต่ละสารถูกทำนายโดย fold model ที่ไม่ได้ `.fit()` สารนั้น
- `Scaffold split` = ทดสอบความสามารถ generalize ไปยังกลุ่มโครงสร้างแกนหลักที่ต่างขึ้น
- `Independent external validation` = ชุดข้อมูลอิสระที่ไม่ถูกใช้ train/tune และต้องตรวจ exact identity overlap เป็นศูนย์ก่อน

ห้ามเรียก 5-fold OOF ปัจจุบันว่า independent external validation

## API ที่เกี่ยวข้อง

- `POST /api/substances/registry/lookup`
- `POST /api/substances/registry/{id}/evidence/pubchem`
- `POST /api/substances/registry/evidence/pubchem/bulk`
- `GET /api/substances/evidence`
- `PATCH /api/substances/evidence/{id}/review`
- `POST /api/substances/evidence/consensus-promote?min_sources=2`
- `GET /api/substances/training-evidence/export?endpoint=skin`
- `GET /api/models/metrics`
- `GET /api/models/info`

อ้างอิง implementation ของ PubChem integration ในโครงการ: PubChem PUG-View, PUG REST และ Dynamic Request Throttling ตามเอกสารที่ลิงก์ไว้ใน source/docs ของโครงการ
