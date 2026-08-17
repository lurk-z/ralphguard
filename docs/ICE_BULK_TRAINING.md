# การเทรน RalphGuard ด้วยข้อมูล NICE/ICE ระดับหลักหมื่น

RalphGuard ใช้ไฟล์ bulk จาก [NIH/NICEATM Integrated Chemical Environment](https://ice.ntp.niehs.nih.gov/downloads/DataonICE/) เพื่อเพิ่มข้อมูลทดลอง/ข้อมูลอ้างอิงอย่างตรวจสอบย้อนกลับได้ ไม่ใช้ผลทำนายจาก CATMoS หรือโมเดล RalphGuard เดิมเป็น Label

ไฟล์ต้นทางทางการ:

| Endpoint | ICE workbook | ไฟล์ที่เตรียมสำหรับเทรน |
|---|---|---|
| Skin irritation | `skin_irritation.xlsx` | `data/raw/skin_irritation.csv` |
| Eye irritation | `eye_irritation.xlsx` | `data/raw/eye_irritation.csv` |
| Skin sensitization | `skin_sensitization.xlsx` | `data/raw/skin_sensitization.csv` |
| Acute oral toxicity | `acute_oral.xlsx` | `data/raw/acute_oral_toxicity.csv` |

## รันแบบ reproducible ด้วย Docker

เปิด Docker Desktop ก่อน แล้วรันจากโฟลเดอร์โปรเจกต์:

```powershell
./scripts/train_large_ice.ps1
```

### โหมดตรวจเป้า 10,000 ต่อ endpoint

```powershell
./scripts/train_quality_10k_per_endpoint.ps1
```

โหมดนี้พยายามดึง PubChem regulatory evidence ให้ครอบคลุมราย endpoint แล้วบังคับ
integrity gate ดังนี้:

- clean, deduplicated training rows รวมอย่างน้อย 40,000
- ทุก endpoint อย่างน้อย 10,000 rows
- positive และ negative ของทุก endpoint อย่างน้อย 20 rows เป็น hard
  trainability gate (`-MinimumClassRows`) และ 100 rows เป็น advisory quality
  target ที่ยังรายงานแยกไว้
- exact train/external molecular overlap ต้องเป็นศูนย์
- dataset manifest ต้องตรงกับไฟล์ ICE ที่เตรียมไว้

หาก public evidence จริงไม่ถึงเป้า script จะหยุดก่อนเทรนแทนการสร้าง label จาก
prediction หรือถือว่าการไม่พบ hazard statement เป็น negative การหยุดเช่นนี้คือ
quality gate ไม่ใช่ความผิดพลาดของโมเดล

จำนวน 10,000 ต่อ endpoint ไม่ใช่หลักประกัน accuracy การตัดสิน Candidate ยังต้อง
ใช้ OOF, scaffold CV, external validation, MCC และ class balance ร่วมกัน

สคริปต์นี้เรียกสามขั้นตอนด้านล่างให้อัตโนมัติ หรือสามารถแยกรันเองได้:

```powershell
docker compose --profile training run --rm ice-data-prep
docker compose --profile training run --rm trainer python scripts/check_training_integrity.py --strict-conflicts --require-all --require-manifest
docker compose --profile training run --rm trainer python scripts/train_candidate_v2.py --validation-profile auto
```

คำสั่งแรกจะ:

1. ดาวน์โหลด workbooks จาก ICE โดยตรง
2. Join ผลทดลองกับโครงสร้างด้วย DTXSID/InChIKey/CID/CASRN
3. ตัด mixture, prediction, assay ที่ไม่รองรับ และโครงสร้างที่ไม่ชัดเจน
4. แปลง Label ด้วยกฎ conservative ที่บันทึกในแต่ละแถว
5. ตัด molecule/endpoint ที่มี Label ขัดแย้ง
6. สร้าง SHA-256 และ `data/raw/dataset_manifest.json`
7. คืน error หากรวมแล้วเหลือน้อยกว่า 10,000 unique endpoint rows

ข้อมูลที่กฎยังตัดสินไม่ได้จะไม่เข้า Train และถูกส่งไปที่ `data/staging/ice_bulk_review_queue.csv`

## Label policy

Skin-sensitization bulk labels use an evidence hierarchy:

- Direct ICE `Active/Inactive` or `Sensitizer/Non-sensitizer` calls from LLNA,
  guinea-pig, Human Maximization, and Human Repeat Insult Patch tests have
  `sample_weight=1.0`.
- A reported LLNA EC3 is positive evidence because EC3 is the concentration at
  which the stimulation-index threshold of three is reached.
- DPRA (key event 1), KeratinoSens/LuSens (key event 2), and
  h-CLAT/U-SENS/mMUSST (key event 3) are never used alone. A label requires
  concordant explicit calls across at least two different key events, has
  `sample_weight=0.7`, and is provenance-tagged as in-vitro consensus.
- Numeric incidence fields, including `Incidence of positive responses = 0`,
  are not interpreted as positive classification calls.

Skin/eye alternative-method labels use an endpoint-specific conservative
policy:

- Explicit ICE calls from OECD TG 439 EpiDerm, EpiSkin, or LabCyte irritation
  methods may supply lower-weight (`0.7`) positive or No-Category skin labels.
- A positive TG 431/430/435 corrosion call establishes skin hazard, but an
  inactive corrosion call is never misread as "not irritating".
- OECD TG 494 Vitrigel is used only for an explicit Inactive/No-Category eye
  call. An Active result requires follow-up and is not promoted by itself.
- Direct human/animal evidence takes priority. A contradictory lower-tier
  PubChem weak label is recorded and overridden; conflicts within the best
  available evidence tier remain review-gated.

Official method references: [OECD TG 439](https://www.oecd.org/en/publications/test-no-439-in-vitro-skin-irritation-reconstructed-human-epidermis-test-method_9789264242845-en.html),
[TG 431](https://www.oecd.org/en/publications/test-no-431-in-vitro-skin-corrosion-reconstructed-human-epidermis-rhe-test-method_9789264264618-en.html),
[TG 430](https://www.oecd.org/en/publications/test-no-430-in-vitro-skin-corrosion-transcutaneous-electrical-resistance-test-method-ter_9789264242739-en.html),
[TG 435](https://www.oecd.org/en/publications/test-no-435-in-vitro-membrane-barrier-test-method-for-skin-corrosion_9789264242791-en.html),
and [TG 494](https://www.oecd.org/en/publications/tg-494-vitrigel-eye-irritancy-test-method-for-identifying-chemicals-not-requiring-classification-and-labelling-for-eye-irritation-or-serious-eye-damage_9f20068a-en.html).

The one-command workflow also screens PubChem regulatory GHS evidence. It
exports manual-review rows at weight 1.0, multi-source consensus at weight 0.5,
or positive GHS codes from one explicitly identified regulatory source at
weight 0.25. Third-party-only annotations and absence-of-hazard inferences are
excluded. The 10,000 minimum applies to final canonicalized,
conflict-filtered, holdout-quarantined, deduplicated endpoint rows rather than
raw downloaded records.

The quality workflow separates a hard trainability gate from an advisory
quality target. Its default hard minimum is 20 identities in each class and
the report still flags any class below the recommended 100. This distinction
allows an evidence-limited candidate to be trained without presenting it as a
well-validated production model.

The workflow is resumable. After pages 1-200 have already been imported, its
defaults process pages 201-300 before export/audit. Use `-PubChemStartPage 1`
for a fresh database. Candidate fitting is capped at a deterministic 15,000
identities per endpoint by default: every experimental/reviewed row is kept
first and PubChem weak rows fill the remaining compute budget. The integrity
report continues to audit every eligible identity.

- Skin/Eye: ใช้เฉพาะ classification ที่ชัดเจน เช่น irritant, corrosive, category 1/2, non-irritant หรือ not classified; คะแนน lesion เดี่ยวไม่ถูกเดาเป็น 0/1
- Sensitization: LLNA SI >= 3 รองรับ positive; SI < 3 เพียง record เดียวไม่เพียงพอเป็น negative; Guinea-pig assay ต้องมีผลสรุปชัดเจน
- Acute oral: LD50 ที่แปลงหน่วยได้ `<= 2000 mg/kg` เป็น positive hazard และ `> 2000 mg/kg` เป็น negative; bounds/units ที่กำกวมถูกส่ง review

## Validation profile สำหรับข้อมูลใหญ่

`--validation-profile auto` ใช้ Full validation เมื่อ endpoint มีน้อยกว่า 5,000 แถว และเปลี่ยนเป็น Large profile เมื่อมีตั้งแต่ 5,000 แถวขึ้นไป

Large profile ยังคงสร้าง:

- 5-fold OOF metrics และ prediction CSV
- ROC curve, confusion matrix และ probability plot
- 5-fold scaffold-grouped CV
- external validation เมื่อชุดทดสอบไม่ซ้ำกับ Train

Large profile ข้าม Nested CV ซึ่งมีต้นทุนสูงมาก และรายงานสถานะว่าไม่ได้รันอย่างชัดเจน ไม่เติมค่าความแม่นยำสมมติ
