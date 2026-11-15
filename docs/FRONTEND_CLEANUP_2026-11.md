# ปรับ frontend ของ RalphGuard ก่อน Ralph Lab (branch `cleanup/main-frontend`)

ทำเมื่อ 16 พ.ย. 2569 · แตกจาก `main` `488ac12` · ขอบเขตเต็มอยู่ใน `docs/ralph-lab/MAIN_CLEANUP_SCOPE.md` บน branch `jay`
เป้าหมาย: ระบบเดิมสะอาด เป็นระบบ เร็ว ผ่าน accessibility · หน้าตาเดิม (ยกเว้นสี teal ที่เข้มขึ้น) · UI ใหม่ทำในงานแข่ง

หน้าที่เหลือ: `/` · `/about` · `/how-to` · `/methodology` · `/login` · `/projects` · `/assess` · `/herbs` · `/test_components` (dev)
หน้าหลักของระบบ: **`/projects` และ `/assess`** · โครงสร้างโฟลเดอร์ดู `frontend/src/STRUCTURE.md`

## 1. ผล Lighthouse ก่อน → หลัง

Lighthouse 13.6 · production build · มือถือจำลอง (CPU ช้า 4 เท่า + 4G) · `/assess` ไม่ระบุโปรเจกต์ (เหมือนรอบก่อน)

| หน้า | Performance | Accessibility | LCP | TBT (เวลาค้าง) | โหลดรวม | ห้องแล็บ 3D |
| --- | --- | --- | --- | --- | --- | --- |
| `/about` | 86 → **99** | 91 → **100** | 1.1 → 1.1 s | 573 → 119 ms | 1,987 → **543 KB** | โหลด → **ไม่โหลด** |
| `/how-to` | 72 → **100** | 91 → **100** | 7.1 → **1.1 s** | 253 → 90 ms | 1,987 → **543 KB** | โหลด → **ไม่โหลด** |
| `/methodology` | 83 → **100** | 92 → **100** | 1.1 → 1.1 s | 684 → 123 ms | 1,987 → **543 KB** | โหลด → **ไม่โหลด** |
| `/herbs` | 97 → **99** | 96 → **100** | 1.1 → 1.1 s | 201 → 101 ms | 1,991 → **548 KB** | โหลด → **ไม่โหลด** |
| `/login` | 100 → 100 | 100 → 100 | 1.1 → 1.1 s | 12 → 6 ms | 1,100 → **229 KB** | – |
| `/projects` | 100 → 92 * | 100 → 100 | 1.1 → 3.3 s * | 20 → 20 ms | 1,191 → **319 KB** | – |
| `/projects` (เดสก์ท็อป) | 100 → 100 | 96 → **100** | 0.3 → 0.7 s | 0 → 0 ms | 317 → 316 KB | – |
| `/assess` | 43 → 47 | 93 → **100** | 9.5 → **5.6 s** | 7,724 → 9,126 ms ** | 6,312 → 5,444 KB | – |
| `/assess` (เดสก์ท็อป) | 63 → 66 | 95 → **100** | 1.8 → 1.2 s | 1,804 → 1,798 ms ** | 6,312 → 5,444 KB | – |
| `/` | 36 → 37 | 100 → 100 | 14.0 → **11.0 s** | 7,874 → **4,645 ms** | 2,214 → **1,344 KB** | ต้องโหลด (หน้านี้ใช้) |

\* `/projects` มือถือ: Lighthouse วัด LCP คนละจุด รอบก่อนวัดช่องค้นหา รอบนี้วัดข้อความ "ยังไม่มีโปรเจกต์" ที่ขึ้นหลังเรียก backend · โค้ดหน้านี้เปลี่ยนแค่ aria-label และสี · ไม่ใช่ปัญหาจากการแก้
\*\* `/assess`: เวลาค้างเกือบทั้งหมดเป็นงานก้อนเดียว 7.2 s ตอน **compile shader ของใบหน้า 3D** ครั้งแรก (ดูข้อ 4.1) ไม่ใช่การวาดซ้ำ การแก้ frameloop จึงไม่ลดตัวเลขนี้ แต่ลดงานหลังโหลดเสร็จ (ดูข้อ 3)

