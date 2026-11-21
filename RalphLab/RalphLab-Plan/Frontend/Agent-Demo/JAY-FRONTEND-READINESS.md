---
title: ตรวจความพร้อม jay-frontend ก่อนเริ่มทำ Lab
date: 2026-11-20
baseline_commit: 9218cb59ed015be95587e055521bdad04d0e1714
tags: [ralphlab, frontend, rehearsal]
---

# ก่อนเริ่มทำ FE

ใช้ `jay-frontend` เป็น Before ได้ เก็บ branch เดิมไว้ เริ่มงานจาก SHA ที่ทีมตกลงวันแข่ง งานที่ต้องทำให้ผ่านก่อนคือ **ล็อกอินด้วยบัญชีทดสอบ เปิดโครงการของบัญชีนั้น แล้วเข้า Lab เพื่อส่งข้อความแรก** การยืนยันตัวตนและ backend ที่เครื่องเดโมจะใช้ยังต้องทดสอบด้วยกัน

## สิ่งที่ต้องจัดการก่อน

| ลำดับ | สิ่งที่พบ | ทำอะไรและจะรู้ว่าผ่านอย่างไร |
|---|---|---|
| 1. ให้ FE ชี้ถูก backend | API ที่ตอบบน `127.0.0.1:8000` คืน HTTP 200 JSON เมื่อขอรายการโครงการโดยไม่มี session หรือ Authorization ตรวจเฉพาะสถานะและชนิดการตอบกลับ โค้ด `backend/app/core/auth.py` และ `backend/app/api/projects.py` ใน SHA ฐานกำหนดให้ตอบ 401 เมื่อมีการตั้งค่า secret แล้ว จึงยังระบุไม่ได้ว่า service นี้ใช้ revision/config เดียวกับฐาน | ยืนยัน revision/port กับเพื่อน Backend ตรวจ `NEXT_PUBLIC_API_URL` ก่อน build และตั้ง CORS ให้ตรงกับ origin ที่นำเสนอ (preflight ในเครื่องตอบ `*`) บน backend ที่ใช้จริง ผู้ไม่ล็อกอินต้องได้ 401 และบัญชีทดสอบต้องอ่านได้เฉพาะโครงการของตน |
| 2. เตรียม Google Login | ใน `frontend/.env.local` ที่ตรวจ มี `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_API_URL` ส่วน `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET` ยังไม่มีค่าที่ใช้ได้ เบราว์เซอร์ที่ยังไม่ล็อกอินเปิด Projects/Assessment แล้วไป Login จริง | ตั้ง credentials ใน environment ของเครื่องเดโม ลงทะเบียน callback `<origin>/api/auth/callback/google` ใช้ origin และ port เดียวกันทั้งรอบ เช่น `http://localhost:3000` ให้ทีมตั้ง `NEXTAUTH_SECRET` ของ FE และ `AUTH_SECRET` ของ BE ให้ตรงกัน ล็อกอินหนึ่งครั้ง เปิดโครงการ ทดสอบรีเฟรชแล้วเข้าได้ เก็บ secrets นอก Git และ Vault |
| 3. เตรียม build บนเครื่องแข่ง | ฐานดึง Noto Sans Thai และ IBM Plex Mono ตอน build สำเร็จเมื่อเข้าถึง Google Fonts รอบจำกัดเครือข่ายล้มที่สองตระกูลนี้ | ซ้อม production build บนเครื่องจริงด้วย lockfile ถ้าต้อง build ออฟไลน์และกติกาอนุญาต ให้ใช้แพตช์ฟอนต์ด้านล่าง ตรวจวรรณยุกต์ไทยและความกว้างข้อความอีกครั้ง |
| 4. เลือกการสาธิต | `/health` ตอบ 200 ส่วน `/health/ready` ตอบ 503 ตัวตรวจ DB, user schema, ingredient catalogue, Redis และ auth config รายงาน ok ส่วน LLM ยังไม่ตั้งค่าและ herbal catalogue ว่าง | MVP แชต/ส่งงานใช้ข้อมูลจำลองได้ ทดสอบ Google แยกจาก mock transport ถ้าจะโชว์ Agent จริง ให้เพื่อน Backend ยืนยัน endpoint/event contract, worker, สถานะพร้อมของส่วนที่ใช้ และผลการส่งมอบหนึ่งรอบผ่าน FE |

**ก่อนเปิด URL สาธารณะ** ผล `npm audit --omit=dev` ของ production dependency tree ใน lockfile ณ วันที่ตรวจ พบ 27 รายการ ระดับ critical 2, high 16 และ moderate 9 โดย direct dependency ที่ registry จัดระดับ critical คือ `next` และระดับ high มี `axios`, `postcss`, `shadcn` จำนวนนี้เป็นรายการแพ็กเกจตาม npm และยังไม่ได้พิสูจน์การเข้าถึงช่องโหว่จากแอป แยกการอัปเกรดลง branch ทดสอบ เลือกรุ่นแก้ตาม advisory แล้วรัน build, tests, OAuth และเปิดฉาก 3D ซ้ำก่อนเผยแพร่

