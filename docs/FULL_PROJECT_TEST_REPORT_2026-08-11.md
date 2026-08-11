# RalphGuard Full Project Test Plan & Report

วันที่ทดสอบ: 11 สิงหาคม 2569 (2026)  
สาขา: `main-Responsive/UI`  
Baseline commit: `65df055 Region-Map`  
สถานะเอกสาร: **ทดสอบเสร็จแล้ว — ยังไม่แนะนำให้ commit/release จนกว่าจะพิจารณาปัญหา High และ Critical**

## 1. เป้าหมายและขอบเขต

ตรวจสอบ RalphGuard ทั้งระบบหลังงาน UI และ logic หลักเสร็จ โดยครอบคลุม frontend, backend API, PostgreSQL, Redis, scientific worker, OCR, Node Graph, โมเดล 3 มิติ, responsive UI, persistence และ production build

รอบนี้เป็นการตรวจและรายงานปัญหาเท่านั้น ไม่มีการแก้ source code ของปัญหาที่พบ เพื่อไม่ให้ผลทดสอบปะปนกับการเปลี่ยนแปลงใหม่ ไฟล์งานเดิมใน worktree ถูกเก็บไว้ทั้งหมด

## 2. แผนทดสอบ

### T1 — Repository และ runtime readiness

- ตรวจ Git/worktree โดยไม่ย้อนการแก้ไขของผู้ใช้
- ตรวจ model bundle, registry seed และ Docker Compose
- ตรวจ health ของ backend, PostgreSQL, Redis และ worker

### T2 — Frontend static, unit, build และ dependency

- `npm run type-check`
- `node --test --experimental-strip-types tests/*.test.ts`
- `npm run build`
- route smoke test จาก production/dev server
- `npm audit --omit=dev --audit-level=high`
- `git diff --check`

### T3 — Backend และ scientific automated tests

- backend `pytest -q`
- scientific worker `pytest -q`
- `pip check` ทั้ง backend และ worker
- ทดสอบ validation ของ formula, SMILES, project และ assessment

### T4 — API และ service integration

- Projects: create, update, delete, restore
- Substance: registry pagination, search, profile, resolve และ depiction
- Assessment: submit, Redis queue, worker, polling และผล Day 1/3/7
- OCR ด้วย fixture จริงใน repository
- Chat fallback, external AI unavailable state และ TTS

### T5 — Desktop UI workflow

- Projects และ Formula empty state
- เพิ่มสารจากคลัง, manual substance, favorite, OCR และ CSV modal
- ทา/ลบ/ลบทั้งหมด/ประเมินบนโมเดล
- Node Graph: เพิ่มสาร, เชื่อม, ไม่เชื่อม, ประเมิน, บันทึก และ reload
- Right Inspector, Day tabs, trend, AI tab และ PDF trigger
- History, results, trust, skin viewer และ symptom lab

### T6 — Responsive UI

- Mobile 389×852
- iPad 820×1180
- Desktop 1280×720
- ตรวจ Bottom Sheet, modal, Inspector, Formula Panel, toolbar, overflow, clipping และ accessibility ของปุ่มแบบ icon

### T7 — Persistence และ regression

- reload แล้ว formula, Graph, paint และ result อยู่ถูกสูตร
- connected-node scope ประเมินเฉพาะสารที่เชื่อม Result Node
- Graph ไม่ sync กล่องสูตรก่อนกดบันทึก
- AI chat history และ project/formula ownership

## 3. สภาพแวดล้อม

