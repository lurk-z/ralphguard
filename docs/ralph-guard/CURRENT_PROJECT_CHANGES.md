# สรุปสิ่งที่เพิ่มและแก้ไขในโปรเจกต์ RalphGuard

อัปเดตล่าสุด: 17 กรกฎาคม 2026

Branch ที่ตรวจสอบ: `GOD`

ช่วงที่ใช้เปรียบเทียบ: `1da7a12 (before codex)` ถึง `3c87309`
ขนาดการเปลี่ยนแปลง: 58 ไฟล์, เพิ่มประมาณ 3,570 บรรทัด และลบประมาณ 1,832 บรรทัด

## ภาพรวม

RalphGuard ถูกปรับจากหน้าประเมินและหน้าตัวอย่างที่แยกกันหลายส่วน ให้เป็น workflow ที่เริ่มจากหน้าโปรเจกต์ แล้วเข้าสู่ Assessment Studio เดียวกัน ภายในหน้าประเมินสามารถสร้างสูตร เลือกสารจากคลัง นำเข้า CSV อ่านฉลากด้วย OCR ใช้ AI ช่วยแก้สูตร สร้าง Node graph ประเมินความเสี่ยง 4 ด้าน และแสดงผลบนโมเดล 3D ตาม Day 1, Day 3 และ Day 7 ได้

การเปลี่ยนแปลงสำคัญอีกส่วนคือการนำไฟล์โมเดล QSAR ทั้ง 4 endpoint เข้า Git ทำให้เครื่องอื่นที่ clone repository ได้โมเดลพร้อมใช้งาน ไม่เกิดกรณี worker ไม่มีโมเดลแล้วส่งผลลัพธ์เป็นศูนย์ทั้งหมดเหมือนก่อนหน้านี้

## 1. Workflow และระบบโปรเจกต์

- ปุ่ม “เริ่มใช้งาน” บนหน้าแรกพาไป `/projects` ก่อน ไม่ข้ามตรงไป `/assess`
- นำระบบผู้ใช้งานออกจาก workflow ปัจจุบัน แต่ยังคงระบบโปรเจกต์ไว้
- เพิ่ม API และ UI สำหรับ:
  - สร้างโปรเจกต์
  - ดูรายการโปรเจกต์
  - แก้ไขชื่อและคำอธิบายโปรเจกต์
  - ลบโปรเจกต์พร้อมหน้าต่างยืนยัน
  - เปิด Assessment Studio ของแต่ละโปรเจกต์
  - ดูรายการผลการประเมินภายในโปรเจกต์
- หน้า `/projects/[id]/assess` เปลี่ยนให้ redirect ไปยัง implementation กลางที่ `/assess?projectId=...` เพื่อไม่ให้หน้าประเมินปกติกับหน้าประเมินจากโปรเจกต์ทำงานซ้ำกัน
- หาก backend ไม่พร้อม หน้าสร้างโปรเจกต์ยังมี local fallback สำหรับ demo
- หน้า Settings เดิมถูกนำออกจาก flow และ redirect กลับหน้าโปรเจกต์

ไฟล์หลัก:

- `frontend/src/app/(dashboard)/projects/page.tsx`
- `frontend/src/app/(dashboard)/projects/new/page.tsx`
- `frontend/src/app/(dashboard)/projects/[id]/assess/page.tsx`
- `backend/app/api/projects.py`
- `backend/app/schemas/project.py`

## 2. Assessment Studio

หน้าประเมินถูก redesign และรวมความสามารถที่เคยแยกกันไว้ใน workspace เดียว ได้แก่:

