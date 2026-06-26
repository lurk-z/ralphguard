# RalphGuard — รายงานผลการทดสอบความแม่นยำ (Model Evaluation)

ทดสอบกับชุดข้อมูลจริง 4 endpoint + รัน 100 use case ผ่าน pipeline จริง
วิธี: **stratified 5-fold cross-validation** (out-of-fold predictions, n=144/endpoint, รวม 576 การทำนาย) + functional test 100 เคส

---

## 1. ความแม่นยำแบบ generalization (5-fold CV — ตัวเลขจริงที่ไม่เข้าข้างตัวเอง)

| Endpoint | n | pos | Accuracy | Balanced Acc | **Sensitivity** | Specificity | ROC-AUC | MCC |
|---|---|---|---|---|---|---|---|---|
| skin | 144 | 35 | 0.771 | 0.577 | **0.20** (7/35) | 0.95 | 0.677 | 0.24 |
| eye | 144 | 35 | 0.771 | 0.577 | **0.20** (7/35) | 0.95 | 0.677 | 0.24 |
| sens | 144 | 30 | 0.771 | 0.487 | **0.00** (0/30) | 0.97 | 0.735 | −0.08 |
| acute | 144 | 32 | 0.840 | 0.708 | **0.47** (15/32) | 0.95 | 0.878 | 0.49 |
| **เฉลี่ย** | | | **0.79** | 0.59 | **0.22** | 0.95 | **0.74** | 0.22 |

> **Accuracy ~79% ดูดี แต่หลอกตา** — มันสูงเพราะโมเดล "เดาว่าปลอดภัย (negative)" เกือบทุกตัว ซึ่งถูกเพราะข้อมูลส่วนใหญ่เป็น negative (imbalance)
> ตัวเลขที่สำคัญจริงสำหรับเครื่องมือความปลอดภัยคือ **Sensitivity (จับ hazard เจอไหม) = ต่ำมาก เฉลี่ย 0.22** → **พลาด hazard จริงเป็นส่วนใหญ่**

---

## 2. ปัญหาที่เจอ (ต้องแก้)

### 🔴 ปัญหาใหญ่ 1: ชุดข้อมูล skin กับ eye ซ้ำกันเป๊ะ
`skin_irritation.csv` และ `eye_irritation.csv` มี **SMILES + label เหมือนกันทุกแถว (byte-identical)** → จริงๆ มีแค่ **3 ชุดข้อมูลที่ต่างกัน ไม่ใช่ 4** และโมเดล eye = สำเนาของ skin (metric เท่ากันเป๊ะจึงเป็นเพราะเหตุนี้ ไม่ใช่ความบังเอิญ)

### 🔴 ปัญหาใหญ่ 2: Sensitivity ต่ำจาก class imbalance
- positive มีแค่ ~20–24% ของข้อมูล โมเดลเลยเอนเอียงไปทาง negative
- **endpoint `sens` แย่สุด: จับ sensitizer ได้ 0/30 (Sensitivity 0.00, MCC ติดลบ)** = ใช้ตัดสินการแพ้ไม่ได้เลยในสภาพปัจจุบัน
- ในเชิงความปลอดภัย "พลาด hazard" (false negative) อันตรายกว่า "เตือนเกิน" (false positive) มาก

### 🟡 ปัญหา 3: ชุดข้อมูลเล็ก (~144 สาร/endpoint)
variance สูง — ค่า AUC จาก held-out split เดียว (รายงานเดิม 0.76–0.78) มองโลกสวยกว่าค่า CV จริง (0.68–0.88)

---

## 3. การทดสอบ 100 use case ผ่าน pipeline จริง

- **รันสำเร็จ 100/100 เคส, ไม่มี crash** (70 สารเดี่ยว + 20 สูตรผสม + 10 reference/edge) → **pipeline ทนทานดีมาก**
- สูตรผสมรันได้ 20/20 (mixture aggregation + Day1/3/7 + confidence + disclaimer ครบ)
- ความแม่นสารเดี่ยว 70/70 = 100% แต่ **เป็นสารในชุดเทรน → มองโลกสวย (RF จำได้)** ไม่ใช่ค่าจริง ดูข้อ 1 แทน

### Sanity check สารอ้างอิง (peak score + confidence)
| สาร | skin | sens | acute | confidence | ความเห็น |
|---|---|---|---|---|---|
| glycerol (อ่อน) | 3.9 | 0.0 | 1.0 | High | ✅ ถูก |
| ethanol | 6.5 | 0.0 | 5.0 | High | ✅ ถูก |
| SLS (ระคายเคือง) | 83.8 | — | — | Medium | ✅ ถูก |
| formaldehyde | 95.5 | 70.5 | 75.5 | Medium | ✅ ถูก (ระคาย+แพ้) |
| NaOH (กัดกร่อน) | 98.8 | — | 80.5 | **Low** | ✅ คะแนนถูก + AD เตือน |
| water | 65.0 | — | 69.0 | **Low** | ⚠️ คะแนนเพี้ยน แต่ **AD เตือน Low** ถูก |
| DNCB (สารก่อแพ้แรง) | — | **16.0** | 93.5 | Medium | ❌ พลาด — sens ควรสูงแต่ได้ต่ำ |
| โมเลกุล OOD (2 ตัว) | — | — | — | **Low** | ✅ AD จับ out-of-domain ได้ |

> **จุดแข็งที่ชัด:** ระบบ Applicability Domain + Confidence 3 ชั้น **ทำงานได้จริง** — มันลดความเชื่อมั่นเป็น "Low" ให้สารแปลก/นอกขอบเขต (water, NaOH, OOD) อัตโนมัติ = มี safety net

---

## 4. สรุป & ข้อเสนอแนะ

**จุดแข็ง:** pipeline ทนทาน (100/100), ระบบ AD/confidence ทำงานจริงและช่วยกันผลลวง, acute endpoint แม่นพอใช้ (AUC 0.88)

**จุดอ่อนหลัก (ต้องแก้ก่อนเคลม "แม่นยำ"):**
1. แยกชุดข้อมูล eye ออกจาก skin ให้เป็นข้อมูลจริงคนละชุด
2. แก้ imbalance เพื่อดัน sensitivity: `class_weight="balanced"`, oversampling (SMOTE), หรือปรับ decision threshold (เช่น 0.3 แทน 0.5)
3. เพิ่มขนาดข้อมูล + หา external validation set
4. รายงานผลด้วย **Balanced Accuracy / Sensitivity / MCC / AUC** ไม่ใช่ Accuracy ตัวเดียว (ซื่อสัตย์กับกรรมการ)

**ข้อความที่ควรใช้กับกรรมการ (ตรงไปตรงมา):** "ระบบเป็น screening tool ที่มี applicability domain + confidence กำกับ ผลปัจจุบันแม่นระดับคัดกรองเบื้องต้น โดย acute toxicity ทำได้ดี (AUC 0.88) ส่วน irritation/sensitization ยังจำกัดด้วยขนาดและความไม่สมดุลของข้อมูล ซึ่งเป็นทิศทางพัฒนาต่อ"

*(ทดสอบด้วย 5-fold CV จริงในวันที่จัดทำรายงาน — ตัวเลขทำซ้ำได้ด้วยสคริปต์)*
