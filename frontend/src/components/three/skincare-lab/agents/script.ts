import { AGENT_BY_ID, type AgentId } from './agents'

/*
 * Scripted "brain" for the pre-hackathon mock (no LLM, no backend).
 * Text the user types is matched to a task by keywords. Each task belongs to one
 * agent; asking the wrong agent makes it hand the task to the owner.
 * Hand-offs carry the task key, so the receiver runs it directly.
 * All numbers are made up for the demo (shown as "ข้อมูลจำลอง" in the chat).
 */

export type TaskKey = 'brief' | 'status' | 'research' | 'formulate' | 'assess' | 'review'
export type Version = 'V1' | 'V2'
export type Band = 'low' | 'moderate' | 'high'

export const TASK_OWNER: Record<TaskKey, AgentId> = {
  brief: 'lead',
  status: 'lead',
  research: 'researcher',
  formulate: 'formulator',
  assess: 'analyst',
  review: 'reviewer',
}

export type Card =
  | { kind: 'brief'; rows: [string, string][] }
  | { kind: 'options'; rows: { name: string; why: string; source?: { label: string; href: string } }[] }
  | { kind: 'formula'; version: Version; rows: { name: string; pct: number; note?: string }[] }
  | { kind: 'scores'; version: Version; rows: { label: string; score: number; band: Band }[] }
  | { kind: 'verdict'; pass: boolean; rows: { label: string; pass: boolean; detail?: string }[]; note?: string }

export type LabContext = {
  /** Latest formula version created. */
  version: Version | null
  /** Latest version that has scores. */
  assessed: Version | null
  /** Latest version that passed review. */
  passed: Version | null
}

export const EMPTY_CONTEXT: LabContext = { version: null, assessed: null, passed: null }

export type Handoff = { to: AgentId; task: TaskKey; note: string; carry?: boolean }

export type ScriptResult = {
  reply: string
  card?: Card
  steps: string[]
  handoff?: Handoff
  patch?: Partial<LabContext>
  /** Ask the user before the hand-off runs (risky step). Denied → `deniedReply`. */
  confirm?: { title: string; description: string; deniedReply: string }
}

// Keyword → task. Checked in this order, so the more specific phrases win.
const INTENTS: { task: TaskKey; words: string[] }[] = [
  { task: 'status', words: ['สรุปสถานะ', 'สถานะโครงการ', 'ความคืบหน้า'] },
  { task: 'review', words: ['ผ่านเกณฑ์', 'ผ่านไหม', 'เทียบผล', 'เทียบกับเกณฑ์', 'ตัดสิน'] },
  { task: 'assess', words: ['ประเมิน', 'qsar', 'คะแนน', 'ความเสี่ยง'] },
  { task: 'formulate', words: ['สร้างสูตร', 'ปรับสูตร', 'สูตรใหม่', 'สัดส่วน', 'v1', 'v2'] },
  { task: 'research', words: ['ทางเลือก', 'หลักฐาน', 'ค้น', 'งานวิจัย', 'ข้อมูลสาร'] },
  { task: 'brief', words: ['ต้องการสูตร', 'โจทย์', 'เปิดโครงการ'] },
]

export function intentOf(text: string): TaskKey | null {
  const t = text.toLowerCase()
  return INTENTS.find((i) => i.words.some((w) => t.includes(w)))?.task ?? null
}

const V1 = [
  { name: 'Water', pct: 72.5, note: 'ฐานของสูตร' },
  { name: 'Sodium Lauryl Sulfate', pct: 10, note: 'สารทำความสะอาดหลัก (คงไว้ตามโจทย์)' },
  { name: 'Cocamidopropyl Betaine', pct: 8, note: 'ช่วยลดการระคายของสารหลัก' },
  { name: 'Decyl Glucoside', pct: 5, note: 'สารทำความสะอาดอ่อนโยน' },
  { name: 'Glycerin', pct: 3, note: 'ลดผิวแห้งหลังล้าง' },
  { name: 'Phenoxyethanol', pct: 1, note: 'สารกันเสีย' },
  { name: 'Citric Acid', pct: 0.5, note: 'ปรับ pH' },
]

const V2 = [
  { name: 'Water', pct: 74.5 },
  { name: 'Sodium Lauryl Sulfate', pct: 4, note: 'ลดจาก 10%' },
  { name: 'Cocamidopropyl Betaine', pct: 8 },
  { name: 'Decyl Glucoside', pct: 9, note: 'เพิ่มจาก 5%' },
  { name: 'Glycerin', pct: 3 },
  { name: 'Phenoxyethanol', pct: 1 },
  { name: 'Citric Acid', pct: 0.5 },
]

