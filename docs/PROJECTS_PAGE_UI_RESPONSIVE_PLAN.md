# แผนปรับปรุงหน้า `/projects`

สถานะเอกสาร: Implementation เสร็จแล้ว รอตรวจด้วยข้อมูลจริงจำนวนมากเพิ่มเติม

Branch ที่ตรวจ: `main-Responsive/UI`

ขอบเขต: หน้าโปรเจกต์ทั้งหมด, Create/Edit/Delete Project, Responsive และ Motion
ยังไม่แก้หน้า `/assess` ในงานชุดนี้

## 1. เป้าหมาย

- ทำให้หน้า `/projects` ดูเป็นระบบงานระดับมืออาชีพและไม่โล่งเกินไป
- ให้ `/projects` เป็นหน้าหลักหน้าเดียวของระบบจัดการโปรเจกต์ในช่วงนี้
- สร้างโปรเจกต์ด้วย Create View เต็มพื้นที่ และแก้ไขผ่าน Dialog โดยไม่เปลี่ยน route
- เพิ่มสีและไอคอนประจำโปรเจกต์ โดยยังคงภาพลักษณ์ทางการแพทย์
- แจ้งผล Create/Edit/Delete/Restore ผ่าน Toast ที่ชัดเจน
- รองรับ Undo Delete โดยไม่ทำให้ผลประเมินสูญหายถาวรก่อนผู้ใช้มีโอกาสย้อนกลับ
- รองรับ Mobile, Tablet และ Desktop โดยไม่มี horizontal overflow
- เพิ่ม Motion ที่สื่อความหมายและรองรับ `prefers-reduced-motion`

## 2. Skill ที่ใช้วิเคราะห์

- `ui-ux-pro-max`
  - Accessibility และ keyboard navigation มาก่อนความสวย
  - Touch target อย่างน้อย 44px
  - หนึ่งหน้าควรมี Primary CTA หลักเพียงหนึ่งตำแหน่ง
  - ใช้ Lucide/SVG แทน Emoji
  - ใช้ semantic color tokens และไม่ใช้สีเป็นตัวสื่อความหมายเพียงอย่างเดียว
  - Micro-interaction ควรอยู่ประมาณ 150–300ms
  - Undo เหมาะกับ destructive action
- `gsap-core`, `gsap-react`, `gsap-performance`
  - ใช้ `transform`, `opacity` และ `autoAlpha`
  - หลีกเลี่ยงการ animate `width`, `height`, `top`, `left`
  - Animation ต้อง cleanup เมื่อ component unmount
  - รองรับ `prefers-reduced-motion`
- `gsap-plugins`
  - ใช้ `Flip` สำหรับการเพิ่ม ลบ และจัดตำแหน่ง Project Card ใหม่

หมายเหตุ: search script ของ `ui-ux-pro-max` ใน repository เป็น pointer ไปยัง path ที่ไม่มีอยู่ จึงใช้ checklist จาก `SKILL.md` โดยตรงแทน

## 3. วิเคราะห์ UI ปัจจุบัน

### สิ่งที่ดีอยู่แล้ว

- ใช้ shadcn/ui สำหรับ Card, Dialog, AlertDialog, Button และ Form
- ใช้ Lucide icons
- มี Loading skeleton, Empty state และ Error handling
- Project Card ใช้ keyboard เปิดได้
- API มี Create, Edit และ Delete แล้ว
- มี Sonner Toaster และ GSAP ใน dependencies

### ปัญหาหลัก

1. Sidebar มีเพียงเมนู “โปรเจกต์” ซึ่งซ้ำกับหน้าที่กำลังเปิดและทำให้ฝั่งซ้ายดูว่าง
2. Empty state กว้างและสูงมาก ทำให้หน้าดูเหมือนยังออกแบบไม่เสร็จ
3. Create Project แยกไป `/projects/new` ทั้งที่ปัจจุบันมี destination หลักเพียงหน้าเดียว
4. Create/Edit ยังไม่มีตัวเลือกสีและไอคอนประจำโปรเจกต์
5. Edit สำเร็จยังไม่มี Success Toast
6. Delete ปัจจุบันเป็น Hard Delete และลบ Assessment ผ่าน ORM cascade จึง Undo ด้วย Toast อย่างเดียวไม่ได้
7. Project Card ยังแยกเอกลักษณ์แต่ละโปรเจกต์ได้น้อย
8. Motion ของ Card, Dialog และการเปลี่ยนข้อมูลยังไม่เป็นระบบเดียวกัน

## 4. การตัดสินใจด้านโครงสร้าง

### 4.1 ใช้ Sidebar สำหรับ Brand และ Navigation

หน้า `/projects` ใช้ Sidebar แบบกระชับ ประกอบด้วย:

- Logo และชื่อ RalphGuard
- เมนู “โปรเจกต์ทั้งหมด”
- เส้นขอบที่ลากเพื่อปรับความกว้างได้ และเปลี่ยนเป็น icon-only เมื่อย่อ

เหตุผล:

- แยก Brand และ Navigation ออกจากเครื่องมือจัดการรายการ
- Top App Bar เหลือข้อมูลและเครื่องมือที่สัมพันธ์กับหน้าปัจจุบัน
- รองรับการเพิ่ม navigation จริงในอนาคตโดยไม่สร้างเมนูปลอม

`/projects` ใช้ `ProjectsShell` เฉพาะหน้า ส่วนหน้าลึกยังใช้ shell เดิมตามโครงสร้างปัจจุบัน

### 4.2 ให้ Create/Edit อยู่ใน route เดียว

- ปุ่ม “สร้างโปรเจกต์” เปลี่ยนพื้นที่เนื้อหาเป็น `ProjectCreateView`
- Create View แสดงข้อมูลหลักก่อน แล้วจึงแสดงสีและไอคอน
- ปุ่มแก้ไขยังเปิด `ProjectFormDialog` ในโหมด Edit
- `/projects/new` ไม่แสดงใน navigation
- Route เดิมควร redirect กลับ `/projects` หรือคงเป็น compatibility route ชั่วคราว

### 4.3 ไม่เพิ่มเมนูหรือหน้าที่ระบบยังไม่มี

ยังไม่เพิ่ม Dashboard, Recent, Archive หรือ Settings ใน sidebar เพื่อเติมพื้นที่ เพราะจะสร้าง navigation ที่ไม่มีการใช้งานจริง

