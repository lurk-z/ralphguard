'use client'

import { useSyncExternalStore } from 'react'
import { useSession } from 'next-auth/react'
import { createDemoStore, createLabDemo, createMockTransport, DEMO_PLAYBOOK, type Fault } from '@/lib/lab-demo/engine'
import { scopeKey, type DemoScope } from '@/lib/lab-demo/events'
import { createChatArchive, emptyHistory } from '@/lib/lab-demo/chat-history'

/**
 * Agent demo (`?agentDemo=1`) · deterministic, in-memory, demo data only.
 *
 * The store and the engines live at module level, above the lifetime of the Lab tab and
 * the chat panel: closing the chat or switching to Nodes mid-handoff never strands or
 * repeats a delivery. A reload starts a fresh simulation and restores private transcripts.
 *
 * `?demoFault=ack-lost`  → the Director accepts, but the first acknowledgement is lost.
 * `?demoFault=fail-twice` → both automatic attempts fail; the message offers a manual retry.
 */
export const DEMO_EXPERIMENT = 'D01'
const LATENCY_MS = 900
const STEP_MS = 1100

const archive = createChatArchive(() => window.localStorage, Math.random().toString(36).slice(2))
const store = createDemoStore(archive.append)
const engines = new Map<string, ReturnType<typeof createLabDemo>>()

function faultsFromUrl(): Fault[] {
  const value = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('demoFault')
  if (value === 'ack-lost') return [{ attempt: 1, kind: 'ack-lost' }]
  if (value === 'fail-twice') return [{ attempt: 1, kind: 'unreachable' }, { attempt: 2, kind: 'ack-lost' }]
  return []
}

export function demoScope(projectId: number | null, userId: string): DemoScope {
  return { userId, projectId: projectId == null ? 'standalone' : `p${projectId}`, mode: 'demo' }
}

function engineFor(scope: DemoScope) {
  const key = scopeKey(scope)
  let engine = engines.get(key)
  if (!engine) {
    engine = createLabDemo({ store, scope, experimentId: DEMO_EXPERIMENT, transport: createMockTransport({ faults: faultsFromUrl(), latencyMs: LATENCY_MS }), playbook: DEMO_PLAYBOOK, stepMs: STEP_MS })
    engines.set(key, engine)
  }
  return engine
}

export function useAgentDemo(projectId: number | null) {
  const { data, status } = useSession()
  const viewer = data?.user
  const scope = demoScope(projectId, viewer?.id || viewer?.email || 'demo-user')
  const state = useSyncExternalStore(store.subscribe, () => store.get(scope), () => store.get(scope))
  const history = useSyncExternalStore(archive.subscribe, () => archive.load(scope), () => emptyHistory)
  const engine = engineFor(scope)
  return { state, submit: engine.submit, submitGroup: engine.submitGroup, decideGroup: engine.decideGroup, retry: engine.retry,
    history, deleteThread: (id: string) => archive.remove(scope, id),
    viewer, ready: status !== 'loading', userId: scope.userId, experimentId: DEMO_EXPERIMENT }
}

export type AgentDemo = ReturnType<typeof useAgentDemo>
