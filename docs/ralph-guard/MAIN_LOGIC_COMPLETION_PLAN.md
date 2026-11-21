# แผนเติม Logic ให้ RalphGuard จากฐาน `main`

สถานะ: กำลังดำเนินการทีละหัวข้อ

Branch: `codex/main-logic-completion`

Base commit: `9bdf0c45c14f9dc1cdcb1625c6e3573c4c9d9404` (`main`)

## ความคืบหน้า

- [x] P0.1 implementation: ยกเลิกโปรเจกต์ `local-*`, แยก API error ออกจาก empty state และตรวจ project id/การมีอยู่ของโปรเจกต์ก่อนผูก assessment
- [x] P0.1 static verification: diff check ผ่าน และไฟล์ที่แก้ไม่มี TypeScript error เพิ่มเติม
- [x] P0.1 live smoke test: ผู้ใช้ยืนยันว่า create, route guard และ server unavailable ผ่าน
- [x] P0.2 core implementation: บันทึก/กู้สูตร, สาร, เปอร์เซ็นต์, selection, region, day, tab และสถานะแผงแบบ versioned แยกตาม `projectId`
- [x] P0.2 automated tests: storage isolation, normalization, invalid data และ deletion ผ่าน 4/4
- [x] P0.2 live smoke test: ผู้ใช้ยืนยันว่า F5 และ project-scoped workspace ผ่าน
- [x] P0.3A implementation: ผูกผลประเมิน, pending job, region และ input signature แยกตามกล่องสูตร พร้อม stale-request guard
- [x] P0.3A automated tests: persistence ownership และ signature invalidation รวมผ่าน 6/6
- [x] P0.3A live smoke test: ผู้ใช้อนุญาตให้ดำเนินการต่อหลังตรวจผล
- [x] P0.3B implementation: serialize/restore texture mask แยกตามกล่องสูตรและลบ mask เมื่อกล่องถูกลบ
- [x] P0.3B automated tests: paint ownership และ data URL validation รวมผ่าน 7/7
- [x] P0.3B live smoke test: ผู้ใช้ตรวจแล้วและอนุญาตให้ดำเนินการต่อ
- [x] P0.3C implementation: รวมรอยของกล่องอื่นเป็น occupied mask, แสดงรอยทุกกล่องร่วมกัน, ป้องกันแปรงทาทับ และจำกัดยางลบไว้ที่กล่องที่เลือก
- [x] P0.3C static verification: workspace tests ผ่าน 7/7 และไม่มี TypeScript error ใหม่จากไฟล์ที่แก้
- [ ] P0.3C live smoke test: รอผู้ใช้ทดสอบรอยรวม, overlap guard, ยางลบ, F5 และ project isolation
- [x] P0.4 implementation: ตรวจ precondition ก่อนประเมิน, ใช้ pixel-based `hasPaint`, กันงานซ้ำ และแจ้งผลสำเร็จ/ล้มเหลวผ่าน Toaster เดิม
- [x] P0.4 automated tests: ลำดับ validation และ workspace paint metadata รวมผ่าน 11/11
- [ ] P0.4 live smoke test: รอผู้ใช้ทดสอบทุกข้อความเตือน, งานซ้ำ, ผลสำเร็จ และ F5 หลังลบรอยหมด
- [x] P1.5 implementation: บันทึกเวลาเริ่มงาน, resume polling หลัง F5, abort เมื่อออกจากหน้า, exponential backoff และหยุดงานค้างเมื่อเกิน 15 นาที
- [x] P1.5 automated tests: polling delay/expiry และ workspace migration รวมผ่าน 13/13
- [ ] P1.5 live smoke test: รอผู้ใช้ทดสอบ F5 ระหว่างรอผล, Backend หลุด/กลับมา และการออกจากโปรเจกต์ระหว่าง polling
- [x] P1.6 implementation: โปรเจกต์ใหม่เริ่มว่าง, ไม่มีสารตัวอย่าง Ethanol/Aspirin อัตโนมัติ และรายงานไม่ใช้ sample fallback (ต่อมา P2.10 เปลี่ยนให้โหนดสร้างจากกล่องสูตรที่เลือกตาม requirement ล่าสุด)
- [x] P1.6 automated tests: เลือก completed assessment ล่าสุดและยืนยันว่าไม่มีรายงานเมื่อยังไม่มีผล รวมผ่าน 15/15
- [ ] P1.6 live smoke test: รอผู้ใช้ทดสอบโปรเจกต์ใหม่, โหนดว่าง, รายงานจริง/ไม่มีผล และ Backend unavailable
- [x] P1.7 implementation: ลิงก์รายงานระบุ assessmentId, หน้า results/history ส่ง ID ชัดเจน และ Backend ตรวจ assessment ownership ต่อ project
- [x] P1.7 automated tests: frontend logic 15/15 และ backend ownership 2/2
- [ ] P1.7 live smoke test: รอผู้ใช้ทดสอบรายงานจาก results/history, URL ไม่มี ID และ ID ข้ามโปรเจกต์
- [x] P2.8 implementation: แยก `lib/formula-csv.ts`, validate schema/row/percent/total/limit/duplicate และ replace เฉพาะกล่องที่เลือกตอนเริ่มนำเข้า
- [x] P2.8 automated tests: CSV delimiters, aliases, quoted fields, malformed data, duplicate และ row limit รวม regression ผ่าน 21/21
- [ ] P2.8 live smoke test: รอผู้ใช้ทดสอบไฟล์ถูกต้อง, ข้อมูลผิด, duplicate, สลับกล่องระหว่างอ่าน และ F5
- [x] P2.9 implementation: กำหนด OCR เป็น replace, ผูกผลกับกล่อง/โปรเจกต์ต้นทาง, abort request เมื่อปิด และรายงาน duplicate/ไม่มี SMILES/ไม่ได้เลือก/จับคู่ไม่ได้
- [x] P2.9 automated tests: กติกา replace, water, duplicate, partial success, invalid concentration และผลรวมเกิน 100% รวม regression ผ่าน 25/25
- [ ] P2.9 live smoke test: รอผู้ใช้ทดสอบ replace, partial success, ปิดระหว่างสแกน, เปลี่ยนกล่อง/โปรเจกต์ และ F5
- [x] P2.10 implementation: บันทึก nodes/edges/viewport/result แยกตาม project และ formula, แสดงกราฟของกล่องที่เลือก และ sync สารระหว่างกล่องกับ chemical nodes
- [x] P2.10 automated tests: graph build/sync/invalidation, empty-formula cleanup, formula ownership, corrupt-data normalization และ regression รวมผ่าน 32/32
- [ ] P2.10 live smoke test: รอผู้ใช้ทดสอบสูตร A/B, sync สองทาง, layout/result persistence, F5 และ project isolation
- [x] P3.11 implementation: เพิ่ม route loading/error boundary, caller abort signal, latest-request guard, stale-response protection และ secret-safe error logging
- [x] P3.11 automated tests: signal forwarding, timeout message, request supersession/cancel, abort filtering, secret-safe logging และ regression รวมผ่าน 38/38
- [ ] P3.11 live smoke test: รอผู้ใช้ทดสอบเปลี่ยน route/filter ระหว่างโหลด, กด mutation ซ้ำ, เปลี่ยนสูตรระหว่างเริ่มประเมิน และ Backend unavailable
- [x] P3.12 implementation: แยก project route parser, normalize/reject ชื่อโปรเจกต์ว่างที่ Backend และตรวจ stale polling ด้วย job ID + input signature
- [x] P3.12 automated tests: project create success/failure, invalid route IDs, stale polling response และ regression ผ่าน frontend 43/43 + backend 15/15
- [ ] P3.12 live smoke test: รอผู้ใช้ทดสอบชื่อโปรเจกต์ว่าง, invalid project URL และแก้สูตรระหว่าง polling

