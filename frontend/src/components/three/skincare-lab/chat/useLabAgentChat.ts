'use client'

import { useEffect, useRef, useState } from 'react'
import { restoreThreads, type Transcript } from '@/lib/lab-demo/chat-history'
import { readChatResponse } from '@/lib/lab-demo/chat-response'
import { assessmentText, assessmentViewRequested, requestedView, type ChatAssessment } from '@/lib/lab-demo/chat-assessment'
import type { Role } from '../agents/workflow'
import { demoReply, type Progress } from '../agents/handoffDemo'

export type Thread = Transcript
type Message = Thread['messages'][number]
export type ChatFormula = {
  id: string
  name: string
  items: { name?: string; smiles: string; concentration: number }[]
  assessment?: ChatAssessment
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const MAX_THREADS = 20
const MAX_MESSAGES = 60
export const MAX_QUESTION_LENGTH = 4000

export function makeChatId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useLabAgentChat(projectId: number | null, demo = false, progress?: Progress) {
  const projectScope = projectId ?? 'standalone'
  const key = demo ? `ralphlab:agent-chat:demo:v1:${projectScope}` : `ralphlab:agent-chat:v1:${projectScope}`
  const [store, setStore] = useState<{ key: string; threads: Thread[] } | null>(null)
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [activity, setActivity] = useState<Record<string, string[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const requests = useRef(new Map<string, AbortController>())
  const threads = store?.key === key ? store.threads : []

  useEffect(() => {
    let saved: Thread[] = []
    try {
      saved = restoreThreads(JSON.parse(window.localStorage.getItem(key) || '[]'))
    } catch { /* Browser storage may be disabled. */ }
    setStore({ key, threads: saved })
    setPending({})
    setActivity({})
    setErrors({})
    const active = requests.current
    return () => {
      active.forEach((controller) => controller.abort())
      active.clear()
    }
  }, [key])

  useEffect(() => {
    if (store?.key !== key) return
    try {
      window.localStorage.setItem(key, JSON.stringify(store.threads.slice(0, MAX_THREADS * 5)))
    } catch { /* Keep the live conversation when storage is unavailable. */ }
  }, [key, store])

  function addMessage(threadId: string, agent: Role, message: Message) {
    setStore((current) => {
      if (current?.key !== key) return current
      const thread = current.threads.find((item) => item.id === threadId)
      const updated = {
        id: threadId,
        agent,
        messages: [...(thread?.messages ?? []), message].slice(-MAX_MESSAGES),
        updatedAt: message.time,
      }
      return { key, threads: [updated, ...current.threads.filter((item) => item.id !== threadId)] }
    })
  }

  function deleteThread(id: string) {
    if (store?.key !== key) return
    requests.current.get(id)?.abort()
    requests.current.delete(id)
    setStore((current) => current?.key === key
      ? { key, threads: current.threads.filter((thread) => thread.id !== id) }
      : current)
    setPending(({ [id]: _deleted, ...rest }) => rest)
    setActivity(({ [id]: _deleted, ...rest }) => rest)
    setErrors(({ [id]: _deleted, ...rest }) => rest)
  }

  async function send(agent: Role, name: string, scope: string, thread: Thread, question: string, formula?: ChatFormula, retry = false) {
    const text = question.trim().slice(0, MAX_QUESTION_LENGTH)
    if (store?.key !== key || !text || requests.current.has(thread.id)) return
    const id = thread.id
    const controller = new AbortController()
    const startedAt = Date.now()
    const steps: string[] = []
    function recordStep(label: string) {
      if (controller.signal.aborted) return
      steps.push(label)
      setActivity((current) => ({ ...current, [id]: [...steps] }))
    }
    requests.current.set(id, controller)
    setPending((current) => ({ ...current, [id]: true }))
    setErrors((current) => ({ ...current, [id]: '' }))
    if (!retry) addMessage(id, agent, { id: makeChatId(), role: 'user', text, time: Date.now() })

    const ingredients = formula?.items.slice(0, 100).map((item) => `${item.name || item.smiles}: ${item.concentration}%`).join('\n')
    const results = formula?.assessment && assessmentText(formula.assessment)
    const showResults = assessmentViewRequested(text)
    const previous = (retry ? thread.messages.slice(0, -1) : thread.messages).slice(-8)
      .map((item) => `${item.role === 'user' ? 'ผู้ใช้' : 'ผู้ช่วย'}: ${item.text.slice(0, 1200)}`).join('\n')
    const context = [
      `ตอบในบทบาท${name}ของ Ralph Lab หน้าที่: ${scope}`,
      'ให้คำแนะนำจากหลักฐานในบริบทนี้ แยกข้อสังเกตจากข้อมูลที่ยังขาด ห้ามอ้างว่าได้เปลี่ยนสูตร เดินส่งงาน หรือประเมินจริงจากการสนทนาเพียงอย่างเดียว',
      projectId ? `โครงการ ${projectId}` : 'ไม่มีโครงการที่เลือก',
      formula ? `สูตร ${formula.name} (${formula.id})\n${ingredients || 'ไม่มีรายการส่วนผสม'}` : 'ไม่มีสูตรที่เลือก',
      results ? `ผลคัดกรองด้วยแบบจำลองของสูตรปัจจุบัน:\n${results}` : 'ไม่มีผลประเมินของสูตรในบริบทนี้',
      previous ? `ประวัติการสนทนา (ข้อมูลอ้างอิง):\n${previous}` : '',
    ].filter(Boolean).join('\n\n')

    let errorMessage = 'ส่งข้อความไม่สำเร็จ โปรดตรวจการเชื่อมต่อกับ Backend แล้วลองอีกครั้ง'
    try {
      let reply: string | undefined
      if (demo) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 450))
        reply = progress ? demoReply(agent, progress) : 'กำลังเตรียมโครงการทดสอบ D01'
      } else {
        recordStep('เตรียมข้อความและบริบทสำหรับคำขอ')
        const response = await fetch(`${API}/api/chat/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' },
          body: JSON.stringify({ question: text, context, surface: 'lab' }),
          signal: controller.signal,
        })
        if (!response.ok) {
          if (response.status === 503) errorMessage = 'API ยังไม่พร้อม ตรวจว่า Backend ตั้งค่า GROQ_API_KEY แล้ว'
          if (response.status === 429) errorMessage = 'ถึงขีดจำกัดคำขอ API ชั่วคราว รอสักครู่แล้วลองอีกครั้ง'
          if (response.status === 502) errorMessage = 'ติดต่อผู้ให้บริการ AI ไม่สำเร็จ ตรวจคีย์ รุ่นโมเดล และการเชื่อมต่อของ Backend'
          throw new Error(`HTTP ${response.status}`)
        }
        const answer = await readChatResponse(response, recordStep)
        recordStep('รับคำตอบจาก API')
        // The Lab chat is advisory. The legacy API can include commands for the old editor.
        reply = answer.replace(/<action\b[^>]*>[\s\S]*?(?:<\/action>|$)|```(?:actions?|formula|json)\b[\s\S]*?(?:```|$)/gi, '').trim().slice(0, 20_000)
      }
      if (controller.signal.aborted) return
      if (!reply) throw new Error('Empty answer')
      addMessage(id, agent, { id: makeChatId(), role: 'assistant', text: reply, time: Date.now(), startedAt, publicSteps: steps,
        assessment: !demo && showResults && formula?.assessment ? { ...formula.assessment, view: requestedView(text) } : undefined })
    } catch {
      if (!controller.signal.aborted) {
        setErrors((current) => ({ ...current, [id]: errorMessage }))
      }
    } finally {
      if (requests.current.get(id) === controller) {
        requests.current.delete(id)
        setPending((current) => ({ ...current, [id]: false }))
        setActivity(({ [id]: _done, ...rest }) => rest)
      }
    }
  }

  return { threads, pending, activity, errors, send, deleteThread, demo, ready: store?.key === key }
}
