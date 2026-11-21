export type AssessmentRow = { label: string; score: number | null; finding: string }

/** A snapshot taken when the message was sent, independent of later formula edits. */
export type ChatAssessment = {
  source: 'demo' | 'assessment'
  formulaName: string
  recordId: string
  rows: AssessmentRow[]
  view?: 'table' | 'chart'
}

export const demoAssessment: ChatAssessment = {
  source: 'demo', formulaName: 'V1', recordId: 'D01',
  rows: [
    { label: 'ระคายเคืองผิว', score: 18, finding: 'ต่ำ' },
    { label: 'ระคายเคืองตา', score: 56, finding: 'ต้องทบทวน' },
    { label: 'แพ้สัมผัส', score: null, finding: 'ข้อมูลไม่เพียงพอ' },
    { label: 'พิษเฉียบพลัน', score: null, finding: 'นอกขอบเขตแบบจำลอง' },
  ],
}

export function assessmentViewRequested(question: string) {
  return /(?:ดู|สรุป)ผล|ผล(?:การ)?(?:คัดกรอง|ประเมิน|ทดลอง|เป็น)|คัดกรอง|endpoint|สี่ด้าน|4\s*ด้าน|กราฟ|ตาราง|chart|graph|table|screening|assessment/i.test(question)
}

export function requestedView(question: string): 'chart' | 'table' {
  return /กราฟ|chart|graph/i.test(question) ? 'chart' : 'table'
}

export function assessmentText(data: ChatAssessment) {
  const source = data.source === 'demo' ? 'ข้อมูลจำลอง' : 'ผลคัดกรองจาก Assessment'
  return [`${source} · ${data.formulaName} · ${data.recordId}`, ...data.rows.map(row =>
    `${row.label}: ${row.score === null ? 'ไม่มีคะแนน' : row.score + '/100'} · ${row.finding}`)].join('\n')
}

export function isChatAssessment(value: unknown): value is ChatAssessment {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<ChatAssessment>
  return (data.source === 'demo' || data.source === 'assessment') && typeof data.formulaName === 'string' &&
    typeof data.recordId === 'string' && Array.isArray(data.rows) && data.rows.length === 4 &&
    data.rows.every(row => row && typeof row.label === 'string' && typeof row.finding === 'string' &&
      (row.score === null || (Number.isFinite(row.score) && row.score >= 0 && row.score <= 100)))
}