## 2. สิ่งที่เปลี่ยน

### W1 ลบสิ่งที่ไม่ได้ใช้ (~3,900 บรรทัด)

| ลบ | เหตุผล |
| --- | --- |
| `AnatomyModel`, `AnatomyModelGLTF`, `OrganChip`, `landing/{LandingMockups,SplitReveal,Reveal,HeroText3D}`, `three/Text3D`, `test_components/_Text3DTest`, `ui/table` | ไม่มีหน้าไหน import |
| หน้า `/register`, `/forgot-password`, `/settings`, `/projects/new` | เป็นแค่ redirect → ย้ายไป `redirects()` ใน `next.config.js` |
| หน้า `/symptom-lab` + ส่วนท้าย `SymptomLabModel` | ไม่มีลิงก์ · ส่วนที่ `/assess` ใช้ย้ายเป็น `components/face/PaintSymptomModel.tsx` |
| หน้า `/history`, `/models`, `/skin-viewer`, `/projects/[id]/results` | ไม่ใช้แล้ว (ผู้ใช้สั่ง) · redirect ไป `/projects`, `/methodology`, `/assess`, `/assess?projectId=` |
| `face/FaceIrritationModel`, `layout/DashboardShell`, `lib/report-selection` (+ เทสต์) | ใช้แค่หน้าที่ลบ |

ไม่ลบ: แพ็กเกจ (`@base-ui/react`, `axios`, `shadcn`) · `/test_components` และ ui ที่ใช้แค่หน้านั้น · `api.listAssessments` (ไม่มีคนเรียกแล้ว)
ไฟล์ใน `public/` ที่ไม่มีโค้ดใช้แล้ว **ยังไม่ลบ รอตัดสินใจ:** `models/human.glb` (6.1 MB) · `fonts/*.json` และ `helvetiker_bold.typeface.json` (รวม ~1.2 MB, ฟอนต์ของ Text3D)

### W2 โครงสร้างโฟลเดอร์

ย้ายไฟล์ 21 ไฟล์ด้วย `git mv` (ไม่แก้เนื้อโค้ด) · `components/` ชั้นบนไม่มีไฟล์ `.tsx` แล้ว · หน้าเว็บสาธารณะอยู่ใน `app/(site)/` (URL เดิม) · `app/_lib/*` → `lib/landing/*` · กติกาวางไฟล์ใหม่ใน `frontend/src/STRUCTURE.md`

### W3 ประสิทธิภาพ

| เรื่อง | แก้ | ไฟล์ |
| --- | --- | --- |
| 3D วาดทุกเฟรมตลอด | hook ใหม่ `useIdleFrameloop`: วาดตลอดตอนใช้งาน + 8 วินาทีหลังแตะครั้งสุดท้าย → `demand` เมื่อว่าง → `never` เมื่อพ้นจอ (แอนิเมชันตา/แถบสแกน/ตัวละครยังเล่นตอนใช้งาน) | `hooks/use-idle-frameloop.ts`, `face/SymptomFaceCanvas.tsx`, `landing/LabScene.tsx` |
| หน้าอื่นโหลดห้องแล็บ 3D | เอา `useGLTF.preload()` ที่อยู่นอก component ออกจาก `LabScene` (Next prefetch โค้ดหน้าแรกจากโลโก้ใน `SiteNav`) | `landing/LabScene.tsx` |
| `logo.png` 872 KB ทุกหน้า | `public/icons/logo-192.webp` (4 KB, `unoptimized`) · `app/icon.png` 32 px · `app/apple-icon.png` 180 px · `logo.png` เหลือใช้แค่รายงาน PDF | login, `Navbar`, `ProjectsShell`, `BrandedProgressLoader`, `assess/page.tsx` |
| ไม่มี skeleton | `assess/loading.tsx` (โครง 3 คอลัมน์) · `face/FaceCanvasSkeleton` (ตอนโหลดโค้ด 3D) · `face/FaceLoadingOverlay` (% ดาวน์โหลด `head.glb`) | – |

