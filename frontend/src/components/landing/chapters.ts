// Scrollytelling chapters. Each chapter pairs a Three.js camera (from the GLB)
// with the copy that fades in while the camera holds on it. Edit freely — the
// number of chapters drives both the camera sequence and the scroll length.
//
// `highlight` (optional) renders that substring of the title in the brand
// gradient (e.g. "AI"). The first chapter is the hero (gets the eyebrow + CTAs).

export type Chapter = {
  cam: string
  hero?: boolean
  cta?: boolean
  eyebrow: string
  titleLines: string[]
  highlight?: string
  body: string
}

export const CHAPTERS: Chapter[] = [
  {
    cam: 'Camera_end',
    hero: true,
    eyebrow: 'In-silico Chemical Risk Screening Platform',
    titleLines: ['คัดกรองความเสี่ยง', 'สารเคมีด้วย AI'],
    highlight: 'AI',
    body: 'ประเมินความเสี่ยงเบื้องต้นของสารเคมีและสูตรผลิตภัณฑ์ด้วย AI และแบบจำลองคอมพิวเตอร์',
  },
  {
    cam: 'Camera_2',
    eyebrow: 'ขั้นที่ 1 · ส่วนผสม',
    titleLines: ['ใส่ข้อมูลสารเคมีหรือสูตรผลิตภัณฑ์'],
    body: 'ระบบรองรับชื่อสาร, SMILES และไฟล์ CSV พร้อมสัดส่วนของส่วนประกอบ',
  },
  {
    cam: 'Camera_3',
    eyebrow: 'ขั้นที่ 2 · การทำนาย',
    titleLines: ['ระบบตรวจสอบโครงสร้างสาร'],
    body: 'คำนวณ molecular descriptors และ fingerprint เพื่อนำไปใช้ประเมินความเสี่ยงอย่างเป็นระบบ',
  },
  {
    cam: 'Camera_4',
    eyebrow: 'ขั้นที่ 3 · จำลอง',
    titleLines: ['ทดสอบในห้องแล็บเสมือนจริง'],
    body: 'จำลองปฏิกิริยาและความเข้มข้นในสภาวะต่าง ๆ โดยไม่ต้องทดลองกับสัตว์หรือผิวจริง',
  },
  {
    cam: 'Camera_5',
    eyebrow: 'ขั้นที่ 4 · ประเมินผล',
    titleLines: ['แสดงผลแบบ 3D', 'เห็นความเสี่ยงเป็นภาพ'],
    highlight: '3D',
    body: 'เปลี่ยนคะแนนวิเคราะห์ให้กลายเป็นภาพจำลอง เพื่อช่วยให้เข้าใจผลลัพธ์ได้รวดเร็ว',
  },
  {
    cam: 'Camera_6',
    eyebrow: 'ขั้นที่ 5 · รายงาน',
    titleLines: ['วิเคราะห์ความเสี่ยง 4 ด้าน'],
    body: '',
  },
  {
    cam: 'Camera_7',
    eyebrow: 'เร็วกว่า ประหยัดกว่า',
    titleLines: ['สรุปผลการวิเคราะห์', 'ในรูปแบบ PDF'],
    highlight: 'PDF',
    body: 'ช่วยสรุปผลให้พร้อมใช้งานต่อ เพื่อปรับสูตร ตัดสินใจ และพัฒนาผลิตภัณฑ์ได้มั่นใจยิ่งขึ้น',
  },
  {
    cam: 'Camera_7.1',
    eyebrow: '',
    titleLines: [],
    body: '',
  },
  {
    cam: 'Camera_end',
    eyebrow: '',
    titleLines: ['วิเคราะห์ความเสี่ยงเบื้องต้น', 'ได้ในไม่กี่ขั้นตอน'],
    body: 'เพื่อช่วยลดเวลา ลดต้นทุน และพัฒนาผลิตภัณฑ์ได้อย่างมั่นใจ',
    cta: true,
  },
]

export const CAMERA_SEQUENCE = CHAPTERS.map((c) => c.cam)
