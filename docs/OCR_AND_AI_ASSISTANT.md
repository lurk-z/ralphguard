# RalphGuard — ขั้นตอนการพัฒนา OCR & AI Assistant

เอกสารสรุปวิธีคิดและขั้นตอนพัฒนา 2 โมดูล AI เสริม: **OCR อ่านฉลาก (Image Processing)** และ **ผู้ช่วย AI "แรลฟ์" (NLP/Chatbot + Speech)**

---

## ส่วนที่ 1 — OCR อ่านฉลากส่วนผสม (Image Processing)

**เป้าหมาย:** เปลี่ยน "รูปถ่ายฉลากผลิตภัณฑ์" → "สูตรที่ประเมินได้" อัตโนมัติ

### สถาปัตยกรรม
```
รูปฉลาก → [Backend /api/ocr] → Tesseract OCR → คัดบล็อก Ingredients
        → tokenize (คั่นคอมมา) → จับคู่ชื่อ INCI→SMILES (คลัง + PubChem)
        → กรอง guard → คืน items[] → Frontend โหลดเข้าสูตร
```
- **Backend:** `backend/app/api/ocr.py`
- **Frontend:** `LabelScanModal.tsx` (popup สแกน + laser animation + ยืนยันผล)

### ขั้นตอนการพัฒนา (ตามลำดับที่ทำจริง)

**1) วางท่อ OCR พื้นฐาน**
รับไฟล์ภาพ → PIL แปลง grayscale + autocontrast → `pytesseract.image_to_string(lang="eng")`

**2) แก้ปัญหา OCR ตกคอมมา / พิมพ์ผิด**
ครั้งแรกใช้ split คอมมาตรงๆ → พบว่า OCR มักตกคอมมาทำให้สารติดกัน → เปลี่ยนเป็น **n-gram sliding-window fuzzy matching** (RapidFuzz) จับสารที่รู้จักได้แม้คอมมาหาย/สะกดเพี้ยน

**3) จับคู่ INCI → SMILES**
สร้างคลัง INCI ภายใน (`INCI_SMILES` ~60 ชื่อ) + `KNOWN_NO_STRUCTURE` (สารผสม/พอลิเมอร์ที่ไม่มีโครงสร้างเดี่ยว เช่น Aqua, Parfum, Xanthan Gum)

**4) เสริม PubChem (runtime resolver)**
สารที่ไม่อยู่ในคลัง → ยิง **PubChem PUG-REST** (ชื่อ→SMILES) → validate ด้วย RDKit → cache
ทำให้ครอบคลุมสารจริงเกือบทุกตัวโดยไม่ต้องเก็บฐานเอง (มี `online` flag ปิดได้เมื่อรันออฟไลน์)

**5) ใส่ Guard กันจับผิด (จากการทดสอบฉลากจริง NIVEA)**
- **คัดเฉพาะบล็อก Ingredients** — อ่านหลัง `Ingredients:` ถึงก่อน `Made in / Imported / Tel / ที่อยู่` → ตัดคำโฆษณา/ที่อยู่/ขยะออก
- **จับทั้งชื่อ INCI (whole-token)** ไม่ฉีกครึ่งคำ → กันเคส "Lanolin Alcohol" ถูกอ่านเป็น "Alcohol"→Ethanol และ "Aluminum Stearates" ถูกฉีกเป็น 2 ชิ้น
- **`_AMBIGUOUS`** — คำตระกูลเคมี (aluminum, stearate, acid, sodium...) ห้ามแม็ปเดี่ยว
- **`_NOISE` + `_plausible`** — กรองคำขยะฉลาก (made, tel, batch, hong kong...)
- ตัดวงเล็บ `(Eucerit)` ทิ้งก่อน tokenize

**6) UI สแกน (LabelScanModal)**
popup พื้นหลังเบลอ → อัปโหลด → grid + เส้น laser วิ่งบนรูป → ตัดสิน "ใช้งานได้/ใช้ไม่ได้" → แสดงสารที่เจอ (ป้าย PubChem) → ยืนยันความเข้มข้น → เพิ่มเข้าสูตร

