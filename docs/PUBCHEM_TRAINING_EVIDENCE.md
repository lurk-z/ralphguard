# PubChem evidence สำหรับเพิ่มข้อมูลฝึก

ระบบนี้แยกข้อมูลออกเป็นสามชั้นเพื่อไม่ให้ PubChem กลายเป็น toxicity label โดยอัตโนมัติ:

1. `ingredient_registry` ระบุตัวตนและโครงสร้างสาร
2. `experimental_evidence` เก็บ GHS annotation แยกตาม endpoint และแหล่งอ้างอิง
3. `data/curated/pubchem_verified_<endpoint>.csv` มีเฉพาะหลักฐานที่ผู้ตรวจยืนยันแล้ว หรือ weak label ที่มีแหล่งอิสระตรงกันอย่างน้อยสองแหล่ง

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
docker compose exec backend python scripts/import_global_pubchem_ghs.py --target 1000 --max-pages 6
```

ตัวนำเข้าจะหยุดเมื่อได้โครงสร้างไม่ซ้ำตามเป้าหมาย และคัดออกก่อนบันทึกเมื่อเป็น:

- salt หรือ multi-component structure
- inorganic หรือมีธาตุนอกชุด H/B/C/N/O/F/Si/P/S/Cl/Br/I
- canonical SMILES หรือ InChI สร้างไม่ได้
- molecular weight นอกช่วง 30–500
- heavy atoms นอกช่วง 2–36 ซึ่งครอบคลุมขอบเขตโมเดลปัจจุบัน

ผลการรันล่าสุดตรวจ 1,750 CID และผ่าน 1,302 โครงสร้าง โดยตัด salt 308, inorganic 52, MW นอกช่วง 50, unsupported element 36 และ heavy atoms นอกช่วง 2 รายการ

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

## API ที่เพิ่ม

- `POST /api/substances/registry/{id}/evidence/pubchem`
- `POST /api/substances/registry/evidence/pubchem/bulk`
- `GET /api/substances/evidence`
- `PATCH /api/substances/evidence/{id}/review`
- `POST /api/substances/evidence/consensus-promote?min_sources=2`
- `GET /api/substances/training-evidence/export?endpoint=skin`

อ้างอิง: [PubChem PUG-View](https://pubchem.ncbi.nlm.nih.gov/docs/pug-view), [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) และ [Dynamic Request Throttling](https://pubchem.ncbi.nlm.nih.gov/docs/dynamic-request-throttling)
