# รายงานฉบับสมบูรณ์

> **โครงการ:** ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลองคอมพิวเตอร์เพื่อลดการพึ่งพาการทดลองในสัตว์
> **ชื่อภาษาอังกฤษ:** RalphGuard — In-silico Irritation and Toxicity Risk Screening Platform for Reducing Animal Testing Dependency
> **การแข่งขัน:** NSC 2026 หมวด 14 — โปรแกรมเพื่องานการพัฒนาด้านวิทยาศาสตร์และเทคโนโลยี (ระดับนิสิต นักศึกษา)
>
> **ผู้พัฒนา:** นายสุรวิทย์ สุขเจริญ (หัวหน้าโครงการ) · นายธนกรณ์ อ่อนกลั่น (ผู้ร่วมพัฒนา)
> ภาควิชาเทคโนโลยีสารสนเทศ คณะเทคโนโลยีและการจัดการอุตสาหกรรม มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ

---

## กิตติกรรมประกาศ (Acknowledgement)

โครงการนี้ได้รับทุนอุดหนุนจาก **การแข่งขันพัฒนาโปรแกรมคอมพิวเตอร์แห่งประเทศไทย ครั้งที่ 28 (The 28th National Software Contest: NSC 2026)** โดย **สำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ (สวทช.)** ในชื่อโครงการ "ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลองคอมพิวเตอร์เพื่อลดการพึ่งพาการทดลองในสัตว์ (RalphGuard)"

คณะผู้พัฒนาขอขอบคุณอาจารย์ที่ปรึกษาและภาควิชาเทคโนโลยีสารสนเทศ มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ ที่ให้คำแนะนำตลอดการพัฒนา

---

## 1. บทคัดย่อ

### ภาษาไทย

การประเมินความปลอดภัยของสารเคมีในระยะต้น โดยเฉพาะการระคายเคืองต่อผิวหนัง ดวงตา การแพ้สัมผัส และความเป็นพิษเฉียบพลัน ในอดีตมักพึ่งพาการทดลองในสัตว์ ซึ่งก่อให้เกิดประเด็นด้านจริยธรรม ต้นทุน และระยะเวลา โครงการ **RalphGuard** จึงพัฒนาเว็บแอปพลิเคชันสำหรับ **คัดกรองความเสี่ยงเบื้องต้น (in-silico screening)** ด้วยแบบจำลอง QSAR (Quantitative Structure–Activity Relationship) ที่วิเคราะห์จากโครงสร้างโมเลกุล (SMILES) โดยตรง

ระบบรับข้อมูลสูตรผสมสารเคมี (SMILES + ความเข้มข้น) และบริเวณร่างกายที่ต้องการทดสอบ จากนั้นคำนวณลายพิมพ์โมเลกุล (Morgan fingerprint) ป้อนเข้าแบบจำลอง Random Forest เพื่อทำนายความเสี่ยง 4 ด้าน แสดงผลเป็นคะแนน 0–100 พร้อมแนวโน้มเชิงเวลา (วันที่ 1, 3, 7) บนแดชบอร์ดและโมเดลกายวิภาค 3 มิติ จุดเด่นคือ **ระบบความน่าเชื่อถือ 3 ชั้น** (Applicability Domain + ความชัดของความน่าจะเป็น + ความสอดคล้องของ structural alert) ซึ่งช่วยป้องกันการสรุปผลเกินขอบเขตของข้อมูล (out-of-domain) ตามหลักการ OECD QSAR 5 ข้อ

ระบบนี้เป็นเครื่องมือคัดกรองเบื้องต้น **ไม่ใช่การทดสอบทางคลินิกหรือการรับรองความปลอดภัย** แต่ช่วยลดจำนวนสารเสี่ยงสูงก่อนเข้าสู่การทดสอบจริง สนับสนุนแนวคิดลดการพึ่งพาการทดลองในสัตว์โดยไม่จำเป็น

### English

Early-stage chemical safety assessment — skin/eye irritation, skin sensitization, and acute toxicity — has historically relied on animal testing, raising ethical, cost, and time concerns. **RalphGuard** is a web application for **in-silico screening** using QSAR (Quantitative Structure–Activity Relationship) models that operate directly on molecular structure (SMILES).

