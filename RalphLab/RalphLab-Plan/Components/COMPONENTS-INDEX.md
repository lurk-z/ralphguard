# Components RalphGuard (V1)

โค้ด UI ที่ใช้งานจริงในเว็บ RalphGuard ณ 19 พ.ย. 2569 (ddd97e1 (jay-sandbox)) แยกเป็นไฟล์ละ 1 component พร้อม **ชื่อไฟล์ที่ต้องสร้าง การติดตั้ง หน้าที่ใช้ และโค้ดเต็ม** คัดลอกไปใช้ต่อในงานแข่งได้ทันที

รวม 59 ชิ้น · เบา 41 · ปานกลาง 10 · หนัก 8

| ดูก่อน | ไฟล์ |
|---|---|
| กติกาเวอร์ชัน V1 / V2 | [VERSIONS](VERSIONS.md) |
| เริ่มโปรเจกต์ใหม่ ต้องมีอะไรก่อน | [BASE-SETUP](BASE-SETUP.md) |

## เกณฑ์น้ำหนัก

วัดด้วย `npm run inventory` ใน `frontend` (esbuild, minify + gzip) ไม่นับ React, Next, lucide, three.js และตัวช่วย class

| น้ำหนัก | เกณฑ์ |
|---|---|
| เบา | น้อยกว่า 5 KB **หรือ** โหลดเมื่อเปิดใช้เท่านั้น (`next/dynamic` ไม่อยู่ใน first load) |
| ปานกลาง | 5–15 KB |
| หนัก | มากกว่า 15 KB หรือใช้ three.js / gsap ตอนเปิดหน้า |

## ui (shadcn)

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [Alert](ui/Alert.md) | V1 | เบา | 0.6 KB | `/assess`, `/projects` | กล่องแจ้งเตือนในหน้า (shadcn Alert) แบบปกติ เตือน และ destructive |
| [AlertDialog](ui/AlertDialog.md) | V1 | ปานกลาง | 13.3 KB | `/assess`, `/projects` | หน้าต่างยืนยันการกระทำเสี่ยง เช่น ลบ (shadcn AlertDialog) |
| [Avatar](ui/Avatar.md) | V1 | เบา | 3 KB | `/projects` | รูปผู้ใช้กลม (shadcn Avatar) มี fallback เป็นตัวอักษร |
| [Badge](ui/Badge.md) | V1 | เบา | 0.4 KB | `/assess` | ป้ายเล็ก (shadcn Badge) |
| [Button](ui/Button.md) | V1 | เบา | 1.6 KB | `/`, `/assess`, `/projects` | ปุ่มพื้นฐาน (shadcn Button) 6 variant 6 ขนาด สีหลักใช้ primary-strong |
| [Card](ui/Card.md) | V1 | เบา | 0.5 KB | `/assess` | การ์ด (shadcn Card) |
| [Checkbox](ui/Checkbox.md) | V1 | ปานกลาง | 6.2 KB | `/projects` | ช่องติ๊ก (shadcn Checkbox) รองรับสถานะ indeterminate และพื้นที่แตะ 44px |
| [Dialog](ui/Dialog.md) | V1 | ปานกลาง | 12.5 KB | `/projects` | หน้าต่าง modal (shadcn Dialog) ใช้กับสร้าง/เปลี่ยนชื่อโปรเจกต์ |
| [DropdownMenu](ui/DropdownMenu.md) | V1 | หนัก | 27.7 KB | `/assess`, `/projects` | เมนู dropdown (shadcn DropdownMenu) รวมรายการเลือกเดียวและ checkbox |
| [Empty](ui/Empty.md) | V1 | เบา | 0.6 KB | `/assess`, `/projects` | สถานะว่าง (shadcn Empty) ไอคอน หัวข้อ คำอธิบาย ปุ่ม |
| [Input](ui/Input.md) | V1 | เบา | 0.9 KB | `/assess`, `/projects` | ช่องกรอก (shadcn Input) มีโหมดค้นหา ไอคอนนำหน้า และหน่วยต่อท้าย |
| [Popover](ui/Popover.md) | V1 | หนัก | 22.2 KB | `/assess` | กล่องลอยเล็กยึดกับปุ่ม (shadcn Popover) มีระยะกันชนขอบจอ 8px |
| [Progress](ui/Progress.md) | V1 | เบา | 2.5 KB | `/projects` | แถบความคืบหน้า (shadcn Progress) |
| [Select](ui/Select.md) | V1 | เบา (lazy) | 31.1 KB | `/assess` | ตัวเลือกแบบ dropdown (shadcn Select) รองรับจัดกลุ่ม |
| [Sheet](ui/Sheet.md) | V1 | ปานกลาง | 12.5 KB | `/assess` | แผงเลื่อนจากขอบจอ (shadcn Sheet) ใช้กับแผงสูตรและผลบนจอเล็ก |
| [Skeleton](ui/Skeleton.md) | V1 | เบา | 0.2 KB | `/assess`, `/projects` | บล็อกกระพริบรอข้อมูล (shadcn Skeleton) |
| [Slider](ui/Slider.md) | V1 | ปานกลาง | 6.4 KB | `/assess` | แถบเลื่อนค่า (shadcn Slider) |
| [Sonner](ui/Sonner.md) | V1 | เบา | 1 KB | `ทุกหน้า (layout)` | ตัวแสดง toast (sonner) วางที่ layout ราก |
| [Table](ui/Table.md) | V1 | เบา | 0.6 KB | `/projects` | ตาราง (shadcn Table) |
| [Tabs](ui/Tabs.md) | V1 | ปานกลาง | 6.3 KB | `/assess` | แท็บ (shadcn Tabs) เป็นฐานของ SegmentedTabs |
| [Tooltip](ui/Tooltip.md) | V1 | หนัก | 17.4 KB | `/assess` | คำอธิบายสั้นเมื่อชี้หรือโฟกัส (shadcn Tooltip) |