### W4 Accessibility (ทุกหน้า 100)

- สีใหม่ `--primary-strong: 182 100% 24%` (#00767A, 5.4:1 บนขาว) · `Button` default และ `text-primary` บนพื้นขาวใช้สีนี้ · ปุ่มพื้น teal + ตัวขาว 33 จุด → `bg-brand-dark` · `--accent-foreground` / `--sidebar-accent-foreground` → 24% · ไอคอน เส้นขอบ พื้นอ่อนยังเป็น #009FA5
- ลิงก์ footer สูงอย่างน้อย 24 px · ตัวหนังสือจางบนพื้นมืด (`ink2/50` → `/65`)
- `/assess`: แท็บ ประเมิน/Nodes มีชื่อบนจอเล็ก · ชื่อปุ่ม ลบทั้งหมด/เริ่มประเมิน ตรงกับที่เห็น · แท็บที่ไม่เลือก `slate-600`
- `/projects`: การ์ดโปรเจกต์และโลโก้ไม่มี `aria-label` ที่ไม่ตรงกับข้อความ · ปุ่ม Previous/Next

## 3. ตรวจแล้ว

- `npm run build` ผ่าน · `tsc --noEmit` ผ่าน · เทสต์ 77/78 (ที่ไม่ผ่าน `pubchem-online` พังอยู่แล้วบน main เพราะ node หา alias `@/lib` ไม่เจอ · `api-request.test.ts` ค้างอยู่แล้วบน main)
- นับ WebGL draw call ด้วย Chrome headless:

| หน้า | ใช้งาน (3 วิ) | ว่าง (หลัง ~20 วิ) | ขยับเมาส์ | ว่างอีกครั้ง |
| --- | --- | --- | --- | --- |
| `/` | +99,052 | **+0** | +105,549 | **+0** |
| `/assess` | +1,274 | **+0** | +4,030 | **+0** |

- ภาพตอนวาดตลอดกับแบบใหม่ (ใบหน้า) เหมือนกันทุกพิกเซล
- `/about`, `/how-to`, `/methodology`, `/herbs` ไม่มีคำขอ `.glb` แล้ว
- redirect: `/history` → `/projects` ใช้ได้

**ยังไม่ได้ตรวจ:** การทาสีบนใบหน้าและเปลี่ยน Day ในโปรเจกต์ที่มีข้อมูลจริง (เซิร์ฟเวอร์ทดสอบไม่มีผู้ใช้ล็อกอิน) · มือถือจริง (ผู้ใช้ตรวจ) · รายงาน PDF

## 4. ข้อค้นพบที่ยังไม่แก้

1. **`/assess` ค้าง 7 วินาทีตอนวาดภาพแรก (มือถือจำลอง)** — three.js compile shader ของใบหน้าแบบรอผล (`WebGLProgram` เรียก `getProgramParameter` ทันที) · ทางแก้ที่น่าลอง: `renderer.compileAsync(scene, camera)` ก่อนแสดง (three r158+) หรือปิด `renderer.debug.checkShaderErrors` ใน production · ตัวเลขใน Chrome headless (วาดด้วย CPU) แย่กว่าเครื่องจริง
2. **ตัวย่อรูปของ Next ค้างเมื่อแปลง webp → webp** บนเครื่องที่ไม่มีแพ็กเกจ `sharp` (`/_next/image?url=…webp` ไม่ตอบ) → โลโก้ใช้ `unoptimized` · ถ้าจะใช้ `next/image` กับ webp ให้ติดตั้ง `sharp`
3. **`next start` บนเครื่องต้องมี `NEXTAUTH_SECRET`** ไม่งั้น `/login` แสดง "เปิดหน้านี้ไม่สำเร็จ" (worktree ไม่มี `.env.local`)
4. หน้าแรกยังหนัก (Performance 37) เพราะห้องแล็บ 3D + three.js ตั้งแต่แรก · ทางแก้: ภาพนิ่งก่อนแล้วค่อยโหลด 3D (ยังไม่ได้เลือกทำ)