The system accepts a chemical formula (SMILES + concentration) and a target body region, computes Morgan molecular fingerprints, and feeds them into Random Forest classifiers to predict four endpoints, presenting 0–100 risk scores with a temporal trend (Day 1, 3, 7) on a dashboard and 3D anatomy model. Its key feature is a **3-layer confidence system** (Applicability Domain + prediction-probability extremity + structural-alert agreement) that prevents over-extrapolation beyond the data's applicability domain, following the five OECD QSAR validation principles.

RalphGuard is a **preliminary screening tool, not a clinical test or safety certification**, helping reduce the number of high-risk substances before real testing and supporting the reduction of unnecessary animal testing.

### คำสำคัญ (Keywords)

In-silico Toxicity, Skin Irritation, QSAR, Applicability Domain, 3D Anatomy Visualization, Animal-free Testing, Chemical Safety, Sustainable Innovation

---

## 2. บทนำ (แนวคิด ความสำคัญ และความเป็นมา)

ปัจจุบันการพัฒนายา เครื่องสำอาง และผลิตภัณฑ์ที่มีสารเคมีเป็นส่วนประกอบ จำเป็นต้องให้ความสำคัญกับความปลอดภัยของผู้ใช้ตั้งแต่ระยะเริ่มต้น โดยเฉพาะความเสี่ยงด้านการระคายเคืองต่อผิวหนัง ดวงตา และความเป็นพิษเบื้องต้นก่อนนำไปสู่การทดสอบเชิงลึก อย่างไรก็ตาม การประเมินความปลอดภัยบางประเภทในอดีตเกี่ยวข้องกับการทดลองในสัตว์ ซึ่งทำให้เกิดประเด็นด้านจริยธรรม ต้นทุน ระยะเวลา และการใช้ทรัพยากรจำนวนมาก

แนวทางการทดสอบแบบไม่ใช้สัตว์ (animal-free / New Approach Methodologies) และการใช้แบบจำลองคอมพิวเตอร์จึงมีบทบาทมากขึ้น โดยเฉพาะการคัดกรองสารในขั้นต้นด้วยข้อมูลโครงสร้างโมเลกุลและแบบจำลองเชิงสถิติหรือเชิงกฎ อย่างไรก็ตาม เครื่องมือจำนวนหนึ่งมักอยู่ในรูปแบบสำหรับผู้เชี่ยวชาญ ใช้งานยาก หรือแสดงผลเป็นตัวเลขและตารางที่เข้าใจยากสำหรับผู้เรียน นักศึกษา หรือผู้พัฒนาผลิตภัณฑ์ระยะต้น

จากปัญหาดังกล่าว คณะผู้พัฒนาจึงเสนอ **RalphGuard** ซึ่งประกอบด้วยส่วนรับข้อมูลสาร/สูตร ส่วนวิเคราะห์โครงสร้างโมเลกุล ส่วนประเมินคะแนนความเสี่ยง ส่วนตรวจสอบความน่าเชื่อถือของผลลัพธ์ และส่วนแสดงผลแบบแดชบอร์ดร่วมกับโมเดลกายวิภาค 3 มิติ เพื่อให้ผู้ใช้เห็นแนวโน้มความเสี่ยงอย่างเป็นระบบและเข้าใจง่าย

### ความสอดคล้องกับแนวคิดนวัตกรรมเพื่อความยั่งยืน (Sustainable Innovation)

- **มิติสังคม:** ลดการพึ่งพาการทดลองในสัตว์ ส่งเสริมจริยธรรมในการพัฒนาผลิตภัณฑ์ และเป็นสื่อการเรียนรู้ด้าน chemical safety / toxicology
- **มิติเศรษฐกิจ:** ลดต้นทุนและเวลาในขั้นคัดกรอง โดยกรองสารเสี่ยงสูงออกก่อนการทดสอบจริงที่มีราคาแพง
- **มิติสิ่งแวดล้อม:** ลดการใช้สัตว์ทดลองและทรัพยากรในห้องปฏิบัติการ

---

