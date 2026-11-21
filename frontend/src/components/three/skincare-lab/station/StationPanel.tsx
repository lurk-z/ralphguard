'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, apiErrorMessage, type ProjectOut } from '@/lib/api'
import { formulaAssessmentSignature } from '@/lib/project-workspace'
import type { ArchiveRecord } from '@/lib/lab-station/archive'
import { FRIDGE_CAPACITY } from '@/lib/lab-station/archive'
import {
  endpointOutcome,
  listTestedRevisions,
  type EndpointOutcome,
  type RevisionListing,
  type TestedRevision,
} from '@/lib/lab-station/assessment'
import { STATION_ENDPOINTS, stationEndpoint, type StationEndpointId } from '@/lib/lab-station/endpoints'
import { findingsFromOutcomes } from '@/lib/lab-station/findings'
import { createRevisionDraft } from '@/lib/lab-station/revision'
import { allResolved, type TrayPhase } from '@/lib/lab-station/station-state'
import type { Region } from '@/lib/api'
import ResultCard from './ResultCard'
import type { StationBridge } from './bridge'
import { useStationSession } from './useStationSession'

const PHASE_TH: Record<TrayPhase, string> = {
  ready: 'พร้อมทดสอบ',
  testing: 'กำลังทดสอบ',
  deciding: 'รอตัดสินใจ',
  storing: 'กำลังเก็บเข้าตู้เย็น',
  discarding: 'กำลังทิ้ง',
  stored: 'เก็บในตู้เย็นแล้ว',
  discarded: 'ทิ้งแล้ว',
}

const card = 'rounded-xl bg-white/95 shadow-sm ring-1 ring-slate-200'
const btn =
  'inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40'

function ProjectPicker({ onPick }: { onPick: (p: ProjectOut) => void }) {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    api
      .listProjects(ctrl.signal)
      .then(setProjects)
      .catch((e) => !ctrl.signal.aborted && setError(apiErrorMessage(e, 'โหลดโปรเจกต์ไม่สำเร็จ')))
    return () => ctrl.abort()
  }, [])
  if (error) return <p className="text-xs text-rose-600">{error}</p>
  if (!projects) return <p className="text-xs text-slate-500">กำลังโหลดโปรเจกต์…</p>
  if (!projects.length) return <p className="text-xs text-slate-500">ยังไม่มีโปรเจกต์</p>
  return (
    <ul className="space-y-1">
      {projects.map((p) => (
        <li key={p.id}>
          <button className="w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100" onClick={() => onPick(p)}>
            {p.name}
          </button>
        </li>
      ))}
    </ul>
  )
}

