---
title: ฐาน jay-frontend และหลักฐาน Before–After ของ Lab
tags: [ralphlab, frontend, baseline]
date: 2026-11-20
baseline_commit: 9218cb59ed015be95587e055521bdad04d0e1714
---

# เริ่มแข่งขันจาก jay-frontend

จุดเริ่มที่ตรวจจาก Git คือ `9218cb59ed015be95587e055521bdad04d0e1714` เปิด Assessment และ Nodes เดิมได้จากหน้า Studio ตามโค้ดที่ commit ไว้ งานแรกที่จะเพิ่มคือเปิด Lab ในโครงการเดิม เลือก Agent พิมพ์ข้อความ และเห็นคำตอบในบทสนทนาที่ถูกต้อง เกณฑ์ถัดไปคือพิสูจน์ว่าใครรับงานต่อจากใครได้จริง

## สิ่งที่ตรวจได้จาก Git

| รายการ | ผลตรวจวันที่ 20 พ.ย. 2569 |
|---|---|
| `jay-frontend` และ `origin/jay-frontend` ในเครื่อง | ทั้งคู่ชี้ `9218cb59ed015be95587e055521bdad04d0e1714` คำอธิบาย commit คือ `Remove the description line from the project list` การตรวจนี้อ่าน remote-tracking ref ที่มีในเครื่อง |
| `jay-sandbox` ที่เปิดทำงาน | HEAD คือ `ddd97e19ecda49d8cd7b696a914e04a4a0144cf3` มี 2 commits ต่อจากฐานและมีไฟล์ frontend ต่างกัน 68 รายการเมื่อเทียบ **เฉพาะ commits** |
| ไฟล์ที่อยู่ในเครื่อง | checkout `jay-sandbox` มีทั้ง staged, unstaged และ untracked รวมถึงงานของคนอื่น ตัวเลข 68 ข้างต้นจึงใช้แทนจำนวนไฟล์ของเดโมที่กำลังพัฒนาไม่ได้ |
| Worktrees | workspace หลักอยู่ `jay-sandbox` อีก checkout อยู่ที่ `94b507c2abe7913c3bd6b1c45958d14ea6561c67` แบบ detached ขณะตรวจ `jay-frontend` ไม่มี worktree เปิดค้าง |

## สิ่งที่ควรเก็บและจุดที่ต้องเปลี่ยน

พาธในตารางเป็นพาธจริงใต้ `frontend/` ของ **baseline commit** สามารถอ่านไฟล์เก่าด้วย `git show` แม้ checkout ปัจจุบันมีโค้ดใหม่กว่า

| พื้นที่ | หลักฐานจากไฟล์เดิม | แนวทางวันแข่ง |
|---|---|---|
| ทางเข้าโครงการ | `src/app/(dashboard)/projects/[id]/assess/page.tsx` ตรวจ project ID แล้วส่งไป `/assess?projectId=<id>` ส่วน `src/app/(dashboard)/assess/page.tsx` มีตัวเลือก Assessment และ Nodes | เพิ่ม Lab ที่โครงการเดิม ส่ง project ID ลงห้องและแชต ทดสอบสลับสองโครงการเพื่อจับข้อความข้ามโครงการ |
| Assessment | `src/app/(dashboard)/assess/page.tsx` มีทั้งกล่อง/การนำเข้าสูตร แสดงผล และจุด mount `<VoiceAssistant>` ที่บรรทัด 3392 ของ commit ฐาน | เก็บขั้นตอนนำเข้าและประเมินสูตรไว้ ย้ายประสบการณ์แชตไป Lab ด้วยการถอดจุดแสดงผู้ช่วยบนหน้าเดิมหลัง Lab พิมพ์ตอบได้ ตรวจ callers ก่อนจัดการ callback เดิม |
| ผู้ช่วยเก่า | `src/components/assistant/VoiceAssistant.tsx`, `src/lib/assistant-history.ts`, `src/lib/assistant-typing.ts` และ `runAssistantAction` ในหน้า Assessment | ใช้ UI/utility เฉพาะส่วนที่ตรงกับแชตใหม่ กำหนดขอบเขตประวัติด้วยผู้ใช้ โครงการ และเธรด คำสั่งเดิมที่แก้สูตรใน Assessment ต้องแยกจากข้อความเดโม |
| Nodes รุ่นก่อน | `src/components/formula/FormulaGraph.tsx` รับ `onNodesChange`, `onEdgesChange`, `onConnect` และมี `removeNode` ส่วน `src/lib/project-workspace.ts` เก็บชนิดโหนด substance/modifier/result | เก็บข้อมูลและตัวอ่านรุ่นเก่าไว้ สร้างมุม lineage อ่านอย่างเดียวด้วยข้อมูล parent version ของการทดลอง ตรวจเปิด project เก่าหลังเปลี่ยนหน้า และตรวจว่าคลิกโหนดใหม่ไม่แก้สูตร |
| 3D | `src/components/landing/LabScene.tsx` โหลด `/models/Lab_room.glb` สำหรับหน้า Landing ใน `public/models` ของฐานมี `Lab_room.glb`, `head.glb`, `human.glb`, `head-region-map.png` | เก็บ Landing และ asset ที่ใช้เดิมไว้ แยก loader ของ Lab ออกจาก Landing เพราะห้องสามห้องและ Agent 5 บทบาทใช้ asset คนละชุด |
| Dependencies | `package.json` มี Next 14.2.13, `three`, `@react-three/fiber`, `@react-three/drei`, `gsap` และ `reactflow` | ใช้แพ็กเกจเดิมสำหรับ MVP ตรวจ imports ของส่วนที่จะคัดลอกทีละ feature ก่อนอัปเดต dependencies ของฐาน |