หมายเหตุการตรวจ P0.1: `npm run type-check` ยังไม่ผ่านจาก error เดิมใน `src/components/TrendChart.tsx` ซึ่งอยู่นอก diff ของงานนี้ จึงยังไม่แก้เพื่อรักษาขอบเขตงาน logic และ UI freeze

## ขอบเขตที่ห้ามเปลี่ยน

- ใช้โค้ดและ UI ของ `main` เป็นฐานทั้งหมด
- ห้ามนำหน้า, component, JSX, CSS, layout, สี, spacing, animation หรือรูปแบบ UI จาก `integrate-ui` มาใช้
- ห้ามปรับหน้าตา UI ของ `main` ระหว่างงาน logic แม้จะเห็นจุดที่ควรปรับ ให้บันทึกไว้เป็นข้อเสนอแยกเท่านั้น
- เปิดดู `integrate-ui` ได้เฉพาะ logic, pure function, type, validation, state machine, persistence pattern และ test ที่ช่วยลดการเขียนซ้ำ
- ถ้าจำเป็นต้องเพิ่ม feedback เช่น loading, error หรือ toast ให้ใช้ component และรูปแบบเดิมที่มีอยู่ใน `main` โดยไม่ออกแบบ UI ใหม่
- Logo, emoji และการเปลี่ยนเป็น icon จัดเป็นงาน UI/asset จึงพักไว้ก่อน จนกว่าจะได้รับคำสั่งแยกอย่างชัดเจน

