# งาน: เปลี่ยนแท็บ Nodes ใน `/assess` เป็น "สายวิวัฒนาการของสูตร" (อ่านอย่างเดียว)

เอกสารสั่งงานสำหรับ agent (Codex) · เขียน 20 พ.ย. 2569 · branch ฐาน `jay-sandbox` (commit `ddd97e1`)
ผู้ใช้ตอบคำถามออกแบบไว้แล้วทั้งหมดในเอกสารนี้ **ถ้าข้อไหนไม่ชัด ให้ถามก่อนทำ อย่าเดา**

---

## 1. เป้าหมาย

แท็บ **Nodes** เดิมคือกราฟแก้สูตร (ลากสาร เชื่อมเส้น กดประเมิน) จะเปลี่ยนเป็น **พื้นที่เก็บสูตรที่ห้องแล็บ AI ทดลอง** ให้ผู้ใช้ดูว่า agent สร้างอะไรมา

- แต่ละ "รุ่น" ของสูตร (V1, V2-A, V2-B, V3 …) คือผลการทดลองของ agent ในห้องแล็บ 3D (แท็บ Lab)
- ผู้ใช้ **ดูได้อย่างเดียว**: ไม่มีปุ่มประเมิน ไม่แก้ไข ไม่ลบ ไม่ลากเส้นเชื่อม
- จุดประสงค์: เห็นแผนผังการทดลองและสายวิวัฒนาการ (เช่น V1 แตกเป็น V2-A กับ V2-B เพื่อลองคนละทาง) เห็นว่าแต่ละรุ่นมีปัญหาอะไร แก้อะไรจากรุ่นแม่ และหารุ่นที่ดีที่สุด
- ผู้ใช้สลับดูห้องแล็บ 3D (แท็บ Lab) กับ workflow (แท็บ Nodes) ของโปรเจกต์เดียวกัน **ด้วยแท็บบนหัวเท่านั้น** ไม่ต้องเชื่อม state ระหว่างสองแท็บ

## 2. หน้าตาที่ต้องการ (ตามภาพร่างของผู้ใช้)

```
                 ┌────────────── V1 ──────────────┐   ← กล่องรุ่น (กว้าง)
                 └────────────────────────────────┘
                   ↑   ↑      ↑       ↑       ↑          เส้นโค้งสีเทา จากกล่องสารแต่ละตัว ชี้ขึ้นไปที่กล่องรุ่น
   ┌─────┐   ┌───────┐   ┌───────┐   ┌───────┐
   │ สาร │   │  สาร  │   │  สาร  │   │  สาร  │       ← กล่องสาร แยกเป็นกล่องละตัว (แบบ node เดิม)
   └─────┘   └───────┘   └───────┘   └───────┘
      ┌──────┐     ┌───────┐        ┌───────┐
      │ สาร  │     │  สาร  │        │  สาร  │       ← แถวที่สอง (ถ้าสารเกิน 4 ตัว)
      └──────┘     └───────┘        └───────┘
```

### 2.1 พื้นที่ (canvas)
- ใช้ **React Flow เดิม** (`reactflow` ที่ติดตั้งอยู่แล้ว) เพื่อให้ **ลากพื้นหลังเลื่อนได้ ซูมด้วยล้อเมาส์ ปุ่ม +/− และแผนที่ย่อ** เหมือน Nodes เดิมทุกอย่าง
  - ดูการตั้งค่าเดิมใน `frontend/src/components/formula/FormulaGraph.tsx` (`<ReactFlow>` บรรทัดราว 1537: `Background color="#CBD5E1" gap={18}`, `Controls showInteractive={false} className="formula-graph-controls"`, `MiniMap pannable zoomable className="formula-graph-minimap …"`, `proOptions={{ hideAttribution: true }}`) และ CSS `.formula-graph-controls` / `.formula-graph-minimap` ใน `app/globals.css`
- **ผู้ใช้ลากย้ายกล่องได้อิสระทุกกล่อง** (กล่องรุ่นและกล่องสาร) เหมือน node เดิม ตำแหน่งเริ่มต้นจัดอัตโนมัติ (ข้อ 4.4)
- ห้าม: เชื่อมเส้นใหม่ (`nodesConnectable={false}`), ลบด้วยปุ่ม Delete (`deleteKeyCode={null}`), แก้ค่าใดๆ
- `fitView` ตอนเปิด

