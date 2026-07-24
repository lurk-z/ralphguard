# การตอบข้อเสนอแนะ/ข้อเสียจากกรรมการ (Reviewer Response)

โครงการ **RalphGuard** — ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีแบบ in-silico
NSC 2026 (ครั้งที่ 28) · หมวด 14 · รหัส 28P14E01438

เอกสารนี้สรุปวิธีที่โครงการจัดการกับข้อเสีย 4 ข้อจากการประเมินรอบข้อเสนอโครงการ พร้อมชี้ไฟล์/โค้ด/หลักฐานที่รองรับ

---

## สรุปภาพรวม

| # | ข้อเสียจากกรรมการ | สถานะ | หลักฐานหลัก |
|---|---|---|---|
| 1 | ขาดรายละเอียด confidence/uncertainty ที่ป้อนกลับให้ผู้ใช้ | แก้ไขแล้ว | 3-layer confidence + แสดงในหน้าผล/แท็บความน่าเชื่อถือ |
| 2 | ขาดรายละเอียดการเตรียมข้อมูล | แก้ไขแล้ว | `docs/DATA_PREPARATION.md`, `data_prep.py` |
| 3 | ความใหม่ของแบบจำลอง AI ยังไม่ชัดเจน | แก้ไขแล้ว | Ensemble v2 + 3-layer confidence + visualization |
| 4 | ยังไม่มีการยืนยันผลกับข้อมูลทดลองจริง | แก้ไขแล้ว | `docs/EXTERNAL_VALIDATION.md`, `data/external_validation.csv` |

---

## ข้อ 1 — Confidence / Uncertainty Quantification ที่ป้อนกลับให้ผู้ใช้

**ปัญหา:** ผลการทำนายไม่ได้บอกว่าผู้ใช้ควรเชื่อถือได้แค่ไหน

**สิ่งที่ทำ — ระบบความเชื่อมั่น 3 ชั้น (3-Layer Confidence):**

1. **Applicability Domain (AD)** — วัดว่าสารที่ป้อนเข้ามา "อยู่ในขอบเขต" ของข้อมูลที่ใช้ฝึกหรือไม่ ด้วยระยะ Tanimoto (k-NN) กับ fingerprint ของชุดฝึก หากสารอยู่นอกขอบเขต (out-of-domain) ระบบจะเตือนว่าความน่าเชื่อถือต่ำ
2. **Model Uncertainty (Epistemic)** — คำนวณจากความไม่เห็นพ้องของสมาชิกใน ensemble (ส่วนเบี่ยงเบนมาตรฐานของความน่าจะเป็นจากแต่ละโมเดล) ยิ่งสมาชิกทำนายต่างกันมาก ยิ่งไม่แน่นอน
3. **Structural-Alert Agreement** — ตรวจว่าโมเดลสถิติสอดคล้องกับกฎเชิงโครงสร้าง (structural alerts เชิงพิษวิทยา) หรือไม่ หากขัดกันจะลดระดับความเชื่อมั่น

**การป้อนกลับให้ผู้ใช้:**
- ทุกผลการทำนายแสดง **ระดับความเชื่อมั่น (สูง / กลาง / ต่ำ)** พร้อม **เหตุผลภาษาไทย** เช่น "อยู่นอกขอบเขตข้อมูลฝึก" หรือ "โมเดลไม่แน่นอนสูง"
- แสดงค่า **domain similarity** และสถานะ **in/out-of-domain**
- แท็บ **"ความน่าเชื่อถือ"** แสดงตัวชี้วัดประสิทธิภาพของโมเดล (AUC, Balanced Accuracy, Sensitivity, Specificity) ต่อ endpoint

**ไฟล์ที่เกี่ยวข้อง:** `scientific/confidence.py`, `scientific/applicability.py`, `scientific/qsar/predictor.py` (คืนค่า `confidence`, `uncertainty`, `in_domain`, `domain_similarity`), หน้า `frontend .../assess` (แท็บความน่าเชื่อถือ)

---

## ข้อ 2 — รายละเอียดการเตรียมข้อมูล (Data Preparation)

**ปัญหา:** ไม่ได้อธิบายว่าเตรียมข้อมูลอย่างไร

**สิ่งที่ทำ — กระบวนการเตรียมข้อมูลที่ตรวจสอบได้ (documented & reproducible):**

1. **แหล่งข้อมูล** — ระบุฐานข้อมูลสาธารณะที่ใช้ต่อ endpoint (skin/eye irritation, skin sensitization, acute toxicity) พร้อมจำนวนสาร
2. **การทำความสะอาด** — ตรวจความถูกต้องของ SMILES ด้วย RDKit, ทำ canonicalization, ลบสารที่ parse ไม่ได้/ซ้ำ (deduplication ตาม canonical SMILES)
3. **การจัดการ label** — แปลงเป็น binary classification ต่อ endpoint พร้อมเกณฑ์ตัดสิน
4. **Featurization** — Morgan/ECFP fingerprint + MACCS keys + physicochemical descriptors (เลือก feature mode ต่อ endpoint)
5. **การแบ่งข้อมูล** — train/test split + nested cross-validation เพื่อประเมินแบบไม่ลำเอียง
6. **การจัดการ class imbalance** — ใช้ `class_weight="balanced"` และปรับ decision threshold ด้วย Youden's J