## หลักการของระบบ

- Backend/PostgreSQL เป็นแหล่งข้อมูลหลักของโปรเจกต์และผลประเมิน
- `localStorage` ใช้เป็น draft cache ของ workspace เพื่อให้ F5 แล้วงานไม่หาย ไม่ใช้สร้างโปรเจกต์ปลอมแทน backend
- ข้อมูลใน `localStorage` ต้องมี version และแยก key ตาม `projectId` เพื่อไม่ให้ข้อมูลข้ามโปรเจกต์
- ผลประเมินต้องผูกกับสูตรและ input ที่ใช้ประเมินจริง ไม่ใช้ผลชุดเดียวร่วมกันทุกกล่องสูตร
- เมื่อสูตรหรือเปอร์เซ็นต์เปลี่ยน ผลเดิมต้องถูกระบุว่าใช้ไม่ได้และไม่แสดงเหมือนยังเป็นผลล่าสุด
- โหมดโหนดเป็นอีกมุมมองของกล่องสูตรที่เลือก: chemical nodes ต้อง sync สองทางกับสารของกล่องนั้น แต่ layout, edge, viewport และผลโหนดยังคงบันทึกแยกต่อกล่อง
- ห้ามใช้ข้อมูลตัวอย่างเป็น fallback โดยผู้ใช้ไม่รู้ หาก backend ล้มเหลวต้องแสดงสถานะผิดพลาดตามจริง

## ลำดับความสำคัญ

### P0 — ความถูกต้องและการไม่สูญหายของข้อมูล

#### 1. ทำให้การสร้างและเปิดโปรเจกต์เชื่อถือได้

- ยกเลิก fallback ที่สร้าง id รูปแบบ `local-*` แต่ไม่ได้บันทึกจริง
- ตรวจว่า route `/assess/[projectId]` อ้างถึงโปรเจกต์ที่มีอยู่จริง
- แยกสถานะ API error ออกจากกรณีที่ผู้ใช้ยังไม่มีโปรเจกต์
- ห้ามพาผู้ใช้เข้าสู่ workspace ที่ไม่สามารถบันทึกกลับได้

เกณฑ์ผ่าน:

- สร้างโปรเจกต์สำเร็จแล้วเปิดซ้ำได้
- สร้างไม่สำเร็จแล้วไม่เกิดโปรเจกต์ลวง
- URL ที่ project id ไม่ถูกต้องมีพฤติกรรมที่ชัดเจน

#### 2. บันทึกและกู้ workspace แยกตามโปรเจกต์

ข้อมูลขั้นต่ำที่ต้องเก็บ:

- กล่องสูตร, ชื่อสูตร และกล่องที่เลือก
- รายการสาร, SMILES และเปอร์เซ็นต์
- บริเวณทดสอบ
- ผลประเมินล่าสุดของแต่ละกล่องสูตร
- Day 1/3/7 ที่เลือก
- สีและไอคอนของกล่อง หาก `main` รองรับข้อมูลนี้อยู่แล้ว
- งานประเมินที่กำลังรอผล
- ข้อมูลการทาบนโมเดล แยกเจ้าของตามกล่องสูตร
- โหนด, เส้นเชื่อม และตำแหน่งบน canvas ของโหมดโหนด

แนวทาง:

- สร้าง schema แบบ versioned เช่น `ralphguard:workspace:v1:<projectId>`
- validate และ normalize ข้อมูลก่อน restore
- autosave แบบ debounce และ flush ก่อนออกจากหน้า
- ถ้าข้อมูลเสีย ให้คืนค่าเฉพาะส่วนที่ปลอดภัย ไม่ทำให้ทั้งหน้าพัง

อ้างอิงจาก `integrate-ui` ได้เฉพาะแนวคิดของ `normalizeWorkspace`, `getProjectWorkspace` และ `saveProjectWorkspace` แล้วปรับให้เข้ากับ data model ของ `main`; ห้ามคัดลอก UI หรือระบบ local project มาทับ backend

เกณฑ์ผ่าน:

- F5 แล้วข้อมูลทั้งหมดข้างต้นไม่หาย
- เปิดโปรเจกต์อื่นแล้วข้อมูลไม่ปะปน
- กลับมาโปรเจกต์เดิมแล้ว restore ได้

#### 3. ผูกผลประเมินกับ input และกล่องสูตรอย่างถูกต้อง

- แยก `resultByFormulaId` และ `jobByFormulaId`
- สร้าง assessment input signature จากสูตร, รายการสาร, SMILES, concentration และบริเวณทดสอบ
- เมื่อเพิ่ม/ลบสาร, แก้เปอร์เซ็นต์, เปลี่ยนบริเวณ หรือเปลี่ยน input ที่มีผลต่อการคำนวณ ให้ invalidate เฉพาะผลของกล่องนั้น
- การเลือกกล่องอื่นต้องไม่ลบผลหรืออาการของกล่องก่อนหน้า
- บนโมเดลสามารถเก็บรอยหลายกล่องพร้อมกัน แต่ห้ามทับตำแหน่งที่กล่องอื่นครอบครอง

เกณฑ์ผ่าน:

- ผลไม่ย้ายข้ามกล่องสูตร
- แก้สูตรแล้วไม่แสดงผลเก่าเป็นผลปัจจุบัน
- สลับกล่องแล้วผลและรอยเดิมยังอยู่

#### 4. สร้าง state machine สำหรับการเริ่มทดสอบ

ตรวจตามลำดับ:

1. มีโปรเจกต์ที่ใช้ได้
2. เลือกกล่องสูตรแล้ว
3. กล่องมีสารอย่างน้อยหนึ่งรายการ
4. ข้อมูลสารและ SMILES ผ่าน validation
5. สัดส่วนรวมไม่เกิน 100%
6. มีรอยทาของกล่องนั้นบนโมเดล
7. รอยไม่ทับกับกล่องอื่น
8. ไม่ได้ส่งงานประเมินซ้ำระหว่างงานเดิมกำลังทำ

ปุ่มยังคงกดได้เพื่อให้ระบบแจ้งสาเหตุผ่าน Toaster เดิมของโปรเจกต์ เช่น ยังไม่เลือกกล่อง, ยังไม่มีสาร หรือยังไม่ได้ทาบนโมเดล เมื่อสำเร็จให้แจ้งว่าการวิเคราะห์เสร็จสิ้น

เกณฑ์ผ่าน:

- ทุก precondition ให้ข้อความที่ชัดเจนเพียงหนึ่งสาเหตุหลักต่อครั้ง
- ไม่ส่ง request ที่ invalid ไป backend
- request ที่ถูกต้องสร้างผลเพียงหนึ่งงาน

### P1 — ความต่อเนื่องและความจริงของผลลัพธ์

#### 5. กู้สถานะงานประเมินหลัง F5

- บันทึก job id, formula id, input signature และเวลาที่เริ่ม
- หลัง restore ให้กลับไป polling งานที่ยังไม่จบ
- ใช้ retry/backoff, timeout และ abort เมื่อเปลี่ยนโปรเจกต์หรือ input
- ป้องกัน response เก่ากลับมาทับผลของสูตรใหม่

#### 6. ลบข้อมูลจำลองและ fallback ที่ทำให้ผู้ใช้เข้าใจผิด

- โหมดโหนดต้องเริ่มตามข้อมูลของตัวเอง ไม่สร้าง Ethanol/Aspirin อัตโนมัติเมื่อว่าง
- หน้ารายงานและผลประเมินต้องไม่ใช้ sample result เมื่อ backend ล้มเหลว
- error, empty และ loading ต้องเป็นคนละสถานะ

#### 7. ทำให้รายงานอ้างถึงผลจริง

- เปิดรายงานด้วย `assessmentId` ที่ชัดเจน
- แสดงชื่อโปรเจกต์จริงและผลของกล่องสูตรที่เลือก
- ป้องกัน report ของโปรเจกต์หนึ่งเปิดปะปนกับอีกโปรเจกต์

### P2 — ความครบถ้วนของเครื่องมือนำเข้าและโหมดโหนด

#### 8. ทำ CSV Import ให้เป็น logic กลาง

- แยก parser เป็น `lib/formula-csv.ts`
- รองรับ `name`, `smiles`, `concentration`
- ตรวจ header, ค่าว่าง, ชนิดตัวเลข, ช่วงเปอร์เซ็นต์, ผลรวม และจำนวนแถวสูงสุด
- ตรวจสารซ้ำและกำหนดนโยบาย merge/skip ที่แน่นอน
- นำเข้ากล่องสูตรที่เลือกเท่านั้น