## 5. รูปแบบหน้าใหม่

### Desktop

1. Sidebar
   - Logo/RalphGuard
   - เมนูโปรเจกต์
   - Resize handle
2. Top App Bar
   - ชื่อหน้าและคำอธิบาย
   - Search
   - Grid/List layout switch
   - Create action เมื่อมีโปรเจกต์แล้ว
3. Project Grid
   - 3 คอลัมน์บนจอกว้าง
   - 2 คอลัมน์บน Laptop/Tablet แนวนอน
4. Empty, Loading และ Error state ภายใน content container เดียวกัน

### Mobile

- Sidebar เปลี่ยนเป็น Brand bar บนจอขนาดเล็ก
- Page Header เรียงแนวตั้ง
- Search เต็มความกว้าง
- Create action อยู่ใน Empty state หรือ Top App Bar ตามจำนวนโปรเจกต์
- Project Grid เหลือ 1 คอลัมน์
- Edit/Delete ย้ายเข้าเมนู More หรือคง icon button ที่มี hit area 44px
- Dialog ใช้ความกว้างเกือบเต็ม viewport และ footer button เรียงเต็มความกว้าง

### Breakpoints ที่ต้องทดสอบ

- 375px
- 768px
- 1024px
- 1440px

## 6. Project Card

แต่ละ Card แสดง:

- Icon ประจำโปรเจกต์บนพื้นสีอ่อน
- ชื่อโปรเจกต์
- คำอธิบายไม่เกิน 2 บรรทัด
- วันที่สร้างหรือแก้ไขล่าสุด
- ปุ่ม Edit และ Delete
- เปิดโปรเจกต์ด้วยการคลิก Card ทั้งใบ

แนวทางสี:

- เลือกจาก preset เท่านั้น ไม่ใช้ unrestricted color picker
- ตัวเลือก 10 สี: Teal, Cyan, Blue, Indigo, Violet, Emerald, Amber, Slate, Rose, Orange
- ใช้สีเป็น accent ของ icon, border หรือแถบเล็ก ไม่เปลี่ยนพื้น Card ทั้งใบเป็นสีสด
- Selected color ต้องมี check icon เพื่อไม่พึ่งสีเพียงอย่างเดียว

แนวทาง icon:

- ใช้ Lucide ชุดเดียวกับระบบ
- ตัวเลือก 10 แบบ: `FlaskConical`, `Beaker`, `TestTube2`, `Microscope`,
  `ShieldCheck`, `Droplets`, `Atom`, `Leaf`, `HeartPulse`, `ClipboardCheck`
- ทุก icon-only button ต้องมี `aria-label` และ Tooltip

## 7. Create View และ Edit Dialog

ใช้ `ProjectCreateView` สำหรับการสร้างแบบเต็มพื้นที่ และใช้ `ProjectFormDialog`
สำหรับแก้ไขข้อมูลเดิม

ลำดับข้อมูล:

1. ชื่อโปรเจกต์และคำอธิบายเป็นข้อมูลหลัก
2. สีและไอคอนเป็นข้อมูลเสริม
3. ปุ่มยกเลิกและสร้างอยู่ท้าย flow

พฤติกรรม:

- Focus ช่องชื่อเมื่อเปิด
- Validate ชื่อเมื่อ blur และเมื่อ submit
- Enter submit เมื่อ focus อยู่ในช่องชื่อ
- ปิด Dialog ไม่ได้ระหว่าง request
- ปุ่ม Save/Create มี Loading state
- Error แสดงใกล้ form และมี `role="alert"`

Toast copy:

- Create: `สร้างโปรเจกต์ “{name}” สำเร็จ`
- Edit: `แก้ไขโปรเจกต์ “{name}” สำเร็จ`
- Error: ระบุสาเหตุและสิ่งที่ผู้ใช้ทำต่อได้

## 8. Undo Delete ที่ถูกต้อง

### ปัญหาปัจจุบัน

`DELETE /projects/{id}` ลบ Project จริงทันที และ relationship ใช้ `cascade="all, delete-orphan"` จึงอาจลบ Assessment ทั้งหมดด้วย การนำ Project object กลับมาเฉพาะ Frontend จะไม่สามารถกู้ Assessment เดิมได้

### แนวทางที่เลือก: Soft Delete

Backend:

1. เพิ่ม `deleted_at` ในตาราง `projects`
2. `DELETE /projects/{id}` เปลี่ยนเป็นตั้งค่า `deleted_at`
3. `GET /projects` ไม่คืนโปรเจกต์ที่ถูกลบ
4. เพิ่ม `POST /projects/{id}/restore`
5. ยังไม่ลบ Assessment ตอน Soft Delete
6. เตรียม Hard Delete/Purge เป็นงานแยกในอนาคต

Frontend:

1. ผู้ใช้ยืนยัน Delete ผ่าน AlertDialog
2. ซ่อน Card หลัง Backend Soft Delete สำเร็จ
3. แสดง Toast:
   - ข้อความ: `ลบโปรเจกต์ “{name}” แล้ว`
   - Action: `Undo`
4. เมื่อกด Undo ให้เรียก Restore API และนำ Card กลับตำแหน่งเดิม
5. แสดง `กู้คืนโปรเจกต์แล้ว`
6. ถ้า Restore ล้มเหลว แสดง Error Toast พร้อม Retry

Workspace ใน `localStorage` ต้องไม่ถูกลบทันทีตอน Soft Delete เพื่อให้ Undo กลับมาได้ครบ การ cleanup ถาวรต้องทำตอน Purge เท่านั้น

## 9. Backend/Data Model ที่ต้องเพิ่ม

ฟิลด์ Project:

- `color_key`: string enum พร้อม default `teal`
- `icon_key`: string enum พร้อม default `flask`
- `updated_at`: datetime
- `deleted_at`: nullable datetime

API:

- Create รับ `color_key`, `icon_key`
- Update รับ `color_key`, `icon_key`
- ProjectOut ส่งค่าทั้งสองกลับ
- Delete เป็น Soft Delete
- Restore endpoint
- List/Get ต้องไม่คืน deleted project

Validation:

- Backend whitelist สีและ icon
- Frontend และ Backend ใช้ key ชุดเดียวกัน
- ห้ามรับ raw CSS/hex/icon component name จากผู้ใช้โดยตรง