### 2.2 กล่องรุ่น (Version node) กว้างประมาณ 340px
แสดง (ตามลำดับ):
1. **รุ่น** ตัวหนา เช่น `V2-A` + ป้ายสถานะ (ข้อ 4.3) + ป้าย "ดีที่สุด" (ถ้ามี, สีเขียว ไอคอนถ้วย)
2. agent ที่สร้าง · ชื่อสูตร (บรรทัดเล็ก สีจาง) ไม่มี agent ก็แสดงแค่ชื่อสูตร
3. **คะแนน 4 endpoint**: ผิว · ตา · แพ้ · พิษ เป็นแถบเล็กมีตัวเลข สีตามระดับจาก `BANDS` ใน `components/kit/risk-bands.ts`
4. **สิ่งที่แก้จากรุ่นแม่** (สีเขียว ไอคอนประแจ) เช่น `แก้: Ethanol 40→20% · +Glycerin 5%` (คำนวณจากการเทียบสาร ข้อ 4.2)
5. **ปัญหาที่พบ** (สีแดง ไอคอนสามเหลี่ยม) เช่น `ระคายผิว 62 · Ethanol 40%`
6. ถ้าทดสอบแล้วและไม่มีปัญหา: "ไม่พบจุดเสี่ยงสูง" (สีจาง)

กล่องรุ่นมี handle รับเส้นที่ **ขอบล่าง**

### 2.3 กล่องสาร (Substance node) กว้างประมาณ 176px สูงประมาณ 60px
**แบบเดียวกับแถวสารใน node เดิม แต่ไม่มีหัวข้อ "สารในสูตร" ไม่มี "✓ ถูกต้อง · MW"**:
- รูปโครงสร้างเล็ก (`substanceDepictionUrl(smiles)` จาก `lib/api.ts`, `loading="lazy"`, ถ้าโหลดไม่ได้ซ่อนรูป)
- ชื่อสาร + SMILES ตัวเล็ก font mono
- % ทางขวา ตัวหนา
- handle ส่งเส้นที่ **ขอบบน**

### 2.4 เส้น
- จากกล่องสาร **ขึ้นไปที่กล่องรุ่นของมัน** เส้นโค้ง (React Flow edge `type: "default"` = bezier) สีเทา `#94A3B8` หนา ~1.25px หัวลูกศรที่ปลายฝั่งกล่องรุ่น (`markerEnd: { type: MarkerType.ArrowClosed }`)
- **ไม่มีเส้นเชื่อมระหว่างรุ่น** (ผู้ใช้: "ถ้ามีรุ่นลูกก็ไม่ต้องมีอะไร") ความเป็นแม่-ลูกบอกผ่านชื่อรุ่น (V2-A) และบรรทัด "แก้:" ในกล่อง

### 2.5 การเทียบรุ่น
**ยังไม่ต้องเปลี่ยน/ทำเพิ่มในรอบนี้** ผู้ใช้จะคิดอีกที ถ้าจะทำ ให้ถามก่อน (แนวที่คุยกันไว้: กดกล่องรุ่น 2 กล่อง แล้วมีแผงเทียบด้านล่าง: คะแนนแต่ละ endpoint + ผลต่าง ลดลงสีเขียว เพิ่มขึ้นสีแดง + สารที่ต่างกัน)

## 3. ข้อมูล

### 3.1 แหล่งข้อมูลจริง (ใช้ของที่มีอยู่ ห้ามแก้ backend ในงานนี้)
- ผลประเมินของโปรเจกต์: `api.listProjectAssessments(projectId)` → `api.getProjectAssessment(projectId, id)` ได้ `AssessmentRecord` (`lib/api.ts`): `formula` (สารและ %), `status`, `result.endpoints[skin|eye|sens|acute].{peak_score, band}`, `result.substances[].per_endpoint[ep].{score, flagged}`, `created_at`
- ชื่อสูตร: `loadProjectWorkspace(projectId)` (`lib/project-workspace.ts`) → `formulas[]` และ `assessmentByFormulaId[formulaId].jobId` จับคู่ assessment กับสูตรใน workspace
- **เส้นแม่-ลูก**: revision brief ของห้องแล็บ `loadRevisionBrief(projectId, draftFormulaId)` ใน `lib/lab-station/revision.ts` บอกว่าสูตร draft นี้แก้มาจาก assessment ไหน (`sourceAssessmentId`) และพบปัญหาอะไร (`findings`)
  - รุ่นลูก = assessment ของสูตรที่มี brief → แม่ = `sourceAssessmentId`
  - สูตร draft ที่มี brief แต่ยังไม่ได้ประเมิน → แสดงเป็นรุ่นสถานะ "รอทดสอบ" ใต้แม่
