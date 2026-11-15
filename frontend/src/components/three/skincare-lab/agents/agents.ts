import { AISLE, FOOTPRINTS } from '../footprints'

/**
 * Ralph Lab's five AI staff. Each one stands at its own station in the 3D lab.
 * Colours avoid green / amber / red, which already mean risk levels in the app.
 * See docs/ralph-lab/agents/PLAN.md.
 */
export type AgentId = 'lead' | 'researcher' | 'formulator' | 'analyst' | 'reviewer'

export type AgentDef = {
  id: AgentId
  name: string
  /** One line: what this agent does. */
  role: string
  color: string
  /** Station id from FOOTPRINTS. */
  stationId: string
  /** Example commands shown as buttons in the chat. */
  examples: string[]
  /** What it can use (shown on its Agent card). */
  tools: { name: string; description: string }[]
}

export const AGENTS: AgentDef[] = [
  {
    id: 'lead',
    name: 'หัวหน้าแล็บ',
    role: 'รับโจทย์ ตั้งเกณฑ์ และเปิดโครงการทดลอง',
    color: '#4F46E5',
    stationId: 'data-review',
    examples: ['ต้องการสูตรทำความสะอาดที่ระคายเคืองต่ำ โดยยังคงส่วนผสมหลักตามที่กำหนด', 'สรุปสถานะโครงการ'],
    tools: [
      { name: 'ตั้งเกณฑ์ราย endpoint', description: 'แปลงโจทย์เป็นเกณฑ์ที่วัดได้ เช่น ระคายเคืองผิว ≤ กลาง' },
      { name: 'เปิดโครงการทดลอง', description: 'บันทึกโจทย์ ข้อจำกัด และส่งงานให้สถานีแรก' },
    ],
  },
  {
    id: 'researcher',
    name: 'นักวิจัย',
    role: 'ค้นหลักฐานของส่วนผสมและเสนอทางเลือก',
    color: '#9333EA',
    stationId: 'weighing',
    examples: ['หาทางเลือกสารทำความสะอาดที่อ่อนโยน', 'หลักฐานของ Glycerin'],
    tools: [
      { name: 'คลังสาร', description: 'ข้อมูลสารที่ระบบมีอยู่ หน้าที่ และโครงสร้าง' },
      { name: 'PubChem', description: 'ข้อมูลสารจากฐานข้อมูลสาธารณะ (ลิงก์ของจริงเท่านั้น)' },
    ],
  },
  {
    id: 'formulator',
    name: 'นักพัฒนาสูตร',
    role: 'กำหนดส่วนผสมและสัดส่วน สร้างสูตร V1 / V2',
    color: '#009FA5',
    stationId: 'mixing',
    examples: ['สร้างสูตร V1', 'ประเมินสูตรนี้ให้หน่อย'],
    tools: [
      { name: 'ตัวคำนวณสัดส่วน', description: 'จัดส่วนผสมให้ครบ 100% และเติม Water เป็นฐาน' },
      { name: 'บันทึกรุ่นสูตร', description: 'เก็บ V1, V2 พร้อมเหตุผลที่เปลี่ยน' },
    ],
  },
  {
    id: 'analyst',
    name: 'นักวิเคราะห์',
    role: 'ประเมินความเสี่ยงด้วย QSAR ราย endpoint',
    color: '#0284C7',
    stationId: 'checks',
    examples: ['ประเมินสูตร V1', 'ช่วยปรับสูตรให้ระคายเคืองน้อยลง'],
    tools: [
      { name: 'QSAR 4 endpoint', description: 'ระคายเคืองผิว ตา การแพ้ผิวหนัง และพิษเฉียบพลัน พร้อมความน่าเชื่อถือของโมเดล' },
    ],
  },
  {
    id: 'reviewer',
    name: 'ผู้ประเมิน',
    role: 'เทียบผลกับเกณฑ์ แล้วส่งงานแก้ให้ถูกคน',
    color: '#DB2777',
    stationId: 'filling',
    examples: ['เทียบผล V1 กับเกณฑ์', 'ผ่านเกณฑ์ไหม'],
    tools: [
      { name: 'เทียบเกณฑ์', description: 'เทียบผลประเมินกับเกณฑ์ของโครงการทีละ endpoint' },
      { name: 'ส่งใบงานแก้ไข', description: 'หาสาเหตุที่ไม่ผ่าน แล้วส่งให้คนที่รับผิดชอบ' },
    ],
  },
]

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>

const STATION = Object.fromEntries(FOOTPRINTS.map((f) => [f.id, f])) as Record<string, (typeof FOOTPRINTS)[number]>

export function stationLabel(agent: AgentDef) {
  return STATION[agent.stationId]?.label ?? agent.stationId
}

/** Floor position (x, z) of an agent's station. */
export function homeOf(id: AgentId): [number, number] {
  const f = STATION[AGENT_BY_ID[id].stationId]
  return [f.x, f.z]
}

function dist(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function nearestAisle(p: [number, number]) {
  let best = 0
  AISLE.forEach((q, i) => {
    if (dist(p, q) < dist(p, AISLE[best])) best = i
  })
  return best
}

/**
 * Route between two stations along the main aisle (which is known to be clear of
 * furniture), stopping a little short of the receiver so the two do not overlap.
 */
export function walkPath(from: AgentId, to: AgentId): [number, number][] {
  const a = homeOf(from)
  const b = homeOf(to)
  const i = nearestAisle(a)
  const j = nearestAisle(b)
  const mid: [number, number][] = []
  const step = i <= j ? 1 : -1
  for (let k = i; k !== j + step; k += step) mid.push(AISLE[k])
  const path: [number, number][] = [a, ...mid]
  const last = path[path.length - 1]
  const len = dist(last, b)
  const stop = Math.max(0, len - 0.24)
  path.push([last[0] + ((b[0] - last[0]) * stop) / (len || 1), last[1] + ((b[1] - last[1]) * stop) / (len || 1)])
  return path
}

export function pathLength(path: [number, number][]) {
  let total = 0
  for (let k = 1; k < path.length; k++) total += dist(path[k - 1], path[k])
  return total
}

/** World units per second (~1.2 m/s). */
export const WALK_SPEED = 0.5