## kit (ชิ้นของแอป)

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [AppHeader](kit/AppHeader.md) | V1 | หนัก | 29.6 KB | `/projects` | แถบบนแบบไม่มี sidebar: โลโก้ซ้าย ปุ่มและเมนูผู้ใช้ขวา |
| [AssessmentIcon](kit/AssessmentIcon.md) | V1 | เบา | 0.8 KB | `/assess` | ไอคอนของ endpoint ทั้ง 5 ตามรหัสผลประเมิน |
| [BrandLogo](kit/BrandLogo.md) | V1 | เบา | 0.6 KB | `/projects` | โลโก้ RalphGuard (ไอคอน + ชื่อ + คำอธิบายย่อ) |
| [BrushToolbar](kit/BrushToolbar.md) | V1 | ปานกลาง | 7.5 KB | `/assess` | แถบเครื่องมือทาสีใต้ใบหน้า: ขนาดรอย ลบรอย ลบทั้งหมด เริ่มประเมิน (แยกแถวบนมือถือ) |
| [FormulaCard](kit/FormulaCard.md) | V1 | เบา | 4.4 KB | `/assess` | กล่องสูตร: แถบสัดส่วนสี รายการสาร ช่อง % ปุ่มเอาสารออก และปุ่มเพิ่มสาร |
| [PageHeader](kit/PageHeader.md) | V1 | เบา | 0.4 KB | `/projects` | หัวหน้า: ชื่อ คำอธิบาย และปุ่มด้านขวา |
| [ProjectList](kit/ProjectList.md) | V1 | ปานกลาง | 8.7 KB | `/projects` | ตารางโปรเจกต์: ช่องติ๊ก เรียงลำดับ แก้ไข/ลบเมื่อชี้ เปิดได้ทั้งแถว |
| [RiskBands](kit/RiskBands.md) | V1 | เบา | 0.2 KB | `/assess` | ค่าคงที่ระดับความเสี่ยงและความเชื่อมั่น (สี ชื่อ) ไฟล์เล็กเพื่อไม่ลาก Tooltip |
| [ScoreCard](kit/ScoreCard.md) | V1 | หนัก | 20.1 KB | `/assess` | รายการผลประเมินแต่ละ endpoint: วงแหวนคะแนนนับขึ้น ระดับสี ความเชื่อมั่น พร้อม ScoreStat |
| [SegmentedTabs](kit/SegmentedTabs.md) | V1 | ปานกลาง | 6.6 KB | `/assess` | แท็บสลับมุมมอง 2 แบบ: line (เส้นใต้) และ pill (แคปซูลเลื่อน) ซ่อนชื่อบนมือถือได้ |
| [SeverityLegend](kit/SeverityLegend.md) | V1 | เบา | 0.5 KB | `/assess` | คำอธิบายระดับสี ต่ำ ปานกลาง สูง รุนแรง |