### บทเรียนสำคัญ
OCR อ่านตัวอักษรได้ดี แต่คอขวดคือ **การแม็ปชื่อ→โครงสร้าง** — จึงต้องมี guard + PubChem fallback + ให้ผู้ใช้ยืนยัน % ก่อนประเมิน

---

## ส่วนที่ 2 — ผู้ช่วย AI "แรลฟ์" (NLP/Chatbot + Speech)

**เป้าหมาย:** สนทนาภาษาไทยธรรมชาติ + **ลงมือทำจริง** (agentic) + รับ/ตอบด้วยเสียง

### สถาปัตยกรรม
```
ผู้ใช้ (พิมพ์/พูด) → [Backend /api/chat] → LLM (Groq/Llama 3.3)
   → คำตอบภาษาคน + แท็กคำสั่ง <action>[...]</action>
   → Frontend parse แท็ก → ลงมือทำ (เพิ่ม/ลด/เปลี่ยน/รัน) → พูดกลับด้วย TTS
```
- **Backend chat:** `backend/app/api/chat.py` · **TTS:** `backend/app/api/tts.py`
- **Frontend:** `VoiceAssistant.tsx`

### ขั้นตอนการพัฒนา

**1) เลือกโมเดลภาษา**
เริ่มลอง Gemini (คีย์ `AQ.` ติดปัญหา auth) → เปลี่ยนเป็น **Groq (Llama 3.3 70B)** ผ่าน OpenAI-compatible API (คีย์อยู่ backend `.env` เท่านั้น ไม่หลุด frontend)

**2) ออกแบบ System Prompt (persona + grounding)**
กำหนดบุคลิก "แรลฟ์" เป็นกันเอง ตอบกระชับ, ground บนผลประเมินที่ส่งเป็น context, ห้ามกุตัวเลข, เตือน in-silico เฉพาะตอนเสี่ยงสูง

**3) ทำให้ "ลงมือทำได้" (Agent)**
ออกแบบให้ LLM แนบคำสั่งในแท็ก `<action>[...]</action>` (ผู้ใช้ไม่เห็น JSON) แล้ว frontend parse ไปทำจริง
คำสั่งที่รองรับ: `add_substance`, `set_concentration`, `remove_substance`, `replace_substance`, `rename_formula`, `set_formula`, `create_formula`, `goto`, `run`, `clear`

**4) เพิ่มความสามารถให้ครบ (เพิ่ม/ลบ/แก้ไข)**
เดิมทำได้บางคำสั่ง → เพิ่ม `set_concentration` (ลดสารเดิม ไม่ใช่เพิ่มซ้ำ), `replace_substance` (เปลี่ยนสาร), `rename_formula` (ตั้งชื่อ) + สอน prompt ให้ทำ "ทุกอย่างในประโยคเดียว" ให้ครบ

**5) ส่ง context สูตรปัจจุบัน**
ส่งรายชื่อสาร + % ปัจจุบันเข้า prompt เพื่อให้ AI match ชื่อสารถูกเวลาสั่งลด/เปลี่ยน

**6) Speech (เข้า–ออก)**
- **TTS:** เสียงไทย neural ผ่าน `edge-tts` (`th-TH-PremwadeeNeural`) มี fallback เป็น browser speechSynthesis
- **STT:** Web Speech `SpeechRecognition` (th-TH) พูดสั่งได้

**7) ปรับให้ตอบเป็นธรรมชาติ**
temperature 0.6, top_p 0.95, เขียน persona + ตัวอย่างบทสนทนาใน prompt ให้ตอบหลากหลาย ไม่ท่องประโยคเดิม

### บทเรียนสำคัญ
กุญแจของ agent ที่ดีคือ **โครงสร้างคำสั่งที่ชัด (structured actions) + สอนให้ทำครบทุกขั้น** และแยกคีย์ไว้ backend เท่านั้นเพื่อความปลอดภัย
