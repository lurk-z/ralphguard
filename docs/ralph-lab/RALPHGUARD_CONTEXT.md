# RalphGuard · บริบทตั้งต้นและระบบเดิม

## บริบทจากไฟล์แนบ

`RalphGuard_Ralph_Lab_Context_and_Prompt.txt` รวบรวมข้อมูลที่เจ้าของโครงการเคยเล่าและโจทย์ให้ตรวจ repository ก่อนวางทิศทาง Ralph Lab เจ้าของโครงการระบุว่า RalphGuard เคยเข้ารอบ Finalist ของ **NSC 2026** และเคยรับหน้าที่ Front-end Developer เป้าหมายของระบบเดิมคือประเมินหรือแสดงข้อมูลด้านการระคายเคืองและความเป็นพิษด้วยวิธีคำนวณ โดยลดการพึ่งการทดลองกับสัตว์สำหรับการคัดกรอง

รายละเอียดตั้งต้นกล่าวถึงใบหน้ามนุษย์ 3D ผลช่วง Day 1, Day 3 และ Day 7 และโทนสี Gradient จาก `#5EADFE` ไป `#009FA5` ส่วนคำอธิบายว่าเวอร์ชันที่เคยใช้ไม่มี Login/Register เป็นข้อมูลของเวอร์ชันที่เล่าไว้ในไฟล์แนบ ใน working tree ที่ตรวจพบเส้นทาง Google Login แล้ว

ไฟล์แนบวางกรอบให้ตรวจโค้ดจริงก่อนสรุป ครอบคลุม frontend, backend, API, database, โมเดล, แหล่งข้อมูล, การแสดงผล และสถานะทดสอบ ให้แยกผลที่รันยืนยันได้จากส่วนที่มีโค้ดแต่ยังไม่ยืนยัน และแยกผลโมเดลออกจากข้อมูลทดลองกับภาพประกอบ รายละเอียดข้อจำกัดด้านเวลาที่ตั้งไว้ตอนต้นอยู่ใน [บริบทงานแข่ง](HACKATHON.md) ส่วนแนวคิดล่าสุดของเจ้าของโครงการอยู่ใน [Ralph Lab](RALPH_LAB_CONCEPT.md)

## Repository และส่วนประกอบ

Repository ในเครื่องคือ `D:\Github-project\ralphguard` และ frontend อยู่ใน `D:\Github-project\ralphguard\frontend` การตรวจเดิมอ้างอิง branch `jay` ฐาน commit `871db04` ตารางนี้อ้างเส้นทางจาก working tree ที่อ่านได้ระหว่างจัดทำเอกสาร

