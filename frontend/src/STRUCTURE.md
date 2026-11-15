# โครงสร้าง `frontend/src`

## app/ — หน้าและ route เท่านั้น

| โฟลเดอร์ | หน้า | หมายเหตุ |
| --- | --- | --- |
| `(site)/` | `/` | หน้าแรก (สาธารณะ ไม่ต้องล็อกอิน) |
| `(auth)/` | `/login` | |
| `(dashboard)/` | `/projects`, `/assess` | ต้องล็อกอิน (ตรวจใน `(dashboard)/layout.tsx`) · หน้าหลักของระบบคือ `/projects` และ `/assess` |
| `api/` | `/api/auth/*` | next-auth |
| `test_components/` | `/test_components` | หน้าทดสอบ UI ตอน dev (404 ใน production) |

วงเล็บ `( )` คือกลุ่มของ Next.js ไม่เป็นส่วนของ URL
หน้าที่เลิกใช้แล้ว (`/register`, `/forgot-password`, `/settings`, `/projects/new`, `/history`, `/skin-viewer`, `/models`, `/projects/[id]/results`, `/herbs`, `/how-to`, `/methodology`, `/about`) redirect ใน `next.config.js`

## components/ — แยกตามฟีเจอร์

| โฟลเดอร์ | เก็บอะไร |
| --- | --- |
| `ui/` | shadcn ล้วน (ปุ่ม ช่องกรอก dialog ฯลฯ) **ห้ามมี logic หรือข้อมูลของแอป** |
| `kit/` | ชิ้น UI ของแอปที่ประกอบจาก `ui/` ใช้ซ้ำได้หลายหน้า (`AppHeader`, `BrandLogo`, `PageHeader`, `ProjectList`) · ต้นแบบอยู่ในคลัง Obsidian `RalphGuard UI` |
| `shared/` | ของใช้ร่วมหลายฟีเจอร์ (`SemanticIcon`, `BrandedProgressLoader`) |
| `layout/` | โครงหน้าและเมนู (`Navbar`) |
| `auth/` | ปุ่มล็อกอิน · session provider (เมนูผู้ใช้อยู่ใน `kit/app-header`) |
| `face/` | ใบหน้า 3D ใน /assess: `SymptomFaceCanvas` → `PaintSymptomModel` · skeleton ระหว่างโหลด |
| `formula/` | กราฟสูตร (Nodes) นำเข้า CSV สแกนฉลาก |
| `substances/` | คลังสาร เพิ่มสารเอง การ์ดสาร |
| `assistant/` | ผู้ช่วยเสียง |
| `charts/` | กราฟ |
| `landing/` | หน้าแรก รวม 3D ห้องแล็บ (`LabScene`) |

## lib/ hooks/ types/

- `lib/` — logic ไม่มี UI (เรียก API, คำนวณ, แปลงข้อมูล) · `lib/landing/` สถานะการเลื่อนของหน้าแรก
- `hooks/` — React hooks ใช้ร่วม (`use-idle-frameloop` = กติกาวาด 3D)
- `types/` — ประกาศ type ของไลบรารี (`next-auth.d.ts`)
- เทสต์อยู่ที่ `frontend/tests/` (`node --experimental-strip-types --test tests/*.test.ts`)

## กติกาวางไฟล์ใหม่

1. หน้าใหม่ → `app/<กลุ่ม>/<ชื่อ>/page.tsx`
2. component ใช้แค่ฟีเจอร์เดียว → `components/<ฟีเจอร์>/`
3. ใช้ตั้งแต่ 2 ฟีเจอร์ขึ้นไป → `components/shared/`
4. ไม่วาง `.tsx` ไว้ที่ `components/` ชั้นบนสุด
5. import ด้วย `@/` เสมอ ยกเว้นไฟล์ในโฟลเดอร์เดียวกัน (`./x`)
6. 3D: ใช้ `useIdleFrameloop()` (เล่นตอนใช้งาน · หยุดเมื่อว่าง/พ้นจอ) และอย่าเรียก `useGLTF.preload()` นอก component ในไฟล์ที่หน้าอื่นอาจโหลดล่วงหน้า