const pubchem = (name: string) => ({ label: 'PubChem', href: `https://pubchem.ncbi.nlm.nih.gov/compound/${encodeURIComponent(name)}` })

const SCORES: Record<Version, { label: string; score: number; band: Band }[]> = {
  V1: [
    { label: 'ระคายเคืองผิว', score: 58, band: 'high' },
    { label: 'ระคายเคืองตา', score: 41, band: 'moderate' },
    { label: 'แพ้ผิวหนัง', score: 18, band: 'low' },
    { label: 'พิษเฉียบพลัน', score: 9, band: 'low' },
  ],
  V2: [
    { label: 'ระคายเคืองผิว', score: 34, band: 'moderate' },
    { label: 'ระคายเคืองตา', score: 28, band: 'moderate' },
    { label: 'แพ้ผิวหนัง', score: 14, band: 'low' },
    { label: 'พิษเฉียบพลัน', score: 8, band: 'low' },
  ],
}

function handoffTo(task: TaskKey, note: string, carry = false): Handoff {
  return { to: TASK_OWNER[task], task, note, carry }
}

/** Run one task as its owner. */
/** "V1" / "V2" if the text names a version (e.g. "ประเมินสูตร V1"). */
export function versionIn(text: string): Version | null {
  const m = text.match(/v\s?([12])/i)
  return m ? (`V${m[1]}` as Version) : null
}