- สร้าง เลือก เปลี่ยนชื่อ และลบสูตร
- แผงส่วนผสมของสูตรสามารถเลื่อนปิดไปทางซ้ายและเปิดกลับได้
- แก้ช่องเปอร์เซ็นต์ไม่ให้เกิดเลขศูนย์นำหน้า เช่น `030`
- เพิ่ม Product Template และตัวกรองระดับความเสี่ยง
- เพิ่มคลังสารแบบจัดหมวดหมู่ พร้อม search และ dropdown ที่ใช้ธีมเดียวกับหน้าเว็บ
- เพิ่มข้อมูลบทบาทและข้อควรระวังของสารสำหรับ tooltip
- เพิ่มปุ่มอ่านฉลากด้วย OCR และนำเข้า CSV
- เพิ่มไฟล์ CSV ตัวอย่างจำนวน 10 สารที่ `frontend/public/formula-example-10-ingredients.csv`
- ป้องกันผลรวมความเข้มข้นเกิน 100%
- ตรวจสอบ SMILES ด้วย RDKit ก่อนส่งประเมิน
- แสดง formula coverage และรายการส่วนผสมที่ระบบยังประเมินไม่ได้
- ปรับกราฟแนวโน้ม Day 1, Day 3 และ Day 7
- ปรับตำแหน่งปุ่มกราฟและปุ่มประเมินไม่ให้ทับ UI อื่น
- เหลือปุ่มประเมินหลักเพียงจุดเดียวใน viewport

ไฟล์หลัก:

- `frontend/src/app/(dashboard)/assess/page.tsx`
- `frontend/src/lib/catalog.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/components/TrendChart.tsx`

## 3. Node graph และคลังสาร

- เพิ่มโหมด Node graph ภายใน Assessment Studio
- เพิ่มคลังสารแบบจัดหมวดหมู่สำหรับลากหรือเพิ่มเป็น node
- เพิ่มสารเสริมสูตรและ node ผลการประเมิน
- เชื่อม node สารหลายตัวเข้ากับ node ประเมินความเสี่ยงได้
- บันทึกสูตรที่สร้างจาก Node graph กลับเข้าโปรเจกต์ได้
- ปรับ UI, สีข้อความ, minimap, เส้นเชื่อม และพื้นที่ทำงานให้เข้ากับธีมหลัก
- เพิ่ม template สารในทั้งหน้าประเมินแบบฟอร์มและหน้า Node graph
- หน้า project assessment ใช้ Node graph ตัวเดียวกับหน้าประเมินหลักแล้ว

ไฟล์หลัก:

- `frontend/src/components/FormulaGraph.tsx`
- `frontend/src/lib/catalog.ts`

## 4. AI Assistant, Speech และการแก้สูตร

- เพิ่ม Chatbot ที่รับ context ของสูตร ผลประเมิน coverage และโปรเจกต์ปัจจุบัน
- รองรับการรับคำสั่งด้วยเสียงผ่าน frontend และตอบกลับด้วยเสียง
- เชื่อม Groq API โดยอ่าน key จาก `.env` เท่านั้น ไม่ส่ง key ไปยัง browser
- AI สามารถเสนอ action เช่น:
  - สร้างสูตร
  - เพิ่ม ลบ หรือแทนที่สาร
  - ปรับความเข้มข้น
  - เปลี่ยนชื่อสูตร
  - เปิดหน้า Node graph
  - สั่งประเมินสูตร
- ทุก action ที่แก้ workspace ต้องแสดง preview และให้ผู้ใช้ยืนยันก่อน
- เพิ่ม deterministic fallback สำหรับคำสั่งสร้างโทนเนอร์อ่อนโยน เพื่อให้สูตรที่สร้างได้รวม 100% และใช้เฉพาะสารที่มีข้อมูลยืนยันในคลัง
- เพิ่ม alias resolution เช่น Panthenol, D-Panthenol, Vitamin B5 และ Glycerol
- ป้องกัน AI ใช้ SMILES ของโมเลกุลเดี่ยวแทนสารสกัดหรือสารผสม เช่น Witch Hazel
- ป้องกัน AI สร้าง action จากสารที่ไม่มีโครงสร้างยืนยันใน registry ฝั่งโปรแกรม

ข้อควรทราบ: AI ยังเป็นผู้ช่วยจัดการ workspace และอธิบายผล ไม่ใช่แหล่งยืนยันความปลอดภัยทางการแพทย์หรือกฎระเบียบ