## 10. Motion Specification

ใช้ Motion เท่าที่สื่อเหตุและผล:

| เหตุการณ์ | Animation | เวลา |
|---|---|---:|
| เปิด Dialog | Fade + `y: 8` + `scale: 0.98 → 1` | 220ms |
| ปิด Dialog | Fade + scale เล็กน้อย | 150ms |
| โหลด Project Grid ครั้งแรก | Card fade + `y: 10`, stagger 35ms | 220–280ms |
| สร้างโปรเจกต์ | Card ใหม่ fade/scale เข้า + highlight ring ชั่วคราว | 260ms |
| แก้ไขสีหรือ icon | Crossfade preview และ accent | 180ms |
| ลบโปรเจกต์ | Card fade + `scale: 0.98` | 160ms |
| Undo | Card กลับตำแหน่งเดิมด้วย Flip | 220ms |
| Reflow ของ Grid | GSAP Flip | 220–260ms |

ข้อกำหนด:

- ใช้ transform/opacity เท่านั้นใน motion หลัก
- จำกัด stagger ไม่ให้รายการจำนวนมากรอนาน
- Animation ต้อง interruptible
- `prefers-reduced-motion: reduce` ปิด stagger, translate และ scale เหลือ state change ทันทีหรือ fade สั้น
- Cleanup GSAP context/tween ทุกครั้งเมื่อ unmount

## 11. ลำดับ Implementation

### P0 — Data Safety ก่อน UI

1. เพิ่ม migration: `color_key`, `icon_key`, `updated_at`, `deleted_at`
2. เพิ่ม Project schema และ validation
3. เปลี่ยน Delete เป็น Soft Delete
4. เพิ่ม Restore API
5. เพิ่ม Backend tests สำหรับ Create/Edit/Delete/Restore และ Assessment preservation

เหตุผล: หากทำ Undo Toast ก่อน Soft Delete ผู้ใช้อาจเห็นว่าย้อนกลับได้ แต่ข้อมูล Assessment ถูกลบไปแล้ว

### P1 — Page Shell และ Responsive Foundation

1. สร้าง `ProjectsShell`
2. สร้าง Sidebar สำหรับ Brand, Navigation และ Resize handle
3. สร้าง Top App Bar สำหรับข้อมูลหน้า Search และ Layout switch
4. กำหนด content max-width, gutters และ breakpoints
5. ตรวจ mobile header และ safe spacing

### P2 — Create View และ Edit Form

1. สร้าง `ProjectCreateView`
2. ใช้ `ProjectFormDialog` สำหรับ Edit
3. ย้าย Create มาอยู่ใน `/projects` โดยเปลี่ยน content state
4. เพิ่ม Color Selector
5. เพิ่ม Icon Selector
6. เพิ่ม Create/Edit Success Toast
7. ทำ `/projects/new` เป็น compatibility redirect

### P3 — Project Grid และ Page States

1. ปรับ Project Card
2. เพิ่ม Search และเรียงล่าสุดอัตโนมัติ
3. ทำ Empty state ให้กระชับและอยู่กึ่งกลาง content
4. ปรับ Loading skeleton ให้ตรงกับ Card จริง
5. ปรับ Error state ให้มี Retry

### P4 — Delete + Undo

1. ใช้ AlertDialog ยืนยันการลบ
2. เรียก Soft Delete
3. แสดง Toast พร้อม Undo action
4. เรียก Restore เมื่อกด Undo
5. ทดสอบ refresh, request failure และ double click

### P5 — Motion

1. Dialog motion
2. Card entrance
3. Create/Edit feedback
4. Delete/Undo และ Grid reflow ด้วย GSAP Flip
5. Reduced-motion fallback

### P6 — Accessibility และ Responsive QA

1. Keyboard navigation
2. Focus management หลังเปิด/ปิด Dialog
3. Screen reader labels และ Toast `aria-live`
4. Touch targets อย่างน้อย 44px
5. Contrast ของทุก project color
6. ทดสอบ 375/768/1024/1440px
7. ทดสอบชื่อและคำอธิบายยาว
8. ทดสอบ 0, 1, 10 และ 50+ โปรเจกต์

## 12. สิ่งที่ยังไม่ทำในรอบนี้

- ไม่ปรับ UI หน้า `/assess`
- ไม่เพิ่มหน้า Dashboard/Archive/Settings ปลอมเพื่อเติม Sidebar
- ไม่เพิ่ม Drag & Drop เรียง Project
- ไม่เพิ่ม Hard Delete/Purge UI
- ไม่เพิ่มระบบสมาชิกหรือ Project ownership
- ไม่ใช้สีสดเต็ม Card หรือ animation ที่เป็นเพียงของตกแต่ง

## 13. Definition of Done

- `/projects` มี Sidebar ที่กระชับและไม่แสดงเนื้อหาซ้ำกับ Top App Bar
- Sidebar ปรับความกว้างด้วยเมาส์หรือคีย์บอร์ดได้
- Create/Edit ทำได้จาก route เดียว
- สีและ icon บันทึกผ่าน Backend และยังอยู่หลัง F5
- Create/Edit แสดง Success Toast
- Delete แสดง Undo และ Restore ข้อมูลเดิมได้จริง
- Assessment ไม่ถูกลบจาก Soft Delete
- Grid, Dialog และ Toast ใช้งานได้ด้วย keyboard
- ไม่มี horizontal overflow ที่ 375px
- Animation ไม่กระตุกและปิดได้ด้วย reduced-motion
- Backend, frontend logic tests และ type-check ผ่าน

## 14. Implementation Checklist

### Backend และความปลอดภัยของข้อมูล

- [x] เพิ่ม `color_key`, `icon_key`, `updated_at` และ `deleted_at`
- [x] เพิ่ม migration `20260730_0005`
- [x] ตรวจสอบค่า color/icon ด้วย whitelist ใน schema
- [x] รองรับ color/icon ใน Create, Update และ ProjectOut
- [x] เปลี่ยน Delete เป็น Soft Delete
- [x] เพิ่ม Restore API สำหรับ Undo
- [x] ซ่อนโปรเจกต์ที่ถูกลบจาก List/Get
- [x] รักษา Assessment เดิมไว้เมื่อลบโปรเจกต์แบบ Soft Delete

### หน้า `/projects`