**ไฟล์ที่เกี่ยวข้อง:** `docs/DATA_PREPARATION.md`, `data_prep.py`, `scientific/featurizer.py`, `scientific/fingerprints.py`, `scientific/descriptors.py`

> หมายเหตุ: พบว่าชุดข้อมูล eye เดิมซ้ำกับ skin — ได้บันทึกเป็นประเด็นให้แก้ (จัดหาชุดข้อมูล eye จริง) เพื่อความโปร่งใส

---

## ข้อ 3 — ความใหม่ของแบบจำลอง AI (Model Novelty)

**ปัญหา:** ยังไม่ชัดว่าโมเดลใหม่/ต่างจากงานเดิมอย่างไร

**จุดใหม่ของ RalphGuard (ไม่ใช่ Random Forest เดี่ยวธรรมดา):**

1. **Ensemble v2** — soft-voting ระหว่าง 4 โมเดลที่ต่างธรรมชาติกัน: Random Forest + Extra Trees + Logistic Regression + HistGradientBoosting (ทั้งหมด balanced) ทำให้ลดจุดอ่อนเฉพาะตัวของแต่ละอัลกอริทึม
2. **3-Layer Confidence** — รวม Applicability Domain + ความไม่แน่นอนของ ensemble + ความสอดคล้องกับ structural alerts เป็นระบบความเชื่อมั่นเดียว (งาน QSAR ทั่วไปมักมีแค่ค่าความน่าจะเป็น)
3. **Applicability Domain + Youden Threshold** — ปรับ decision threshold ด้วย Youden's J แทนการใช้ 0.5 คงที่ ทำให้ sensitivity ดีขึ้นอย่างมาก
4. **การผสาน rule-based + statistical** — รวมกฎเชิงโครงสร้างเข้ากับโมเดลสถิติ (hybrid) เพื่อให้ตีความเชิงกลไกได้ (สอดคล้อง OECD principle 5)
5. **Visualization ตามบริเวณกายวิภาค** — แสดงผลลงบน "ผิวของโมเดล 3 มิติจริง" ตามบริเวณ (ใบหน้า/ดวงตา) พร้อมความไวต่อสารต่างกันตามส่วนของผิว
6. **Node-based workflow** — ทำให้ "อัลกอริทึมที่ชัดเจน" (OECD principle 2) มองเห็นและ what-if ได้

**ไฟล์ที่เกี่ยวข้อง:** `data_prep.py` (`build_members`, ensemble_v2), `scientific/qsar/predictor.py`, `docs/MODEL_IMPROVEMENT.md`

---

## ข้อ 4 — การยืนยันผลกับข้อมูลทดลองจริง (External Validation)

**ปัญหา:** ยังไม่มีการทดสอบกับข้อมูลจริงภายนอกชุดฝึก

**สิ่งที่ทำ — External Validation กับสารอ้างอิง:**

- ทดสอบกับชุดสารอ้างอิง 24 ตัว (ไม่อยู่ในชุดฝึก) ที่มีผลการทดลองจริงเป็นที่ยอมรับ
- ผลลัพธ์: **Sensitivity 1.00, Accuracy 0.92** (และเฉพาะสารใหม่ Sensitivity 1.00)
- ตัวอย่างที่ยืนยันได้ถูกต้อง เช่น DNCB (สารก่อภูมิแพ้ที่รู้จัก) ถูกจับได้ถูกต้อง

**สิ่งที่ควรทำเพิ่มเพื่อรอบ 2 (ให้แข็งแรงขึ้น):**
- ขยายจำนวนสารอ้างอิง และ **อ้างแหล่งข้อมูลทดลองจริง** (เช่น สารอ้างอิง OECD, ECHA CHEM database, DSSTox)
- ทำ **ตารางเปรียบเทียบ ทำนาย vs ผลจริง** รายสาร ในรายงาน
- รายงาน confusion matrix + metrics แยกต่อ endpoint

**ไฟล์ที่เกี่ยวข้อง:** `docs/EXTERNAL_VALIDATION.md`, `data/external_validation.csv`, `docs/MODEL_EVALUATION.md`

---

## สิ่งที่ต้องทำต่อ (Checklist สำหรับรอบ 2)

- [ ] นำ 4 ส่วนนี้เขียนเป็นหัวข้อในรายงานฉบับสมบูรณ์
- [ ] เพิ่มการแสดง confidence/uncertainty รายผลในหน้า UI ให้เด่นชัดขึ้น
- [ ] ขยายชุด external validation + ระบุแหล่งอ้างอิงให้ครบ
- [ ] จัดหาชุดข้อมูล eye ที่แยกจาก skin (แก้ประเด็นข้อมูลซ้ำ)
- [ ] ใส่ตาราง/กราฟผลการทดสอบทั้งหมดลงรายงาน + คู่มือใช้งาน
