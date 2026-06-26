# RalphGuard — การพัฒนาโมเดลแบบวนซ้ำ (คิด → ทดลอง → แก้ → คิดใหม่)

ปัญหาตั้งต้น: โมเดลเดิม **Sensitivity ต่ำมาก (เฉลี่ย 0.22, sens=0.00)** เพราะ class imbalance —
เป็นเครื่องมือความปลอดภัยที่ "พลาด hazard" ซึ่งอันตราย

วิธีวัด: **nested 5-fold CV** (เลือก threshold ด้วย Youden's J จาก inner 3-fold เท่านั้น = ไม่ leak),
รายงาน AUC (threshold-free) + Balanced Accuracy / Sensitivity / Specificity / MCC

---

## ลำดับการทดลอง

**Round 1 — แก้ imbalance:** `class_weight="balanced"` อย่างเดียวแทบไม่ช่วย (AUC ขยับนิดเดียว)
แต่ **threshold tuning (Youden's J) คือตัวพลิกเกม** → Sensitivity พุ่งทุก endpoint
บทเรียน: เพดานอยู่ที่ AUC ต้องไปดัน AUC ต่อ

**Round 2 — เทียบ algorithm (AUC):** ไม่มีตัวไหนชนะหมด →
skin: HistGB (0.710) · sens: **LogReg (0.771)** · acute: **RF (0.876)**
บทเรียน: ความหลากหลาย → เหมาะทำ ensemble

**Round 3 — feature engineering:** ฟีเจอร์ช่วยไม่เท่ากัน →
skin: **MACCS+descriptors (0.693→0.760)** · acute: morgan+MACCS+descr (0.876→0.885) · sens: Morgan ล้วนดีสุด (0.764)

**Round 4 — ensemble ผสม (วิธีใหม่):** soft-voting ของ RF + ExtraTrees + LogReg + HistGB (ทุกตัว balanced)
บนฟีเจอร์ที่ดีที่สุดต่อ endpoint + nested threshold

**Round 5 — สรุป** ด้านล่าง

---

## ผลลัพธ์: เดิม vs วิธีใหม่ (nested CV, ไม่ leak)

| Endpoint | เมตริก | เดิม (RF, thr0.5, Morgan) | **วิธีใหม่** | เปลี่ยนแปลง |
|---|---|---|---|---|
| **skin** | AUC | 0.677 | **0.759** | +0.082 |
| | Balanced Acc | 0.572 | **0.655** | +0.083 |
| | **Sensitivity** | 0.20 | **0.71** | **+0.51** |
| | MCC | 0.217 | **0.267** | +0.050 |
| **sens** | AUC | 0.735 | **0.767** | +0.032 |
| | Balanced Acc | 0.487 | **0.714** | +0.227 |
| | **Sensitivity** | **0.00** | **0.87** | **+0.87** |
| | MCC | −0.075 | **0.348** | +0.42 |
| **acute** | AUC | 0.878 | 0.869 | ~เท่าเดิม |
| | Balanced Acc | 0.708 | **0.790** | +0.082 |
| | **Sensitivity** | 0.469 | **0.875** | **+0.41** |
| | MCC | 0.489 | 0.488 | ~เท่าเดิม |

**ค่าเฉลี่ย Sensitivity: 0.22 → ~0.81** (เครื่องมือ "จับ hazard เจอ" ดีขึ้นมาก)

---

## วิธีที่ดีที่สุด (ต่อ endpoint) — "RalphGuard Ensemble v2"

| Endpoint | ฟีเจอร์ | โมเดล | Threshold |
|---|---|---|---|
| skin | MACCS + descriptors | Soft-vote (RF+ET+LogReg+HistGB, balanced) | Youden's J (nested) |
| sens | Morgan FP | RF balanced (หรือ ensemble — เท่ากัน) | Youden's J (nested) |
| acute | Morgan + MACCS + descriptors | Soft-vote ensemble | Youden's J (nested) |

องค์ประกอบของ "วิธีใหม่":
1. **เลือกฟีเจอร์ต่อ endpoint** (ไม่บังคับใช้ Morgan อย่างเดียว)
2. **ผสมหลาย algorithm** ด้วย soft-voting (เฉลี่ย probability) → ลด variance, รวมจุดแข็งแต่ละตัว
3. **balanced class weight** ทุก base learner
4. **Operating threshold จาก Youden's J** เลือกผ่าน inner-CV (เอนเอียงไปจับ hazard)

---

## ข้อแลกเปลี่ยน & ความซื่อสัตย์

- **Specificity ลดลง** (เดิม ~0.95 → ~0.56–0.75) = เตือนผิดมากขึ้น (false positive) —
  แต่สำหรับ **screening ความปลอดภัย นี่คือทิศทางที่ถูก** (พลาด hazard แย่กว่าเตือนเกิน)
  และระบบมี Applicability Domain + Confidence กำกับว่าเคสไหนเชื่อได้
- threshold เลือกผ่าน **nested CV (inner fold)** → ตัวเลขที่รายงานไม่ leak
- ข้อมูลยังเล็ก (~144) → variance สูง, ผลเป็นระดับ screening
- **eye ยังเป็นสำเนา skin** — ต้องหาข้อมูล eye irritation จริงมาแทน (ปัญหาข้อมูล ไม่ใช่ algorithm)

## ข้อเสนอถัดไป
- นำ "Ensemble v2" ไปแทนใน `data_prep.py` (เทรน + เซฟ bundle + เก็บ threshold ต่อ endpoint)
- ให้ `predictor.py` ใช้ threshold ต่อ endpoint แทน 0.5 ตายตัว
- ถ้าได้ข้อมูลเพิ่ม/แยก eye จริง คาดว่า AUC ขยับขึ้นอีก

*(ทุกตัวเลขจาก nested 5-fold CV รันในวันจัดทำ ทำซ้ำได้ด้วยสคริปต์ /tmp/round*.py)*