- [x] สร้าง Sidebar แบบกระชับใน `ProjectsShell`
- [x] สร้าง Top App Bar สำหรับข้อมูลหน้าและเครื่องมือ
- [x] สร้าง `ProjectCreateView` แบบเต็มพื้นที่สำหรับ Create
- [x] ใช้ `ProjectFormDialog` สำหรับ Edit
- [x] เพิ่มตัวเลือกสีและไอคอน
- [x] เพิ่ม Search และเรียงล่าสุดอัตโนมัติ
- [x] ปรับ Project Card ให้แสดงสี ไอคอน คำอธิบาย และวันที่อัปเดต
- [x] ปรับ Empty, Loading และ Error state
- [x] เพิ่ม Create/Edit Success Toast
- [x] เพิ่ม Delete Toast พร้อมปุ่ม `Undo`
- [x] ทำ `/projects/new` เป็น redirect กลับ `/projects`
- [x] ปรับ touch target หลักเป็นอย่างน้อย 44px

### Motion และ Accessibility

- [x] เพิ่ม Card entrance animation
- [x] เพิ่ม Delete/Restore animation และ Grid reflow ด้วย GSAP Flip
- [x] ใช้ transform/opacity เป็นหลัก
- [x] รองรับ `prefers-reduced-motion`
- [x] ใส่ label, aria-label, Tooltip และสถานะ pressed ให้ control ที่จำเป็น
- [x] ตรวจสอบ keyboard-accessible Dialog และปุ่มหลัก

### Verification

- [x] Frontend type-check ผ่าน
- [x] Frontend logic tests ผ่าน 46/46
- [x] Production build ผ่าน
- [x] Backend tests ของ Project Create/Appearance/Soft Delete/Restore ผ่าน 8/8
- [x] Migration ขึ้นถึง `20260730_0005 (head)`
- [x] ตรวจหน้า Desktop จริง
- [x] ตรวจหน้า Mobile 390×844 จริง
- [x] ตรวจว่าไม่มี horizontal overflow หรือ console error ในหน้าที่ทดสอบ
- [ ] ทดสอบด้วยข้อมูลจริง 10 และ 50+ โปรเจกต์

หมายเหตุผลทดสอบ Backend ทั้งชุด: ผ่าน 38/39 รายการ อีก 1 รายการเป็น test ของการหา `.env` จาก repository root ที่สมมติ path แบบเครื่อง host จึงไม่พบ `/backend` เมื่อรันอยู่ใน Docker; ไม่เกี่ยวกับระบบ Project ที่แก้ในรอบนี้

## 15. แผนปรับหน้า `/assess` หลังหน้า Projects ผ่าน

สถานะ: วางแผนแล้ว ยังไม่เริ่มแก้ UI หรือ Responsive ของ `/assess`

หลักการของรอบนี้:

- หน้า `โปรเจกต์ทั้งหมด` และ `สร้างโปรเจกต์ใหม่` ถือว่าผ่านแล้ว ไม่ย้อนกลับไปปรับในงานชุดนี้
- ทำ Workflow และ UI ของ `/assess` บน Desktop ให้ถูกต้องและใช้งานจบก่อน
- เริ่ม Responsive Layout หลังจาก UX, state และลำดับการทำงานบน Desktop ผ่านการตรวจแล้วเท่านั้น
- รักษา logic ที่ใช้งานได้อยู่แล้ว เช่น Project-scoped workspace, หลายสูตร, CSV, OCR, Node, Day 1/3/7 และการบันทึกเมื่อ F5

### 15.1 เป้าหมายผู้ใช้

ผู้ใช้หลักคือนักวิจัยหรือผู้พัฒนาผลิตภัณฑ์ skincare ที่ต้องการ:

- เห็นทันทีว่ากำลังทำงานในโปรเจกต์และสูตรใด
- เข้าใจขั้นตอนถัดไปโดยไม่ต้องเดาจากปุ่มที่ disabled
- ตรวจสูตรและสัดส่วนสารก่อนนำไปทาบนพื้นที่จำลอง
- ระบุตำแหน่งทาบนโมเดลก่อนส่งสูตรประเมิน
- แยกสถานะ “ยังไม่ทา”, “พร้อมประเมิน”, “กำลังวิเคราะห์” และ “มีผลแล้ว” ได้ชัดเจน
- เปรียบเทียบหลายสูตรบนโมเดลเดียวกันโดยข้อมูลไม่ปะปน
- กลับเข้าหน้าหรือกด F5 แล้วทำงานต่อจากสถานะเดิมได้

### 15.2 Workflow หลักที่ต้องเปลี่ยน

Workflow เดิม:

`เลือกโปรเจกต์ → สร้างสูตร → เพิ่มสาร → ประเมิน → ทาโมเดล → ดูผล → F5`

Workflow ใหม่ที่ต้องใช้:

`เลือกโปรเจกต์ → สร้างสูตร → เพิ่มสาร → ทาโมเดล → ประเมิน → ดูผล → F5`

ขั้นตอนภายในหน้า `/assess`:

1. **เลือกหรือสร้างสูตร**
   - ต้องมีสูตรที่เลือกอยู่หนึ่งสูตร
   - สูตรแต่ละกล่องเป็นการทดลองอิสระ แต่รอยของทุกสูตรสามารถแสดงบนโมเดลพร้อมกันได้
2. **เพิ่มและตรวจสาร**
   - ต้องมีสารอย่างน้อย 1 รายการ
   - ตรวจ SMILES, ความเข้มข้น, สารซ้ำ และผลรวมไม่เกิน 100%
   - น้ำฐานยังคำนวณอัตโนมัติเหมือนเดิม
3. **ทาสูตรบนโมเดล**
   - เปิดการทาครีมสีขาวทันทีเมื่อสูตรผ่านการตรวจพื้นฐาน โดยไม่ต้องมีผลประเมินก่อน
   - รอยทาต้องผูกกับ `formulaId`
   - สูตรต่างกันห้ามทาทับตำแหน่งเดียวกัน
   - ยางลบลบรอยสีขาวได้ก่อนประเมิน และมีทั้ง “ล้างรอยที่เลือก” กับ “ล้างทั้งหมด”