## ผลทดสอบจากสำเนา SHA ฐาน

ทดสอบบน Windows ด้วย Node 24.19.0 และ npm 11.17.0 จาก archive ของ commit แยกจาก working tree ที่กำลังพัฒนา `origin/jay-frontend` ที่อ่านเป็น remote-tracking ref ในเครื่อง

| รายการ | ผล |
|---|---|
| ติดตั้ง | `npm ci --offline --no-audit --no-fund` ผ่านจาก lockfile ด้วย npm cache เครื่องนี้ เครื่องใหม่ต้องเติม cache หรือติดตั้งล่วงหน้าตามกติกา |
| TypeScript / production | `npm run type-check` ผ่าน ฐาน build ได้เมื่อดาวน์โหลดฟอนต์ได้ ตาราง First Load JS ของ Next รายงาน Landing 417 kB, Assessment 249 kB และ Projects 182 kB ขนาดนี้แยกจาก GLB และเวลาที่ GPU ใช้วาด |
| Test / lint เดิม | ฐานยังไม่มี `npm test` รัน Node test runner กับ 14 ไฟล์ พบผ่าน 79, ล้ม 3, ถูกยกเลิก 1 รายการ ตัวจำลอง fetch ของเทสต์ API รับ request ของ NextAuth ปนกับ request เป้าหมาย ข้อความ timeout คาดค่าเดิม และ Node runner โหลด alias ของ PubChem ไม่ได้ `npm run lint` เดิมเปิดตัวช่วยตั้งค่า |
| หลังใช้แพตช์ตรวจสอบ | ผ่าน 84/84 บนฐาน เมื่อโหลดไฟล์ PubChem ได้จึงนับเทสต์ในไฟล์นั้นได้ครบ แยก mock session ในไฟล์ทดสอบเท่านั้น Lint ผ่านโดยมี 7 warnings ในหน้า Assessment, FormulaGraph และ particles |
| ชุดซ้อม Lab | ทดสอบนำแพตช์ทั้งสองไปใช้กับสำเนาฐานใหม่จริง แตก ZIP 50 รายการ ไม่มีชื่อชนต้นฉบับ ตรวจ SHA-256 โมเดลทั้ง 6 ไฟล์หลังคัดลอก เพิ่ม CSS import ที่ dashboard layout แล้วรันเทสต์ฐานรวมเดโม ผ่าน 106/106 และ production build ผ่านใน sandbox ที่จำกัดเครือข่าย มี route `/lab-room` ใน build จริง Next รายงาน First Load JS 172 kB สำหรับ route นี้ โดย GLB โหลดแยก |
| Browser Before | ทดสอบ production ใน Chrome ที่ 1440×900 และ 390×844 หน้า Landing และ Login เปิดได้ ไม่มี JS exception หรือ horizontal overflow ระหว่างการตรวจ ผู้ใช้ที่ยังไม่ล็อกอินเข้า `/projects`, `/projects/new`, `/assess` และ `/projects/12/assess` ลงท้ายที่ `/login` หน้า `/lab-room` บนฐานเดิมได้ 404 ตามฟีเจอร์ที่มี |
| CI | workflow เดิมรัน FE type-check บน Node 20 ใช้ `npm install` รันเมื่อ push เข้า branch ที่ระบุหรือเปิด PR เข้า main การ push เข้า jay-frontend โดยลำพังยังไม่เรียก FE CI ชุดนี้ ก่อนส่งงานให้รันชุดตรวจในเครื่อง หรือเพิ่ม CI ให้ตรง Node/lockfile ที่ซ้อม |

**ภาพ Before จาก production build ของฐาน** ใช้ Chrome ขนาด 1440×900 ภาพ [Landing](Before-9218cb5/landing-1440x900.png) และ [Login](Before-9218cb5/login-1440x900.png) ส่วนภาพ Assessment และ Nodes ให้เก็บขณะลงชื่อเข้าโครงการทดสอบเดียวกับที่จะใช้ถ่าย After ตาม [[JAY-FRONTEND-BASELINE]]

## วิธีเตรียม checkout และทดสอบซ้ำ

บันทึก SHA จาก `git rev-parse jay-frontend` แล้วเก็บ Before บน checkout ของ SHA นั้นก่อน รอบนี้ทดลองแพตช์ในสำเนาแยก ต้นทางแพตช์อยู่ใน Vault และปลายทางคือ **ราก checkout ที่จะพัฒนา** เมื่อกติกาอนุญาตให้ใช้โค้ดที่เตรียมไว้ คำสั่งนี้ใช้จากราก checkout ปลายทาง