- ดูตัวอย่างการอ่านข้อมูลชุดนี้ใน `lib/lab-station/assessment.ts` (`listTestedRevisions`, `loadRevisionAssessment`, `endpointOutcome`)
- endpoint ที่ใช้: `STATION_ENDPOINT_IDS` (`skin`, `eye`, `sens`, `acute`) จาก `lib/lab-station/endpoints.ts`

### 3.2 ไม่มีข้อมูล → แสดงตัวอย่าง
- ถ้าโปรเจกต์ไม่มี assessment เลย, ไม่มี `projectId`, หรือโหลดไม่สำเร็จ → แสดง **tree ตัวอย่าง** พร้อมป้ายบนหัว "ตัวอย่าง · ยังไม่มีการทดลองจากห้องแล็บ" (โหลดพลาด: "โหลดข้อมูลไม่สำเร็จ · แสดงตัวอย่าง")
- ข้อมูลตัวอย่างที่ใช้ (5 รุ่น): V1 Toner A (Ethanol 40, Isopropanol 30, Glycerin 10 · ผิว 62 สูง) → V2-A ลดแอลกอฮอล์ (Ethanol 20, Isopropanol 30, Glycerin 15 · ผิว 30) และ V2-B เปลี่ยนตัวทำละลาย (Isopropanol 60, Glycerin 10 · ผิว 55 สูง) → V3-A ปรับ pH จาก V2-A (+Butylene Glycol 5 · ดีที่สุด) → V4-A draft "รอทดสอบ"

### 3.3 ข้อจำกัดที่รู้แล้ว (ผู้ใช้รับทราบแล้ว จะแก้ทีหลัง ห้ามแก้เองในงานนี้)
1. ป้าย "ดีที่สุด" ต้องให้ **agent ผู้ประเมินในห้องแล็บเป็นคนเลือก** แต่ข้อมูลห้องแล็บยังไม่มีช่องนี้ → ข้อมูลจริงไม่มีป้าย มีแค่ใน tree ตัวอย่าง (ทำ field `best?: boolean` รอไว้)
2. agent ที่สร้างแต่ละรุ่นยังไม่ถูกบันทึก → ข้อมูลจริงไม่แสดง agent (ทำ field `agent?: string` รอไว้)
3. revision brief อยู่ใน `localStorage` ของเบราว์เซอร์ → เปิดจากเครื่องอื่นจะไม่เห็นเส้นแม่-ลูก

## 4. กติกาที่ต้องทำให้ตรง

### 4.1 ชื่อรุ่น (ตั้งอัตโนมัติตามตำแหน่งใน tree)
- รากของแต่ละสาย = `V1` · ลูกตัวเดียว = `V2` · ลูกหลายตัว = `V2-A`, `V2-B` … เรียงตามเวลาที่สร้าง
- ตัวอักษรตามสายลงไป: ลูกตัวเดียวของ V2-A = `V3-A` · ถ้า V2-A แตกสองทาง = `V3-AA`, `V3-AB`
- ชื่อสูตรเดิมยังแสดงคู่กันในกล่อง

### 4.2 "แก้:" (เทียบกับรุ่นแม่)
เทียบสารด้วย key = SMILES (ถ้าไม่มีใช้ชื่อ) ตัวพิมพ์เล็ก เรียง: เปลี่ยน % → เพิ่ม → เอาออก
- เปลี่ยน: `Ethanol 40→20%` · เพิ่ม: `+Glycerin 5%` · เอาออก: `−Ethanol` · ปัดทศนิยม 1 ตำแหน่ง · แสดงไม่เกิน 3 รายการในกล่อง

