'use client'

import { BAND_TH, type EndpointOutcome } from '@/lib/lab-station/assessment'
import { stationEndpoint, type StationEndpointId } from '@/lib/lab-station/endpoints'

const BAND_TONE: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  moderate: 'bg-amber-50 text-amber-700 ring-amber-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  severe: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('th-TH')

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 text-[11px] leading-snug">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-slate-600">{children}</dd>
    </div>
  )
}

/** Result of one endpoint, shown exactly as the assessment returned it. */
export default function ResultCard({ endpoint, outcome }: { endpoint: StationEndpointId; outcome: EndpointOutcome }) {
  const ep = stationEndpoint(endpoint)
  if (outcome.kind === 'loading') {
    return <p className="text-xs text-slate-500">กำลังรอผลประเมินจากเซิร์ฟเวอร์…</p>
  }
  if (outcome.kind === 'failed') {
    return <p className="rounded-md bg-rose-50 px-2.5 py-2 text-xs text-rose-700">{outcome.messageTh} — ไม่มีผลให้แสดง</p>
  }
  if (outcome.kind === 'unavailable') {
    return <p className="rounded-md bg-slate-100 px-2.5 py-2 text-xs text-slate-600">ไม่มีข้อมูล: {outcome.reasonTh}</p>
  }
  if (outcome.kind === 'insufficient') {
    return (
      <div className="space-y-1 rounded-md bg-slate-100 px-2.5 py-2 text-xs text-slate-600">
        <p className="font-medium">หลักฐานไม่เพียงพอ</p>
        <p>{outcome.reasonTh}</p>
        <p className="text-slate-400">วิธีประเมิน: {outcome.methodTh}</p>
      </div>
    )
  }
  const o = outcome
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-800">{fmt(o.score)}</span>
        <span className="text-xs text-slate-400">/ 100</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${BAND_TONE[o.band]}`}>
          ระดับ{BAND_TH[o.band]}
        </span>
      </div>
      <p className="text-[11px] font-medium text-slate-500">ผลคัดกรองจากแบบจำลอง (prediction) ไม่ใช่ผลทดลองทางคลินิก</p>
      <dl className="space-y-1">
        <Row k="วิธีประเมิน">{o.methodTh}</Row>
        {o.coverageTh && <Row k="ส่วนผสม">{o.coverageTh}</Row>}
        {o.confidence && (
          <Row k="ความเชื่อมั่น">
            {o.confidence.level}
            {o.confidence.inDomain ? '' : ' · นอกขอบเขตแบบจำลอง'} — {o.confidence.reasonTh}
          </Row>
        )}
        {o.uncertainty !== null && <Row k="ความไม่แน่นอน">สูงสุดของสารในสูตร {fmt(o.uncertainty, 2)}</Row>}
        <Row k="แบบจำลอง">
          {o.modelStatus === 'research_candidate' ? 'โมเดลทดลอง' : o.modelStatus === 'production' ? 'production' : 'ไม่ระบุ'}
          {o.modelVersions.length ? ` (${o.modelVersions.join(', ')})` : ''}
        </Row>
        {o.evidenceNoteTh && <Row k="หมายเหตุ">{o.evidenceNoteTh}</Row>}
        {endpoint === 'acute' && <Row k="ช่องทางสัมผัส">{o.exposureRoute ?? 'ผลประเมินไม่ได้ระบุช่องทางสัมผัส'}</Row>}
        {o.flagged.length > 0 && (
          <Row k="สารที่ถูกชี้">
            {o.flagged.map((s) => `${s.name}${s.concentration != null ? ` ${fmt(s.concentration)}%` : ''} (${fmt(s.score)})`).join(', ')}
          </Row>
        )}
        <Row k="งานประเมิน">
          <span className="font-mono text-[10px]">{o.assessmentId.slice(0, 8)}</span>
        </Row>
      </dl>
      <p className="text-[10px] leading-snug text-slate-400">{ep.visualNoteTh}</p>
    </div>
  )
}