```powershell
$vault = 'D:\Github-project\ralphguard\RalphLab\RalphLab-Plan'
$checks = Join-Path $vault 'Use-Prepared\jay-frontend-checks.patch'
$fonts = Join-Path $vault 'Use-Prepared\jay-frontend-offline-fonts.patch'
git apply --check $checks $fonts
# เมื่อคำสั่งด้านบนผ่านและต้องการใช้ทั้งสองแพตช์
git apply $checks $fonts
Set-Location frontend
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run type-check
npm.cmd run start
```

- [แพตช์ชุดตรวจ](../../Use-Prepared/jay-frontend-checks.patch) เพิ่ม script ทดสอบสำหรับ Node ที่ซ้อม เพิ่ม ESLint config แก้ import ของ PubChem ให้ทั้ง Next และ Node ใช้ได้ และจัด mock ในเทสต์ API ให้ตรง request
- [แพตช์ฟอนต์สำหรับออฟไลน์](../../Use-Prepared/jay-frontend-offline-fonts.patch) ใช้ LINE Seed ที่มาพร้อม repo และ system fallback สำหรับไทย/monospace รูปตัวอักษรอาจต่างจาก Before ถ้าต้องการหน้าตาเดิมและ build ออนไลน์ได้ ให้ใช้เฉพาะแพตช์ชุดตรวจ
- ถ้าอนุญาตเฉพาะ Prompt ให้เริ่มจาก [[AGENT-DEMO-CLAUDE-PROMPT]] แล้วใช้รายการตรวจในหน้านี้เป็นเกณฑ์รับงาน ตรวจสิทธิ์ใช้ GLB แยกจากสิทธิ์ใช้โค้ด ถ้าใช้โมเดลได้ ให้ใช้ห้องและ Agent ห้าตัวตาม [[WEB-MODELS]] ถ้าใช้โค้ดได้ ดูขั้นตอนติดตั้ง ZIP และผูก project ID ที่ [[CODEX-FE-MASTER]]

## ลำดับงาน FE และเกณฑ์จบช่วงแรก

1. **Before** เข้าด้วยบัญชีเดโม เปิดโครงการทดสอบ ถ่ายหน้า Assessment และ Nodes เก็บ SHA และ viewport เปิดซ้ำด้วยบัญชีเดียวกันหลังพัฒนา
2. **Lab ส่งข้อความได้** เปิด Lab ในโครงการ เลือก Analyst ส่ง “V1 มีอะไรบ้าง” ต้องได้คำตอบในแชตส่วนตัว ย้อนกลับเข้าห้องเดิมแล้วข้อความยังอยู่และไม่เล่นแอนิเมชันพิมพ์ซ้ำ
3. **Lab ส่งงานได้** ส่ง “ทำสูตรลดสิวให้หน่อย” จาก Analyst ตรวจว่า Director รับงาน ผู้รับผิดชอบคนที่สามเข้ามาแล้วเกิดกลุ่มชื่อการทดลอง เปิดสมาชิก ดูผู้ส่งและผู้รับ ส่งเหตุการณ์ซ้ำหนึ่งครั้งแล้วงานไม่เพิ่ม ทดสอบเปลี่ยนโครงการแล้วข้อความไม่ข้ามโครงการ ดู [[AGENT-DEMO-QA]]
4. **เชื่อมหน้าที่เหลือ** ผูก Lab กับแท็บของโครงการ จากนั้นปรับ Nodes ให้แสดง lineage และเปรียบเทียบรุ่น ถอดจุดแสดงผู้ช่วยเดิมใน Assessment เมื่อคุยใน Lab ได้แล้ว เก็บ flow ประเมินเดิมไว้สำหรับเทียบ Before/After
5. **ก่อนขึ้นจอ** ทดสอบ 3D บนเครื่องนำเสนอ จับเวลาเริ่มเปิด Lab จนคลิก Agent ได้ ลองลากขอบแชตพร้อมหมุนกล้อง เทียบเครื่อง/ความละเอียด/โครงการเดียวกัน รอบตรวจนี้ยังไม่มีตัวเลข FPS หรือเวลาโหลด 3D ที่ใช้ตัดสินเครื่องจริง

การรันรอบนี้ยังไม่ครอบคลุม Google OAuth แบบครบวงจรด้วยบัญชีจริง, ข้อมูลโครงการหลังล็อกอิน, QSAR, การส่งมอบจาก backend/worker จริง และการทดสอบอัปเกรดแพ็กเกจตามผล audit พื้นที่ที่มี regression tests และหลักฐาน Browser ระบุไว้แยกด้านบน
