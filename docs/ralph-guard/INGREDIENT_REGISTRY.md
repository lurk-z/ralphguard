# Ingredient Registry และ PubChem enrichment

RalphGuard แยกการรู้จักชื่อสาร การ resolve โครงสร้าง และการอนุญาตเข้า QSAR ออกจากกัน ข้อมูลที่พบจาก PubChem จึงไม่กลายเป็นผลประเมินหรือถูกส่งเข้าโมเดลโดยอัตโนมัติ

## ขั้นตอนเมื่อ OCR พบส่วนผสม

1. จับคู่กับ curated INCI และ Ingredient Registry ที่ผ่านการยืนยันแล้ว
2. บันทึก observation พร้อมชื่อที่พบ แหล่งที่มา เวลา และ OCR confidence
3. ชื่อที่ยังไม่รู้จักจะถูกค้นใน PubChem PUG REST เมื่อเปิด `online=true`
4. ระบบดึง CID, canonical SMILES, InChI, InChIKey, molecular formula/weight, synonym และ CAS candidate
5. SMILES ต้องผ่าน RDKit และระบบจำแนก single substance, salt, inorganic, polymer, botanical, fragrance, mixture หรือ UVCB
6. ผลจาก PubChem ถูกบันทึกเป็น `verification_status=pending` และ `qsar_eligible=false`
7. ผู้ตรวจยืนยันหรือปฏิเสธ candidate ผ่าน Registry API
8. หลังยืนยัน ชื่อเดิมและ synonym จะถูก resolve จากฐานข้อมูลในการสแกนครั้งต่อไป

ระบบเก็บทั้งผลสำเร็จและ `not_found` ใน PostgreSQL เพื่อลดการเรียกซ้ำ ใช้ rate limit 4 requests/วินาที พร้อม retry/backoff สำหรับ `429`, `503` และ `504`

## สถานะสำคัญ

- `recognized`: รู้จักชื่อหรือจับคู่กับ registry ได้
- `structure_status`: สถานะโครงสร้าง เช่น `resolved`, `polymeric`, `multi_component`
- `qsar_eligible`: อนุญาตให้เข้าโมเดล QSAR ชุดปัจจุบันหรือไม่
- `assessment_method`: `qsar`, `known_carrier_baseline`, `knowledge_base` หรือ `pending_verification`
- `verification_status`: `pending`, `verified` หรือ `rejected`
- `registry_version`: เพิ่มเมื่อมีการ review เปลี่ยนแปลงข้อมูล

ตัวอย่าง Aqua:

```json
{
  "inci_name": "aqua",
  "canonical_name": "Water",
  "pubchem_cid": 962,
  "canonical_smiles": "O",
  "substance_type": "defined_single_substance",
  "structure_status": "resolved",
  "qsar_eligible": false,
  "assessment_method": "known_carrier_baseline",
  "verification_status": "verified"
}
```

## API

ค้น PubChem และสร้าง/อัปเดต candidate:

```http
POST /api/substances/registry/lookup
Content-Type: application/json

{"name":"Tranexamic Acid","refresh":false}
```

ดูรายการรอตรวจ:

```http
GET /api/substances/registry?verification_status=pending
```

ยืนยันโมเลกุลเดี่ยวให้เข้า QSAR:

```http
PATCH /api/substances/registry/{id}/verify
Content-Type: application/json

{
  "action":"verify",
  "qsar_eligible":true,
  "reviewer_note":"ตรวจชื่อ, CID และโครงสร้างแล้ว"
}
```

การตั้ง `qsar_eligible=true` จะถูกปฏิเสธ หากรายการไม่ใช่ `defined_single_substance`, โครงสร้างยังไม่ `resolved`, ไม่มี canonical SMILES หรือ SMILES มีหลายองค์ประกอบ

## ข้อจำกัด

- PubChem เป็นแหล่งข้อมูล compound ไม่ใช่ทะเบียน INCI โดยตรง
- polymer, fragrance, botanical extract และ UVCB ห้ามใช้ CID ของโมเลกุลตัวแทนเพียงตัวเดียว
- ข้อมูล hazard/GHS ที่อาจดึงเพิ่มในอนาคตต้องเก็บ provenance และใช้เป็น knowledge base เท่านั้น ห้ามสร้าง toxicity label อัตโนมัติ
- การ review ผ่าน API ในระบบปัจจุบันควรทำโดยผู้ดูแลข้อมูลหรือผู้ตรวจสอบโครงสร้างสาร

อ้างอิง: [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) และ [Dynamic Request Throttling](https://pubchem.ncbi.nlm.nih.gov/docs/dynamic-request-throttling)
