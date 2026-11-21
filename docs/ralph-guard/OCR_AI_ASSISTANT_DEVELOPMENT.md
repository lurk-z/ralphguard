# การพัฒนา OCR และ AI Assistant ของ RalphGuard

เอกสารนี้สรุปแนวคิด สถาปัตยกรรม ขั้นตอนพัฒนา การตรวจสอบ และข้อจำกัดของระบบอ่านฉลากส่วนผสมและผู้ช่วย AI ใน RalphGuard ณ วันที่ 24 กรกฎาคม 2026

## 1. เป้าหมายของระบบ

RalphGuard ใช้ OCR แปลงภาพฉลากเครื่องสำอางเป็นรายชื่อส่วนผสม และเชื่อมรายชื่อเหล่านั้นกับทะเบียนสารที่ตรวจสอบแล้ว ก่อนตัดสินใจว่าสารใดมีโครงสร้างเหมาะสำหรับ QSAR ระบบจะไม่ทำสารที่ประเมินไม่ได้หายไป แต่จะแสดงเป็นสารที่รู้จักแต่ไม่เข้า QSAR หรือ unresolved พร้อมเหตุผล

AI Assistant ช่วยรับคำถามและคำสั่งเกี่ยวกับสูตรผ่านข้อความหรือเสียง โดยอ้างอิงสูตรและผลประเมินที่กำลังเปิดอยู่ การเปลี่ยนแปลง workspace ต้องผ่านหน้าตรวจสอบและการยืนยันของผู้ใช้

## 2. ขั้นตอนพัฒนา OCR

### 2.1 รับและตรวจภาพ

- รับไฟล์ผ่าน `POST /api/ocr/ingredients`
- ตรวจชนิดไฟล์ ขนาดภาพ และจำนวนพิกเซลก่อนประมวลผล
- หมุนภาพตาม EXIF และแปลงเป็น grayscale
- deskew โดยทดลองมุม -6 ถึง +6 องศา ช่วงละ 0.5 องศา แล้วเลือกมุมที่แนวข้อความชัดที่สุด
- ปรับความกว้างเป้าหมายประมาณ 2,200 พิกเซล โดยจำกัดการขยายไม่เกิน 4 เท่า

### 2.2 ประมวลผลภาพหลายแบบ

ระบบสร้างภาพ 3 แบบเพื่อรับมือแสง เงา ความเบลอ และพื้นฉลากที่ต่างกัน

1. Autocontrast ปรับช่วงสว่างและมืดอัตโนมัติ
2. Sharpened เพิ่ม contrast และใช้ unsharp mask ทำให้ขอบตัวอักษรชัดขึ้น
3. Binary Otsu ลด noise แล้วแยกตัวอักษรกับพื้นหลังแบบอัตโนมัติ

แต่ละภาพอ่านด้วย Tesseract PSM 4, 6 และ 11 รวมสูงสุด 9 รอบ การอ่านหลายรอบไม่ได้ใช้การโหวตระดับพิกเซลแบบสุ่ม แต่สร้างความหลากหลายที่ควบคุมได้และตรวจสอบซ้ำได้

### 2.3 รวมผลและแยกรายชื่อ INCI

- ให้คะแนนแต่ละรอบจากจำนวนสารที่เชื่อมได้ จำนวนสารที่รู้จักแต่ไม่มีโครงสร้าง จำนวนคำที่อ่านได้ และ confidence ของ Tesseract
- เลือกผลที่มีคุณภาพสูงสุดและใช้ผลอันดับต้นเพื่อคำนวณ confidence สรุป
- ตัดข้อความนอกช่วง Ingredients เช่น คำเตือน ที่อยู่ เลขล็อต และข้อความการตลาด
- แยกรายชื่อด้วย comma/semicolon และมี phrase recovery สำหรับกรณี OCR ทำช่องว่างหรือ comma หาย
- fuzzy match ใช้กับชื่อเต็มของสารและต้องผ่าน threshold ตามความยาวชื่อ
- approximate match ต้องได้รับการยืนยันจากอย่างน้อย 2 OCR passes เพื่อลดสารที่ระบบเดาขึ้นผิด

### 2.4 Entity linking และ structure resolution