/** Run one task as its owner. `want` = the version the user asked for, if any. */
export function runTask(task: TaskKey, ctx: LabContext, want: Version | null = null): ScriptResult {
  switch (task) {
    case 'brief':
      return {
        reply: 'รับโจทย์แล้ว ผมสรุปวัตถุประสงค์ ข้อจำกัด และเกณฑ์ไว้ตามนี้ แล้วเปิดโครงการทดลองให้ จากนั้นส่งให้นักวิจัยหาทางเลือกส่วนผสม',
        card: {
          kind: 'brief',
          rows: [
            ['วัตถุประสงค์', 'สูตรทำความสะอาดที่ระคายเคืองต่ำ'],
            ['ต้องคงไว้', 'Sodium Lauryl Sulfate เป็นสารทำความสะอาดหลัก'],
            ['ข้อจำกัด', 'ไม่เพิ่มสารแต่งกลิ่น'],
            ['เกณฑ์', 'ผิว ≤ กลาง · ตา ≤ กลาง · แพ้ ≤ ต่ำ · พิษเฉียบพลัน ≤ ต่ำ'],
          ],
        },
        steps: ['อ่านโจทย์', 'บันทึกวัตถุประสงค์', 'ระบุส่วนผสมที่ต้องคงไว้และข้อจำกัด', 'ตั้งเกณฑ์ราย endpoint', 'เปิดโครงการทดลอง'],
        handoff: handoffTo('research', 'หาทางเลือกส่วนผสมที่ระคายเคืองต่ำตามโจทย์'),
        // A new brief starts a new experiment.
        patch: { version: null, assessed: null, passed: null },
      }

    case 'status': {
      if (ctx.passed) {
        return {
          reply: `ปิดรอบการทดลองนี้ได้ สูตร ${ctx.passed} ผ่านเกณฑ์ทุก endpoint`,
          card: {
            kind: 'verdict',
            pass: true,
            rows: [
              { label: `สูตรล่าสุด ${ctx.passed}`, pass: true },
              { label: 'ผ่านเกณฑ์ทั้ง 4 endpoint', pass: true },
            ],
            note: 'ข้อมูลทั้งหมดเป็นผลจำลอง ต้องทดสอบจริงก่อนใช้',
          },
          steps: ['รวบรวมผลจากทุกสถานี', 'ตรวจว่าผ่านเกณฑ์ครบ', 'บันทึกสรุปโครงการ'],
        }
      }
      const where = !ctx.version ? 'ยังไม่มีสูตร' : !ctx.assessed ? `มีสูตร ${ctx.version} แต่ยังไม่ประเมิน` : `ประเมิน ${ctx.assessed} แล้ว รอผู้ประเมินตัดสิน`
      return { reply: `สถานะตอนนี้: ${where}`, steps: ['รวบรวมสถานะจากทุกสถานี'] }
    }

    case 'research':
      return {
        reply: 'ค้นหลักฐานแล้ว เสนอทางเลือกตามนี้ แล้วส่งให้นักพัฒนาสูตรกำหนดสัดส่วน',
        card: {
          kind: 'options',
          rows: [
            { name: 'Decyl Glucoside', why: 'สารทำความสะอาดกลุ่มกลูโคไซด์ ระคายเคืองต่ำ ใช้ร่วมกับสารหลักได้', source: pubchem('Decyl glucoside') },
            { name: 'Cocamidopropyl Betaine', why: 'ช่วยลดการระคายของ Sodium Lauryl Sulfate', source: pubchem('Cocamidopropyl betaine') },
            { name: 'Glycerin', why: 'ให้ความชุ่มชื้น ลดผิวแห้งหลังล้าง', source: pubchem('Glycerin') },
            { name: 'ลดความเข้มข้น SLS', why: 'ระคายเคืองมากขึ้นเมื่อความเข้มข้นสูง', source: pubchem('Sodium lauryl sulfate') },
          ],
        },
        steps: ['อ่านโจทย์และข้อจำกัด', 'ค้นหลักฐานของส่วนผสมหลัก', 'เทียบหน้าที่ของสารที่ใช้แทนได้', 'สรุปทางเลือกพร้อมเหตุผล'],
        handoff: handoffTo('formulate', 'สร้างสูตร V1 จากทางเลือกที่เสนอ'),
      }

    case 'formulate': {
      // Second round only after a failed review of V1.
      const next: Version = ctx.version === 'V1' && ctx.assessed === 'V1' && !ctx.passed ? 'V2' : ctx.version ?? 'V1'
      if (next === 'V2') {
        return {
          reply: 'ได้ใบงานจากผู้ประเมินแล้ว สร้างสูตร V2 โดยลดสารทำความสะอาดหลักและเพิ่มสารที่อ่อนโยนแทน แล้วส่งให้นักวิเคราะห์ประเมินอีกครั้ง',
          card: { kind: 'formula', version: 'V2', rows: V2 },
          steps: ['อ่านใบงานจากผู้ประเมิน', 'ลด Sodium Lauryl Sulfate 10% → 4%', 'เพิ่ม Decyl Glucoside 5% → 9%', 'ตรวจสัดส่วนรวม 100%', 'บันทึกว่าเปลี่ยนอะไร เพราะอะไร'],
          handoff: handoffTo('assess', 'ประเมินสูตร V2', true),
          patch: { version: 'V2' },
        }
      }
      return {
        reply: 'สร้างสูตร V1 แล้ว คงสารทำความสะอาดหลักตามโจทย์ และเพิ่มสารช่วยลดการระคาย แล้วถือตัวอย่างไปให้นักวิเคราะห์',
        card: { kind: 'formula', version: 'V1', rows: V1 },
        steps: ['อ่านทางเลือกจากนักวิจัย', 'เลือกส่วนผสมและหน้าที่', 'กำหนดสัดส่วนให้ครบ 100%', 'บันทึกเหตุผลของสูตร V1'],
        handoff: handoffTo('assess', 'ประเมินสูตร V1', true),
        patch: { version: 'V1' },
      }
    }

    case 'assess': {
      if (!ctx.version) {
        // Unexpected: nothing to assess yet → the right person makes a formula first.
        return {
          reply: 'ยังไม่มีสูตรให้ประเมิน ผมส่งให้นักพัฒนาสูตรสร้างสูตรก่อน แล้วค่อยกลับมาประเมิน',
          steps: ['ตรวจว่ามีตัวอย่างให้ประเมิน'],
          handoff: handoffTo('formulate', 'ยังไม่มีสูตร ขอสูตร V1 ก่อนประเมิน'),
        }
      }
      // Assess the version asked for if it exists (V1 always does once there is a formula); else the latest.
      const v: Version = want === 'V1' || (want === 'V2' && ctx.version === 'V2') ? want : ctx.version
      const missing = want === 'V2' && ctx.version !== 'V2' ? 'ยังไม่มีสูตร V2 จึงประเมิน V1 แทน · ' : ''
      return {
        reply: `${missing}ประเมินสูตร ${v} ครบ 4 endpoint แล้ว ความน่าเชื่อถือของโมเดลระดับกลาง ส่งผลให้ผู้ประเมินเทียบกับเกณฑ์`,
        card: { kind: 'scores', version: v, rows: SCORES[v] },
        steps: [`รับตัวอย่าง ${v}`, 'แปลงส่วนผสมเป็นโครงสร้างโมเลกุล', 'รัน QSAR 4 endpoint', 'รวมผลตามสัดส่วน', 'ระบุความไม่แน่นอน'],
        handoff: handoffTo('review', `เทียบผล ${v} กับเกณฑ์`, true),
        patch: { assessed: v },
      }
    }

    case 'review': {
      if (!ctx.assessed) {
        return {
          reply: 'ยังไม่มีผลประเมินให้เทียบ ผมส่งให้นักวิเคราะห์ประเมินก่อน',
          steps: ['ตรวจว่ามีผลประเมิน'],
          handoff: handoffTo('assess', 'ขอผลประเมินก่อนเทียบเกณฑ์'),
        }
      }
      if (ctx.assessed === 'V1') {
        return {
          reply: 'สูตร V1 ไม่ผ่าน: ระคายเคืองผิวสูงกว่าเกณฑ์ สาเหตุหลักคือ Sodium Lauryl Sulfate 10% งานแก้นี้เป็นของนักพัฒนาสูตร แต่ต้องลดสารที่โจทย์บังคับให้คงไว้ จึงขออนุมัติก่อนส่งใบงาน',
          card: {
            kind: 'verdict',
            pass: false,
            rows: [
              { label: 'ระคายเคืองผิว', pass: false, detail: 'สูง · เกณฑ์ ≤ กลาง' },
              { label: 'ระคายเคืองตา', pass: true, detail: 'กลาง' },
              { label: 'แพ้ผิวหนัง', pass: true, detail: 'ต่ำ' },
              { label: 'พิษเฉียบพลัน', pass: true, detail: 'ต่ำ' },
            ],
          },
          confirm: {
            title: 'ลด Sodium Lauryl Sulfate จาก 10% เป็น 4%?',
            description: 'โจทย์ให้คงสารนี้เป็นสารทำความสะอาดหลัก การลดยังคงสารไว้ แต่เปลี่ยนสัดส่วน',
            deniedReply: 'ไม่อนุมัติ จึงไม่ส่งใบงานแก้ไข สูตร V1 ยังไม่ผ่านเกณฑ์ ลองปรับโจทย์หรือเกณฑ์กับหัวหน้าแล็บ',
          },
          steps: ['อ่านผลประเมิน V1', 'เทียบกับเกณฑ์ราย endpoint', 'หาสาเหตุที่ไม่ผ่าน', 'เลือกคนที่ต้องแก้: นักพัฒนาสูตร'],
          handoff: handoffTo('formulate', 'ปรับเป็น V2: ลด Sodium Lauryl Sulfate ให้ระคายเคืองผิว ≤ กลาง'),
        }
      }
      return {
        reply: 'สูตร V2 ผ่านเกณฑ์ทุก endpoint ส่งให้หัวหน้าแล็บปิดรอบการทดลอง',
        card: {
          kind: 'verdict',
          pass: true,
          rows: [
            { label: 'ระคายเคืองผิว', pass: true, detail: 'กลาง' },
            { label: 'ระคายเคืองตา', pass: true, detail: 'กลาง' },
            { label: 'แพ้ผิวหนัง', pass: true, detail: 'ต่ำ' },
            { label: 'พิษเฉียบพลัน', pass: true, detail: 'ต่ำ' },
          ],
        },
        steps: ['อ่านผลประเมิน V2', 'เทียบกับเกณฑ์ราย endpoint', 'ยืนยันว่าผ่านครบ'],
        handoff: handoffTo('status', 'V2 ผ่านเกณฑ์ ขอปิดรอบการทดลอง'),
        patch: { passed: 'V2' },
      }
    }
  }
}

/** What an agent does with text the user typed to it. */
export function respond(agentId: AgentId, text: string, ctx: LabContext): ScriptResult {
  const task = intentOf(text)
  const me = AGENT_BY_ID[agentId]
  if (!task) {
    return {
      reply: `ผม${me.name} ทำหน้าที่${me.role} ลองพิมพ์ตามตัวอย่างด้านล่าง หรือสั่งงานที่เกี่ยวกับหน้าที่ของผมได้เลย`,
      steps: [],
    }
  }
  const owner = TASK_OWNER[task]
  if (owner !== agentId) {
    return {
      reply: `งานนี้เป็นหน้าที่ของ${AGENT_BY_ID[owner].name} ผมส่งต่อให้แล้ว`,
      steps: ['อ่านคำสั่ง', `ตรวจว่าเป็นงานของใคร → ${AGENT_BY_ID[owner].name}`],
      handoff: { to: owner, task, note: text },
    }
  }
  return runTask(task, ctx, versionIn(text))
}
