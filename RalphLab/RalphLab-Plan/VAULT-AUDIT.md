---
title: ตรวจ Vault กับซอร์สของ Ralph Lab
date: 2026-11-20
tags: [ralphlab, inventory]
---

# ตรวจ Vault กับซอร์สของ Ralph Lab

ตรวจจากไฟล์บนดิสก์ใน checkout `jay-sandbox` ก่อนจัดโครงสร้าง พบ 162 ไฟล์ใน RalphLab-Plan รวม Markdown 78 ไฟล์ ส่วนโฟลเดอร์ RalphLab/3D ที่อยู่นอก RalphLab-Plan มีแต่โฟลเดอร์ย่อยว่าง ขอบเขตการนับไม่รวมค่าตั้งส่วนตัวของ Obsidian ใน .obsidian

| สิ่งที่ตรวจ | ผล | ขอบเขตของคำว่าใช้ต่อได้ |
|---|---|---|
| ความซ้ำภายในแผน | จัดกลุ่มทั้ง 162 ไฟล์ด้วย SHA-256 ไม่มีคู่ที่เนื้อหาเหมือนกันทุกไบต์ | เอกสารซ้ำเชิงความหมายยังมีตามตารางด้านล่าง |
| ซอร์ส V1 ใน Components | อ่าน frontmatter `file` และเทียบบล็อก “โค้ด V1” กับไฟล์นั้นใน repo โดยปรับ BOM, CRLF และช่องว่างท้ายไฟล์ พบว่าตรงกัน 59/59 | ใช้เป็นสำเนาซอร์สได้ตามเวอร์ชัน ต้องมี dependency และไฟล์ประกอบของแต่ละชิ้น |
| ความละเอียดของโน้ต Component | 59/59 มีหน้าที่ใช้ ไฟล์ที่ต้องมี การติดตั้ง ตัวอย่างใช้ และโค้ด V1 มี 11 ไฟล์ที่ใช้ชื่อหัวข้อ “Props” ตรงตัว | ใช้ type/export ในบล็อกโค้ดช่วยตรวจ interface ของแต่ละชิ้น ตัวเลข gzip ใน index เป็นการวัดครั้งก่อน ซึ่งยกเว้น dependency บางตัว |
| ห้องและ Agent ใน WEB-MODELS | SHA-256 ตรงกับสำเนาใน frontend/public/models ครบ 6/6 (ห้องหนึ่งไฟล์ ตัวละครห้าไฟล์) | ยืนยันตัวไฟล์ตรงกัน การเข้าฉาก เวลาโหลด เฟรมเรต และการส่งของยังต้องทดสอบในเว็บตามอุปกรณ์ |
| ลิงก์ทรัพยากร | พบลิงก์ไป default.jpeg ซึ่งไม่มีใน Vault แก้เป็นข้อความประวัตินำเข้าใน SOURCE-MAP | นับโครงสร้างห้องจาก GLB ปัจจุบัน การตรวจลิงก์ Markdown ไม่ครอบคลุม texture ที่ Blender อ้างภายใน binary |

## ถ้ามีเฉพาะ Vault จะกู้ Component ตัวไหนได้บ้าง

ตรวจ import/export ของไฟล์ TypeScript ตามพาธในโน้ต V1 ทั้ง 59 ชิ้น รวมการไล่ผ่านชิ้นที่มี snapshot และโค้ด `src/lib/utils.ts` ใน [[BASE-SETUP]] พบว่า **47 ชิ้นมีซอร์สของ local imports ครบตามการตรวจนี้** เช่น Button, Avatar, FormulaCard และ ScoreCard อีก **12 ชิ้น** อ้างไฟล์ที่ต้องนำมาจาก repo หรือสร้างทดแทน ตารางแสดงจุดแรกที่ขาด โดยทุกพาธเริ่มจาก `frontend/src/lib/` เมื่อได้ไฟล์เหล่านี้แล้วต้องตรวจ import ของไฟล์ที่นำมาเพิ่มด้วย

| โน้ตของชิ้นที่ต้องการ | โมดูลภายนอกชุด snapshot ที่พบ |
|---|---|
| VoiceAssistant | assistant-history.ts, assistant-typing.ts, request-reliability.ts |
| PaintSymptomModel, SymptomFaceCanvas | face-region-map.ts, project-workspace.ts |
| CsvImportModal | api.ts, catalog.ts, formula-csv.ts |
| FormulaGraph | api.ts, catalog.ts, formula-graph.ts, project-workspace.ts |
| LabelScanModal | api.ts, catalog.ts, ocr-concentration-estimation.ts |
| LabScene, ScrollStory | landing/scroll.ts, landing/story.ts |
| SmoothScroll | landing/scroll.ts |
| ManualSubstanceModal | api.ts, manual-substance.ts, pubchem-online.ts |
| SubstanceHoverCard | api.ts, catalog.ts |
| SubstanceLibraryPage | api.ts, catalog.ts, manual-substance.ts, pubchem-online.ts, request-reliability.ts, substance-library-local.ts |

