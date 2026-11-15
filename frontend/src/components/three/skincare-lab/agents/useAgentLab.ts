'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENTS, AGENT_BY_ID, WALK_SPEED, pathLength, walkPath, type AgentId } from './agents'
import { EMPTY_CONTEXT, respond, runTask, versionIn, type Card, type LabContext, type ScriptResult } from './script'

export type ConfirmState = 'pending' | 'approved' | 'denied'

export type ChatMessage = {
  id: string
  from: 'user' | 'agent' | 'system'
  text: string
  at: number
  card?: Card
  /** Work steps behind an agent reply (shown as Chain of Thought). */
  steps?: string[]
  /** Set on hand-off notes: who sent it to whom. */
  handoff?: { from: AgentId; to: AgentId }
  /** A risky step waiting for the user (Confirmation). */
  confirm?: { title: string; description: string; state: ConfirmState }
}

export type Step = { label: string; done: boolean }
export type AgentStatus = 'idle' | 'working' | 'walking'

/** A walk in progress, read every frame by the 3D figures. */
export type Walk = { path: [number, number][]; start: number; duration: number; carry: boolean }

const STORAGE_KEY = 'ralphlab:agents:v2'
const MAX_MESSAGES = 100
/** Stops a chain of hand-offs from running forever (A → B → A …). */
const MAX_CHAIN = 12
const STEP_MS = 450
const THINK_MS = 600

type Saved = { messages: Record<AgentId, ChatMessage[]>; ctx: LabContext; done: AgentId[] }

function emptyRecord<T>(make: () => T) {
  return Object.fromEntries(AGENTS.map((a) => [a.id, make()])) as Record<AgentId, T>
}

function load(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Saved
    if (!data?.messages || !data?.ctx) return null
    // A confirmation left open when the page closed cannot be resumed: drop its pending state.
    for (const list of Object.values(data.messages)) {
      for (const m of list) if (m.confirm?.state === 'pending') m.confirm.state = 'denied'
    }
    return data
  } catch {
    return null
  }
}

