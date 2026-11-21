import type { Role } from './workflow'

export type Version = 'V1' | 'V2'
export type Handoff = {
  from: Role
  to: Role
  title: string
  note: string
  version?: Version
  item?: 'sample' | 'report'
  releasesResults?: boolean
}
export type Progress = { index: number; delivered: boolean }
export const BRIEF = 'โครงการ D01 · สูตรทำความสะอาดอ่อนโยน คงกลีเซอริน 5% ใช้น้ำและเบสล้าง A หรือ B งดน้ำหอม เป้าหมายคือผลคัดกรองผิวระดับต่ำ พร้อมหลักฐานเพียงพอทั้งสี่ด้าน ทดลองสูงสุดสองรุ่น'

const FORMULAS = {
  V1: 'น้ำ 84% · กลีเซอริน 5% · เบสล้าง A 10% · น้ำหอม 1%',
  V2: 'น้ำ 85% · กลีเซอริน 5% · เบสล้าง B 10%',
}
const OUTCOMES = [
  { endpoint: 'ระคายเคืองผิว', V1: 'สูงกว่าเกณฑ์ · ความเชื่อมั่นปานกลาง', V2: 'ต่ำตามเกณฑ์ · ความเชื่อมั่นปานกลาง' },
  { endpoint: 'ระคายเคืองตา', V1: 'ต่ำ · ความเชื่อมั่นต่ำ', V2: 'ต่ำ · ความเชื่อมั่นต่ำ' },
  { endpoint: 'แพ้สัมผัส', V1: 'ยังสรุปไม่ได้ · ขาดข้อมูลของน้ำหอม', V2: 'ต่ำ · ยังขาดหลักฐานยืนยันสำหรับสูตรผสม' },
  { endpoint: 'พิษเฉียบพลัน', V1: 'สรุปไม่ได้ · นอกขอบเขตโมเดล', V2: 'ยังนอกขอบเขตโมเดล · ต้องใช้หลักฐานเพิ่ม' },
]
export const HANDOFFS: Handoff[] = [
  { from: 'director', to: 'researcher', title: 'เปิดโครงการ D01', note: BRIEF },
  { from: 'researcher', to: 'formulator', title: 'ส่งตัวเลือกสำหรับสูตรตั้งต้น', note: 'บันทึกหลักฐานจำลอง E01 ระบุกลีเซอรินเป็นสารให้ความชุ่มชื้น และ A/B เป็นเบสล้าง เลือก A เป็นฐานเปรียบเทียบ ขอให้ตรวจข้อจำกัดเรื่องน้ำหอมในรายการต้นแบบ' },
  { from: 'formulator', to: 'analyst', version: 'V1', item: 'sample', title: 'ส่งขวด D01-V1', note: 'เก็บสูตรตั้งต้นตามใบผสมเพื่อใช้เทียบรอบถัดไป ในข้อมูลทดสอบจงใจคงน้ำหอมไว้ให้ตรวจพบข้อผิดเงื่อนไข' },
  { from: 'analyst', to: 'evaluator', version: 'V1', item: 'report', releasesResults: true, title: 'ส่งผลคัดกรอง V1 ทั้งสี่ด้าน', note: 'แนบตัวอย่างผลรูปแบบ QSAR พร้อมความไม่แน่นอนรายด้าน เพื่อให้เทียบกับเกณฑ์ในใบโจทย์' },
  { from: 'evaluator', to: 'researcher', version: 'V1', title: 'หาทางเลือกและเติมหลักฐาน', note: 'ผลผิวสูงกว่าเกณฑ์และหลักฐานการแพ้สัมผัสของน้ำหอมยังขาด ขอข้อมูลเบส B และระบุช่องว่างที่ยังสรุปไม่ได้' },
  { from: 'evaluator', to: 'formulator', version: 'V1', title: 'เปิดใบแก้สูตร', note: 'น้ำหอม 1% ผิดข้อกำหนด ให้ตัดออกและรอข้อเสนอของนักวิจัยเพื่อแก้ผลผิวที่เกินเกณฑ์' },
  { from: 'evaluator', to: 'analyst', version: 'V1', title: 'ส่งตรวจขอบเขตโมเดล', note: 'รับหน้าที่ผู้เชี่ยวชาญโมเดล ตรวจผลพิษเฉียบพลันที่อยู่นอกขอบเขต และแจ้งว่าต้องใช้หลักฐานอื่น' },
  { from: 'analyst', to: 'researcher', version: 'V1', item: 'report', title: 'ส่งผลพร้อมข้อจำกัด', note: 'ถือรายงาน V1 กลับมาให้ทีมวิจัย ผลนอกขอบเขตใช้จัดอันดับความปลอดภัยไม่ได้ ให้บันทึกเป็นประเด็นรอผู้เชี่ยวชาญ' },
  { from: 'researcher', to: 'formulator', version: 'V1', title: 'ส่งข้อเสนอแก้ V1', note: 'จากบันทึกตัวเลือก E01 ให้ลองเบส B ที่สัดส่วนเดิม ตัดน้ำหอม ชดเชยสัดส่วนด้วยน้ำ แล้วตรวจสี่ด้านซ้ำ' },
  { from: 'formulator', to: 'analyst', version: 'V2', item: 'sample', title: 'ส่งขวด D01-V2', note: 'สร้าง V2 จาก V1 เปลี่ยน A เป็น B ตัดน้ำหอม 1% เพิ่มน้ำจาก 84% เป็น 85% และคงกลีเซอริน 5%' },
  { from: 'analyst', to: 'evaluator', version: 'V2', item: 'report', releasesResults: true, title: 'ส่งผลตรวจซ้ำ V2', note: 'เทียบผลของทั้งสองรุ่นทีละด้าน ตรวจว่าการเปลี่ยนเบสและตัดน้ำหอมแก้ข้อใดได้ และเหลือข้อใดที่ข้อมูลยังตอบไม่ได้' },
  { from: 'evaluator', to: 'director', version: 'V2', title: 'ครบสองรอบ · รอผู้ใช้ตัดสินใจ', note: 'V2 ตรงเงื่อนไขส่วนผสมและผลผิวจำลองดีขึ้น แต่ผลพิษเฉียบพลันยังสรุปไม่ได้ หยุดที่สองรุ่น เสนอให้ผู้ใช้เลือกว่าจะส่งให้ผู้เชี่ยวชาญทบทวนหรือยุติโครงการ' },
]