ตัวเลขนี้วัดความครบของซอร์ส V1 ฝั่ง local imports เท่านั้น การเปิดใช้งานยังขึ้นกับ npm packages, CSS และธีม, providers, public assets และบริการข้อมูลของแต่ละหน้า หากต้องเตรียมชุดที่รันได้จาก Vault เพียงอย่างเดียว ให้ซ้อมจากโฟลเดอร์ว่างด้วยเส้นทางที่จะใช้จริงในงาน เช่น เปิดห้อง → คลิก Agent → ส่งข้อความ → รับของ → เปิดผลใน Nodes จดไฟล์ที่ขาดระหว่างทางและผลทดสอบของ checkout นั้นใน [[AGENT-DEMO-QA]]

## เนื้อหาที่คล้ายกันและไฟล์ที่ให้ถือเป็นหลัก

| อ่านแล้วอาจเข้าใจว่าซ้ำกัน | ความต่างและคำตัดสิน |
|---|---|
| FE-MVP-PLAN / LAB-AGENT-CHAT-PLAN / AGENT-DEMO-SPEC | สองไฟล์แรกเป็นที่มาของร่างแชตและ Nodes เช่น คำถามแนะนำหรือแสดง draft ในผัง ให้ใช้ SPEC ล่าสุดสำหรับแชตกลุ่มและจังหวะเผยแพร่ Node |
| LAB-HANDOFF-DEMO / AGENT-DEMO-BUILD / AGENT-DEMO-QA | ไฟล์แรกบอกพฤติกรรมเดโมที่เดินตามลำดับ ส่วน BUILD เป็นวิธีสร้างงานตามคำสั่งผู้ใช้และ QA เป็นกรณีที่ต้องพิสูจน์ รายการใน QA ยังไม่ใช่ผลผ่าน |
| SPEC / Prompt-Only | มีข้อกำหนดซ้ำโดยตั้งใจ เพราะ Prompt ต้องใช้งานได้เมื่อแยกจาก Vault หากเปลี่ยนกติกาส่งงาน ให้แก้ทั้งคู่แล้วตรวจกรณีรับงานซ้ำ |
| WEB-MODELS / ROOM-INDEX / CHARACTER-INDEX / SOURCE-MAP | WEB-MODELS ใช้คัดไฟล์ลงเว็บ ดัชนีเฉพาะทางใช้เลือก asset และคลิป ส่วน SOURCE-MAP ใช้ย้อนที่มา ไฟล์ GLB ใน Vault ซ้ำกับ repo โดยตั้งใจ |
| FormulaGraph / NODES_LINEAGE_TASK / SPEC | FormulaGraph ใน Components เป็น snapshot ของ editor เดิม เอกสารใน repo ระบุโครงหน้าผัง ส่วน SPEC กำหนดให้ขึ้นรุ่นหลังปิดผล การมี editor หรือเอกสารออกแบบยังไม่ยืนยันว่าหน้าสายสูตรใหม่เสร็จ |

## สิ่งที่มีแล้วและสิ่งที่ยังต้องทำ

- **อยู่ใน Vault แล้ว** ซอร์ส Component V1 จำนวน 59 ชิ้น GLB ตาม WEB-MODELS ต้นฉบับ Blender ภาพอ้างอิง แผน QA และเครื่องมือ Blender ตามดัชนี วันที่ 20 พ.ย. เพิ่ม [ชุดซอร์ส Lab และแชตที่ใช้บนฐานวันแข่ง](Use-Prepared/Lab-Chat-Rehearsal.zip) วิธีนำเข้าดู [[CODEX-FE-MASTER]]
- **มี implementation ใน repo** การโหลดห้อง การเดิน การเปิดแชตของแต่ละบทบาท การควบคุมกล้อง สถานี ถาด และการเก็บประวัติขวด ค้นพาธใน [[CODEX-FE-MASTER]] โค้ดเฉพาะเหล่านี้ไม่ได้เก็บเป็น snapshot ทั้งระบบใน Components
- **ฐานวันแข่ง** [[JAY-FRONTEND-BASELINE]] ระบุผู้ช่วยบน Assessment กับ editor เดิมใน Nodes ให้เปิด Lab และส่งข้อความได้ก่อนเปลี่ยนสองจุดนี้
- **ผลซ้อมใน sandbox** ตรวจการส่งมอบ การตอบรับซ้ำ checklist และกลุ่มแยกตามงานแล้ว ผลรันอยู่ใน [[AGENT-DEMO-PROGRESS]] ส่วนการซิงก์ท่าเดิน ขวด และสายสูตรกับเหตุการณ์จากคำสั่งเดียวกันยังต้องทำและทดสอบ

เก็บไฟล์ร่างและต้นฉบับไว้เพื่อย้อนการตัดสินใจ การลบยังไม่มีประโยชน์ชัดเมื่อเทียบกับการแยกสถานะที่จุดเข้าใช้งาน