function RevisionPicker({ project, onPick }: { project: ProjectOut; onPick: (r: TestedRevision) => void }) {
  const [listing, setListing] = useState<RevisionListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    listTestedRevisions(project.id, ctrl.signal)
      .then(setListing)
      .catch((e) => !ctrl.signal.aborted && setError(apiErrorMessage(e, 'โหลดสูตรที่ทดสอบไม่สำเร็จ')))
    return () => ctrl.abort()
  }, [project.id])
  if (error) return <p className="text-xs text-rose-600">{error}</p>
  if (!listing) return <p className="text-xs text-slate-500">กำลังโหลดสูตรของโปรเจกต์…</p>
  return (
    <div className="space-y-3">
      {listing.failedToLoad > 0 && (
        <p className="text-xs text-rose-600">โหลดงานประเมิน {listing.failedToLoad} รายการไม่สำเร็จ รายการนั้นจึงไม่แสดง</p>
      )}
      {listing.revisions.length === 0 && listing.failedToLoad === 0 && (
        <p className="text-xs text-slate-500">โปรเจกต์นี้ยังไม่มีงานประเมิน ประเมินสูตรในหน้าประเมินก่อน แล้วกลับมาทดสอบที่นี่</p>
      )}
      <ul className="space-y-1">
        {listing.revisions.map((r) => (
          <li key={r.assessmentId}>
            <button className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-slate-100" onClick={() => onPick(r)}>
              <span className="block text-sm text-slate-700">{r.name}</span>
              <span className="block text-[11px] text-slate-400">
                {r.items.length} ส่วนผสม · {r.region} · {r.status === 'completed' ? 'ประเมินแล้ว' : r.status === 'failed' ? 'ประเมินล้มเหลว' : 'กำลังประเมิน'} ·{' '}
                <span className="font-mono">{r.assessmentId.slice(0, 8)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {listing.untested.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-2">
          <p className="text-[11px] text-slate-400">สูตรที่ยังไม่มีผลประเมิน (ทดสอบไม่ได้จนกว่าจะประเมิน)</p>
          {listing.untested.map((u) => (
            <a key={u.formulaId} href={`/assess?projectId=${project.id}`} className="block rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100">
              {u.name} → ไปประเมิน
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/** A kept vial: its own assessment, re-checked against the snapshot it was stored with. */
function ArchiveDetails({ record, onClose }: { record: ArchiveRecord; onClose: () => void }) {
  const [state, setState] = useState<{ outcome: EndpointOutcome; items: { name?: string; concentration: number }[]; region: string } | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    api
      .getProjectAssessment(record.projectId, record.assessmentId, ctrl.signal)
      .then((rec) => {
        const sig = formulaAssessmentSignature(rec.formula, rec.region as Region)
        const outcome: EndpointOutcome =
          sig !== record.formulaSignature
            ? { kind: 'failed', messageTh: 'สูตรในงานประเมินไม่ตรงกับตัวอย่างที่เก็บไว้' }
            : rec.status === 'completed' && rec.result
              ? endpointOutcome({ kind: 'ready', record: rec }, record.endpoint)
              : rec.status === 'failed'
                ? { kind: 'failed', messageTh: rec.error ?? 'การประเมินล้มเหลว' }
                : { kind: 'loading' }
        setState({ outcome, items: rec.formula, region: rec.region })
      })
      .catch((e) => !ctrl.signal.aborted && setState({ outcome: { kind: 'failed', messageTh: apiErrorMessage(e, 'โหลดผลไม่สำเร็จ') }, items: [], region: '' }))
    return () => ctrl.abort()
  }, [record])
  return (
    <div className={`${card} space-y-2 p-3`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-slate-700">ตัวอย่างในตู้เย็น ช่อง {record.slot + 1}</p>
        <button className={`${btn} ml-auto text-slate-500 hover:bg-slate-100`} onClick={onClose}>
          ปิด
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        {stationEndpoint(record.endpoint).labelTh} · {record.formulaName} · เก็บเมื่อ {new Date(record.storedAt).toLocaleString('th-TH')}
      </p>
      {state ? <ResultCard endpoint={record.endpoint} outcome={state.outcome} /> : <p className="text-xs text-slate-500">กำลังโหลด…</p>}
      {state && state.items.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <p className="mb-1 text-[11px] text-slate-400">สูตรที่ทดสอบ ({state.region})</p>
          <ul className="space-y-0.5 text-[11px] text-slate-600">
            {state.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-2">
                <span>{i.name || '—'}</span>
                <span className="tabular-nums">{i.concentration}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function RevisionOffer({ revision, outcomes }: { revision: TestedRevision; outcomes: Record<StationEndpointId, EndpointOutcome> }) {
  const router = useRouter()
  const findings = useMemo(() => findingsFromOutcomes(outcomes), [outcomes])
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(findings.map((f) => f.id)))
  const [error, setError] = useState<string | null>(null)
  const [declined, setDeclined] = useState(false)
  if (declined) return <p className="text-xs text-slate-500">เก็บสูตรนี้ไว้ตามเดิม ผลทดสอบทั้งหมดยังอยู่ครบ</p>
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">ทดสอบครบ 4 รายการแล้ว ต้องการแก้ไขสูตรหรือไม่?</p>
      {!open ? (
        <div className="flex gap-2">
          <button className={`${btn} bg-teal-600 text-white hover:bg-teal-700`} onClick={() => setOpen(true)}>
            แก้ไขสูตร
          </button>
          <button className={`${btn} text-slate-500 hover:bg-slate-100`} onClick={() => setDeclined(true)}>
            ยังไม่แก้ไข
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500">เลือกข้อค้นพบที่จะนำไปใช้ในฉบับแก้ไข (สูตรที่ทดสอบและผลเดิมจะไม่ถูกเปลี่ยน)</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {findings.map((f) => (
              <li key={f.id}>
                <label className="flex gap-2 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={picked.has(f.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s)
                        if (e.target.checked) n.add(f.id)
                        else n.delete(f.id)
                        return n
                      })
                    }
                  />
                  <span>{f.textTh}</span>
                </label>
              </li>
            ))}
            {findings.length === 0 && <li className="text-[11px] text-slate-400">ไม่มีข้อค้นพบจากผลที่ได้</li>}
          </ul>
          <button
            className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}
            onClick={() => {
              const res = createRevisionDraft({
                projectId: revision.projectId,
                sourceAssessmentId: revision.assessmentId,
                sourceFormulaName: revision.name,
                region: revision.region,
                items: revision.items,
                findings: findings.filter((f) => picked.has(f.id)),
              })
              if (!res.ok) setError(res.messageTh)
              else router.push(res.href)
            }}
          >
            เปิดสูตรฉบับแก้ไขในหน้าประเมิน
          </button>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

function Session({ revision, bridge, onBack }: { revision: TestedRevision; bridge: StationBridge; onBack: () => void }) {
  const s = useStationSession(revision, bridge)
  const [selected, setSelected] = useState<StationEndpointId | null>(null)
  const [openRecord, setOpenRecord] = useState<ArchiveRecord | null>(null)
  const sceneReady = s.sceneReady

  useEffect(() => {
    bridge.onPick = (pick) => {
      if (pick.kind === 'aliquot') {
        setSelected(pick.endpoint)
        void s.runTest(pick.endpoint)
      } else {
        const r = s.archive.find((a) => a.slot === pick.slot)
        if (r) setOpenRecord(r)
      }
    }
    return () => {
      bridge.onPick = null
    }
  }, [bridge, s])

  const header =
    s.assessment.kind === 'pending'
      ? 'งานประเมินยังไม่เสร็จ ผลจะแสดงเมื่อเซิร์ฟเวอร์ประเมินเสร็จ'
      : s.assessment.kind === 'failed' || s.assessment.kind === 'mismatch'
        ? s.assessment.messageTh
        : null

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{revision.name}</p>
          <p className="text-[11px] text-slate-400">
            ขวดหลัก 1 ขวด → แบ่ง 4 ตัวอย่าง · <span className="font-mono">{revision.assessmentId.slice(0, 8)}</span>
          </p>
        </div>
        <button className={`${btn} ml-auto shrink-0 text-slate-500 hover:bg-slate-100`} onClick={onBack} disabled={!!s.state.busy}>
          เปลี่ยนสูตร
        </button>
      </div>
      {!sceneReady && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">ภาพ 3 มิติของสถานีทดสอบยังไม่ได้โหลด ขั้นตอนจะทำงานโดยไม่มีแอนิเมชัน</p>}
      {header && <p className="rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] text-slate-600">{header}</p>}

      <ul className="space-y-2">
        {STATION_ENDPOINTS.map((ep) => {
          const phase = s.state.phase[ep.id]
          const isSel = selected === ep.id
          const busyOther = !!s.state.busy && s.state.busy !== ep.id
          return (
            <li key={ep.id} className={`${card} p-2.5`}>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{ep.id}</span>
                <button className="min-w-0 flex-1 truncate text-left text-sm text-slate-700" onClick={() => setSelected(isSel ? null : ep.id)}>
                  {ep.labelTh}
                </button>
                <span className="shrink-0 text-[11px] text-slate-400">{PHASE_TH[phase]}</span>
              </div>
              {phase === 'ready' && (
                <button
                  className={`${btn} mt-2 bg-teal-600 text-white hover:bg-teal-700`}
                  disabled={busyOther || s.assessment.kind === 'loading'}
                  onClick={() => {
                    setSelected(ep.id)
                    void s.runTest(ep.id)
                  }}
                >
                  ทดสอบตัวอย่างนี้
                </button>
              )}
              {(s.revealed[ep.id] && (isSel || phase === 'deciding' || phase === 'storing' || phase === 'discarding')) && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <ResultCard endpoint={ep.id} outcome={s.outcomes[ep.id]} />
                </div>
              )}
              {(phase === 'deciding' || phase === 'storing' || phase === 'discarding') && (
                <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                  <p className="text-xs font-medium text-slate-700">เก็บหรือทิ้งตัวอย่างนี้?</p>
                  <div className="flex gap-2">
                    <button
                      className={`${btn} bg-sky-600 text-white hover:bg-sky-700`}
                      disabled={phase !== 'deciding' || busyOther}
                      onClick={() => void s.keep(ep.id)}
                    >
                      {phase === 'storing' ? 'กำลังเก็บ…' : 'เก็บเข้าตู้เย็น'}
                    </button>
                    <button
                      className={`${btn} bg-slate-200 text-slate-700 hover:bg-slate-300`}
                      disabled={phase !== 'deciding' || busyOther}
                      onClick={() => void s.discard(ep.id)}
                    >
                      {phase === 'discarding' ? 'กำลังทิ้ง…' : 'ทิ้ง'}
                    </button>
                  </div>
                </div>
              )}
              {s.state.error[ep.id] && <p className="mt-1.5 text-[11px] text-rose-600">{s.state.error[ep.id]}</p>}
              {phase === 'stored' && s.state.slot[ep.id] !== undefined && (
                <p className="mt-1 text-[11px] text-slate-400">ตู้เย็นช่อง {s.state.slot[ep.id]! + 1}</p>
              )}
            </li>
          )
        })}
      </ul>

      <div className={`${card} space-y-1.5 p-2.5`}>
        <p className="text-xs font-medium text-slate-700">
          ตู้เย็น {s.archive.length}/{FRIDGE_CAPACITY}
        </p>
        {s.archive.length === 0 && <p className="text-[11px] text-slate-400">ยังไม่มีตัวอย่างที่เก็บไว้</p>}
        <ul className="space-y-0.5">
          {s.archive.map((r) => (
            <li key={r.id}>
              <button className="w-full rounded px-1.5 py-1 text-left text-[11px] text-slate-600 hover:bg-slate-100" onClick={() => setOpenRecord(r)}>
                ช่อง {r.slot + 1} · {r.endpoint} · {r.formulaName}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {openRecord && <ArchiveDetails record={openRecord} onClose={() => setOpenRecord(null)} />}

      {allResolved(s.state) && (
        <div className={`${card} space-y-2 p-3`}>
          <ul className="space-y-0.5 text-[11px] text-slate-600">
            {STATION_ENDPOINTS.map((ep) => {
              const o = s.outcomes[ep.id]
              return (
                <li key={ep.id} className="flex justify-between gap-2">
                  <span>{ep.labelTh}</span>
                  <span className="tabular-nums">
                    {o.kind === 'result' ? `${Math.round(o.score * 10) / 10}/100` : o.kind === 'insufficient' ? 'หลักฐานไม่พอ' : o.kind === 'unavailable' ? 'ไม่มีผล' : o.kind === 'failed' ? 'ล้มเหลว' : '…'}
                    {' · '}
                    {PHASE_TH[s.state.phase[ep.id]]}
                  </span>
                </li>
              )
            })}
          </ul>
          <RevisionOffer revision={revision} outcomes={s.outcomes} />
        </div>
      )}
    </div>
  )
}

/** Overlay for the four-endpoint testing station in /lab-room. */
export default function StationPanel({ bridge }: { bridge: StationBridge }) {
  const [open, setOpen] = useState(false)
  const [project, setProject] = useState<ProjectOut | null>(null)
  const [revision, setRevision] = useState<TestedRevision | null>(null)

  useEffect(() => {
    if (!open && revision) {
      bridge.director?.release()
    }
  }, [open, revision, bridge])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-end p-3 sm:inset-y-0 sm:bottom-auto">
      {!open ? (
        <button
          className="pointer-events-auto rounded-full bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-white"
          onClick={() => setOpen(true)}
        >
          สถานีทดสอบ 4 endpoint
        </button>
      ) : (
        <aside className="pointer-events-auto flex max-h-[70vh] w-full flex-col overflow-hidden rounded-2xl bg-slate-50/95 shadow-lg ring-1 ring-slate-200 sm:max-h-full sm:w-[340px]">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
            <p className="text-sm font-semibold text-slate-800">สถานีทดสอบ</p>
            {project && !revision && (
              <button className={`${btn} text-slate-500 hover:bg-slate-100`} onClick={() => setProject(null)}>
                ← โปรเจกต์
              </button>
            )}
            <button className={`${btn} ml-auto text-slate-500 hover:bg-slate-100`} onClick={() => setOpen(false)}>
              ปิด
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!project ? (
              <>
                <p className="mb-2 text-xs text-slate-500">เลือกโปรเจกต์</p>
                <ProjectPicker onPick={setProject} />
              </>
            ) : !revision ? (
              <>
                <p className="mb-2 text-xs text-slate-500">{project.name} · เลือกสูตรที่ประเมินแล้ว</p>
                <RevisionPicker project={project} onPick={setRevision} />
              </>
            ) : (
              <Session
                key={revision.assessmentId}
                revision={revision}
                bridge={bridge}
                onBack={() => {
                  bridge.director?.release()
                  setRevision(null)
                }}
              />
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