| รายการ | ค่า |
|---|---|
| OS | Windows / PowerShell |
| Node.js | 22.19.0 |
| npm | 10.9.3 |
| Python บนเครื่อง | 3.13.14 |
| Docker | 29.6.2 |
| Docker Compose | 5.3.1 |
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8000` |
| Database migration | Alembic head `20260730_0005` |
| Substance registry | 1,336 seed rows |

## 4. สรุปผล

| ID | ชุดทดสอบ | สถานะ | ผลสำคัญ |
|---|---|---|---|
| T1 | Repository/runtime readiness | **ผ่าน** | Compose parse ผ่าน, backend/PostgreSQL/Redis healthy, model bundle 4 ชุดและ registry seed ครบ |
| T2 | Frontend static/unit/build | **ผ่านบางส่วน** | type-check ผ่าน, unit 72/72 ผ่าน, build ผ่าน; แต่ dependency audit พบ 11 ช่องโหว่ |
| T3 | Backend/scientific tests | **ผ่านบางส่วน** | backend 39/40, scientific 2/2, `pip check` ผ่านทั้งสอง container |
| T4 | API/service integration | **ผ่านบางส่วน** | assessment จบครบ queue/worker, CRUD ใช้ได้; พบ 500 เมื่อ project ไม่มีอยู่และ OCR registry warning |
| T5 | Desktop UI workflow | **ผ่านบางส่วน** | workflow หลักประเมินได้ แต่ Node save, legacy result navigation, AI และ 3D บางหน้ามีปัญหา |
| T6 | Responsive UI | **ผ่านบางส่วน** | Formula/Bottom Sheet/Inspector ใช้ได้; Projects มือถือ overflow และปุ่ม mobile บางตัวไม่มี accessible name |
| T7 | Persistence/regression | **ไม่ผ่าน** | formula/graph/result reload ได้ แต่บันทึก Graph ผิดกติกาและ AI chat history ไม่คงอยู่ |

**สรุปรวม:** Production build ผ่านและระบบประเมินหลักทำงานครบ แต่ยังมี 1 Critical, 2 High, 12 Medium และ 4 Low ที่ควรพิจารณาก่อน commit/release

## 5. ผล Automated Tests

### Frontend

| คำสั่ง | ผล |
|---|---|
| `npm run type-check` | ผ่าน |
| `node --test --experimental-strip-types tests/*.test.ts` | ผ่าน 72/72 |
| `npm run build` | ผ่าน สร้าง 19 routes |
| Route smoke 18 routes | HTTP 200 ทุก route |
| `npm audit --omit=dev --audit-level=high` | ไม่ผ่าน: 11 vulnerabilities (3 moderate, 7 high, 1 critical) |

Build สำคัญ:

- `/` first-load JS 417 kB
- `/assess` first-load JS 237 kB
- `/projects` first-load JS 201 kB
- route `/test_components` ถูกสร้างใน production build ด้วย

### Backend และ scientific

| คำสั่ง | ผล |
|---|---|
| backend `pytest -q` | 39 ผ่าน, 1 ไม่ผ่าน |
| worker `pytest -q` | 2/2 ผ่าน |
| backend `pip check` | ผ่าน |
| worker `pip check` | ผ่าน |

Backend test ที่ไม่ผ่านคือ `test_settings_loads_repo_root_env_when_run_from_backend_dir` เพราะ test คาดว่า `GROQ_API_KEY` ต้องมีค่าจริงใน `.env` แต่ environment ปัจจุบันไม่ได้ตั้งค่า secret นี้

### Clone/readiness

`scripts/verify-clone-ready.ps1 -SkipDefaultBranchCheck` ผ่านทั้งหมด: registry seed, model bundle และ Docker Compose configuration พร้อมใช้งาน

## 6. ผล API Integration

- `/health` ตอบ 200 และระบุ service `ralphguard-api`
- PostgreSQL รับ connection และ Redis ตอบ `PONG`
- สร้างโปรเจกต์ทดสอบ, แก้ไข, soft delete, restore และลบซ้ำได้
- ส่งสูตร Ethanol 40% + Glycerin 10% แล้ว assessment จบผ่าน Redis/worker ประมาณ 1.2 วินาที
- ได้ผล Day 1/3/7, confidence และ coverage กลับครบ
- valid SMILES `CCO` resolve และสร้าง SVG depiction ได้
- invalid SMILES ถูกปฏิเสธด้วย 422
- สูตรรวมเกิน 100% ถูกปฏิเสธด้วย 422
- registry pagination 500 + 500 รายการไม่พบ ID ซ้ำ
- OCR fixture อ่าน raw text 864 ตัวอักษร, consensus 272 ตัวอักษร, recognized 10 รายการ, image confidence 38.6%
- deterministic chat fallback ทำงาน
- TTS ตอบ 200

## 7. ผล UI Workflow ที่ผ่าน

- สร้างโปรเจกต์ใหม่แล้วเริ่มด้วย Empty State ไม่มีสูตรอัตโนมัติ
- สร้าง Formula A และเพิ่ม Ethanol/Glycerin จากคลังได้ Water ปรับเป็น 50%
- คลังสารคงเปิดเพื่อเลือกซ้ำได้ และ manual name suggestion กรองชื่อที่ขึ้นต้นตรงคำค้น
- duplicate manual substance แจ้งสั้นว่า “พบ Ethanol ในคลังสารแล้ว”
- favorite เพิ่ม/ลบได้ และแสดงหมวดรายการโปรด
- ประเมินโดยยังไม่ทาแสดง precondition toast ถูกต้อง
- ทา, ลบรอย, ลบทั้งหมด และประเมินบนโมเดลได้
- Right Inspector แสดง Day 1/3/7, 4 endpoints, confidence และ coverage
- Node Graph ประเมินเฉพาะสารที่เชื่อม Result Node; node ที่ไม่เชื่อมไม่ถูกรวม
- reload แล้วสูตร, graph snapshot, paint และ assessment result หลักยังอยู่
- Mobile Bottom Sheet: ตั้งค่าสูตร, วิธีเพิ่มสาร และ category filter ทำงาน
- Mobile modal: edit formula, delete confirmation, manual substance, OCR และ CSV อยู่กึ่งกลางและไม่ล้นจอ
- Mobile/iPad Inspector, toolbar และ brush-size slider ใช้งานได้; แตะด้านนอกแล้ว slider ปิด
- Trust page responsive ไม่มี document-level horizontal overflow
- Symptom Lab โหลดโมเดลและ controls ได้
- Active project history/results (`project 126`) เปิดผลสำเร็จ
- โปรเจกต์ทดสอบ ID 128 ถูกลบผ่าน UI หลังจบทดสอบ

## 8. ปัญหาที่พบ

### RG-01 — Critical — Frontend dependencies มีช่องโหว่ที่ทราบแล้ว

**หลักฐาน:** `npm audit --omit=dev --audit-level=high` พบ 11 รายการ: 1 Critical, 7 High, 3 Moderate โดย Next.js ปัจจุบันคือ `14.2.13` และ audit ระบุช่องโหว่หลายกลุ่ม เช่น authorization bypass, SSRF, cache poisoning, XSS และ DoS

**ผลกระทบ:** ไม่ควร release สู่ environment ที่รับ traffic ภายนอกโดยยังไม่ประเมิน/อัปเดต dependency

**ข้อเสนอ:** วางแผนอัปเกรด Next.js และ package ที่แก้ได้แบบ non-breaking ก่อน จากนั้นรัน build, unit และ UI regression ใหม่ ห้ามใช้ `npm audit fix --force` โดยไม่ review เพราะเสนอข้ามไป Next 16

### RG-02 — High — บันทึก Node Graph สร้างสูตรใหม่แม้มีสูตรที่เลือกอยู่

**ทำซ้ำ:** เลือก Formula A → เปิด Nodes → แก้ Graph → กด `บันทึกเป็นสูตร`

**ผลจริง:** ระบบสร้างและเลือก `สูตรจาก Node 1` ใหม่แทนการบันทึกทับ Formula A ในจังหวะ save

**ผลที่ควรเป็น:** ตาม workflow ที่กำหนด Graph ต้องเป็น draft แยก และเมื่อมีสูตรที่เลือกอยู่ให้ sync กลับสูตรนั้นเมื่อกดบันทึกเท่านั้น; สร้างสูตรใหม่เฉพาะกรณีไม่มีสูตรเป้าหมาย

### RG-03 — High — ลิงก์จากหน้าผลกลับไปแก้สูตรเปิด workspace ว่าง

**ทำซ้ำ:** เปิด `/projects/126/results` → กด `กลับไปแก้สูตร`

**ผลจริง:** ไป `/projects/126/assess` ซึ่งแสดง `โปรเจกต์ปัจจุบัน`, Empty State และไม่โหลดสูตรของ project 126

**สาเหตุที่เป็นไปได้:** หน้า workspace ใหม่รับ `projectId` จาก query (`/assess?projectId=126`) แต่ legacy route `/projects/[id]/assess` ไม่แปลง route param ให้ page หลัก

**ข้อเสนอ:** redirect route เก่าไป `/assess?projectId=<id>` หรือส่ง route param เข้า workspace โดยตรง

### RG-04 — Medium — Assessment ของ project ที่ไม่มีอยู่ตอบ 500

**ทำซ้ำ:** POST assessment ด้วย `project_id=2147483647`

**ผลจริง:** HTTP 500 และ backend log เป็น PostgreSQL `ForeignKeyViolation` ที่ `db.commit()`

**ผลที่ควรเป็น:** ตรวจ project ก่อน insert และตอบ 404 หรือ 422 แบบควบคุมได้

### RG-05 — Medium — OCR registry integration unpack ข้อมูลผิดจำนวน

OCR fixture ยังส่งผลกลับ แต่มี warning:

`ingredient registry unavailable: not enough values to unpack (expected 5, got 4)`

ผลคือ candidates เป็น 0 และขั้นตอน registry linking/learning ไม่ทำงาน แม้ OCR recognized 10 รายการ

### RG-06 — Medium — AI Assistant ใช้งาน external AI ไม่ได้และเผย raw error

- `GROQ_API_KEY` ไม่ได้ตั้งค่า ทำให้ general chat ตอบ 503
- UI แสดง raw backend JSON: `เชื่อมต่อ AI ไม่ได้ (503) {"detail":"GROQ_API_KEY not configured"}`
- deterministic fallback ใช้ได้เฉพาะบาง intent

ควรมีข้อความภาษาไทยที่เป็นมิตรและไม่เผย payload ภายใน พร้อมระบุว่า AI ภายนอกยังไม่พร้อม

### RG-07 — Medium — Backend test ผูกกับ secret จริง

Backend test suite หยุดที่ 39/40 เพราะ test ยืนยันว่า `GROQ_API_KEY` ต้องไม่ว่าง ทำให้ clone/CI ที่ถูกต้องแต่ไม่มี secret ไม่สามารถผ่านได้

ควรทดสอบ precedence/parsing ด้วย temporary env value หรือ monkeypatch แทนการบังคับใช้ secret จริง

### RG-08 — Medium — AI chat history หายหลัง reload/สลับสูตร

ข้อความที่ส่งและ error bubble แสดงระหว่าง session แต่หลัง reload และกลับเข้า AI tab จะกลับเป็น Empty State ไม่มีประวัติเดิม ไม่ตรงกับ requirement ที่ให้เนื้อหาคุยยังแสดงอยู่

### RG-09 — Medium — React Flow ยังทำงานอยู่ใต้หน้าคลังสารทั้งหมด

เมื่อเปิด `คลังสารเคมีทั้งหมด` พบ `.react-flow` ยัง mounted, `display:block`, `visibility:visible` และครอบพื้นที่ main เดียวกันใต้ library overlay

ผลกระทบคือเกิด duplicated interactive/accessibility tree และยังเสียค่า render/GPU ทั้งที่ผู้ใช้มองไม่เห็น ซึ่งสัมพันธ์กับอาการเปิดคลังแล้วหน่วง

### RG-10 — Medium — React Flow สร้าง `nodeTypes/edgeTypes` ใหม่ซ้ำ

Console เตือนหลายครั้ง:

`[React Flow]: It looks like you've created a new nodeTypes or edgeTypes object`

ควรประกาศ object นอก component หรือ memoize เพื่อไม่ให้ React Flow reinitialize/คำนวณซ้ำ โดยเฉพาะเมื่อ Graph มี node มาก

### RG-11 — Medium — Projects mobile มี horizontal overflow และพื้นที่ว่างยาวผิดปกติ

ที่ viewport 389×852:

- document กว้าง 394 px ขณะที่ viewport ประมาณ 390 px จึงมี horizontal scrollbar
- card ด้านขวาล้นประมาณ 3 px
- invisible pagination placeholders จำนวนหลายใบยังเรียงเป็นหนึ่งคอลัมน์ ทำให้ pagination อยู่ที่ประมาณ y=1945 ทั้งที่มีเพียง 2 โปรเจกต์

ผลคือผู้ใช้ต้องเลื่อนพื้นที่ว่างยาวมากก่อนถึง pagination

### RG-12 — Medium — History แสดง assessment ของโปรเจกต์ที่ลบแล้วแต่ลิงก์เปิดไม่ได้

History ยังแสดงรายการของ project 127/128 เป็น `#127/#128` และลิงก์ไป `/projects/128/results`

หน้าผลตอบ UI error `โหลดผลการวิเคราะห์ไม่สำเร็จ: ไม่พบข้อมูลที่ร้องขอ` เพราะ project ถูก soft delete แม้ assessment ยังอยู่

ควรซ่อน/ระบุ deleted project หรือเปิดผลด้วย assessment ID ที่ไม่ต้องพึ่ง project ที่ active

### RG-13 — Medium — Standalone skin viewer ใช้มุมกล้องผิด

`/skin-viewer` และ error state ของหน้า results แสดงโมเดลจากด้านบน/ด้านหลังศีรษะคล้ายก้อนผม ไม่เห็นใบหน้า ทั้งที่ controls ระบุ “ทั้งหน้า / หน้าผาก / แก้ม” ทำให้หน้าจำลองใช้งานจริงไม่ได้

หน้า `/assess` ใช้มุมกล้องถูกต้อง จึงน่าจะเป็น camera preset ของ viewer รุ่นเก่า

### RG-14 — Medium — รอยทาแตกเป็นพื้นที่ไม่ต่อเนื่องเมื่อเปลี่ยน viewport

รอยที่ทาบริเวณแก้มบน Desktop เมื่อเปิดบน iPad ปรากฏเพิ่มเป็น mesh แยกบนปาก/คาง ทั้งที่ไม่ได้ทาบริเวณนั้น เป็นสัญญาณว่า paint mask/UV seam ยัง map ข้าม topology บางส่วน

ควรบันทึก UV hit และทดสอบ preset หลายมุมกล้องกับ region เดิม โดยใช้ XYZ fallback เฉพาะเมื่อ UV หาไม่ได้

### RG-15 — Medium — ปุ่มโหมดบน Mobile ไม่มี accessible name

เมื่อข้อความ `ประเมิน / Nodes / ความน่าเชื่อถือ` ถูกซ่อนใน mobile accessibility snapshot ปุ่มทั้งสามกลายเป็น `button` ที่ไม่มีชื่อ ทำให้ screen reader และ automation ระบุไม่ได้

ควรเพิ่ม `aria-label` ที่คงอยู่แม้ซ่อนข้อความด้วย CSS

### RG-16 — Low — Production build เปิด route ทดสอบ

`/test_components` ถูกสร้างใน production build ควรย้ายออกจาก production route tree หรือเปิดเฉพาะ development flag

### RG-17 — Low — TypeScript tests มี ESM package warning

Node เตือน `MODULE_TYPELESS_PACKAGE_JSON` ซ้ำ เพราะ package ไม่มี `type: module` แต่ tests ใช้ ESM syntax ทำให้ Node parse ซ้ำและช้าลงเล็กน้อย

### RG-18 — Low — pytest-asyncio มี configuration warning

Backend test เตือนว่า `asyncio_default_fixture_loop_scope` ยังไม่ได้ตั้งค่า ควรกำหนด scope ชัดเจนก่อน default ในอนาคตเปลี่ยน

### RG-19 — Low — Scientific worker log มี RDKit deprecation spam

Worker log เตือนซ้ำ `please use MorganGenerator` ควรเปลี่ยน API fingerprint รุ่นใหม่เพื่อลด log noise และเตรียมรองรับ RDKit รุ่นถัดไป

## 9. ข้อจำกัดของรอบทดสอบ

- ไม่ได้ยืนยันคำตอบจาก external AI เพราะไม่มี `GROQ_API_KEY`; ทดสอบเฉพาะ fallback และ unavailable UX
- PDF button ถูกกดและ report iframe ถูกสร้าง/ถอดออกโดยไม่มี console error แต่ automation ไม่สามารถยืนยัน native print dialog หรือคุณภาพกระดาษจริงได้ จึงควรพิมพ์ A4 ด้วยมืออีกหนึ่งรอบก่อน release
- 3D visual test เป็น interaction/screenshot regression ไม่ใช่ pixel-perfect comparison
- ไม่ได้แก้ package หรือ source code ใดนอกจากเพิ่มรายงานฉบับนี้

## 10. ลำดับแนะนำก่อน commit/release

1. แก้ RG-01 dependency security และรัน build/tests ใหม่
2. แก้ RG-02 Node save และ RG-03 legacy result navigation
3. แก้ RG-04/RG-05 เพื่อให้ API/OCR failure เป็นแบบควบคุมได้
4. แก้ RG-09/RG-10 ก่อนวัด performance ของ Graph และคลังสารซ้ำ
5. แก้ RG-11 responsive Projects และ RG-15 accessibility
6. ตัดสินใจ persistence ของ AI chat และ deleted-project history
7. รัน regression ชุดเดิมซ้ำ แล้วพิมพ์ PDF A4 จริง 1 รอบ