## 3. วัตถุประสงค์และเป้าหมาย

### วัตถุประสงค์

1. พัฒนาเว็บแอปพลิเคชันสำหรับประเมินความเสี่ยงการระคายเคืองและความเป็นพิษเบื้องต้นของสารเคมีหรือส่วนประกอบในผลิตภัณฑ์
2. พัฒนาระบบรับข้อมูลสารในรูปแบบชื่อสาร SMILES หรือไฟล์ CSV และตรวจสอบความถูกต้องก่อนประมวลผล
3. พัฒนากลไกคำนวณคุณสมบัติโมเลกุลและประเมินความเสี่ยงด้วย molecular descriptors, QSAR model, rule-based toxicity flag และ applicability domain
4. พัฒนาการแสดงผลแบบแดชบอร์ดและ 3D anatomy simulation สำหรับแสดงแนวโน้มการตอบสนองในช่วงเวลา 1, 3, 7 วัน
5. สร้างรายงานสรุปผลพร้อมคำอธิบายข้อจำกัด ระดับความน่าเชื่อถือ และแนวทางทดสอบต่อแบบไม่ใช้สัตว์

### เป้าหมาย

สร้างต้นแบบซอฟต์แวร์ที่รับข้อมูลสาร/สูตร ประมวลผลคุณสมบัติทางเคมี ประเมินระดับความเสี่ยงเบื้องต้น และแสดงผลในรูปแบบที่เข้าใจง่ายทั้งเชิงตาราง กราฟ รายงาน และโมเดลกายวิภาค 3 มิติ

---

## 4. รายละเอียดของการพัฒนา

### 4.1 เนื้อเรื่องย่อ (Story Board) และลำดับการทำงานของระบบ

```
ผู้ใช้
  │  1. สร้าง/เลือกโครงการ (optional)
  │  2. กรอกสูตร: ชื่อสาร + SMILES + % ความเข้มข้น  (หรือสุ่มจากคลังตัวอย่าง)
  │  3. เลือกบริเวณทดสอบบนโมเดล 3 มิติ (ท่อนแขน/มือ/ใบหน้า/ดวงตา)
  ▼
[Frontend Next.js]  ── validate SMILES สด (RDKit) ──▶ [Backend FastAPI]
  │  4. กด "ประเมิน"
  ▼
[Backend]  สร้าง Assessment (status=queued) ลง PostgreSQL
  │         แล้ว enqueue job_id เข้า Redis Stream
  ▼
[Scientific Worker]  อ่าน job จาก Redis (consumer group)
  │   5. canonicalize SMILES → Morgan fingerprint
  │   6. predict 4 endpoints (Random Forest)
  │   7. Applicability Domain check (k-NN Tanimoto)
  │   8. Structural alerts (SMARTS)
  │   9. รวมคะแนนสูตร (ถ่วงน้ำหนักความเข้มข้น × region factor)
  │  10. ขยายเป็น Day 1/3/7 + คำนวณ confidence 3 ชั้น
  │         เขียนผล (status=completed, result JSONB) ลง PostgreSQL
  ▼
[Frontend]  poll GET /api/assessments/{job_id} ทุก 1.5 วินาที
  │  11. แสดงผล: การ์ดต่อ endpoint (gauge + band + confidence),
  │         กราฟ Day 1/3/7, ตาราง structural alerts, ปุ่มพิมพ์ PDF
  ▼
ผู้ใช้เห็นผลพร้อม disclaimer
```

### 4.2 ทฤษฎี หลักการ และเทคนิคที่ใช้

#### 4.2.1 QSAR (Quantitative Structure–Activity Relationship)

QSAR คือการสร้างความสัมพันธ์เชิงปริมาณระหว่างโครงสร้างโมเลกุลกับฤทธิ์ทางชีวภาพ แนวคิดหลักคือ "โมเลกุลที่มีโครงสร้างคล้ายกันมักมีฤทธิ์คล้ายกัน" RalphGuard ใช้ QSAR เชิงจำแนกประเภท (binary classification) ทำนายว่าสารมีความเสี่ยง (positive) หรือไม่ (negative) ในแต่ละ endpoint