หลังอ่านชื่อ ระบบแยกขั้นตอนการรู้จักชื่อออกจากการประเมินพิษอย่างชัดเจน

1. ตรวจ curated INCI และ synonym ที่ผ่านการทบทวน
2. ตรวจทะเบียนสารที่ยืนยันแล้วด้วยชื่อ INCI, canonical name, synonym, CAS, PubChem CID, SMILES และ InChIKey
3. ระบุ substance type เช่น single substance, salt, polymer, silicone, botanical extract, mixture, fragrance, UVCB, inorganic หรือ unknown composition
4. ส่งเข้า QSAR เฉพาะรายการที่มี canonical SMILES ถูกต้องและ `qsar_eligible=true`
5. สารที่รู้จักแต่ไม่เข้า QSAR ยังคงแสดงชื่อ ประเภท เหตุผล และวิธีประเมิน fallback
6. รายการที่ยังไม่ยืนยันแยกเป็น unresolved หรือ candidate และห้ามสร้าง SMILES ขึ้นเอง

PubChem ใช้สำหรับช่วยยืนยัน identity, synonym และโครงสร้าง ไม่ได้นำข้อมูล PubChem มาใช้เป็น toxicity label สำหรับฝึกโมเดลโดยอัตโนมัติ รายการที่นำเข้าแบบ offline seed ต้องผ่านตัวกรองโครงสร้างและสถานะ verification ก่อน

### 2.5 ผลลัพธ์ที่ API ส่งกลับ

- raw OCR text และ consensus text
- parsed/normalized ingredient
- match candidates และ match confidence
- structure availability และ QSAR eligibility
- assessment method และ unresolved reason
- จำนวน OCR passes, variants และ PSM ที่ถูกเลือก
- summary ได้แก่ total, recognized, structure-resolved, QSAR-assessable, knowledge-base-assessed, unresolved และ formula coverage

### 2.6 การทดสอบ OCR

ชุดทดสอบครอบคลุมฉลาก moisturizer, serum, sunscreen และ cleanser รวมทั้งภาพ Garnier ที่ใช้ระหว่างพัฒนา ตรวจทั้งความถูกต้องของรายชื่อ การไม่ทำสารหาย การแยกสารรู้จักแต่ไม่เข้า QSAR และการป้องกัน false positive จากข้อความนอก Ingredients

## 3. ขั้นตอนพัฒนา AI Assistant

### 3.1 การรับคำสั่ง

- ข้อความถูกส่งจาก Frontend ไป `POST /api/chat/`
- คำสั่งเสียงใช้ Web Speech API ของเบราว์เซอร์เมื่ออุปกรณ์รองรับ
- ระบบสร้าง context จากชื่อสูตร ส่วนผสม ความเข้มข้น คะแนน 4 ด้าน confidence, applicability domain และ coverage ล่าสุด

### 3.2 การตอบด้วย Groq

Backend เรียก Groq ผ่าน OpenAI-compatible Chat Completions API โดยเก็บ `GROQ_API_KEY` ใน `.env` ของเครื่องหรือ secret ของระบบ deploy เท่านั้น ค่า key ไม่ถูกส่งไป browser และห้ามบันทึกลง Git หรือ PDF

ระบบนี้เป็น context-grounded assistant ที่ควบคุมด้วย system prompt และกฎเชิงโปรแกรม ไม่ใช่การ fine-tune โมเดลใหม่จากข้อมูลผู้ใช้

### 3.3 Scientific guardrails

- อ้างเฉพาะคะแนนที่อยู่ใน context และห้ามรับรองความปลอดภัยก่อน Run
- ห้ามสร้าง SMILES หรือ toxicity label ขึ้นเอง
- ห้ามแทนสารสกัดหรือสารผสม เช่น Witch Hazel ด้วยโมเลกุลเดี่ยว
- ตรวจ action ที่ AI สร้าง หากพบ composition ที่ไม่รองรับจะขอแก้คำตอบหรือใช้สูตร fallback ที่ทบทวนแล้ว
- สูตรทดสอบ endpoint ใช้ fixture ที่ผ่านการประเมินกับโมเดลชุดปัจจุบัน แทนการรับรองคะแนนจากการคาดเดาของ LLM
- ผล confidence ต่ำหรือ out-of-domain ต้องแสดงข้อจำกัดก่อนสรุป

