# RalphLab Plan · เลือกวิธีใช้ก่อนเปิดไฟล์

**แผนทีมสำหรับวันแข่ง** เริ่มที่ [[TEAM-MVP-GUIDE|คู่มือโครงการ RalphLab สำหรับทีม]] ส่วนสมาชิกคนที่ 2 เปิด [[MEMBER-02-FE-DELIVERY|แผน Frontend, rig และ CCTV]] เพื่อดูของเดิมที่ใช้ได้ ข้อมูลที่ต้องขอจาก Backend และวิธีตรวจว่าเจ้าหน้าที่ ขวด และโหนดเปิดเหตุการณ์เดียวกัน

ก่อนเริ่ม FE เปิด [[JAY-FRONTEND-READINESS]] เพื่อดูผล build/test ของฐาน ภาพ Before และสิ่งที่ต้องยืนยันกับ Backend ก่อนใช้บัญชีเดโม

ฐานวันแข่งคือ `jay-frontend` เปิด [[JAY-FRONTEND-BASELINE]] เพื่อเก็บ Before ก่อนแก้ แล้วทดสอบให้เลือก Agent ใน Lab พิมพ์คำสั่ง และเห็นผู้รับตอบได้เป็นอย่างแรก งานที่ลองไว้ใน `jay-sandbox` ดูได้จาก [[AGENT-DEMO-PROGRESS]]

| เงื่อนไขการใช้งาน | ไฟล์แรกที่ส่งให้ Codex หรือ Claude |
|---|---|
| ใช้ได้เฉพาะ Prompt | [[AGENT-DEMO-CLAUDE-PROMPT]] ใน `Prompt-Only/` ใช้ไฟล์เดียวได้ครบ Assessment, Lab, Nodes และเกณฑ์ทดสอบ |
| ใช้โมเดลได้ แต่ต้องเขียนโค้ดใหม่ | [[AGENT-DEMO-CLAUDE-PROMPT]] กับ GLB ห้องและ Agent ที่อนุญาตตาม [[WEB-MODELS]] |
| ใช้โค้ดได้ แต่ต้องสร้างภาพหรือโมเดลใหม่ | [[CODEX-FE-MASTER]] ใช้ตัวแทนรูปทรงเรียบให้เลือก Agent และทดสอบแชตได้ตั้งแต่แรก |
| ใช้โค้ดและโมเดลที่เตรียมมาได้ | [[CODEX-FE-MASTER]] ใน `Use-Prepared/` เป็นคำสั่งตั้งต้นไฟล์เดียว มีลำดับอ่าน พาธต้นทางและปลายทาง งานที่ต้องปรับ และจุดตรวจรับ |
| ต้องการรู้ว่าอะไรตรงกับ repo และเอกสารไหนเป็นรุ่นเก่า | [[VAULT-AUDIT]] |

## แผนที่โฟลเดอร์

- **Prompt-Only/** ข้อความสร้าง FE จากศูนย์ คัดลอกไฟล์ในโฟลเดอร์นี้ได้โดยลำพัง
- **Use-Prepared/** คำสั่งสำหรับใช้ฐานเดิมและ [[PROMPTS-3D]] ซึ่งอ้างฉากและภาพที่เตรียมไว้
- **Components/** ซอร์ส V1 ใน Markdown ตามหมวด มีพาธไฟล์ dependency และตัวอย่างใช้ เริ่มที่ [[COMPONENTS-INDEX]], [[BASE-SETUP]] และ [[VERSIONS]]
- **3D/** โมเดลเว็บ ต้นฉบับ Blender ภาพอ้างอิง เท็กซ์เจอร์ และเครื่องมือผลิต ดู [[WEB-MODELS]] สำหรับไฟล์ที่เว็บโหลด, [[ROOM-INDEX]] สำหรับห้อง, [[CHARACTER-INDEX]] สำหรับ Agent และ [[STATION-INDEX]] สำหรับสถานี
- **Frontend/Agent-Demo/** ข้อตกลงของต้นแบบแชต [[AGENT-DEMO-SPEC]] ลำดับสร้าง [[AGENT-DEMO-BUILD]] และรายการทดสอบ [[AGENT-DEMO-QA]]
- **Frontend/** บันทึกงานก่อนหน้า ได้แก่ [[LAB-HANDOFF-DEMO]] สำหรับเดโมเดินตามบท และ [[FE-MVP-PLAN]] กับ [[LAB-AGENT-CHAT-PLAN]] สำหรับเหตุผลการออกแบบรุ่นแรก

ภาพใน Refs ใช้เทียบงาน โมเดลใน Web หรือไฟล์ห้อง .glb ใช้โหลดบนเว็บ และ .blend ใช้แก้ฉาก รายละเอียดที่มาดู [[SOURCE-MAP]] และบริบทโครงการเดิมดู [RalphGuard context](3D/Context/RalphGuard_Ralph_Lab_Context_and_Prompt.txt)