ไม่มีพาธ `src/lib/lab-demo/`, `src/components/three/skincare-lab/`, หน้า `/lab-room` หรือ Vault `RalphLab/RalphLab-Plan/` ใน tree ของฐาน จึงควรตัดการแสดง UI เก่าที่ถูกแทนที่เฉพาะจุดเมื่อเส้นทางใหม่ผ่าน QA ส่วน Login และ Landing เก็บเป็นหลักฐาน Before ได้เลย ไม่มีรายการที่จำเป็นต้องลบทันทีเพื่อเริ่มงาน

## แหล่งงานเตรียมและสิทธิ์ในการใช้

[[WEB-MODELS]] ชี้ทั้งต้นทางใน Vault และปลายทางของเว็บ ตรวจ SHA-256 แบบคู่แล้วไฟล์ห้อง `Lab_room_3room.glb` กับ Agent ทั้งห้า (`director`, `researcher`, `formulator_station`, `analyst_station`, `evaluator`) ตรงกับไฟล์ใน `frontend/public/models` ของ working tree ทั้ง 6 คู่ การตรวจนี้ยืนยันตัวไฟล์ ส่วนความลื่นต้องวัดในเบราว์เซอร์บนเครื่องที่ใช้เดโม

| สิ่งที่ผู้จัดอนุญาต | วิธีเริ่มให้พิมพ์แชตได้ก่อน |
|---|---|
| โค้ดและโมเดล | เปิด [[CODEX-FE-MASTER]] และ [[WEB-MODELS]] คัดลอกเฉพาะ dependency chain ของห้อง + chat + demo และ asset ที่ loader ใช้ แล้วตรวจ `projectId` จากหน้าเดิม |
| เฉพาะโมเดลกับ prompt | นำ GLB จาก [[WEB-MODELS]] สร้าง Lab กับแชตใหม่จาก [[AGENT-DEMO-CLAUDE-PROMPT]] ใช้ข้อความจำลองหนึ่งรอบก่อนเชื่อม handoff |
| ใช้ prompt ได้ แต่ใช้โค้ดและโมเดลเตรียมไม่ได้ | ใช้ [[AGENT-DEMO-CLAUDE-PROMPT]] ประกอบฉากพื้น โต๊ะ และตัวแทน Agent ที่เลือกได้ในงาน แล้วเดิน flow พิมพ์ → ตอบ → ส่งมอบ ด้วยอินเทอร์เฟซเดิม |
| โค้ดใช้ได้ แต่ใช้โมเดลเตรียมไม่ได้ | เปิด [[CODEX-FE-MASTER]] นำส่วนแชตกับ event model มาใช้ และผูก Agent ID เข้ากับตัวแทนที่สร้างในงาน |