#### 4.2.2 Molecular Fingerprint (Morgan / ECFP)

แต่ละโมเลกุลถูกแปลงเป็นเวกเตอร์ไบนารีขนาด **2048 บิต** ด้วย **Morgan fingerprint (radius = 2)** ซึ่งเทียบเท่า ECFP4 โดยเข้ารหัสสภาพแวดล้อมเชิงโครงสร้างรอบอะตอมแต่ละตัว fingerprint นี้ใช้เป็นทั้ง (ก) ฟีเจอร์ของแบบจำลอง และ (ข) ฐานคำนวณความคล้ายสำหรับ Applicability Domain

#### 4.2.3 Molecular Descriptors

คำนวณคุณสมบัติเชิงฟิสิกส์เคมี 6–8 ตัวด้วย RDKit เพื่อแสดงข้อมูลสารและประกอบการประเมิน ได้แก่ น้ำหนักโมเลกุล (MW), ค่าสัมประสิทธิ์การละลาย (logP), พื้นที่ผิวเชิงขั้ว (TPSA), จำนวนพันธะให้/รับไฮโดรเจน (HBD/HBA), พันธะหมุนได้ และวงแหวนอะโรมาติก

#### 4.2.4 แบบจำลอง Random Forest

ใช้ **Random Forest** (200 ต้นไม้ตัดสินใจ, `random_state=42`) จาก scikit-learn สำหรับทั้ง 4 endpoint โดยใช้ความน่าจะเป็นของคลาส positive (`predict_proba`) เป็นคะแนนความเสี่ยงดิบ 0–1 แล้วแปลงเป็น 0–100

#### 4.2.5 Applicability Domain (AD) — k-NN Tanimoto

ตามหลักการ OECD ข้อ 3 ระบบตรวจว่าสารที่ทำนายอยู่ใน "ขอบเขตที่แบบจำลองเชื่อถือได้" หรือไม่ โดยคำนวณค่าความคล้าย Tanimoto เฉลี่ยกับสาร **k = 5** ตัวที่ใกล้ที่สุดในชุดฝึก หากต่ำกว่า **threshold = 0.30** จะถือว่า **out-of-domain** และลดความน่าเชื่อถือเป็น Low ทันที

#### 4.2.6 Structural Alerts (Rule-based) — SMARTS

ระบบตรวจหมู่ฟังก์ชันที่ทราบกันว่าสัมพันธ์กับการระคายเคือง/แพ้ ด้วยรูปแบบ SMARTS 8 รูปแบบ เช่น aldehyde, epoxide, isocyanate, anhydride, α,β-unsaturated carbonyl, peroxide, acid halide และ strong acid หากหมู่เตือนปรากฏแต่แบบจำลองทำนายความเสี่ยงต่ำ จะถือว่า "ขัดแย้ง" และลดความน่าเชื่อถือ (mechanistic interpretation ตาม OECD ข้อ 5)

#### 4.2.7 ระบบความน่าเชื่อถือ 3 ชั้น (3-Layer Confidence)

| ชั้น | สัญญาณ | ผล |
|---|---|---|
| Layer 1 | Applicability Domain (in/out) | out-of-domain → **Low** เสมอ |
| Layer 2 | ความชัดของความน่าจะเป็น (extremity = \|p − 0.5\| × 2) | ชัดเจน + กฎสอดคล้อง → **High** |
| Layer 3 | ความสอดคล้องของ structural alert กับผลแบบจำลอง | ขัดแย้ง → ลดเป็น **Medium** |

ผลลัพธ์รวมเป็นระดับ **High / Medium / Low** พร้อมเหตุผลภาษาไทย

#### 4.2.8 การรวมคะแนนสูตรผสมและแนวโน้มเชิงเวลา

คะแนนรวมของสูตรคำนวณแบบ **dose-additive** ถ่วงน้ำหนักด้วยความเข้มข้น แล้วคูณด้วย **region sensitivity factor** (เช่น ใบหน้า/ดวงตาไวกว่าท่อนแขน) จากนั้นขยายคะแนนสูงสุดเป็นแนวโน้ม **วันที่ 1 / 3 / 7** ด้วยโปรไฟล์เชิงเวลาที่อิงลักษณะการตอบสนองของแต่ละ endpoint (เช่น การระคายเคืองพีคที่ 48–72 ชม., การแพ้สัมผัสแบบ delayed-type พีคช้ากว่า)

