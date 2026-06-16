# Data Folder

โฟลเดอร์นี้เก็บชุดข้อมูลสำหรับฝึก QSAR models

## โครงสร้าง

```
data/
├── raw/           # ชุดข้อมูลดิบ (download มาตามนี้)
└── processed/     # ชุดข้อมูลหลัง clean + split (สร้างโดย data_prep.py)
```

## ชุดข้อมูลที่ต้องดาวน์โหลด

### 1. Acute Toxicity (CATMoS)
- **แหล่ง:** EPA CompTox Chemicals Dashboard
- **URL:** https://www.epa.gov/comptox-tools/exploring-toxcast-data
- **ค้น:** "OPERA CATMoS" หรือ "Acute Oral Toxicity"
- **บันทึกเป็น:** `raw/catmos_acute_toxicity.csv`

### 2. Skin Sensitization (LLNA)
- **แหล่ง:** ICCVAM / NICEATM
- **บันทึกเป็น:** `raw/llna_sensitization.csv`

### 3. Skin Irritation
- **แหล่ง:** ECHA REACH database หรือ OECD QSAR Toolbox
- **บันทึกเป็น:** `raw/skin_irritation.csv`

### 4. Eye Irritation
- **แหล่ง:** ECETOC Reference Chemicals Database
- **บันทึกเป็น:** `raw/eye_irritation.csv`

## รูปแบบไฟล์ขั้นต่ำ

แต่ละไฟล์ควรมีคอลัมน์อย่างน้อย:

```
smiles, label
```

โดย `label` เป็น 0/1 (binary classification) หรือค่าตัวเลข (regression)

## หมายเหตุ

- ไฟล์ในโฟลเดอร์นี้ **ไม่ถูก commit เข้า Git** (ดู `.gitignore`)
- หลังดาวน์โหลดเสร็จ รัน `python scientific/data_prep.py` เพื่อ clean + split
