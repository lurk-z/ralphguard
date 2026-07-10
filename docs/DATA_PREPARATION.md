# RalphGuard — การเตรียมข้อมูล & ความใหม่ของแบบจำลอง

ตอบข้อเสียกรรมการ #2 (ขาดรายละเอียดการเตรียมข้อมูล) และ #3 (ความใหม่ของแบบจำลอง AI)

---

## ส่วนที่ 1 — การเตรียมข้อมูล (Data Preparation)

### 1.1 แหล่งข้อมูล (`data/raw/`)
| ไฟล์ | endpoint | n | ที่มา (คอลัมน์ source) |
|---|---|---|---|
| skin_irritation.csv | ระคายเคืองผิว | 147 | literature (อ้างอิงแนว OECD TG 404/439) |
| eye_irritation.csv | ระคายเคืองตา | 147 | literature (OECD TG 405/492) |
| llna_sensitization.csv | แพ้สัมผัส | 147 | LLNA-literature (OECD TG 429/442) |
| catmos_acute_toxicity.csv | พิษเฉียบพลัน | 147 | CATMoS-literature (OECD TG 420) |

แต่ละแถว: `smiles, name, label (0/1), source` (acute มี `ghs_category` เพิ่ม)

### 1.2 ขั้นตอนทำความสะอาด (ใน `data_prep.py`)
1. **Canonicalize SMILES** ด้วย RDKit (`MolFromSmiles` → `MolToSmiles`) — รวมรูปแบบ SMILES ที่เขียนต่างกันให้เป็นมาตรฐานเดียว
2. **คัด SMILES ที่ parse ไม่ได้** ออก (RDKit คืน None)
3. **ลบ duplicate** ตาม canonical SMILES (กันสารซ้ำทำให้ประเมินเข้าข้างตัวเอง) — เหลือ ~144 สาร/endpoint
4. **Featurization** (ดู 1.3)

### 1.3 การแปลงเป็นฟีเจอร์ (`scientific/featurizer.py` — ใช้ร่วมกันทั้งเทรน/ทำนาย)
- **Morgan/ECFP fingerprint** radius 2, 2048 bits (โครงสร้างย่อย)
- **MACCS keys** 167 bits (หมู่ฟังก์ชันมาตรฐาน)
- **Physicochemical descriptors** 10 ตัว: MW, logP, TPSA, HBD, HBA, RotatableBonds, AromaticRings, HeavyAtoms, FractionCSP3, NumRings
- เลือกชุดฟีเจอร์ **ต่อ endpoint** (จากผลการทดลอง): skin/eye→MACCS+descriptors, sens→Morgan, acute→Morgan+MACCS+descriptors

### 1.4 ปัญหาคุณภาพข้อมูลที่ตรวจพบ (รายงานตรงไปตรงมา)
- 🔴 **skin กับ eye เป็นข้อมูลชุดเดียวกัน (ซ้ำกันทุกแถว)** — ตรวจด้วย hash ของ SMILES+label
  → ปัจจุบันโมเดล eye = สำเนา skin **ต้องหา dataset eye irritation จริงมาแทน**
- 🟡 **Class imbalance** — positive เพียง ~20–24% (skin 35/147, sens 30/147, acute 32/147)
  → จัดการด้วย `class_weight="balanced"` + เลือก operating threshold (ดูส่วนที่ 2)
- 🟡 **ขนาดเล็ก (~144)** — variance สูง รายงานด้วย cross-validation ไม่ใช่ split เดียว

### 1.5 การแบ่งข้อมูล/ประเมิน
- **5-fold stratified cross-validation** (out-of-fold) สำหรับรายงาน metric
- เลือก threshold ด้วย **inner-fold (nested)** เพื่อไม่ให้ leak (ดู MODEL_IMPROVEMENT.md)
- **External validation set** แยกต่างหาก (ดู EXTERNAL_VALIDATION.md)

---

## ส่วนที่ 2 — ความใหม่ของแบบจำลอง (Novelty)

RalphGuard ไม่ใช่ "RandomForest ตัวเดียว" แต่เป็นระบบที่ประกอบหลายเทคนิคเข้าด้วยกัน:

### 2.1 "RalphGuard Ensemble v2" — โมเดลผสมต่อ endpoint
- **Soft-Voting Ensemble** เฉลี่ย probability จาก 4 อัลกอริทึมที่หลากหลาย:
  RandomForest + ExtraTrees + Logistic Regression + HistGradientBoosting (ทุกตัว balanced)
- **เลือกชุดฟีเจอร์ที่เหมาะสมต่อ endpoint** (ไม่บังคับใช้ fingerprint แบบเดียว)
- **Operating threshold ต่อ endpoint** จาก Youden's J (เอนเอียงไปจับ hazard ให้ครบ)

### 2.2 Uncertainty Quantification (ตอบข้อเสีย #1)
ทุกการทำนายมาพร้อม "ความไม่แน่นอน" ที่วัดได้จริง:
- **Ensemble disagreement** = ส่วนเบี่ยงเบนมาตรฐานของ probability จากสมาชิก 4 ตัว (เห็นไม่ตรงกัน = ไม่แน่ใจ)
- **Applicability Domain** = k-NN Tanimoto similarity (บอกว่าสารอยู่ในขอบเขตที่โมเดลเชื่อถือได้ไหม)
- **Prediction probability** + **operating threshold**
- รวมเป็น **Confidence 3 ชั้น** (AD → probability extremity → structural-alert agreement) + ปรับลดถ้า ensemble ไม่เห็นพ้อง

### 2.3 Hybrid data-driven + knowledge-based
- ผสม **โมเดลเชิงข้อมูล (QSAR)** กับ **กฎเชิงโครงสร้าง (SMARTS structural alerts)** —
  ตรงตามหลัก OECD principle 5 (mechanistic interpretation) และช่วยจับ hazard ที่โมเดลพลาด

### 2.4 ผลของความใหม่ (เทียบ baseline)
| | Sensitivity (จับ hazard) | Balanced Acc |
|---|---|---|
| เดิม (RF เดี่ยว, thr 0.5) | เฉลี่ย **0.22** (sens=0.00) | 0.59 |
| **Ensemble v2** | เฉลี่ย **~0.81** | ~0.72 |
| External (สารใหม่) | **1.00** | — |

→ จุดขายความใหม่: **ระบบ ensemble หลายอัลกอริทึม + uncertainty quantification + applicability domain + hybrid rule-based** ที่ทำให้ in-silico screening จับ hazard ได้ครบขึ้นมากและบอกความเชื่อมั่นได้

*(รายละเอียดเชิงตัวเลขใน MODEL_IMPROVEMENT.md และ MODEL_EVALUATION.md)*
