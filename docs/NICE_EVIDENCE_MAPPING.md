# RalphGuard — NICE/ICE Evidence Mapping & Review Policy

เอกสารนี้อธิบายว่า endpoint-specific reference/in-vivo records จาก NICEATM Integrated Chemical Environment (ICE) ถูกเตรียมก่อนเข้าสู่ Candidate QSAR training อย่างไร

> หลักสำคัญ: **raw experimental/reference record ไม่ใช่ training label โดยอัตโนมัติ**

## 1. Source และ exact molecular identity

Collector ใช้ ICE Search API:

- https://ice.ntp.niehs.nih.gov/api/v1/search
- help: https://ice.ntp.niehs.nih.gov/api/v1/search/help

ICE รองรับ CASRN, DTXSID, InChIKey และ SMILES สำหรับ chemical search

RalphGuard query **หนึ่ง InChIKey ต่อหนึ่ง request** เพื่อให้ evidence ทุก record ผูกกับ exact registry molecule ได้โดยไม่ต้องเดาจากชื่อสาร

## 2. Assay whitelist

| RalphGuard endpoint | ICE assay | Auto mapping policy |
|---|---|---|
| Skin irritation/corrosion | Rabbit Draize Skin Irritation/Corrosion Test | explicit classification เท่านั้น; numeric lesion score ส่ง review |
| Eye irritation/corrosion | Rabbit Draize Eye Irritation/Corrosion Test | explicit classification เท่านั้น; numeric lesion score ส่ง review |
| Skin sensitization | Murine Local Lymph Node Assay (LLNA) | SI >= 3 เป็น positive candidate; SI < 3 เดี่ยว ๆ ไม่เป็น automatic negative |
| Skin sensitization | Guinea Pig Maximization/Buehler | ต้องมี explicit positive/negative classification |
| Acute oral toxicity | Rat Acute Oral Toxicity | explicit acute category หรือ interpretable LD50 จึงสร้าง candidate |

`CATMoS, Rat Acute Oral Toxicity` ไม่อยู่ใน whitelist direct/reference evidence เพราะเป็น in-silico prediction; หากนำมาใช้ภายหลังต้องเก็บเป็น evidence class แยก ไม่เรียกว่า direct in-vivo

## 3. Skin irritation/corrosion

Reference guideline:

- OECD TG 404: https://www.oecd.org/en/publications/test-no-404-acute-dermal-irritation-corrosion_9789264242678-en.html

RalphGuard ไม่ใช้ Draize numeric score เดี่ยวเป็น 0/1 อัตโนมัติ เพราะการจำแนก irritation/corrosion ต้องพิจารณาลักษณะ lesion, severity และ reversibility/persistence ตามบริบทของการศึกษา

ดังนั้น:

```text
explicit Irritant / Corrosive / Category 1/2 -> positive candidate
explicit Not Classified / Non-irritant       -> negative candidate
numeric erythema/edema observation only      -> review_required
```

candidate ทุกตัวต้องผ่าน human review ก่อน export

## 4. Eye irritation/corrosion

Reference guideline:

- OECD TG 405: https://www.oecd.org/en/publications/test-no-405-acute-eye-irritation-corrosion_9789264185333-en.html

ผลตาอาจประกอบด้วย corneal opacity, iritis, conjunctival redness, chemosis และการกลับคืนของอาการตามเวลา จึงไม่ควรเอาคะแนน observation หนึ่งค่าไปสร้าง binary label โดยไม่มี context

```text
explicit Irritant / Corrosive / Category 1/2 -> positive candidate
explicit Not Classified / Non-irritant       -> negative candidate
numeric eye-lesion score only                 -> review_required
```

## 5. Skin sensitization — LLNA

Reference guideline:

- OECD TG 429: https://www.oecd.org/en/publications/test-no-429-skin-sensitisation_9789264071100-en.html

สำหรับ LLNA ค่า Stimulation Index (SI) ถูกใช้ใน decision process โดย threshold SI >= 3 สนับสนุน sensitizer classification

RalphGuard mapping:

```text
SI >= 3 -> positive candidate
SI < 3  -> supportive_negative_only
```

เหตุผลที่ `SI < 3` ไม่ถูกแปลงเป็น 0 ทันที: record เดี่ยวอาจเป็นหนึ่ง dose/หนึ่ง observation และยังไม่ยืนยันว่า study-level conclusion เป็น negative

## 6. Guinea Pig Maximization/Buehler

RalphGuard ไม่สร้าง label จาก numeric observation ที่ไม่ชัดเจน

```text
explicit sensitizer/positive     -> positive candidate
explicit non-sensitizer/negative -> negative candidate
otherwise                         -> review_required
```

## 7. Acute oral toxicity

RalphGuard Candidate v2 ใช้ binary boundary ที่สอดคล้องกับ policy ของ endpoint ปัจจุบันซึ่ง positive class ครอบคลุม acute-oral hazard ที่ mapped จาก H300/H301/H302:

```text
interpretable LD50 <= 2000 mg/kg -> positive candidate
interpretable LD50 > 2000 mg/kg  -> negative candidate
```

Unit ที่รองรับและ normalize เป็น mg/kg:

- ug/kg หรือ µg/kg
- mg/kg
- g/kg

ค่าที่กำกวม เช่น unknown unit หรือ `>= 2000 mg/kg` จะถูกส่ง human review แทนการเดา

## 8. Conflict policy

ระบบ group records ด้วย:

```text
InChIKey + RalphGuard endpoint
```

ถ้า conservative mapping ให้ทั้ง label 0 และ 1 ใน exact molecule/endpoint เดียว:

```text
mapping_status = conflict_review_required
candidate_label = null
```

ไม่มี majority vote และไม่มีการเลือก source ตามลำดับเพื่อกลบ conflict

## 9. Human-review gate

ไฟล์ `data/staging/nice_review_queue.csv` ต้องกรอกครบก่อน promote:

```text
review_status=verified
reviewed_label=0|1
reviewed_by=<reviewer>
reviewer_note=<evidence/reason>
reviewed_at=<timestamp>
```

หากขาด field ใด field หนึ่ง `promote_nice_review_queue.py` จะไม่ export แถวนั้น

## 10. Training weight และ evidence priority

NICE row ที่ผ่าน human review:

```text
label_quality = direct_in_vivo_reviewed
sample_weight = 1.0
```

PubChem regulatory-consensus weak label:

```text
label_quality = regulatory_consensus_weak_label
sample_weight = 0.5
```

เมื่อ exact identity เดียวมี label **ตรงกัน** หลายแหล่ง Candidate v2 ใช้ priority:

```text
base > NICE direct-in-vivo reviewed > PubChem regulatory-consensus weak label
```

แต่ถ้า label **ขัดแย้งกัน** ระบบ exclude exact identity ทั้งตัวจนกว่าจะ review ไม่ใช้ priority ตัดสิน conflict

## 11. สิ่งที่ rule นี้ไม่ได้อ้าง

- ไม่อ้างว่า NICE record ทุกแถวเป็น OECD-compliant study ใหม่
- ไม่อ้างว่า PubChem GHS annotation เท่ากับ raw animal experiment
- ไม่อ้างว่า Candidate v2 ผ่าน external validation จนกว่าจะมี locked external set ที่ exact identity overlap = 0
- ไม่อ้างว่า QSAR score เป็น clinical probability หรือ product-safety certification