ไฟล์หลัก:

- `frontend/src/components/VoiceAssistant.tsx`
- `backend/app/api/chat.py`
- `backend/app/api/tts.py`
- `docs/AI_ASSISTANT_SPEC.md`

## 5. OCR และการรู้จักส่วนผสม

- เพิ่มการ preprocess ภาพฉลากด้วย grayscale, EXIF transpose, upscale และ autocontrast
- ทดลอง Tesseract สอง segmentation mode แล้วเลือกผลที่ confidence ดีกว่า
- จำกัดไฟล์ภาพไม่เกิน 10 MB และรองรับ JPEG, PNG, WebP และ TIFF
- คืน raw OCR text และ OCR confidence ให้ frontend
- แยกรายการผลเป็น:
  - สารที่จับคู่และมีโครงสร้าง
  - สารที่รู้จักแต่ไม่มีโครงสร้างโมเลกุลเดี่ยว
  - รายการที่ยังจับคู่ไม่ได้
- ใช้ exact match, fuzzy match และ PubChem fallback
- ตรวจ SMILES ที่ได้จาก PubChem ด้วย RDKit ก่อนนำไปใช้
- มี in-memory cache สำหรับ PubChem response
- ไม่เดาความเข้มข้นจากลำดับ INCI ผู้ใช้ต้องกรอกและยืนยันเปอร์เซ็นต์ก่อนนำเข้าสูตร
- Modal OCR แสดงรายการสารที่พบ รายการที่ไม่รู้จัก raw text และคำเตือนเรื่องความเข้มข้นอย่างโปร่งใส

ไฟล์หลัก:

- `backend/app/api/ocr.py`
- `frontend/src/components/LabelScanModal.tsx`
- `backend/tests/test_ocr_resolution.py`

## 6. QSAR และ Scientific Pipeline

ระบบประเมินยังคงมี 4 endpoint:

| Endpoint | ความหมาย | ไฟล์โมเดล |
|---|---|---|
| `skin` | การระคายเคืองผิว | `skin_model.pkl` |
| `eye` | การระคายเคืองตา | `eye_model.pkl` |
| `sens` | การก่อภูมิแพ้ผิวหนัง | `sens_model.pkl` |
| `acute` | พิษเฉียบพลัน | `acute_model.pkl` |

สิ่งที่แก้ไข:

- เพิ่มไฟล์โมเดลที่ train แล้วทั้ง 4 ไฟล์เข้า Git และเลิก ignore ไฟล์ runtime เหล่านี้
- worker จึงโหลดโมเดลได้ทันทีหลัง clone โดยไม่ต้อง train ใหม่ก่อนใช้งาน
- แยกสถานะระดับส่วนผสมในผล pipeline ได้แก่ `recognized`, `resolved`, `qsar_eligible`, `assessment_method` และ `unresolved_reason`
- ส่วนผสมที่ประเมินไม่ได้จะไม่ถูกทำให้หายจากผลลัพธ์
- น้ำถูกเก็บในผล coverage แต่ไม่ส่งเข้า QSAR และใช้วิธี `known_carrier_baseline`
- สารสกัดหรือสารผสมที่ถูกแทนด้วย single surrogate SMILES จะถูกปฏิเสธและรายงานเป็น unresolved
- ส่งเข้า QSAR เฉพาะรายการที่มีโครงสร้างผ่าน validation
- เพิ่ม formula coverage summary:
  - จำนวนส่วนผสมทั้งหมด
  - จำนวนที่รู้จัก
  - จำนวนที่ resolve โครงสร้างได้
  - จำนวนที่ใช้ QSAR ได้
  - จำนวนที่ใช้ baseline/knowledge path
  - จำนวน unresolved
  - coverage percentage
- เพิ่ม confidence และ applicability-domain information
- เพิ่ม timecourse Day 1, Day 3 และ Day 7 ให้ทั้ง 4 endpoint

ค่าที่บันทึกใน `scientific/models/validation_report.json` ปัจจุบัน:

| Endpoint | Accuracy | Balanced accuracy | Sensitivity | Specificity | AUC | MCC |
|---|---:|---:|---:|---:|---:|---:|
| Skin irritation | 0.885 | 0.896 | 0.947 | 0.845 | 0.926 | 0.776 |
| Eye irritation | 0.804 | 0.816 | 0.886 | 0.746 | 0.886 | 0.623 |
| Skin sensitization | 0.802 | 0.825 | 0.900 | 0.750 | 0.896 | 0.620 |
| Acute toxicity | 0.877 | 0.873 | 0.862 | 0.885 | 0.903 | 0.736 |

ตัวเลขเหล่านี้เป็นผล validation ของชุดข้อมูลและวิธีแบ่งข้อมูลที่ระบุในเอกสารโมเดล ไม่ควรตีความเป็นความน่าจะเป็นทางคลินิกหรือหลักฐานว่าผลิตภัณฑ์ปลอดภัยแน่นอน

ไฟล์หลัก:

- `scientific/pipeline.py`
- `scientific/worker.py`
- `scientific/models/*.pkl`
- `scientific/models/validation_report.json`
- `scientific/tests/test_pipeline_carriers.py`

## 7. โมเดล 3D, Grid Scan และผลตามเวลา

- นำระบบ Paint/Grid Scan กลับมาใช้กับโมเดลศีรษะ
- การ Paint วาง grid เฉพาะบริเวณที่ผู้ใช้เลือก
- Hover บริเวณที่ Paint แล้วแสดงชื่อสูตร ตำแหน่งบนใบหน้า และผลความเสี่ยง
- เพิ่มยางลบแบบระบาย สามารถลากลบบริเวณ grid และ symptom mask ได้ ไม่ต้องลบทั้งภาพ
- แยกการแสดงผลตาแดงไปยัง mesh ลูกตาโดยเฉพาะ พร้อมเพิ่มอาการที่ขอบตา
- mapping ภาพของผลทั้ง 4 ด้าน:
  - Skin irritation: ผิวแดง บวม และเมื่อรุนแรงจึงเกิดผิวลอก
  - Eye irritation: ตาแดง เส้นเลือดตา และขอบตาอักเสบ
  - Skin sensitization: ตุ่มหรือผื่นแพ้
  - Acute toxicity: ใช้เสริมความรุนแรงของอาการบวมเมื่อคะแนนสูง
- การระคายเคืองผิวทำให้เกิดอาการบวมได้ตามที่กำหนด แต่จำกัด displacement ไม่ให้ใบหน้าพองผิดรูป
- texture ตุ่มและ normal map ใช้ไฟล์เดิมจาก `frontend/public/textures`
- ผลบนบริเวณที่ Paint เปลี่ยนตาม Day 1, Day 3 และ Day 7 โดยใช้ timecourse จาก backend
- หนึ่งรอย Paint เก็บ mask สำหรับทุกอาการ ทำให้อาการที่เพิ่งเกิดในวันหลังแสดงบนตำแหน่งเดิมได้โดยไม่ต้อง Paint ใหม่
- เพิ่ม transition ให้ความแดง ตุ่ม ลอก บวม และตาแดงค่อย ๆ เปลี่ยนตามวันที่เลือก

ไฟล์หลัก:

- `frontend/src/components/SymptomFaceCanvas.tsx`
- `frontend/src/components/SymptomLabModel.tsx`
- `frontend/public/models/head.glb`
- `frontend/public/textures/blister_height.png`
- `frontend/public/textures/blister_normal.png`

## 8. Landing page และการออกแบบ UI

- ปรับหน้าแรกเป็น scroll story ที่อธิบาย workflow ของระบบ
- คงพื้นหลังห้องทดลอง 3D เดิมไว้
- เพิ่ม showcase สำหรับ:
  - AI Speech Technology และ Chatbot
  - Grid Scan หลายมุม
  - OCR อ่านฉลาก
  - Node workspace