### 4.3 สถานะ
| ค่า | ป้าย | สี |
|---|---|---|
| completed | ทดสอบแล้ว | เทา |
| queued | รอคิว | เหลือง |
| running | กำลังทดสอบ | ฟ้า |
| failed | ไม่สำเร็จ | แดง |
| draft (ยังไม่ประเมิน) | รอทดสอบ | เหลือง |

### 4.4 ปัญหาที่พบ
- endpoint ที่ `band` เป็น `high` หรือ `severe` → `"<ชื่อ> <คะแนน> · <สารที่ถูก flag คะแนนสูงสุด> <%>"`
- ชื่อ: skin = ระคายผิว · eye = ระคายตา · sens = แพ้ผิว · acute = พิษเฉียบพลัน
- assessment ล้มเหลว → `ประเมินไม่สำเร็จ: <error>` · แสดงไม่เกิน 2 รายการในกล่อง

### 4.5 ตำแหน่งเริ่มต้น (ผู้ใช้ลากย้ายต่อได้)
- แต่ละรุ่น = 1 กลุ่ม: กล่องรุ่นด้านบนกลางกลุ่ม · กล่องสารแถวละไม่เกิน 4 กล่อง (ช่องห่าง ~16px) เริ่มต่ำกว่ากล่องรุ่นราว 270px (กันที่ให้กล่องรุ่นที่สูงไม่เท่ากัน) แถวห่าง ~20px · แถวสุดท้ายจัดกึ่งกลาง
- จัดกลุ่มเป็นชั้นตามความลึก (V1 ชั้นบน ลูกชั้นถัดไป) กลุ่มในชั้นเดียวกันเรียงซ้ายไปขวา ห่าง ~80px ชั้นห่าง ~90px

## 5. ไฟล์

| ทำอะไร | ไฟล์ |
|---|---|
| สร้าง: สร้าง tree, ชื่อรุ่น, เทียบสาร, ปัญหา, ข้อมูลตัวอย่าง, จัดตำแหน่ง (ฟังก์ชันล้วน ไม่มี UI) | `frontend/src/lib/formula-lineage.ts` |
| สร้าง: canvas React Flow + node 2 แบบ | `frontend/src/components/formula/FormulaLineageGraph.tsx` |
| แก้: แท็บ Nodes ใช้ component ใหม่ (โหลดด้วย `next/dynamic`, `ssr: false`) | `frontend/src/app/(dashboard)/assess/page.tsx` ตรง `mode === "nodes"` (ตอนนี้เรียก `FormulaGraph`) |
| ลบ (หลังของใหม่ใช้ได้และผู้ใช้ตรวจแล้วเท่านั้น) | `components/formula/FormulaGraph.tsx`, `lib/formula-graph.ts`, state `graphByFormulaId` ที่ไม่มีคนใช้แล้วใน assess page, เทสต์ `tests/formula-graph.test.ts` · **ห้ามลบ `reactflow`** เพราะของใหม่ใช้ |

- `import "reactflow/dist/style.css"` ในไฟล์ component ใหม่ (แบบเดียวกับ FormulaGraph)
- ใช้ component ที่มีอยู่ก่อนสร้างใหม่: `Button`, `Skeleton` (`components/ui`), `BANDS` (`components/kit/risk-bands`), ไอคอน `lucide-react`, `cn` (`lib/utils`)
- สีตัวหนังสือ teal ใช้ `text-primary-strong` (ไม่ใช่ `text-primary`) ให้ contrast ผ่าน
- ภาษาในหน้าจอ: ไทยทั้งหมด

## 6. เกณฑ์ตรวจรับ