[[AGENT-DEMO-PROGRESS]] ระบุสิ่งที่เคยผ่านการทดสอบใน sandbox และสิ่งที่ยังค้าง เส้นทางปกติของ demo ที่เตรียมไว้คือ `/lab-room?agentDemo=1` หรือเปิดแท็บ Lab ใน `/assess?projectId=<id>&agentDemo=1` ทดลองด้วยข้อมูลจำลอง `frontend/src/lib/lab-demo/` การเดินตามลำดับสำเร็จรูปของฉาก กับการรับ handoff ในเธรด เป็นคนละเหตุการณ์ เวลานำเสนอให้ใช้ sender, recipient, task/handoff ID และสถานะ accepted เป็นหลักฐานการส่งมอบ

## วิธีเก็บ Before–After โดยย้อนตรวจได้

1. **ก่อนวันแข่ง** ยึด SHA ด้านบนเป็นฐานที่ตรวจวันนี้ ถ้า `jay-frontend` เดินหน้าก่อนเริ่ม ให้บันทึก SHA จริงตอนเริ่มและรายการที่เพิ่มระหว่างสอง SHA แยกไว้ Git SHA ย้อนดูไฟล์ tracked ได้ ส่วนภาพ Before ต้องถ่ายจากตัวแอปของฐานนั้น
2. **ก่อนแก้บรรทัดแรก** เปิด checkout สะอาดของ SHA วันเริ่มในโฟลเดอร์แยก เก็บภาพหน้า `/assess?projectId=<id>` ทั้งแท็บ Assessment และ Nodes รวมถึง Landing ที่มีห้องเก่า กำกับ SHA, route, project fixture, viewport, browser, zoom และเวลาไว้ข้างภาพ ใช้บัญชีทดสอบเดียวกันทั้งสองรอบ
3. **ทำ Lab ก่อน** เช็คการส่งข้อความส่วนตัวและตอบในเธรดเดียวกัน จากนั้นทดสอบงานที่ต้องเพิ่ม Agent คนที่สาม เปิดกลุ่มชื่องาน เห็นรายชื่อสมาชิก ข้อความล่าสุดและผู้รับงาน ตรวจว่าสลับกลับห้องส่วนตัวแล้วยังพบข้อความเดิม ทำกรณี handoff ซ้ำ 1 ครั้งแล้วจำนวนงานไม่เพิ่ม ใช้ [[AGENT-DEMO-QA]] ตรวจรายละเอียด
4. **เมื่อทดสอบ After** บันทึก SHA ที่รวมงานจริง ถ้ามีไฟล์ยังไม่ได้ commit ให้ระบุว่าเป็น working-tree preview และภาพยังทำซ้ำด้วย SHA อย่างเดียวไม่ได้ ถ่ายหน้าฐานซ้ำตามเงื่อนไขเดิม แล้วถ่ายเพิ่มเฉพาะ Lab, เธรดกลุ่ม, สมาชิก และ handoff ใช้ข้อความทดสอบเดียวกันสำหรับการรันทวน
5. **เก็บผลตรวจแยกจากแผน** จดผู้ทดสอบ สถานะผ่าน/ตก และหลักฐานของแต่ละกรณี รวมสิ่งที่ยังจำลองและยังรอ API เช่น ยืนยันการส่งมอบใน mock แล้วกับเชื่อม backend จริงแล้ว ให้รายงานตามรอบที่พิสูจน์ได้

คำสั่งอ่านหลักฐานใน PowerShell ใช้จากราก repo แทน `$after` ด้วย SHA ของผลงานวันแข่งเมื่อมี commit แล้ว

```powershell
$before = '9218cb59ed015be95587e055521bdad04d0e1714'
git branch -vv
git worktree list
git show --no-patch --format='%H %s' $before
git ls-tree -r -l $before -- frontend/public/models
git show "${before}:frontend/src/app/(dashboard)/assess/page.tsx"
git status --short --branch
git diff --cached --name-status
git diff --name-status
git ls-files --others --exclude-standard

# หลังจบงาน เมื่อตั้งค่าตัวแปร $after เป็น SHA ที่จะส่งแล้ว
git diff --name-status $before $after -- frontend
git diff --stat $before $after -- frontend
```

ผลทดสอบ checkout แยกและภาพ Before ของ Landing กับ Login อยู่ใน [[JAY-FRONTEND-READINESS]] ภาพ Assessment และ Nodes หลังลงชื่อเข้าใช้กับผลวัด FPS บนเครื่องนำเสนอยังต้องเก็บเพิ่ม
