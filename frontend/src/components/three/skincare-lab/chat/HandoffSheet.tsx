import { BRIEF, HANDOFFS, roleWork, sampleRecord, type Progress } from '../agents/handoffDemo'
import { ROLE_LABEL } from '../agents/roles'
import type { Role } from '../agents/workflow'

export default function HandoffSheet({ agent, progress, inspectSample }: { agent: Role; progress: Progress; inspectSample: boolean }) {
  const jobs = roleWork(agent, progress)
  const samples = HANDOFFS.slice(0, progress.index + 1).filter(row => row.item === 'sample')
  return (
    <details key={inspectSample ? 'sample' : 'agent'} open className="shrink-0 border-b border-slate-200 bg-slate-50 text-xs text-slate-700">
      <summary className="cursor-pointer px-4 py-2 font-semibold">{inspectSample ? 'ขวดตัวอย่าง' : 'ใบงาน'} · D01 · ข้อมูลจำลอง</summary>
      <div className="max-h-[23dvh] space-y-2 overflow-y-auto px-4 pb-3">
        <p>{BRIEF}</p>
        {jobs.length === 0 && <p>รอใบงานจากสถานีก่อนหน้า</p>}
        {jobs.slice().reverse().map(({ row, index }) => (
          <details key={index}>
            <summary className="cursor-pointer font-medium">{index === progress.index && !progress.delivered ? 'กำลังส่ง' : 'ส่งถึงแล้ว'} · {row.title}</summary>
            <p>{ROLE_LABEL[row.from]} → {ROLE_LABEL[row.to]}</p>
            <p>{row.note}</p>
          </details>
        ))}
        {samples.slice().reverse().map((row, index) => row.version && (
          <details key={row.version} open={inspectSample && index === 0}>
            <summary className="cursor-pointer font-medium">ดูสูตรและผล · D01-{row.version}</summary>
            <p className="whitespace-pre-line py-1">{sampleRecord(row.version, progress)}</p>
          </details>
        ))}
      </div>
    </details>
  )
}
