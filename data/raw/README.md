# Data Folder

## Official bulk preparation (10,000+ endpoint rows)

The current reproducible source is NICEATM ICE. Do not manually reconstruct
the missing historical CSV files and do not use CATMoS predictions as labels.

```powershell
docker compose --profile training run --rm ice-data-prep
```

This downloads the four official ICE workbooks and prepares:

- `raw/skin_irritation.csv`
- `raw/eye_irritation.csv`
- `raw/skin_sensitization.csv`
- `raw/acute_oral_toxicity.csv`

The command fails if fewer than 10,000 unique endpoint rows remain after the
documented mapping, structure join, conflict removal, and evidence filtering.
See `docs/ICE_BULK_TRAINING.md`.

โฟลเดอร์นี้เก็บชุดข้อมูลสำหรับฝึก QSAR models

## โครงสร้าง

```
data/
├── raw/           # ชุดข้อมูลดิบ (download มาตามนี้)
└── processed/     # ชุดข้อมูลหลัง clean + split (สร้างโดย data_prep.py)
```

## ชุดข้อมูลที่ต้องดาวน์โหลด

### 1. Acute Oral Toxicity
- **แหล่ง:** NIH/NICEATM Integrated Chemical Environment (ICE)
- **URL:** https://ice.ntp.niehs.nih.gov/downloads/DataonICE/acute_oral.xlsx
- **ใช้เฉพาะ:** in-vivo rat acute oral evidence; ไม่ใช้ CATMoS predictions เป็น Label
- **บันทึกเป็น:** `raw/acute_oral_toxicity.csv`

### 2. Skin Sensitization
- **แหล่ง:** NIH/NICEATM Integrated Chemical Environment (ICE)
- **URL:** https://ice.ntp.niehs.nih.gov/downloads/DataonICE/skin_sensitization.xlsx
- **บันทึกเป็น:** `raw/skin_sensitization.csv`

### 3. Skin Irritation
- **แหล่ง:** NIH/NICEATM Integrated Chemical Environment (ICE)
- **URL:** https://ice.ntp.niehs.nih.gov/downloads/DataonICE/skin_irritation.xlsx
- **บันทึกเป็น:** `raw/skin_irritation.csv`

### 4. Eye Irritation
- **แหล่ง:** NIH/NICEATM Integrated Chemical Environment (ICE)
- **URL:** https://ice.ntp.niehs.nih.gov/downloads/DataonICE/eye_irritation.xlsx
- **บันทึกเป็น:** `raw/eye_irritation.csv`

## รูปแบบไฟล์ขั้นต่ำ

แต่ละไฟล์ควรมีคอลัมน์อย่างน้อย:

```
smiles, label
```

โดย `label` เป็น 0/1 (binary classification) หรือค่าตัวเลข (regression)

## หมายเหตุ

- ไฟล์ในโฟลเดอร์นี้ **ไม่ถูก commit เข้า Git** (ดู `.gitignore`)
- ทุกครั้งที่นำข้อมูลจริงเข้าเครื่อง ให้คัดลอก `dataset_manifest.example.json` เป็น `dataset_manifest.json` และกรอก URL, วันที่ดึง, assay/guideline, นิยาม Label 0/1, เงื่อนไขการใช้ข้อมูล และ SHA-256 ของไฟล์ดิบ
- CATMoS prediction เป็นผลจากโมเดลอื่น ห้ามใช้เป็น experimental training label; ใช้ได้เฉพาะ reference outcomes ที่มีที่มาและนิยามชัดเจน
- ก่อนเทรน Candidate ให้รัน `scripts/check_training_integrity.py` แล้วจึงรัน `scripts/train_candidate_v2.py`
- ตัวเทรน Production เดิมอยู่ที่ root: `data_prep.py` (ไม่ควรรันเพื่อเขียนทับ Production ก่อน Candidate ผ่าน benchmark)