4. **ประเมินสูตร**
   - ปุ่มกดได้เสมอ แต่ใช้ Toast บอกเงื่อนไขที่ยังขาด
   - ต้องตรวจ Project, สูตร, สาร, ข้อมูลสาร, สัดส่วน และรอยทาของสูตรที่เลือก
   - ส่งประเมินได้เมื่อสูตรที่เลือกมีรอยทาอย่างน้อยหนึ่งตำแหน่ง
5. **ดูผล**
   - ระหว่างรอ Backend แสดง progress ที่สื่อสถานะจริง
   - เมื่อผลสำเร็จ ครีมสีขาวค่อย ๆ จาง และอาการค่อย ๆ ปรากฏเฉพาะตำแหน่งที่ทา
   - แสดง Day 1/3/7, บริเวณที่ทา, อาการ, คะแนน, ระดับความเสี่ยง และความน่าเชื่อถือ
6. **กลับมาใช้งานต่อหลัง F5**
   - คืนสูตรที่เลือก รายการสาร รอยทา ผลล่าสุด วันที่เลือก และสถานะหน้าจอที่จำเป็น
   - ห้ามประเมินใหม่อัตโนมัติ และห้ามแสดงอาการของผลที่หมดอายุจากการแก้สูตร

### 15.3 การแก้ Logic ก่อนแตะ Layout

สิ่งที่โค้ดปัจจุบันยังไม่ตรงกับ Workflow ใหม่:

- `assessmentStartProblem()` ยังไม่รับสถานะรอยทา จึงยังไม่บังคับ “ทาก่อนประเมิน”
- `Viewport` ส่ง `armed={ready}` ให้โมเดล ทำให้ทาได้หลังมีผลประเมินเท่านั้น
- Workflow Chip ปัจจุบันมีเพียง “เตรียมสูตร → ประเมิน → ดูผลลัพธ์” และไม่มีขั้น “ทาโมเดล”
- ข้อความแนะนำบนโมเดลยังบอกให้ประเมินก่อน Paint
- ปุ่มยางลบบางสถานะยังผูกกับความพร้อมของผลประเมิน แทนที่จะผูกกับการมีรอยทา

ลำดับแก้ Logic:

1. เพิ่ม helper สำหรับตรวจความพร้อมของสูตรก่อน Paint แยกจาก helper ก่อน Assessment
2. เพิ่ม `hasPaint` ของสูตรที่เลือกเข้า assessment precondition
3. เปลี่ยนโมเดลให้ Paint ได้เมื่อสูตรผ่าน basic validation ไม่ใช่เมื่อ `completed`
4. ให้ผลอาการแสดงเฉพาะเมื่อ Assessment ของสูตรนั้นเสร็จและ signature ยังตรงกับสูตรปัจจุบัน
5. การเพิ่ม ลบ หรือเปลี่ยนเปอร์เซ็นต์สารต้อง invalidate ผลเดิม แต่เก็บพื้นที่ทาไว้เพื่อให้ผู้ใช้ประเมินสูตรฉบับแก้ไขในตำแหน่งเดิม
6. การลบสูตรต้องลบรอย ผล และ state เฉพาะสูตรนั้น
7. การเปลี่ยนสูตรต้องไม่ reload โมเดล ไม่ลบรอยของสูตรอื่น และไม่ย้ายกล้อง
8. ตรวจ persistence แยกตาม `projectId` และ `formulaId` หลัง F5

### 15.4 Information Architecture ใหม่บน Desktop

หน้า Desktop แบ่งเป็น 4 พื้นที่ตามลำดับงาน ไม่แบ่งตามโครงสร้างโค้ด:

1. **Top App Bar — บริบทและความคืบหน้า**
   - Logo/กลับโปรเจกต์
   - ชื่อโปรเจกต์ปัจจุบัน
   - Mode: ประเมิน / Nodes / ความน่าเชื่อถือ
   - Stepper: สูตร → สาร → ทาโมเดล → ประเมิน → ผลลัพธ์
   - PDF แสดงเมื่อมีผลพร้อมส่งออกเท่านั้น
2. **Experiment Navigator — เลือกการทดลอง**
   - รายการกล่องสูตร
   - ชื่อสูตร จำนวนสาร บริเวณทา และสถานะสั้น ๆ
   - สถานะที่ใช้: ยังไม่มีสาร / พร้อมทา / พร้อมประเมิน / กำลังวิเคราะห์ / มีผลแล้ว / สูตรถูกแก้ไข
   - สร้าง เปลี่ยนชื่อ และลบสูตรจากพื้นที่เดียวกัน
3. **Formula Workspace — เตรียมสูตร**
   - สารในสูตรและน้ำฐาน
   - เพิ่มจากคลัง, CSV และ OCR
   - แสดงผลรวม %, validation และคำเตือนในตำแหน่งใกล้ข้อมูลที่ผิด
   - พับเก็บได้เมื่อผู้ใช้กำลังทาหรืออ่านผล เพื่อเพิ่มพื้นที่โมเดล
4. **Model + Result Workspace — ทาและอ่านผล**
   - โมเดลเป็นพื้นที่หลักและไม่ remount เมื่อสลับสูตรหรือเปิด panel
   - Toolbar ใกล้โมเดลมีขนาดแปรง, ยางลบ, ล้างรอยที่เลือก และล้างทั้งหมด
   - Right Inspector เปลี่ยนเนื้อหาตาม state: คำแนะนำ → พร้อมประเมิน → กำลังวิเคราะห์ → ผลประเมิน

### 15.5 การนำทางผู้ใช้ครั้งแรกแบบ Progressive Guidance

ไม่ใช้ Tutorial Modal ขนาดใหญ่ แต่ใช้คำแนะนำตามบริบท:

- ไม่มีสูตร: เน้นปุ่ม “สร้างสูตรแรก” และซ่อนเครื่องมือที่ยังใช้ไม่ได้
- มีสูตรแต่ไม่มีสาร: Formula Workspace แสดง Empty state พร้อม CTA “เพิ่มสาร”
- มีสารแต่ยังไม่ทา: โมเดลแสดงคำสั้น “เลือกบริเวณบนโมเดลเพื่อทาสูตร” และเน้นเครื่องมือแปรง
- ทาแล้ว: แสดงสถานะ “พร้อมประเมิน” พร้อมสรุปสูตร พื้นที่ทา และปุ่มประเมิน
- กำลังประเมิน: ล็อกการส่งซ้ำเฉพาะสูตรนั้น แต่ยังสลับดูสูตรอื่นได้
- ประเมินเสร็จ: Toast “วิเคราะห์เสร็จสิ้น” และพา focus ไปสรุปผลโดยไม่หมุนหรือ reset กล้อง
- กดปุ่มในลำดับที่ยังไม่พร้อม: แสดง Toast ระบุสิ่งที่ขาดเพียงหนึ่งเรื่องที่ควรทำต่อทันที