- เพิ่มภาพประกอบหน้า landing ใหม่ 4 ไฟล์
- ปรับข้อความ สี highlight และลำดับรูปตามคำขอ
- ปรับ theme ให้ใช้ teal, slate, white และสีสถานะในแนวทางเดียวกัน
- ปรับปุ่ม Home, Navbar และ CTA ให้เข้ากับ theme
- เพิ่ม responsive layout สำหรับ desktop, tablet/iPad และ mobile เพื่อลดการทับกันของข้อความและ mockup
- เปลี่ยนโลโก้และ metadata ของหน้าเว็บ

ไฟล์หลัก:

- `frontend/src/components/landing/ScrollStory.tsx`
- `frontend/src/components/landing/chapters.ts`
- `frontend/src/components/landing/AIAssistantShowcase.tsx`
- `frontend/src/components/landing/GridScanShowcase.tsx`
- `frontend/src/components/landing/OCRLabelShowcase.tsx`
- `frontend/src/components/landing/NodeWorkspaceShowcase.tsx`
- `frontend/src/components/layout/Navbar.tsx`

## 9. Backend, CORS และการนำไปใช้บนเครื่องอื่น

- แก้ CORS preflight ที่เคยตอบ `OPTIONS ... 400 Bad Request`
- ค่าเริ่มต้น development ใช้ `CORS_ORIGINS=*` และปิด credentials เมื่อใช้ wildcard
- รองรับการกำหนดหลาย origin แบบ comma-separated สำหรับ deployment
- ปรับ `.env.example` ให้รวมค่าที่ frontend, backend, database, Redis, worker และ Groq ต้องใช้
- ไม่ใส่ API key จริงใน `.env.example`
- ปรับ Dockerfile/requirements ที่เกี่ยวข้องกับ OCR และ scientific runtime
- เพิ่มขั้นตอน setup และ clone verification ใน `README.md` และ `SETUP.md`
- เพิ่ม `scripts/verify-clone-ready.ps1` เพื่อตรวจว่าไฟล์ runtime, โมเดล 3D, texture, landing assets และโมเดล QSAR ถูก track ใน Git ครบ
- ลบ `frontend/tsconfig.tsbuildinfo` ออกจาก repository เพราะเป็น build artifact

บริการใน `docker-compose.yml` ปัจจุบัน:

- PostgreSQL 16
- Redis 7
- FastAPI backend
- Scientific worker
- Next.js frontend

## 10. การตรวจสอบล่าสุด

ผลที่ตรวจเมื่อ 17 กรกฎาคม 2026:

- `npm run type-check` ผ่าน
- `npm run build` ผ่าน และ Next.js สร้างทุก route สำเร็จ
- `scripts/verify-clone-ready.ps1 -SkipDocker -SkipDefaultBranchCheck` ผ่าน
- พบโมเดล QSAR ทั้ง 4 ไฟล์และทุกไฟล์มีขนาดมากกว่า 1 MB
- `.env.example` ไม่พบรูปแบบ API key จริง
- ก่อนสร้างเอกสารนี้ working tree ไม่มีไฟล์แก้ค้าง

Backend และ scientific pytest ยังไม่ได้รันซ้ำใน shell รอบนี้ เพราะ Python 3.12/3.14 ของเครื่องไม่มี package `pytest` ติดตั้งอยู่ อย่างไรก็ตาม test files ถูกเพิ่มไว้ใน repository แล้ว ได้แก่:

- การปฏิเสธ SMILES ที่ไม่ถูกต้อง
- การปฏิเสธสูตรรวมเกิน 100%
- การยอมรับสูตรที่ valid และมี water balance
- OCR resolution และการบังคับให้ผู้ใช้กรอก concentration
- AI action guard สำหรับสารสกัด
- water carrier และ botanical surrogate ใน scientific pipeline

## 11. ส่วนที่ยังไม่เสร็จตามสเปก ingredient registry ฉบับเต็ม