```
Final Risk Score (ต่อ endpoint) =
   Σ (ความเข้มข้น_i / 100 × คะแนนสาร_i) × region_factor   →  clamp [0,100]
```

### 4.3 เครื่องมือที่ใช้ในการพัฒนา

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, React Three Fiber / Three.js (โมเดล 3 มิติ), Recharts (กราฟ) |
| Backend API | Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, psycopg2 |
| Scientific Engine | Python 3.11, RDKit (2025.3.6), scikit-learn (1.5.2), NumPy, pandas, joblib |
| Database | PostgreSQL 16 |
| Queue / Worker | Redis 7 (Redis Streams + consumer group) |
| Deployment | Docker Compose (5 services: postgres, redis, backend, worker, frontend) |

### 4.4 รายละเอียดโปรแกรมเชิงเทคนิค (Software Specification)

#### 4.4.1 Input / Output Specification

**Input**
- ชื่อสาร, SMILES, ไฟล์ CSV รายการสาร, สัดส่วนความเข้มข้น (%)
- บริเวณทดสอบ (forearm / hand / face / eye)

**Output**
- chemical profile (descriptors), risk score (0–100), risk level (low/moderate/high/severe)
- confidence (High/Medium/Low) + เหตุผล, structural alerts
- 3D anatomy visualization, กราฟ timeline (Day 1/3/7), รายงาน PDF (ผ่าน print)

#### 4.4.2 Functional Specification

1. รับข้อมูลสารและสูตรผลิตภัณฑ์
2. ตรวจสอบและจัดเตรียมข้อมูลสารเคมี (canonicalize SMILES ด้วย RDKit)
3. คำนวณ descriptors และ fingerprint
4. ประเมินความเสี่ยงและตรวจ applicability domain
5. แสดงผลผ่านแดชบอร์ดและโมเดลกายวิภาค 3 มิติ
6. สร้างรายงานสรุปผลการประเมิน

#### 4.4.3 โครงสร้างของซอฟต์แวร์ (Design)

สถาปัตยกรรมแบบ **microservice + asynchronous queue** เพื่อให้การประมวลผลทางวิทยาศาสตร์ (ซึ่งใช้เวลา) ไม่บล็อก API:

```
[Frontend :3000] ──HTTP──▶ [Backend API :8000] ──┬──▶ [PostgreSQL :5432]
                                                  └──▶ [Redis Stream]
                                                         │
                                          [Scientific Worker] ◀┘
                                                  └──▶ [PostgreSQL]  (เขียนผล)
```

**ฐานข้อมูล (PostgreSQL):**
- `projects` — โครงการทดสอบ
- `substances` — สารที่เคยประเมิน (cache, dedup ด้วย canonical SMILES, descriptors JSONB)
- `assessments` — งานประเมิน (formula JSONB, region, status enum, result JSONB)

**API Endpoints หลัก:**

| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/api/substances/validate` | ตรวจ SMILES + คืน canonical + descriptors (RDKit) |
| POST | `/api/assessments/` | สร้างงาน + enqueue → คืน job_id (202) |
| GET | `/api/assessments/` | รายการงาน (filter ตามโครงการ) |
| GET | `/api/assessments/{job_id}` | ดึงผลจาก DB |
| GET | `/api/projects/` · POST · GET `/{id}` | จัดการโครงการ |
| GET | `/api/models/metrics` · `/info` | ข้อมูลความถูกต้องและระเบียบวิธี |
| GET | `/health` · `/health/ready` | ตรวจสุขภาพระบบ |

#### 4.4.4 ส่วนที่ทีมพัฒนาเขียนขึ้นเอง / แหล่งที่มา

ทีมพัฒนาเขียนโค้ดทั้งหมดด้วยตนเอง ได้แก่ pipeline ทางวิทยาศาสตร์ (descriptors, fingerprints, applicability domain, confidence, mixture, structural alerts, QSAR predictor), backend API + DB schema + worker และ frontend ทั้งหมด โดยใช้ไลบรารีโอเพนซอร์สที่มีลิขสิทธิ์ถูกต้อง (RDKit — BSD, scikit-learn — BSD, FastAPI — MIT, Next.js — MIT, Three.js — MIT) ชุดข้อมูลฝึกมาจากแหล่งวรรณกรรม/ฐานข้อมูลสาธารณะ (ดูข้อ 7)

### 4.5 ขอบเขตและข้อจำกัดของโปรแกรม

- เป็นการประเมินความเสี่ยง **เบื้องต้น** ด้วยแบบจำลองคอมพิวเตอร์ ไม่ใช่การรับรองความปลอดภัย
- ไม่สามารถใช้แทนการทดสอบมาตรฐานในห้องปฏิบัติการ การประเมินโดยผู้เชี่ยวชาญ หรือข้อกำหนดของหน่วยงานกำกับดูแล
- การจำลอง 3D anatomy เป็นการแสดงผลเชิงภาพจากคะแนนความเสี่ยง ไม่ใช่การจำลองชีววิทยามนุษย์แบบสมบูรณ์
- ไม่ให้คำแนะนำทางการแพทย์ และไม่ใช้กับข้อมูลผู้ป่วยจริง
- ชุดข้อมูลฝึกมีขนาดเล็ก (~144 สาร/endpoint) จึงเหมาะกับการคัดกรองเชิงสาธิต/การเรียนรู้

### 4.6 คุณลักษณะของอุปกรณ์ที่ใช้กับโปรแกรม

ทำงานบนเว็บเบราว์เซอร์สมัยใหม่ที่รองรับ WebGL (สำหรับโมเดล 3 มิติ) ฝั่งเซิร์ฟเวอร์ต้องการ Docker Desktop; แนะนำ RAM ≥ 8 GB

---

## 5. กลุ่มผู้ใช้โปรแกรม

- **นักศึกษา/ผู้เรียน** ด้านเคมี เภสัช วิทยาศาสตร์เครื่องสำอาง — ใช้เป็นสื่อการเรียนรู้ QSAR และ toxicology screening
- **ผู้พัฒนาผลิตภัณฑ์ระยะต้น** (R&D เครื่องสำอาง/ผลิตภัณฑ์ดูแลผิว) — คัดกรองส่วนผสมก่อนตั้งสูตรจริง
- **นักวิจัย** ที่ต้องการเครื่องมือคัดกรองเบื้องต้นแบบไม่ใช้สัตว์

---

## 6. ผลของการทดสอบโปรแกรม

### 6.1 การทดสอบเชิงฟังก์ชัน

| รายการทดสอบ | ผล |
|---|---|
| Frontend type-check (`tsc --noEmit`) | ✅ ผ่าน (ไม่มี error) |
| Frontend production build (`next build`) | ✅ ผ่าน — prerender ครบ 5 หน้า |
| ตรวจ SMILES สด (valid/invalid) | ✅ คืน canonical + MW ถูกต้อง |
| ส่งงานประเมิน → worker → ผลกลับ | ✅ สถานะ queued → running → completed |
| Out-of-domain substance | ✅ ลด confidence เป็น Low |

### 6.2 ผลการตรวจสอบความถูกต้องของแบบจำลอง (Validation)

ประเมินด้วย **5-fold stratified cross-validation + held-out test set 20%** ผลบน test set:

| Endpoint | n_train | n_test | Accuracy | Balanced Acc | Sensitivity | Specificity | ROC-AUC |
|---|---|---|---|---|---|---|---|
| Skin Irritation | 115 | 29 | 0.793 | 0.669 | 0.429 | 0.909 | 0.779 |
| Eye Irritation | 115 | 29 | 0.793 | 0.669 | 0.429 | 0.909 | 0.779 |
| Skin Sensitization | 115 | 29 | 0.759 | 0.478 | 0.000 | 0.957 | 0.757 |
| Acute Toxicity | 115 | 29 | 0.828 | 0.645 | 0.333 | 0.957 | 0.772 |

**การตีความอย่างโปร่งใส:** ค่า ROC-AUC อยู่ในช่วง 0.76–0.78 ทุก endpoint แสดงว่าแบบจำลองมีความสามารถจำแนกในระดับพอใช้สำหรับการคัดกรอง อย่างไรก็ตามมี **ข้อจำกัดที่ต้องระบุชัด**:

- **Sensitivity ต่ำ** (โดยเฉพาะ Skin Sensitization = 0.000) เนื่องจากชุดข้อมูลเล็กและมีความไม่สมดุลของคลาส (positive น้อยกว่า negative มาก) ทำให้แบบจำลองเอนเอียงไปทางทำนาย negative — เป็นเหตุผลสำคัญที่ระบบ **ไม่พึ่งพาผลแบบจำลองเพียงอย่างเดียว** แต่เสริมด้วย structural alerts และระดับความเชื่อมั่น
- ค่าเมตริกของ Skin และ Eye ใกล้เคียงกันมากเนื่องจากชุดข้อมูลสองชุดมีสารทับซ้อนกันสูง (สารระคายเคืองผิวและตามักเป็นกลุ่มเดียวกัน)
- ยังไม่มี external validation set จากแหล่งอิสระ

ข้อจำกัดเหล่านี้สอดคล้องกับธรรมชาติของโครงการระดับ **screening/prototype** และเป็นเหตุผลที่ทุก output มี disclaimer กำกับ

---

## 7. แหล่งข้อมูลที่ใช้ฝึกแบบจำลอง

| Endpoint | ไฟล์ | แหล่งอ้างอิง | มาตรฐาน OECD ที่เกี่ยวข้อง |
|---|---|---|---|
| Skin Irritation | `skin_irritation.csv` | ECHA REACH / OECD QSAR Toolbox | TG 404 / 439 |
| Eye Irritation | `eye_irritation.csv` | ECETOC Reference Chemicals | TG 405 / 492 |
| Skin Sensitization | `llna_sensitization.csv` | ICCVAM / NICEATM (LLNA) | TG 429 / 442 |
| Acute Toxicity | `catmos_acute_toxicity.csv` | EPA CompTox / OPERA CATMoS | TG 420 |

แต่ละไฟล์มีคอลัมน์ขั้นต่ำ `smiles, label` (label = 0/1) ขนาดประมาณ 147 สาร/endpoint หลัง clean เหลือ ~144 สาร เป็นชุด curated จากวรรณกรรม/ฐานข้อมูลสาธารณะ เหมาะกับการคัดกรองเชิงสาธิต

### หลักการ OECD QSAR 5 ข้อ (ดำเนินการครบ)

1. **Defined endpoint** — 4 endpoint ชัดเจน อิงมาตรฐาน OECD TG
2. **Unambiguous algorithm** — Random Forest บน Morgan fingerprint
3. **Defined applicability domain** — k-NN Tanimoto (k=5, threshold 0.30)
4. **Goodness-of-fit/robustness/predictivity** — 5-fold CV + held-out test
5. **Mechanistic interpretation** — structural alerts (SMARTS)

---

## 8. ปัญหาและอุปสรรค

- **ขนาดและความสมดุลของชุดข้อมูล:** ข้อมูลสาธารณะที่มี label ชัดเจนมีจำกัด ทำให้ชุดเล็กและ class imbalance ส่งผลต่อ sensitivity — แก้ไขเฉพาะหน้าด้วยการเสริม structural alerts และ confidence
- **เวอร์ชันไลบรารี:** RDKit 2024.3.5 ถูกถอดจาก PyPI ระหว่างพัฒนา ต้องปรับเป็น 2025.3.6 และ scikit-learn ต้องสร้างโมเดลในสภาพแวดล้อม Docker (Python 3.11) เนื่องจาก Python รุ่นใหม่บนเครื่อง dev ยังไม่มี wheel
- **การจัดการ enum ใน Alembic:** ต้องสร้าง type `assessment_status` ครั้งเดียวด้วย `create_type=False` เพื่อเลี่ยง error ตอน migrate
- **การประมวลผลแบบ async:** เลือกใช้ Redis Streams + worker แยก เพื่อไม่ให้การ predict บล็อก API

---

## 9. แนวทางการพัฒนาและประยุกต์ใช้ในขั้นต่อไป

- เพิ่มขนาด/คุณภาพชุดข้อมูล และเพิ่ม external validation set
- จัดการ class imbalance (เช่น `class_weight='balanced'`, resampling, threshold tuning) เพื่อเพิ่ม sensitivity โดยเฉพาะ sensitization
- เพิ่ม endpoint และโมเดลขั้นสูง (graph neural network)
- ระบบ batch CSV import เต็มรูปแบบ และ export รายงาน PDF ที่สมบูรณ์
- ปรับโมเดล 3 มิติเป็น GLTF เสมือนจริง และเพิ่มระบบผู้ใช้ (auth) สำหรับงานหลายทีม
- เชื่อมต่อกับฐานข้อมูล read-across / QSAR Toolbox เพื่อเสริมการตีความ

---

## 10. ข้อสรุปและข้อเสนอแนะ

RalphGuard เป็นต้นแบบเว็บแอปพลิเคชันที่สาธิตการคัดกรองความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลอง QSAR แบบครบวงจร ตั้งแต่รับ SMILES ตรวจสอบ คำนวณ ทำนาย ไปจนถึงแสดงผลที่เข้าใจง่ายพร้อมระบบความน่าเชื่อถือ 3 ชั้นตามหลักการ OECD ระบบช่วยลดการพึ่งพาการทดลองในสัตว์ในขั้นคัดกรอง สอดคล้องกับแนวคิดนวัตกรรมเพื่อความยั่งยืน

**ข้อเสนอแนะ:** ผลลัพธ์ทุกส่วนเป็นการคัดกรองเบื้องต้น ควรใช้ประกอบการตัดสินใจร่วมกับการทดสอบที่ได้มาตรฐานก่อนนำไปใช้จริง การพัฒนาต่อควรเน้นการเพิ่มคุณภาพข้อมูลและการตรวจสอบความถูกต้องเชิงลึก

---

## 11. เอกสารอ้างอิง (References)

1. OECD. *Test No. 439: In Vitro Skin Irritation: Reconstructed Human Epidermis Test Method.* OECD Guidelines for the Testing of Chemicals.
2. OECD. *Test No. 492: Reconstructed human Cornea-like Epithelium Test Method for Eye Hazard Assessment.* OECD Guidelines for the Testing of Chemicals.
3. RDKit. *RDKit: Open-source cheminformatics software.* https://www.rdkit.org
4. Tropsha, A. *Best practices for QSAR model development, validation, and exploitation.* Molecular Informatics.
5. OECD. *QSAR Toolbox — Software for grouping chemicals into categories and filling data gaps by read-across and QSAR.*
6. Rogers, D., & Hahn, M. *Extended-Connectivity Fingerprints.* Journal of Chemical Information and Modeling.

---

## 12. สถานที่ติดต่อของผู้พัฒนาและอาจารย์ที่ปรึกษา

- **หัวหน้าโครงการ:** นายสุรวิทย์ สุขเจริญ — อีเมล: surawit2003it@gmail.com
- **ผู้ร่วมพัฒนา:** นายธนกรณ์ อ่อนกลั่น
- ภาควิชาเทคโนโลยีสารสนเทศ คณะเทคโนโลยีและการจัดการอุตสาหกรรม มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ

---

## 13. ภาคผนวก (Appendix)

- **คู่มือการติดตั้งอย่างละเอียด:** ดู [`docs/manual/คู่มือการติดตั้ง.md`](../manual/คู่มือการติดตั้ง.md)
- **คู่มือการใช้งานอย่างละเอียด:** ดู [`docs/manual/คู่มือการใช้งาน.md`](../manual/คู่มือการใช้งาน.md)
- **ข้อตกลงในการใช้ซอฟต์แวร์ (Disclaimer):** ดู [`docs/manual/Disclaimer.md`](../manual/Disclaimer.md)

> **Disclaimer:** ผลจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เท่านั้น ไม่ใช่การทดสอบทางคลินิกหรือทดแทนการประเมินโดยผู้เชี่ยวชาญ