- [ ] แท็บ Nodes แสดง canvas ลากพื้นหลังได้ ซูมได้ (ล้อเมาส์ + ปุ่ม) มีแผนที่ย่อบนจอ ≥ 640px
- [ ] กล่องรุ่นและกล่องสารแยกกัน มีเส้นโค้งจากสารขึ้นไปหารุ่น ตรงกับภาพร่าง
- [ ] กล่องสารไม่มีหัวข้อ "สารในสูตร" และไม่มี "ถูกต้อง · MW"
- [ ] ลากย้ายกล่องได้ทุกกล่อง แต่เชื่อมเส้น ลบ แก้ไข หรือกดประเมินไม่ได้
- [ ] ชื่อรุ่น / แก้ / ปัญหา / สถานะ ตรงตามข้อ 4 (เขียน unit test ให้ `lib/formula-lineage.ts`: ชื่อรุ่นกรณีแตก 2 ทางและลูกเดี่ยว, diff สาร, ปัญหาจาก record)
- [ ] ไม่มีข้อมูลจริง → tree ตัวอย่างพร้อมป้าย "ตัวอย่าง"
- [ ] ระหว่างโหลดแสดง Skeleton ไม่ใช่ตัวหนังสือ "กำลังโหลด…"
- [ ] ใช้ได้บนจอ 390px (iPhone) ขึ้นไป: หัวหน้าไม่ล้น ปุ่ม +/− กดได้ (≥ 32px)
- [ ] `npx tsc --noEmit` ผ่าน · `npm run build` ผ่าน · เทสต์ `node --experimental-strip-types --test tests/*.test.ts` ไม่แย่ลง (ก่อนเริ่ม: ผ่านทั้งหมดยกเว้น `pubchem-online` และ `api-request` ที่พังอยู่แล้ว)
- [ ] `/assess` ไม่โหลด reactflow ตอนเปิดหน้า (โหลดเมื่อเข้าแท็บ Nodes เท่านั้น) ตรวจด้วย `npm run inventory` แล้วดู `/test_components`

## 7. ข้อห้ามและข้อควรระวัง

- **ห้าม commit / stage โค้ดข้ามล็อกอินสำหรับเครื่องพัฒนา** ใน `backend/app/core/auth.py`, `backend/app/core/config.py` และ `frontend/src/app/(dashboard)/layout.tsx` ดูวิธีเลือกเฉพาะบรรทัดงานใน `CLAUDE.local.md` ก่อน commit
- ในโฟลเดอร์นี้มีงานของคนอื่นค้างอยู่ (ห้องแล็บ `three/skincare-lab/*`, `lib/lab-station/*`, `RevisionBriefNote`, หน้า `/lab-room`, `docs/` ที่ย้ายที่, `RalphLab/`) **ห้ามแตะ ห้ามรวมใน commit** · commit เฉพาะไฟล์ในข้อ 5 ด้วย pathspec
- ใน `assess/page.tsx` มี 2 บรรทัดของคนอื่น (`import RevisionBriefNote` และ `<RevisionBriefNote … />`) ห้ามลบ และระวังไม่ให้ติดไปใน commit ถ้าไฟล์ `RevisionBriefNote.tsx` ยังไม่ถูก commit
- **dev server ตอนนี้โหลด CSS ของ reactflow ไม่ได้** (`Loading CSS chunk … failed (/_next/undefined)`) ทั้งของเดิมและของใหม่ เป็นเพราะ cache ของ dev server ไม่ใช่โค้ด (production build ผ่านและมี CSS ครบ) แก้: ปิด dev server → ลบ `frontend/.next-dev` → `npm run dev` ใหม่ · ถ้าต้องเปิด dev server ตัวที่สองให้ตั้ง `NEXT_DIST_DIR=.next-dev-2` ไม่งั้นจะทับกัน
- ห้ามบีบไฟล์ `head.glb` · ห้ามแก้ backend · ห้าม push
- เมื่อเสร็จ: บันทึก component ใหม่เป็น V1 ใน Obsidian vault `RalphLab/RalphLab-Plan/Components/` ตามรูปแบบเดิม (ดู `VERSIONS.md` และ note ตัวอื่นในนั้น)

## 8. ลำดับงานที่แนะนำ

1. รีสตาร์ต dev server แบบล้าง cache (ข้อ 7) ให้ Nodes เดิมเปิดได้ก่อน
2. เขียน `lib/formula-lineage.ts` + unit test (ชื่อรุ่น, diff, ปัญหา, ตัวอย่าง, ตำแหน่ง)
3. เขียน `FormulaLineageGraph.tsx` แสดง tree ตัวอย่างให้ตรงภาพร่างก่อน → ให้ผู้ใช้ดูภาพหน้าจอ
4. ต่อข้อมูลจริง (ข้อ 3.1)
5. สลับแท็บ Nodes ไปใช้ของใหม่ → ตรวจตามข้อ 6 ทั้งจอใหญ่และ 390px
6. ผู้ใช้ตรวจผ่านแล้วค่อยลบของเดิม (ข้อ 5) → build/test อีกครั้ง