### 15.6 State ของ Right Inspector

1. **No formula** — ยังไม่ได้เลือกสูตร
2. **Empty formula** — ยังไม่มีสารในสูตร
3. **Needs paint** — สูตรผ่าน validation แต่ยังไม่มีรอยทา
4. **Ready to assess** — แสดงชื่อสูตร จำนวนสาร สัดส่วนรวม และบริเวณที่ทา
5. **Assessing** — แสดงสถานะจาก Backend และป้องกันการส่งซ้ำ
6. **Completed** — แสดงผลตาม Day 1/3/7 พร้อมรายละเอียดบริเวณและอาการ
7. **Stale result** — สูตรถูกแก้หลังประเมิน; ซ่อนอาการเดิมและให้ประเมินใหม่
8. **Failed** — สาเหตุแบบอ่านง่ายและปุ่มลองใหม่

### 15.7 Visual Direction สำหรับงานวิจัย Skincare

- ใช้พื้นขาว/เทาอ่อนและ Teal ของโครงการเป็นสี action หลัก
- ใช้สีความเสี่ยงเฉพาะผลประเมิน ไม่ใช้ตกแต่งพื้นที่ทั่วไป
- Typography เน้นชื่อสูตร สาร เปอร์เซ็นต์ และคะแนนให้สแกนข้อมูลได้เร็ว
- ใช้ Lucide/SemanticIcon แทน Emoji ทั้งหมด
- ใช้คำศัพท์คงที่: “สูตร”, “สาร”, “บริเวณทา”, “ประเมิน”, “ผลประเมิน”
- แยกข้อมูล Input, Simulation และ Result ด้วยหัวข้อและ spacing ไม่ใช้กรอบซ้อนหลายชั้น
- ทุกคะแนนต้องมี label และระดับข้อความกำกับ ไม่พึ่งสีเพียงอย่างเดียว
- แสดง disclaimer ว่าเป็นการคัดกรองด้วยแบบจำลอง ไม่ใช่ผลทางคลินิก ในตำแหน่งที่อ่านได้แต่ไม่แย่งความเด่นจากผลหลัก

### 15.8 Motion ที่ต้องใช้

- เปิด/ปิด Formula Workspace: transform 250–300ms โดยโมเดลเลื่อนอย่างต่อเนื่อง ไม่กระโดด
- เพิ่ม/ลบสูตรและสาร: fade + translate 180–240ms
- เปลี่ยน Workflow step: เปลี่ยนสีและ progress แบบนุ่มนวล
- หลังเริ่มประเมิน: ครีมยังคงอยู่ระหว่างรอผล
- เมื่อสำเร็จ: ครีมค่อย ๆ จางก่อน แล้วอาการค่อย ๆ ปรากฏ
- เปลี่ยน Day 1/3/7: transition เฉพาะความเข้มอาการ ไม่ลบรอยและไม่ reset กล้อง
- รองรับ `prefers-reduced-motion` ทุกจุด

### 15.9 ลำดับ Implementation

#### A0 — Baseline และ State Contract

- [x] บันทึกภาพและพฤติกรรม Desktop ปัจจุบัน
- [x] ระบุ state source ของสูตร รอยทา Assessment และผล Day 1/3/7
- [x] เพิ่ม/ปรับ unit tests ของ precondition ก่อนเปลี่ยน UI

#### A1 — เปลี่ยน Workflow เป็น Paint ก่อน Assess

- [x] แยก formula validation สำหรับ Paint และ Assessment
- [x] เปิด Paint เมื่อสูตรพร้อม โดยไม่ต้องประเมินก่อน
- [x] บังคับ Assessment ให้มีรอยทาของสูตรที่เลือก
- [x] เปิดยางลบสำหรับรอยครีมก่อนประเมิน
- [x] แก้ข้อความ คำแนะนำ และ Workflow Stepper ให้ตรงลำดับใหม่
- [x] รักษา multi-formula paint และป้องกันพื้นที่ทับกัน

#### A2 — จัดโครงสร้าง UI Desktop ใหม่

- [ ] ปรับ Top App Bar และ Stepper
- [ ] ปรับ Experiment Navigator ให้แสดงสถานะของแต่ละสูตร
- [ ] ปรับ Formula Workspace ให้เน้นสาร สัดส่วน และ validation
- [ ] ปรับ Model Toolbar ให้รวมเครื่องมือทา/ลบในตำแหน่งเดียว
- [ ] ปรับ Right Inspector เป็น state-driven panel
- [ ] ลดข้อความซ้ำ กรอบซ้อน และ control ที่ไม่เกี่ยวกับขั้นปัจจุบัน

#### A3 — Result Experience

- [ ] แสดง loading/progress จากสถานะ Backend
- [ ] ทำ transition ครีมจางและอาการปรากฏ
- [ ] แสดงบริเวณที่ทา อาการ คะแนน ระดับ และ confidence
- [ ] เชื่อม Day 1/3/7 โดยไม่เปลี่ยนรอยหรือกล้อง
- [ ] แสดง Stale result เมื่อแก้สูตรหลังประเมิน

#### A4 — Persistence และ Regression

- [ ] ทดสอบ F5 ทุกช่วงของ Workflow
- [ ] ทดสอบสลับหลายสูตรโดยโมเดลไม่ reload
- [ ] ทดสอบเปิดโปรเจกต์อื่นแล้วข้อมูลไม่ปะปน
- [ ] ทดสอบ CSV, OCR และ Node ไม่เสียจากการปรับหน้า
- [ ] ทดสอบ error, retry, cancel และ request ซ้ำ

#### A5 — Responsive Layout หลัง Desktop ผ่านเท่านั้น

- [ ] ออกแบบ Tablet/iPad หลัง Desktop UX ผ่าน
- [ ] ออกแบบ Mobile หลัง Tablet ผ่าน
- [ ] กำหนดวิธีเปิด Formula Workspace และ Result Inspector บนจอแคบ
- [ ] รักษาโมเดลให้เป็นพื้นที่หลักและไม่มี horizontal overflow
- [ ] ทดสอบ touch target, keyboard, focus และ screen reader
- [ ] ทดสอบ 375px, 390px, 768px, 821px, 1024px และ 1440px

