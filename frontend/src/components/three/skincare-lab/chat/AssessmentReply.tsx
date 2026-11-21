'use client'

import { useState } from 'react'
import { ChartNoAxesColumn, Table2 } from 'lucide-react'
import type { ChatAssessment } from '@/lib/lab-demo/chat-assessment'

export default function AssessmentReply({ data }: { data: ChatAssessment }) {
  const [view, setView] = useState<'table' | 'chart'>(data.view === 'chart' ? 'chart' : 'table')
  const hasScore = data.rows.some(row => row.score !== null)
  return <figure className="my-2 min-w-0 border-y border-slate-200 py-3 text-xs leading-5">
    <figcaption className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <strong className="block break-words text-sm text-slate-900">ผลคัดกรอง · {data.formulaName}</strong>
        <span className="break-all text-[11px] text-slate-500" title={data.recordId}>{data.source === 'demo' ? 'ตัวอย่างจำลอง' : 'Assessment · QSAR'} · {data.recordId}</span>
      </div>
      {hasScore && <div role="group" aria-label="มุมมองผลคัดกรอง" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
        {(['table', 'chart'] as const).map(mode => {
          const Icon = mode === 'table' ? Table2 : ChartNoAxesColumn
          const label = mode === 'table' ? 'ตาราง' : 'กราฟ'
          return <button type="button" key={mode} aria-label={label} title={label} aria-pressed={mode === view} onClick={() => setView(mode)}
            className={`grid size-8 place-items-center rounded-md focus-visible:ring-2 focus-visible:ring-teal-600 ${mode === view ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
            <Icon aria-hidden="true" className="size-4" />
          </button>
        })}
      </div>}
    </figcaption>
    {view === 'table' || !hasScore ? <table aria-label="ผลคัดกรองรายด้าน" className="mt-3 w-full table-fixed text-left">
      <thead className="border-b border-slate-200 text-[11px] text-slate-500">
        <tr><th className="w-[34%] pb-1 font-medium">ด้านที่ประเมิน</th><th className="w-[22%] pb-1 text-right font-medium">คะแนน /100</th><th className="pb-1 pl-2 font-medium">ข้อสังเกต</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100">{data.rows.map(row => <tr key={row.label}>
        <th scope="row" className="break-words py-2 pr-1 font-medium text-slate-800">{row.label}</th>
        <td className="text-right tabular-nums">{row.score ?? <span aria-label="ไม่มีคะแนน">—</span>}</td>
        <td className="break-words py-2 pl-2 text-slate-600">{row.finding}</td>
      </tr>)}</tbody>
    </table> : <ul aria-label="กราฟคะแนนคัดกรอง เต็ม 100" className="mt-3 space-y-2.5">
      {data.rows.map(row => <li key={row.label}>
        <div className="flex items-baseline justify-between gap-2"><span className="font-medium">{row.label}</span>
          <span className="text-right text-[11px] text-slate-600">{row.finding}{row.score !== null && <b className="ml-1 tabular-nums text-slate-800">{row.score}/100</b>}</span>
        </div>
        {row.score !== null && <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-700" style={{ width: row.score + '%' }} /></div>}
      </li>)}
    </ul>}
  </figure>
}