## face (ใบหน้า 3D)

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [FaceCanvasSkeleton](face/FaceCanvasSkeleton.md) | V1 | เบา | 0.7 KB | `/assess` | โครงรอ (skeleton) ของช่องใบหน้า 3D ขณะโหลดโค้ด |
| [FaceLoadingOverlay](face/FaceLoadingOverlay.md) | V1 | เบา (lazy) | 0.7 KB | `/assess` | แผ่นซ้อนแสดง % ดาวน์โหลด head.glb จนโมเดลขึ้น |
| [PaintSymptomModel](face/PaintSymptomModel.md) | V1 | เบา (lazy) | 12.6 KB | `/assess` | โมเดลหัว + shader ผิว ที่รับรอยทาและคะแนนแล้วแสดงแดง ตุ่ม ลอก บวม |
| [SymptomFaceCanvas](face/SymptomFaceCanvas.md) | V1 | เบา (lazy) | 16.9 KB | `/assess` | ใบหน้า 3D ที่ทาสีและแสดงอาการตามคะแนนประเมิน มีโหมดวาดเมื่อไม่ว่างเท่านั้น |

## formula (สูตร)

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [CsvImportModal](formula/CsvImportModal.md) | V1 | เบา (lazy) | 8.5 KB | `/assess` | หน้าต่างนำเข้าสูตรจากไฟล์ CSV |
| [FormulaGraph](formula/FormulaGraph.md) | V1 | เบา (lazy) | 105.6 KB | `/assess` | กราฟ Node ของสูตร ลากสารเข้า-ออก เชื่อมความสัมพันธ์ (reactflow) ใช้ในโหมด Nodes |
| [LabelScanModal](formula/LabelScanModal.md) | V1 | เบา (lazy) | 19.2 KB | `/assess` | หน้าต่างสแกนฉลากด้วย OCR เพื่อนำสารเข้าสูตร |

## substances (คลังสาร)

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [ManualSubstanceModal](substances/ManualSubstanceModal.md) | V1 | เบา (lazy) | 6 KB | `/assess` | หน้าต่างเพิ่มสารเองด้วยชื่อ/SMILES พร้อมคำแนะนำจากทะเบียนสาร |
| [SubstanceHoverCard](substances/SubstanceHoverCard.md) | V1 | ปานกลาง | 10.1 KB | `/assess` | การ์ดข้อมูลสารที่ขึ้นเมื่อชี้หรือกดชื่อสารในสูตร |
| [SubstanceLibraryPage](substances/SubstanceLibraryPage.md) | V1 | เบา (lazy) | 56.8 KB | `/assess` | หน้าคลังสารเคมีเต็มจอ ค้นหา กรองหมวด ดาวสารโปรด และเพิ่มสารลงสูตร |

## assistant

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [VoiceAssistant](assistant/VoiceAssistant.md) | V1 | เบา (lazy) | 6.9 KB | `/assess` | ผู้ช่วย AI แบบแชทและเสียง อธิบายผลประเมินของสูตร |

## charts

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [TrendChart](charts/TrendChart.md) | V1 | เบา (lazy) | 108.2 KB | `/assess` | กราฟเส้นแนวโน้มการอักเสบของผลประเมินแต่ละ Day (recharts) |