let seq = 0
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`

/**
 * State for the five scripted agents: chat history (kept in this browser),
 * work steps, status, the shared experiment context, walks between stations,
 * and confirmations that pause a hand-off until the user answers.
 */
export function useAgentLab() {
  const [messages, setMessages] = useState<Record<AgentId, ChatMessage[]>>(() => emptyRecord(() => []))
  const [steps, setSteps] = useState<Record<AgentId, Step[]>>(() => emptyRecord(() => []))
  const [status, setStatus] = useState<Record<AgentId, AgentStatus>>(() => emptyRecord(() => 'idle' as AgentStatus))
  const [unread, setUnread] = useState<Record<AgentId, number>>(() => emptyRecord(() => 0))
  /** Agents that have finished their part since the last brief (drives the lab lead's Plan). */
  const [done, setDone] = useState<AgentId[]>([])
  const ctxRef = useRef<LabContext>(EMPTY_CONTEXT)
  const walksRef = useRef(new Map<AgentId, Walk>())
  const timers = useRef(new Set<number>())
  const openRef = useRef<AgentId | null>(null)
  const pending = useRef(new Map<string, { agentId: AgentId; result: ScriptResult; chain: number }>())
  const loaded = useRef(false)

  // Load once on the client; save after every change.
  useEffect(() => {
    const saved = load()
    if (saved) {
      setMessages({ ...emptyRecord<ChatMessage[]>(() => []), ...saved.messages })
      ctxRef.current = saved.ctx
      setDone(saved.done ?? [])
    }
    loaded.current = true
    const t = timers.current
    return () => t.forEach((id) => window.clearTimeout(id))
  }, [])
  useEffect(() => {
    if (!loaded.current) return
    try {
      const trimmed = Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v.slice(-MAX_MESSAGES)]))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: trimmed, ctx: ctxRef.current, done }))
    } catch {
      /* storage full or blocked: history just is not kept */
    }
  }, [messages, done])

  const later = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }, [])

  const post = useCallback((agentId: AgentId, msg: Omit<ChatMessage, 'id' | 'at'>) => {
    const id = newId()
    setMessages((all) => ({ ...all, [agentId]: [...all[agentId], { ...msg, id, at: Date.now() }] }))
    if (openRef.current !== agentId && msg.from !== 'user') setUnread((u) => ({ ...u, [agentId]: u[agentId] + 1 }))
    return id
  }, [])

  const setStatusOf = useCallback((id: AgentId, value: AgentStatus) => setStatus((all) => ({ ...all, [id]: value })), [])

  /** Walk along the aisle; calls `done` on arrival. */
  const walk = useCallback(
    (agentId: AgentId, path: [number, number][], carry: boolean, arrived?: () => void) => {
      const duration = (pathLength(path) / WALK_SPEED) * 1000
      walksRef.current.set(agentId, { path, start: performance.now(), duration, carry })
      setStatusOf(agentId, 'walking')
      later(duration, () => arrived?.())
    },
    [later, setStatusOf]
  )

  // `run` and `deliver` call each other through the hand-off chain.
  const runRef = useRef<(agentId: AgentId, result: ScriptResult, chain: number) => void>(() => {})

  const deliver = useCallback(
    (from: AgentId, result: ScriptResult, chain: number) => {
      const h = result.handoff
      if (!h) return
      const to = h.to
      post(from, { from: 'system', text: h.note, handoff: { from, to } })
      if (chain >= MAX_CHAIN) {
        post(from, { from: 'system', text: 'หยุดส่งต่ออัตโนมัติ เพราะส่งต่อกันหลายรอบแล้ว ให้คนตรวจก่อน' })
        setStatusOf(from, 'idle')
        return
      }
      const there = walkPath(from, to)
      walk(from, there, Boolean(h.carry), () => {
        // Arrived: the receiver picks the task up on its own (autonomous chain).
        post(to, { from: 'system', text: `ได้รับงานจาก${AGENT_BY_ID[from].name}: ${h.note}`, handoff: { from, to } })
        runRef.current(to, runTask(h.task, ctxRef.current, versionIn(h.note)), chain + 1)
        walk(from, [...there].reverse(), false, () => {
          walksRef.current.delete(from)
          setStatus((s) => ({ ...s, [from]: s[from] === 'walking' ? 'idle' : s[from] }))
        })
      })
    },
    [post, setStatusOf, walk]
  )

  const run = useCallback(
    (agentId: AgentId, result: ScriptResult, chain: number) => {
      setStatusOf(agentId, 'working')
      if (result.card?.kind === 'brief') setDone([])
      const list = result.steps.map((label) => ({ label, done: false }))
      setSteps((all) => ({ ...all, [agentId]: list }))
      list.forEach((_, i) => {
        later(THINK_MS + STEP_MS * (i + 1), () =>
          setSteps((all) => ({ ...all, [agentId]: all[agentId].map((s, k) => (k <= i ? { ...s, done: true } : s)) }))
        )
      })
      later(THINK_MS + STEP_MS * (list.length + 1), () => {
        if (result.patch) ctxRef.current = { ...ctxRef.current, ...result.patch }
        setSteps((all) => ({ ...all, [agentId]: [] }))
        if (result.card || result.handoff) setDone((d) => (d.includes(agentId) ? d : [...d, agentId]))
        if (result.confirm && result.handoff) {
          // Risky step: wait for the user before handing off.
          const id = post(agentId, {
            from: 'agent',
            text: result.reply,
            card: result.card,
            steps: result.steps,
            confirm: { title: result.confirm.title, description: result.confirm.description, state: 'pending' },
          })
          pending.current.set(id, { agentId, result, chain })
          setStatusOf(agentId, 'idle')
          return
        }
        post(agentId, { from: 'agent', text: result.reply, card: result.card, steps: result.steps })
        if (result.handoff) deliver(agentId, result, chain)
        else setStatusOf(agentId, 'idle')
      })
    },
    [deliver, later, post, setStatusOf]
  )
  runRef.current = run

  const answer = useCallback(
    (messageId: string, approve: boolean) => {
      const job = pending.current.get(messageId)
      if (!job) return
      pending.current.delete(messageId)
      const { agentId, result, chain } = job
      setMessages((all) => ({
        ...all,
        [agentId]: all[agentId].map((m) => (m.id === messageId && m.confirm ? { ...m, confirm: { ...m.confirm, state: approve ? 'approved' : 'denied' } } : m)),
      }))
      if (approve) deliver(agentId, result, chain)
      else post(agentId, { from: 'agent', text: result.confirm?.deniedReply ?? 'ไม่อนุมัติ จึงหยุดงานนี้' })
    },
    [deliver, post]
  )

  /** The user types to an agent. */
  const send = useCallback(
    (agentId: AgentId, text: string) => {
      const clean = text.trim()
      if (!clean) return
      post(agentId, { from: 'user', text: clean })
      run(agentId, respond(agentId, clean, ctxRef.current), 0)
    },
    [post, run]
  )

  /** Stop all work in progress (timers, walks); agents go back to their stations. */
  const stop = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current.clear()
    walksRef.current.clear()
    setSteps(emptyRecord(() => []))
    setStatus((all) => {
      AGENTS.forEach((a) => {
        if (all[a.id] !== 'idle') post(a.id, { from: 'system', text: 'หยุดงานตามคำสั่งผู้ใช้' })
      })
      return emptyRecord(() => 'idle' as AgentStatus)
    })
  }, [post])

  /** Mark an agent's chat as open (clears its unread count). */
  const setOpen = useCallback((agentId: AgentId | null) => {
    openRef.current = agentId
    if (agentId) setUnread((u) => ({ ...u, [agentId]: 0 }))
  }, [])

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current.clear()
    walksRef.current.clear()
    pending.current.clear()
    ctxRef.current = EMPTY_CONTEXT
    setMessages(emptyRecord(() => []))
    setSteps(emptyRecord(() => []))
    setStatus(emptyRecord(() => 'idle' as AgentStatus))
    setUnread(emptyRecord(() => 0))
    setDone([])
  }, [])

  const busy = Object.values(status).some((s) => s !== 'idle')

  return { messages, steps, status, unread, done, busy, walksRef, send, answer, stop, setOpen, clear }
}

export type AgentLab = ReturnType<typeof useAgentLab>