สามารถศึกษา pure parser และ validation จาก `integrate-ui` ได้ แต่ห้ามนำ modal, button หรือ UI CSV ของ branch นั้นมาใช้

#### 9. ทำ OCR ให้มีพฤติกรรมแน่นอน

- กำหนด merge/replace อย่างชัดเจน
- ตรวจ duplicate และสารที่หา SMILES ไม่เจอ
- ยกเลิก request ได้เมื่อปิดหรือเปลี่ยนโปรเจกต์
- OCR สำเร็จบางส่วนต้องรายงานรายการที่นำเข้าไม่ได้ตามจริง

#### 10. บันทึกโหมดโหนดตามกล่องสูตรที่เลือก

- โหมดโหนด sync รายการสารกับกล่องสูตรที่กำลังเลือกเท่านั้น
- เลือกสูตร A/B แล้วต้องเห็น graph และสารของสูตรนั้น โดยข้อมูลไม่ข้ามกล่อง
- การเพิ่ม ลบ หรือแก้ chemical node ต้องอัปเดตกลับไปยังกล่องสูตรเจ้าของกราฟ
- บันทึก node, edge, node data, viewport และผลของโหนดประเมินแยกตาม project และ formula
- เปิดโปรเจกต์หรือกล่องสูตรใหม่แล้วสร้าง graph จากสารของกล่องนั้น โดยไม่ใช้ graph ของกล่องอื่น

### P3 — ความทนทานและการทดสอบ

#### 11. เพิ่ม route และ request reliability

- เพิ่ม loading/error boundary โดยใช้รูปแบบเดิมของ `main`
- abort fetch เมื่อ component unmount หรือเปลี่ยน route
- ป้องกัน double submit และ stale async update
- log error ให้พอวิเคราะห์ได้โดยไม่เปิดเผย secret

#### 12. เพิ่ม automated tests สำหรับ logic สำคัญ

- project creation และ invalid project id
- workspace serialize/restore/migration/corrupt data
- assessment signature และ invalidation
- per-formula job/result ownership
- precondition และ Toaster reason
- CSV parser, duplicate และ invalid rows
- OCR merge rules
- polling resume, timeout และ stale response
- project isolation

## งานที่พักไว้นอกขอบเขต

- การเปลี่ยน layout, สี, spacing, typography หรือ animation
- การนำ component หรือหน้าใด ๆ จาก `integrate-ui` มาใช้
- การเปลี่ยน logo
- การแทน emoji ด้วย icon
- การปรับหน้าตา loading, toast, CSV, OCR, report หรือโหนด

รายการเหล่านี้ต้องได้รับคำสั่งแยกก่อนเริ่ม และไม่ควรปะปนใน commit ของงาน logic

## วิธีทำงานทีละส่วน

ในแต่ละหัวข้อให้ทำตามลำดับนี้:

1. ตรวจโค้ด `main` และระบุปัญหาที่พิสูจน์ได้
2. ระบุไฟล์ที่จะเปลี่ยน, data contract และ acceptance criteria ก่อนแก้
3. ถ้าจะอ้างอิง `integrate-ui` ให้ระบุชื่อ logic ที่นำแนวคิดมาใช้ และยืนยันว่าไม่มี UI ถูกคัดลอก
4. ลงมือเฉพาะหัวข้อเดียว
5. รัน typecheck, lint และ test ที่เกี่ยวข้อง
6. ทดสอบ flow จริงและ F5/project isolation เมื่อเกี่ยวข้อง
7. เขียนคู่มือทดสอบด้วยตัวเอง โดยระบุ URL, สิ่งที่ต้องกดหรือกรอก, ผลที่ควรเห็น และกรณีผิดพลาดที่ต้องลอง
8. สรุป diff และรอทบทวนก่อนเริ่มหัวข้อถัดไป

## จุดเริ่มต้นที่แนะนำ

เริ่มจากหัวข้อ 1: ทำให้การสร้างและเปิดโปรเจกต์เชื่อถือได้ เพราะ project identity เป็นฐานของ persistence, assessment, report และการแยกข้อมูลทุกส่วน หากส่วนนี้ยังไม่แน่น การทำ autosave หรือผลประเมินต่อจะเสี่ยงผูกข้อมูลผิดโปรเจกต์