## shared

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [BrandedProgressLoader](shared/BrandedProgressLoader.md) | V1 | เบา | 3 KB | `/projects` | หน้าจอโหลดมีโลโก้และแถบความคืบหน้า |
| [SemanticIcon](shared/SemanticIcon.md) | V1 | เบา | 0.9 KB | `/`, `/assess` | ชุดไอคอนตามความหมายของแอป (ใบหน้า ตา ขวดทดลอง ฯลฯ) |

## layout

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [Navbar](layout/Navbar.md) | V1 | เบา | 2.2 KB | `/` | แถบเมนูหน้าแรก |

## auth

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [GoogleSignInButton](auth/GoogleSignInButton.md) | V1 | เบา | 0.8 KB | `/login` | ปุ่มเข้าสู่ระบบด้วย Google |
| [SessionProvider](auth/SessionProvider.md) | V1 | เบา | 0.1 KB | `ทุกหน้า (layout)` | ตัวห่อ next-auth SessionProvider วางที่ layout ราก |

## landing (หน้าแรก)

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [AIAssistantShowcase](landing/AIAssistantShowcase.md) | V1 | เบา | 3.2 KB | `/` | ภาพประกอบผู้ช่วย AI ในเนื้อเรื่องหน้าแรก |
| [Chapters](landing/Chapters.md) | V1 | เบา | 1.4 KB | `/` | ข้อมูลบทและตำแหน่งกล้องของเนื้อเรื่องหน้าแรก |
| [GridScanShowcase](landing/GridScanShowcase.md) | V1 | เบา | 1.2 KB | `/` | ภาพประกอบการสแกนกริดผิวในเนื้อเรื่องหน้าแรก |
| [LabScene](landing/LabScene.md) | V1 | หนัก | 3.2 KB | `/` | ห้องแล็บ 3D หน้าแรก กล้องเคลื่อนตามการเลื่อนหน้า |
| [NodeWorkspaceShowcase](landing/NodeWorkspaceShowcase.md) | V1 | เบา | 0.6 KB | `/` | ภาพประกอบพื้นที่ Node ในเนื้อเรื่องหน้าแรก |
| [OCRLabelShowcase](landing/OCRLabelShowcase.md) | V1 | เบา | 2.1 KB | `/` | ภาพประกอบการสแกนฉลาก OCR ในเนื้อเรื่องหน้าแรก |
| [ScrollStory](landing/ScrollStory.md) | V1 | หนัก | 38.7 KB | `/` | ข้อความเล่าเรื่องที่ค่อยๆ เปลี่ยนตามการเลื่อนหน้า หน้าแรก |
| [SmoothScroll](landing/SmoothScroll.md) | V1 | หนัก | 49.2 KB | `/` | ตัวเลื่อนหน้าแบบนุ่ม (gsap ScrollSmoother) ส่งค่าความคืบหน้าให้ฉาก 3D หน้าแรก |

## hooks

| Component | รุ่น | น้ำหนัก | ขนาด | ใช้หน้า | ทำอะไร |
|---|---|---|---:|---|---|
| [UseEverTrue](hooks/UseEverTrue.md) | V1 | เบา | 0.1 KB | `/assess` | Hook: เป็น true เมื่อค่าเคยเป็น true แล้วค้างไว้ ใช้ mount แผงหนักเมื่อเปิดครั้งแรก |
| [UseIdleFrameloop](hooks/UseIdleFrameloop.md) | V1 | เบา | 0.5 KB | `/`, `/assess` | Hook ควบคุมการวาด 3D: วาดตลอดตอนใช้งาน → วาดเมื่อจำเป็นตอนว่าง → หยุดเมื่อพ้นจอ |

## ใช้ที่หน้าไหน

### `/` (12 ชิ้น)

[AIAssistantShowcase](landing/AIAssistantShowcase.md), [Button](ui/Button.md), [Chapters](landing/Chapters.md), [GridScanShowcase](landing/GridScanShowcase.md), [LabScene](landing/LabScene.md), [Navbar](layout/Navbar.md), [NodeWorkspaceShowcase](landing/NodeWorkspaceShowcase.md), [OCRLabelShowcase](landing/OCRLabelShowcase.md), [ScrollStory](landing/ScrollStory.md), [SemanticIcon](shared/SemanticIcon.md), [SmoothScroll](landing/SmoothScroll.md), [UseIdleFrameloop](hooks/UseIdleFrameloop.md)