export function sampleRecord(version: Version, progress: Progress) {
  const resultIndex = HANDOFFS.findIndex(row => row.version === version && row.releasesResults)
  const results = progress.index >= resultIndex
    ? OUTCOMES.map(row => row.endpoint + ' — ' + row[version]).join('\n')
    : 'รอผลคัดกรองทั้งสี่ด้าน'
  const sample = HANDOFFS.find(row => row.version === version && row.item === 'sample')!
  return ['D01-' + version, FORMULAS[version], sample.note, results].join('\n')
}

export function roleWork(role: Role, progress: Progress) {
  return HANDOFFS.slice(0, progress.index + 1).map((row, index) => ({ row, index }))
    .filter(({ row }) => row.from === role || row.to === role)
}

export function demoReply(role: Role, progress: Progress) {
  const work = roleWork(role, progress).at(-1)
  if (!work) return 'ยังไม่มีใบงานมาถึงสถานีนี้\n' + BRIEF
  const { row, index } = work
  const pending = index === progress.index && !progress.delivered
  const status = row.from === role
    ? (pending ? 'กำลังเตรียมและนำส่ง' : 'ส่งงานแล้ว')
    : (pending ? 'กำลังรอรับ' : 'ได้รับงานแล้ว')
  return [status + ' · ' + row.title, row.note, row.version && sampleRecord(row.version, progress)].filter(Boolean).join('\n\n')
}