### 3.4 Preview และการยืนยัน

AI ส่ง action ที่มี schema จำกัด เช่น create formula, set concentration, replace substance, rename, change tab และ run Frontend จะแยก action ออกจากข้อความ แสดงรายการเปลี่ยนแปลง และรอผู้ใช้กดยืนยันก่อนแก้ workspace จึงป้องกันการเปลี่ยนสูตรทันทีจากคำตอบของโมเดล

### 3.5 การตอบกลับด้วยเสียง

ระบบส่งข้อความไป `POST /api/tts/` และใช้ Microsoft Edge Neural TTS เสียงภาษาไทยเป็นทางเลือกหลัก หากบริการไม่พร้อมจะ fallback ไป `window.speechSynthesis` ของเบราว์เซอร์ มีการหยุดเสียงเดิมและยกเลิก request เก่าเมื่อมีคำสั่งใหม่ เพื่อลดเสียงซ้อนและคำตอบที่มาถึงผิดลำดับ

## 4. การเชื่อมทะเบียนสาร

Frontend เดิมแสดงคลังแบบคงที่ 53 สาร ปัจจุบันหน้าประเมินและ Node graph ดึงทะเบียนที่ยืนยันแล้วแบบแบ่งหน้าจาก API และรวมกับ curated catalog ปัจจุบัน offline seed มี 1,336 รายการ โดย 1,329 รายการเข้า QSAR และ 7 รายการรู้จักแต่ไม่เข้า QSAR Migration จะสร้างข้อมูลชุดเดียวกันในฐานข้อมูลของเครื่องที่ Clone ใหม่

## 5. การตรวจความพร้อม

- Frontend TypeScript type-check และ Next.js production build
- Backend automated tests และ OCR/registry tests
- Scientific worker tests และตรวจ model artifacts ครบ 4 endpoints
- Alembic migration บนฐานข้อมูลใหม่และตรวจจำนวน registry อย่างน้อย 1,000 รายการ
- API smoke test สำหรับ CORS, projects, registry, profile, assessment, chat และ TTS
- Browser smoke test ตรวจ CSS, WebGL และหน้า `/assess`
- `scripts/verify-clone-ready.ps1` ตรวจไฟล์ models, 3D assets, textures, migrations และ registry seed ว่ามีอยู่และถูก track ใน Git

## 6. ข้อจำกัดและการใช้ผลอย่างรับผิดชอบ

- OCR confidence เป็นตัวชี้วัดคุณภาพการอ่าน ไม่ใช่ความน่าจะเป็นที่รายชื่อทุกตัวถูกต้อง ผู้ใช้ต้องตรวจข้อความและความเข้มข้นก่อนยืนยัน
- PubChem ช่วยเรื่อง identity และ structure แต่ไม่ทำให้สารทุกชนิดเหมาะกับ QSAR
- พอลิเมอร์ สารสกัด น้ำหอม สารผสม และ UVCB อาจไม่มีโครงสร้างโมเลกุลเดี่ยว ระบบต้องใช้ knowledge base, read-across หรือแสดง unresolved ตามหลักฐานที่มี
- ภาพจำลอง 3D เป็นการสื่อสารคะแนน ไม่ใช่การจำลองทางคลินิกหรือการวินิจฉัย
- ผลทั้งหมดเป็น in-silico screening และไม่ทดแทนการทดสอบตามมาตรฐานหรือการประเมินโดยผู้เชี่ยวชาญ

## 7. ไฟล์หลักที่เกี่ยวข้อง

- `backend/app/api/ocr.py`
- `backend/app/services/ingredient_registry.py`
- `backend/app/services/pubchem_evidence.py`
- `backend/app/api/chat.py`
- `backend/app/api/tts.py`
- `frontend/src/components/LabelScanModal.tsx`
- `frontend/src/components/VoiceAssistant.tsx`
- `frontend/src/components/SubstanceHoverCard.tsx`
- `backend/data/ingredient_registry_seed.csv`
- `scripts/verify-clone-ready.ps1`

