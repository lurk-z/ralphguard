'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { assessmentPollDelay } from '@/lib/assessment-polling'
import { loadArchive, saveArchiveRecord, type ArchiveRecord } from '@/lib/lab-station/archive'
import {
  endpointOutcome,
  loadRevisionAssessment,
  type EndpointOutcome,
  type RevisionAssessmentState,
  type TestedRevision,
} from '@/lib/lab-station/assessment'
import { STATION_ENDPOINT_IDS, type StationEndpointId } from '@/lib/lab-station/endpoints'
import { initialStationState, stationReducer } from '@/lib/lab-station/station-state'
import type { StationBridge } from './bridge'

/**
 * One station session = one tested revision. Loads (and polls) its single assessment job, derives the
 * four tray outcomes from it, and runs the per-tray decisions through the 3D director.
 */
export function useStationSession(revision: TestedRevision | null, bridge: StationBridge) {
  const [assessment, setAssessment] = useState<RevisionAssessmentState>({ kind: 'loading' })
  const [archive, setArchive] = useState<ArchiveRecord[]>([])
  const [state, dispatch] = useReducer(stationReducer, undefined, () => initialStationState())
  const stateRef = useRef(state)
  stateRef.current = state
  const [revealed, setRevealed] = useState<Partial<Record<StationEndpointId, boolean>>>({})
  // Synchronous lock: several clicks can land before React re-renders, and each one must not
  // start a second walk, a second save or a second animation.
  const lock = useRef<StationEndpointId | null>(null)
  const take = (ep: StationEndpointId, phase: string) => {
    if (lock.current || stateRef.current.busy || stateRef.current.phase[ep] !== phase) return false
    lock.current = ep
    return true
  }

  // the 3D scene may register after the panel opened
  const [director, setDirector] = useState(bridge.director)
  useEffect(() => bridge.subscribe(() => setDirector(bridge.director)), [bridge])

  // archive of the whole project (fridge content), restored on every load
  const refreshArchive = useCallback(() => {
    const records = revision ? loadArchive(revision.projectId) : []
    setArchive(records)
    bridge.director?.showArchive(records)
    return records
  }, [revision, bridge])

  useEffect(() => {
    if (!revision) return
    const records = loadArchive(revision.projectId)
    setArchive(records)
    const stored: Partial<Record<StationEndpointId, number>> = {}
    for (const r of records) if (r.assessmentId === revision.assessmentId) stored[r.endpoint] = r.slot
    dispatch({ type: 'reset', stored })
    const shown: Partial<Record<StationEndpointId, boolean>> = {}
    for (const id of Object.keys(stored) as StationEndpointId[]) shown[id] = true
    setRevealed(shown)
  }, [revision])

  // (re)build the station for this revision whenever a scene is there to show it
  useEffect(() => {
    if (!revision || !director) return
    const records = loadArchive(revision.projectId)
    director.showArchive(records)
    director.prepare(revision, records).catch(() => {})
  }, [revision, director])

  // load + poll the revision's one assessment job
  useEffect(() => {
    if (!revision) return
    const ctrl = new AbortController()
    let timer: number | undefined
    let failures = 0
    setAssessment({ kind: 'loading' })
    const tick = async () => {
      try {
        const next = await loadRevisionAssessment(revision, ctrl.signal)
        if (ctrl.signal.aborted) return
        setAssessment(next)
        if (next.kind === 'pending') timer = window.setTimeout(tick, assessmentPollDelay(failures++))
      } catch {
        // aborted
      }
    }
    void tick()
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [revision])

  const outcomes = useMemo(() => {
    const out = {} as Record<StationEndpointId, EndpointOutcome>
    for (const id of STATION_ENDPOINT_IDS) out[id] = endpointOutcome(assessment, id)
    return out
  }, [assessment])

  // a tray shows its outcome once its test has run (or the kept sample was restored)
  useEffect(() => {
    for (const id of STATION_ENDPOINT_IDS) director?.showOutcome(id, revealed[id] ? outcomes[id] : null)
  }, [revealed, outcomes, director])

  const runTest = useCallback(
    async (ep: StationEndpointId) => {
      if (!take(ep, 'ready')) return
      dispatch({ type: 'start', endpoint: ep })
      try {
        await bridge.director?.runTest(ep)
        setRevealed((r) => ({ ...r, [ep]: true }))
        dispatch({ type: 'tested', endpoint: ep })
      } catch {
        dispatch({ type: 'failed', endpoint: ep, messageTh: 'การทดสอบถูกยกเลิก ลองใหม่อีกครั้ง' })
      } finally {
        lock.current = null
      }
    },
    [bridge]
  )

  const keep = useCallback(
    async (ep: StationEndpointId) => {
      if (!revision || !take(ep, 'deciding')) return
      dispatch({ type: 'decide', endpoint: ep, choice: 'keep' })
      // save first: a sample that could not be recorded stays on its tray for a retry
      const saved = saveArchiveRecord({
        projectId: revision.projectId,
        assessmentId: revision.assessmentId,
        endpoint: ep,
        formulaId: revision.formulaId,
        formulaName: revision.name,
        formulaSignature: revision.signature,
      })
      if (!saved.ok) {
        dispatch({ type: 'failed', endpoint: ep, messageTh: saved.messageTh })
        lock.current = null
        return
      }
      try {
        await bridge.director?.store(ep, saved.record.slot)
      } finally {
        refreshArchive()
        dispatch({ type: 'stored', endpoint: ep, slot: saved.record.slot })
        lock.current = null
      }
    },
    [revision, bridge, refreshArchive]
  )

  const discard = useCallback(
    async (ep: StationEndpointId) => {
      if (!take(ep, 'deciding')) return
      dispatch({ type: 'decide', endpoint: ep, choice: 'discard' })
      try {
        await bridge.director?.discard(ep)
        dispatch({ type: 'discarded', endpoint: ep })
      } catch {
        dispatch({ type: 'failed', endpoint: ep, messageTh: 'ทิ้งตัวอย่างไม่สำเร็จ ลองใหม่อีกครั้ง' })
      } finally {
        lock.current = null
      }
    },
    [bridge]
  )

  return { assessment, outcomes, state, revealed, archive, runTest, keep, discard, refreshArchive, sceneReady: director !== null }
}