| ส่วน | เทคโนโลยีและหน้าที่ | จุดอ่านใน repository |
| --- | --- | --- |
| Frontend | Next.js App Router, React, TypeScript, Tailwind, React Flow, Three.js และ React Three Fiber มีหน้าโปรเจกต์ Studio ประวัติ โมเดล และคลังข้อมูล | [frontend/package.json](../../frontend/package.json) · [API client](../../frontend/src/lib/api.ts) |
| Backend | FastAPI, Pydantic, SQLAlchemy และ Alembic มี API สำหรับโปรเจกต์ การประเมิน ทะเบียนสาร สมุนไพร OCR ผู้ช่วย และข้อมูลโมเดล | [Router registrations](../../backend/app/main.py) · [Backend dependencies](../../backend/requirements.txt) |
| Scientific runtime | RDKit และ scikit-learn ใช้ SMILES สร้างข้อมูลโครงสร้างและเรียก model bundles สำหรับคัดกรอง | [Predictor](../../scientific/qsar/predictor.py) · [Pipeline](../../scientific/pipeline.py) · [Runtime dependencies](../../scientific/requirements.worker.txt) |
| การเก็บข้อมูลและ queue | PostgreSQL เก็บโปรเจกต์ ผลประเมิน และทะเบียนสาร Redis Streams ส่งงานประเมินในโหมด queue | [Compose](../../docker-compose.yml) · [Assessment model](../../backend/app/models/assessment.py) · [Assessment service](../../backend/app/services/assessment_service.py) |
| ข้อมูลและโมเดล | มี seed ทะเบียนสาร หลักฐานกำกับแหล่งที่มา รายงานตรวจโมเดล และสคริปต์เตรียมข้อมูล | [Registry seed manifest](../../backend/data/registry_seed_v2_manifest.json) · [Validation report](../../scientific/models/validation_report.json) · [สารบัญวิทยาศาสตร์](../README.md#วิทยาศาสตร์และข้อมูล) |
| Deployment | โหมด local ใน Compose ใช้ worker เป็นค่าเริ่มต้น ส่วน Render ตั้งให้ประเมินแบบ inline ใน backend มี Vercel config สำหรับ frontend | [Compose](../../docker-compose.yml) · [Render](../../render.yaml) · [Vercel](../../frontend/vercel.json) |

## ผู้ใช้ทำอะไรในระบบเดิม

1. **เปิดโปรเจกต์** โค้ดมี Google Login ผ่าน NextAuth โปรเจกต์และงานประเมินมีการตรวจเจ้าของใน API ส่วน route สมัครบัญชีและลืมรหัสผ่านพาไปหน้า Login Working tree ที่อ่านได้มีทางเข้าแบบ local development ผ่าน `DEV_AUTH_BYPASS` ทั้ง frontend และ backend โดยมีเงื่อนไขสภาพแวดล้อมสำหรับ development [Google Login](../../frontend/src/lib/auth.ts) · [Frontend middleware](../../frontend/src/middleware.ts) · [Backend auth](../../backend/app/core/auth.py) · [Projects API](../../backend/app/api/projects.py)
2. **ประกอบสูตร** หน้า `/assess` รองรับเพิ่มสารจากคลัง กรอกข้อมูล นำเข้า CSV หรืออ่านฉลาก OCR รวมถึงประกอบสูตรผ่าน Node Graph ใน Studio จากนั้นเลือกบริเวณและใช้หน้าระบายบนโมเดลก่อนเริ่มประเมิน [Assessment Studio](../../frontend/src/app/%28dashboard%29/assess/page.tsx) · [FormulaGraph](../../frontend/src/components/FormulaGraph.tsx) · [Preconditions](../../frontend/src/lib/assessment-preconditions.ts)
3. **ส่งงานประเมิน** Frontend ตรวจ SMILES แล้วส่งสูตร สัดส่วน บริเวณ และ project ID ผ่าน `POST /api/assessments/` ระบบคืน job ID ให้ frontend ติดตามสถานะ งานใน queue ถูกประมวลผลด้วย worker หรือรันใน backend เมื่อกำหนดโหมด inline [Assessments API](../../backend/app/api/assessments.py) · [Worker](../../scientific/worker.py) · [Inline inference](../../backend/app/services/local_inference.py)
4. **เปิดผลและประวัติ** PostgreSQL เก็บ input และ result ของ job ส่วน draft ของสูตร กราฟ และรอยระบายใน Studio เก็บใน browser ตาม project ID หน้าผลโปรเจกต์เลือกงาน completed ล่าสุด และ API อ่านงานที่ระบุ ID ได้ ประวัติมีหลายรายการ ส่วนลิงก์จากประวัติไปหน้าผลโปรเจกต์จะเปิดผลล่าสุดของโปรเจกต์นั้น [Workspace storage](../../frontend/src/lib/project-workspace.ts) · [หน้าผล](../../frontend/src/app/%28dashboard%29/projects/%5Bid%5D/results/page.tsx) · [หน้าประวัติ](../../frontend/src/app/history/page.tsx) · [Project assessment API](../../backend/app/api/projects.py)
5. **ใช้ผู้ช่วยและรายงาน** ผู้ช่วยเดิมส่งคำถามผ่าน backend ที่เชื่อม Groq และมีโครงสร้างสำหรับให้ผู้ใช้ตรวจ action ก่อนแก้ workspace ตัวสร้างรายงานสร้าง HTML สำหรับพิมพ์ผ่าน browser ส่วน OCR ใช้ Tesseract/Pillow อ่านฉลากและให้ผู้ใช้ตรวจค่าก่อนนำเข้า [Chat API](../../backend/app/api/chat.py) · [VoiceAssistant](../../frontend/src/components/VoiceAssistant.tsx) · [OCR API](../../backend/app/api/ocr.py) · [Report builder](../../frontend/src/lib/assessment-report.ts)

## ผลประเมิน หลักฐาน และภาพ 3D

- **Endpoints หลัก** มี Skin Irritation, Eye Irritation, Skin Sensitization และ Acute Toxicity โค้ดรองรับการโหลด Skin Dryness เป็น research candidate แบบ optional เมื่อมี bundle ที่กำกับสถานะไว้ [Endpoint configuration](../../scientific/endpoints.py) · [Skin Dryness model card](../../scientific/models/candidate_v3/SKIN_DRYNESS_MODEL_CARD.md)
- **คะแนนและความเชื่อมั่น** โมเดลใช้ข้อมูลโครงสร้างรายสาร ส่วนคะแนนระดับสูตรรวมตามสัดส่วนและตัวคูณบริเวณสำหรับ skin/eye ผลส่งกลับมีคะแนนราย endpoint ระดับความเชื่อมั่น และรายละเอียด applicability domain ตามที่ pipeline คำนวณ `formula_coverage` นับตามรายการในสูตรรวมรายการน้ำที่จัดเป็น carrier [Predictor](../../scientific/qsar/predictor.py) · [Mixture calculation](../../scientific/mixture.py) · [Pipeline result](../../scientific/pipeline.py)
- **สถานะ validation** รายงานของโมเดลหลักใช้ 5-fold internal out-of-fold validation เอกสาร external validation ระบุว่า historical set 24 สารมีสารซ้ำกับข้อมูลฝึก ส่วนรายงาน Skin Dryness candidate ระบุสถานะ `research_only_blocked` [Production evaluation](../ralphguard/science/MODEL_EVALUATION.md) · [External validation](../ralphguard/science/EXTERNAL_VALIDATION.md) · [Skin Dryness validation report](../../scientific/models/candidate_v3/skin_dryness_validation_report.json)
- **หลักฐานจากแหล่งข้อมูล** ทะเบียนสารและ evidence API เก็บแหล่งอ้างอิง ประเภทหลักฐาน และสถานะการทบทวน ข้อมูลจาก PubChem/GHS, weak labels และผลโมเดลมีที่มาและความหมายต่างกัน [Ingredient Registry](../ralphguard/features/INGREDIENT_REGISTRY.md) · [Evidence API](../../backend/app/api/substances.py) · [PubChem evidence](../ralphguard/science/PUBCHEM_TRAINING_EVIDENCE.md)
- **ภาพใบหน้าและช่วงเวลา** Day 1/3/7 คำนวณจากตัวคูณตายตัวของคะแนน peak ส่วนภาพบนใบหน้ามาจากกฎแปลงคะแนนเป็นการแสดงผล 3D ช่วงเวลาและภาพเหล่านี้เป็นการแสดงผลเชิงคำนวณ [Temporal profiles](../../scientific/endpoints.py) · [Time-course calculation](../../scientific/mixture.py) · [Symptom mapping](../../frontend/src/components/SymptomLabModel.tsx)
- **ฉากห้องแล็บเดิม** หน้าแรกเรียก `LabScene` และใช้ `Lab_room.glb` เป็นส่วนหนึ่งของการนำเสนอ ส่วนการใช้ห้องแล็บเป็นมุมมองติดตามใบงานและตัวอย่างเป็นแนวคิดของ Ralph Lab ตามที่เจ้าของโครงการอธิบาย [หน้าแรก](../../frontend/src/app/page.tsx) · [LabScene](../../frontend/src/components/three/LabScene.tsx) · [แนวคิด Ralph Lab](RALPH_LAB_CONCEPT.md#มุมมองห้องแล็บ-3d)

## ขอบเขตที่ตรวจสอบแล้ว

- การตรวจเดิมยืนยัน frontend type-check และการอ่าน Compose config ชุดทดสอบ frontend ผ่าน 79 เคสจาก 13 ไฟล์ และ PubChem client ผ่านเพิ่ม 2 เคสด้วยการ resolve alias ในหน่วยความจำ ชุด `api-request.test.ts` มี 2 เคสผ่าน 2 assertion ล้มเหลว และ 1 เคส timeout ในสภาพแวดล้อมที่ใช้ตรวจ
- การตรวจเดิมยังยืนยัน Google OAuth, DB/worker, inference, OCR ภาพจริง, WebGL และ print แบบ end-to-end ไม่ได้ เพราะสภาพแวดล้อมที่ใช้ตรวจเข้า Docker engine และรัน Python ไม่ได้ ผลข้างต้นเป็นสถานะการตรวจครั้งนั้น
- การทดสอบตัวสร้างรายงานในหน่วยความจำพบว่า draft ที่ยังไม่มีผลอาจเกิด `TypeError` และค่าของ Skin Dryness ที่มี `timecourse: null` ถูกใช้ซ้ำจาก peak ในรายงานรายวัน [Report builder](../../frontend/src/lib/assessment-report.ts)

เอกสารอย่าง [HANDOFF เดิม](../../HANDOFF.md), [รายงานการทดสอบ 11 ส.ค.](../ralphguard/history/FULL_PROJECT_TEST_REPORT_2026-08-11.md) และ [บันทึกสถานะ 20 ส.ค.](../ralphguard/history/HANDOFF_IMPLEMENTATION_STATUS_2026-08-20.md) อธิบายสถานะตามช่วงเวลาที่จัดทำ เมื่อต้องอ้างฟีเจอร์หรือผลปัจจุบันให้ตรวจจุดเรียกและข้อมูลใน repository ที่กำลังใช้งาน