### 15.10 Acceptance Criteria

- [ ] ผู้ใช้ใหม่มองหน้าแล้วทราบว่าต้องสร้างสูตร เพิ่มสาร และทาบนโมเดลก่อนประเมิน
- [ ] ไม่สามารถส่งประเมินได้หากสูตรที่เลือกยังไม่มีรอยทา และ Toast บอกสิ่งที่ขาดอย่างชัดเจน
- [ ] ทาและลบรอยครีมสีขาวได้ก่อนมีผลประเมิน
- [ ] การประเมินไม่เริ่มจากการทา ต้องกด “ประเมินสูตร” เท่านั้น
- [ ] ผลและอาการแสดงหลัง Backend สำเร็จเท่านั้น
- [ ] เปลี่ยนสูตรไม่ reload โมเดล ไม่ reset กล้อง และไม่ลบรอยของสูตรอื่น
- [ ] สูตรหลายกล่องแสดงบนโมเดลพร้อมกันได้ แต่ทับพื้นที่กันไม่ได้
- [ ] แก้สารหรือเปอร์เซ็นต์แล้วผลเก่าถูกซ่อนจนกว่าจะประเมินใหม่
- [ ] Day 1/3/7 เปลี่ยนความรุนแรงโดยไม่ลบรอยทา
- [ ] F5 แล้วสูตร รอยทา ผลล่าสุด วันที่ และสูตรที่เลือกไม่หาย
- [ ] Desktop Workflow ผ่านครบก่อนเริ่ม Responsive Layout

### 15.11 ผลการทำ A0 — Baseline และ State Contract

วันที่ตรวจ: 2 สิงหาคม 2569

หน้าที่ตรวจ: `/assess?projectId=116` ที่ Desktop 1440×900 โดยใช้โปรเจกต์ `Thanakhon`

#### Baseline UI/Behavior

- หน้าโหลดสำเร็จและไม่มี console warning/error ในรอบที่ตรวจ
- Top App Bar แสดง Workflow เพียง 3 ขั้น: `เตรียมสูตร → ประเมิน → ดูผลลัพธ์`
- สูตรเริ่มต้นคือ `สูตร A` และยังไม่มีสาร
- Formula Workspace เริ่มปิดตามค่าที่กำหนดเมื่อเข้าโปรเจกต์
- โมเดลแสดงข้อความ `กดประเมินสูตรก่อน จึงจะ Paint บนโมเดลได้`
- ปุ่มยางลบถูก disabled ก่อนมีผลประเมิน
- ปุ่ม `ประเมินสูตร` ยังเป็น action หลักก่อนขั้น Paint
- Right Inspector แสดง Day 1/3/7, ผู้ช่วย AI, Developer Test และ Empty Result พร้อมกัน แม้ผู้ใช้ยังอยู่ต้น Workflow
- Baseline นี้ยืนยันว่าต้องแก้ state gating ก่อนจัด Layout ใหม่ เพื่อไม่ให้ UI ใหม่อธิบาย Workflow ที่ logic ยังทำไม่ได้

#### State Contract

| State | Source of truth | Persistence | ขอบเขต | หน้าที่ใน Workflow ใหม่ |
|---|---|---|---|---|
| Project context | Query `projectId` + `api.getProject()` | Backend | ต่อโปรเจกต์ | ยืนยันว่า Assessment เป็นของโปรเจกต์ใด |
| `formulas` | `ProjectWorkspace.formulas` | LocalStorage | ต่อโปรเจกต์ | รายการการทดลองและสารของแต่ละสูตร |
| `activeId` | `ProjectWorkspace.activeFormulaId` | LocalStorage | ต่อโปรเจกต์ | สูตรที่กำลังเพิ่มสาร ทา และประเมิน |
| `region` | สูตรที่เลือก + `ProjectWorkspace.region` | LocalStorage | ต่อสูตร/โปรเจกต์ | บริเวณทดสอบของสูตรปัจจุบัน |
| `paintByFormulaId` | Snapshot จาก `SymptomLabModel` | LocalStorage | ต่อสูตร | พื้นที่ทาและ `hasPaint` ที่ใช้ปลดล็อก Assessment |
| `assessmentByFormulaId` | ผลจาก Backend พร้อม `inputSignature` | LocalStorage + Backend record | ต่อสูตร | job และผลล่าสุดที่ยังตรงกับสูตรปัจจุบัน |
| `submittingFormulaIds` | React state | ไม่บันทึก | ต่อสูตร | ป้องกันการส่ง Assessment ซ้ำระหว่าง request |
| `dayIdx` | `ProjectWorkspace.dayIdx` | LocalStorage | ต่อโปรเจกต์ | เลือกคะแนน Day 1/3/7 โดยไม่แก้รอยทา |
| `graphByFormulaId` | Snapshot จาก Formula Graph | LocalStorage | ต่อสูตร | Node mode ของสูตรที่เลือก |
| Camera/controls | ภายใน `SymptomLabModel` | ไม่บันทึกข้าม F5 | ต่อ Canvas instance | ต้องไม่ reset เมื่อสลับสูตรหรือเปิด panel |
| UI ชั่วคราว | `error`, `eraseMode`, `showTrend`, `showTemplates` | ไม่บันทึก | ต่อ session | Feedback และเครื่องมือ ไม่ใช่ข้อมูลวิจัย |
| Developer Test | `developerTestEnabled`, test scores | ไม่บันทึก | เฉพาะ QA | ห้ามส่ง API และห้ามแทนผลจริง |

#### กติกาที่ล็อกไว้ก่อนเริ่ม A1

- `formulaReadinessProblem()` เป็น validation กลางสำหรับ Project, สูตร, สาร, SMILES, ความเข้มข้น และผลรวม 100%
- Paint จะปลดล็อกด้วย Formula Readiness ไม่ใช่สถานะ Assessment completed
- Assessment จะใช้ Formula Readiness ร่วมกับ `paintByFormulaId[formulaId].hasPaint === true`
- ผลประเมินใช้ได้เมื่อ `inputSignature` ยังตรงกับสารและบริเวณปัจจุบันเท่านั้น
- เปลี่ยนสารให้ invalidate ผล แต่ไม่ลบพื้นที่ทา
- ลบสูตรให้ลบสูตร รอย ผล และกราฟของสูตรนั้นเท่านั้น
- สลับสูตรให้เปลี่ยน mask ภายใน Canvas เดิม เพื่อรักษากล้องและโมเดลที่โหลดแล้ว