แม้ระบบปัจจุบันโปร่งใสขึ้นและไม่ทิ้ง unresolved ingredient แต่ยังไม่ควรถือว่ารองรับส่วนผสมสกินแคร์ในประเทศไทยครบถ้วน เนื่องจากยังมีงานต่อไปนี้:

- ยังไม่มีฐานข้อมูล ingredient registry แบบ versioned import ที่ใช้ schema เต็ม ได้แก่ INCI, canonical name, ชื่อไทย, synonyms, CAS, PubChem CID, InChIKey, regulatory status และ provenance
- การรู้จักสารใน OCR ปัจจุบันยังใช้ curated dictionary ฝั่ง backend ร่วมกับ fuzzy matching และ PubChem fallback
- PubChem cache ยังเป็น in-memory cache ไม่ใช่ persistent cache และยังไม่มี rate limiter ที่กำหนดชัดเจน
- ยังไม่ได้รองรับ substance type ทั้งหมดแบบเป็นระบบ เช่น polymer, silicone, fragrance, UVCB, inorganic และ unknown composition
- fallback แบบ read-across, rule-based และ knowledge base ยังมีเพียงบางกรณี เช่น water baseline และการกัน botanical surrogate ไม่ใช่ระบบครอบคลุมทุกประเภท
- ยังไม่มีชุด automated label tests แยก moisturizer, serum, sunscreen และ cleanser ครบตามเป้าหมายเดิม
- regulatory status สำหรับประเทศไทยยังไม่ได้เชื่อมกับแหล่งข้อมูลทางการ
- หน้า OCR API ยังไม่ได้ส่ง match candidates และ confidence ของ candidate ทุกตัวใน schema แบบเต็ม

ดังนั้นสถานะที่ถูกต้องคือ “QSAR workflow และ transparency layer ใช้งานได้สำหรับสารที่ resolve เป็นโครงสร้างโมเลกุลเดี่ยวได้” แต่ “ingredient recognition/registry สำหรับตลาดไทยฉบับเต็ม” ยังเป็นงานระยะถัดไป

## 12. งานที่แนะนำให้ทำต่อ

1. สร้าง chemical ingredient registry ในฐานข้อมูล พร้อม import/versioning และ provenance
2. ย้ายคลังสาร frontend และ OCR dictionary ให้ใช้ registry เดียวกันผ่าน API
3. เพิ่ม persistent PubChem cache และ rate limiting
4. เพิ่ม assessment method แบบ rule-based, read-across และ curated knowledge base สำหรับสารที่ QSAR ใช้ไม่ได้
5. เพิ่ม fixture และ integration test จากฉลากจริง 4 กลุ่มผลิตภัณฑ์
6. เพิ่ม deployment configuration สำหรับ Vercel frontend และ Render backend/worker/database โดยแยก environment ให้ชัดเจน
7. รัน backend/scientific test suite ใน Docker หรือ virtual environment ที่ติดตั้ง dependencies ครบ แล้วบันทึกผลใน CI
8. ตรวจ encoding ของเอกสารและข้อความเก่าบางไฟล์ให้เป็น UTF-8 เดียวกันทั้งหมด

## สรุปสถานะปัจจุบัน

ตัวระบบพร้อมสำหรับ demo แบบ end-to-end มากขึ้น: ผู้ใช้เริ่มจากโปรเจกต์ สร้างหรือนำเข้าสูตร ประเมินด้วยโมเดล QSAR 4 ด้าน ดู confidence/coverage ใช้ AI ช่วยแก้ workspace สร้าง Node graph และ Paint ผลบนโมเดล 3D ที่เปลี่ยนตามเวลาได้ เครื่องอื่นสามารถ clone แล้วได้รับโมเดลและ runtime assets ที่จำเป็นครบ

อย่างไรก็ตาม ผลยังเป็นเครื่องมือคัดกรองความเสี่ยงเชิง in-silico ไม่ใช่ผลทดสอบทางคลินิก และระบบ ingredient registry สำหรับผลิตภัณฑ์ในประเทศไทยยังต้องพัฒนาต่อก่อนอ้างว่าครอบคลุมตลาดจริง