### `/assess` (37 ชิ้น)

[Alert](ui/Alert.md), [AlertDialog](ui/AlertDialog.md), [AssessmentIcon](kit/AssessmentIcon.md), [Badge](ui/Badge.md), [BrushToolbar](kit/BrushToolbar.md), [Button](ui/Button.md), [Card](ui/Card.md), [CsvImportModal](formula/CsvImportModal.md), [DropdownMenu](ui/DropdownMenu.md), [Empty](ui/Empty.md), [FaceCanvasSkeleton](face/FaceCanvasSkeleton.md), [FaceLoadingOverlay](face/FaceLoadingOverlay.md), [FormulaCard](kit/FormulaCard.md), [FormulaGraph](formula/FormulaGraph.md), [Input](ui/Input.md), [LabelScanModal](formula/LabelScanModal.md), [ManualSubstanceModal](substances/ManualSubstanceModal.md), [PaintSymptomModel](face/PaintSymptomModel.md), [Popover](ui/Popover.md), [RiskBands](kit/RiskBands.md), [ScoreCard](kit/ScoreCard.md), [SegmentedTabs](kit/SegmentedTabs.md), [Select](ui/Select.md), [SemanticIcon](shared/SemanticIcon.md), [SeverityLegend](kit/SeverityLegend.md), [Sheet](ui/Sheet.md), [Skeleton](ui/Skeleton.md), [Slider](ui/Slider.md), [SubstanceHoverCard](substances/SubstanceHoverCard.md), [SubstanceLibraryPage](substances/SubstanceLibraryPage.md), [SymptomFaceCanvas](face/SymptomFaceCanvas.md), [Tabs](ui/Tabs.md), [Tooltip](ui/Tooltip.md), [TrendChart](charts/TrendChart.md), [UseEverTrue](hooks/UseEverTrue.md), [UseIdleFrameloop](hooks/UseIdleFrameloop.md), [VoiceAssistant](assistant/VoiceAssistant.md)

### `/login` (1 ชิ้น)

[GoogleSignInButton](auth/GoogleSignInButton.md)

### `/projects` (17 ชิ้น)

[Alert](ui/Alert.md), [AlertDialog](ui/AlertDialog.md), [AppHeader](kit/AppHeader.md), [Avatar](ui/Avatar.md), [BrandedProgressLoader](shared/BrandedProgressLoader.md), [BrandLogo](kit/BrandLogo.md), [Button](ui/Button.md), [Checkbox](ui/Checkbox.md), [Dialog](ui/Dialog.md), [DropdownMenu](ui/DropdownMenu.md), [Empty](ui/Empty.md), [Input](ui/Input.md), [PageHeader](kit/PageHeader.md), [Progress](ui/Progress.md), [ProjectList](kit/ProjectList.md), [Skeleton](ui/Skeleton.md), [Table](ui/Table.md)

### `ทุกหน้า (layout)` (2 ชิ้น)

[SessionProvider](auth/SessionProvider.md), [Sonner](ui/Sonner.md)

## ที่ยังไม่อยู่ในนี้

- ห้องแล็บ 3D (`components/three/skincare-lab/*`: ห้อง ตัวละคร สถานีทดสอบ) กำลังเขียนใหม่ ดูไฟล์โมเดลและสคริปต์ที่ [START-HERE](../START-HERE.md) และ [WEB-MODELS](../WEB-MODELS.md) จะเพิ่มเป็น V1 หลังโค้ดนิ่ง
- Component ที่ลบไปแล้วเพราะไม่มีหน้าไหนใช้ (sidebar, drawer, navigation-menu, trace, collapsible, input-group, message-scroller, field, pagination, breadcrumb, bubble, label, particles, separator, persona, message, switch, textarea, แชท AI, edit-sheet, skin-application-demo, substance-thumbnail, three/skin-application, use-mobile) ยังกู้ได้จาก branch `jay`