### 15.12 ผลการทำ A1 — Paint ก่อน Assess

วันที่ตรวจ: 2 สิงหาคม 2569

- แยกเงื่อนไขความพร้อมของสูตรออกจากเงื่อนไขเริ่มประเมิน โดย Paint ใช้ Formula Readiness ส่วน Assessment ต้องมีรอยทาของสูตรที่เลือกเพิ่มอีกหนึ่งเงื่อนไข
- สูตรที่ผ่าน validation สามารถทาครีมสีขาวและใช้ยางลบได้ทันที โดยไม่ต้องมีผลประเมินก่อน
- หากกดประเมินก่อนทา ระบบแสดง Toast `กรุณาทาครีมลงบนผิวโมเดลก่อนเริ่มประเมิน`
- แยกสถานะการทาออกจากการเปิดเผยผลบนโมเดล: ก่อนประเมินแสดงเฉพาะครีมสีขาว และหลัง Backend สำเร็จจึงค่อยเปิดเผยอาการบน mask เดิม
- Workflow Stepper เปลี่ยนเป็น `สูตร → สาร → ทาโมเดล → ประเมิน → ผลลัพธ์` พร้อมข้อความแนะนำตาม state ปัจจุบัน
- การทาหลายสูตรและการป้องกันรอยทับกันยังใช้ mask แยกตามสูตรและ occupied mask เดิม จึงไม่ทำให้โมเดลหรือกล้อง reload
- เพิ่ม unit test ครอบคลุมกรณีสูตรพร้อมแต่ยังไม่มีรอยทา และตรวจ workflow จริงตั้งแต่สูตรว่างจนประเมินสำเร็จ

## 16. ไฟล์หลักที่เปลี่ยน

- `frontend/src/app/(dashboard)/projects/page.tsx`
- `frontend/src/app/(dashboard)/projects/new/page.tsx`
- `frontend/src/components/projects/ProjectsShell.tsx`
- `frontend/src/components/projects/ProjectFormDialog.tsx`
- `frontend/src/components/projects/ProjectCreateView.tsx`
- `frontend/src/lib/project-appearance.ts`
- `frontend/src/lib/api.ts`
- `backend/app/api/projects.py`
- `backend/app/models/project.py`
- `backend/app/schemas/project.py`
- `backend/alembic/versions/20260730_0005_project_appearance_soft_delete.py`
- `backend/tests/test_project_creation.py`
- `backend/tests/test_project_soft_delete.py`

## 17. Checklist การปรับ Layout รอบล่าสุด

- [x] เอากรอบใหญ่รอบ Search ออก
- [x] วาง Search ขนาดกระชับแถวเดียวกับหัวข้อบน Desktop และแสดงแม้ยังไม่มีโปรเจกต์
- [x] เอาตัวเลือก Sort ออกจาก UI และเรียงโปรเจกต์ล่าสุดให้อัตโนมัติ
- [x] ย้าย Logo/RalphGuard ไป Sidebar และเอาปุ่มสร้างออกจาก Sidebar
- [x] เพิ่ม Resize handle ให้ Sidebar พร้อมโหมด icon-only เมื่อย่อ
- [x] ปรับข้อความเมนูที่เลือกเป็นน้ำหนักปกติ
- [x] ย้ายชื่อหน้า จำนวน คำอธิบาย และ Search เข้า Top App Bar
- [x] เพิ่ม Grid/List layout switch พร้อม Flip animation
- [x] แสดงปุ่มสร้างใน Empty state เมื่อไม่มีโปรเจกต์
- [x] แสดงปุ่มสร้างใน Top App Bar เมื่อมีโปรเจกต์แล้ว
- [x] เอาอาการยกตัวของ Project Card ออกและเหลือแสงสีอ่อนตามสีโปรเจกต์
- [x] จัด Project Card ให้กระชับ แยกข้อมูลหลัก Action และวันที่อัปเดตตามลำดับการอ่าน
- [x] ปรับ Loading skeleton ให้มีโครงสร้างและความสูงตรงกับ Project Card จริง
- [x] แสดงปุ่มสร้างโปรเจกต์ใน Top App Bar ตั้งแต่ระหว่างโหลดข้อมูลหลัง F5
- [x] ตั้งความกว้างเริ่มต้น Sidebar เป็น 308px และตัดข้อความยาวด้วย ellipsis
- [x] เลื่อนจุดเปลี่ยนเป็น icon-only ไปที่ 112px และ snap Sidebar เหลือ 72px เมื่อย่อสุด
- [x] ล็อกขนาด Logo และ Navigation icon ไม่ให้ถูกบีบระหว่างปรับความกว้าง Sidebar
- [x] คืนค่าความกว้าง Sidebar ก่อน Browser วาดหน้าเพื่อลด layout shift หลัง F5
- [x] แสดง Skeleton เฉพาะเมื่อมีจำนวนโปรเจกต์เดิมที่บันทึกไว้
- [x] เอากรอบใหญ่รอบ Empty state ออก
- [x] เอากรอบ พื้นหลัง Card และเงารอบ Error state ออก
- [x] ตัดคำว่า `Project Workspace` ออกจาก content หลัก
- [x] ลดขนาดหัวข้อ จำนวนโปรเจกต์ และคำอธิบาย
- [x] เปิดโปรเจกต์ด้วยการคลิก Project Card ทั้งใบและเอาแถบเปิดโปรเจกต์ออก
- [x] เปลี่ยน Create จาก Dialog เป็น content state เต็มพื้นที่
- [x] จัดข้อมูลหลักไว้ก่อนสีและไอคอน
- [x] เพิ่มปุ่มกลับโดยไม่เปลี่ยน route
- [x] เพิ่ม animation ตอนเข้าสู่ Create View
- [x] ตรวจ Desktop และ Mobile 390×844
- [x] ตรวจว่าไม่มี console error
- [x] Frontend type-check ผ่าน
- [x] Frontend tests ผ่าน 46/46
- [x] Production build ผ่าน
