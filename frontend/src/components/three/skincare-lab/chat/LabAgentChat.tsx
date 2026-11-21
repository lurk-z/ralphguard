'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowUp, Check, ChevronDown, CircleCheck, FlaskConical, History, Mic, Search, SquarePen, Trash2, X } from 'lucide-react'
import AssessmentReply from './AssessmentReply'
import { assessmentText } from '@/lib/lab-demo/chat-assessment'
import { ASSISTANT_TYPING_INTERVAL_MS, assistantTypingFrames } from '@/lib/assistant-typing'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ROLE_LABEL } from '../agents/roles'
import type { Role } from '../agents/workflow'
import { MAX_QUESTION_LENGTH, makeChatId, type ChatFormula, type Thread, type useLabAgentChat } from './useLabAgentChat'
import { useChatMicrophone } from './useChatMicrophone'
import HandoffSheet from './HandoffSheet'
import type { Progress } from '../agents/handoffDemo'
import { counts } from '@/lib/lab-demo/events'
import AgentDemoThread from './AgentDemoThread'
import { messageJobId, privateThreadId, type DemoScreen } from '@/lib/lab-demo/conversations'
import { DemoChatHeader, DemoInbox } from './DemoConversations'
import MessageMeta from './MessageMeta'
import ChatActivity, { elapsedLabel } from './ChatActivity'
import type { AgentDemo } from './useAgentDemo'

const AGENTS: Record<Role, { english: string; scope: string }> = {
  director: { english: 'Lab Director', scope: 'กำหนดโจทย์ ข้อจำกัด และขั้นตอนถัดไป' },
  researcher: { english: 'Researcher', scope: 'อธิบายส่วนผสมและช่องว่างของหลักฐาน' },
  formulator: { english: 'Formulation Scientist', scope: 'อ่านองค์ประกอบสูตรและเสนอแนวทางปรับเพื่อทดสอบ' },
  analyst: { english: 'Analyst', scope: 'อธิบายผลคัดกรองราย Endpoint และข้อจำกัดของแบบจำลอง' },
  evaluator: { english: 'Evaluator', scope: 'ทบทวนข้อจำกัดของผลและเสนอขั้นตอนตรวจสอบเพิ่มเติม' },
}

const shortDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const iconButton = 'grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-40 [&>svg]:size-4'
const waveBars = Array.from({ length: 13 }, (_, index) => index)

function Portrait({ agent }: { agent: Role }) {
  return (
    <span aria-hidden="true" className="lab-chat-portrait">
      <Image src={`/images/lab-agents/${agent}-Photoroom.png`} alt="" width={512} height={768} unoptimized draggable={false} />
    </span>
  )
}

function ReplyText({ text, animate }: { text: string; animate: boolean }) {
  const [visibleText, setVisibleText] = useState(animate ? '' : text)
  useEffect(() => {
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleText(text)
      return
    }
    const frames = assistantTypingFrames(text)
    let index = 0
    const timer = window.setInterval(() => {
      setVisibleText(frames[index] ?? text)
      index += 1
      if (index >= frames.length) window.clearInterval(timer)
    }, ASSISTANT_TYPING_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [animate, text])

  return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{visibleText || '…'}</p>
}

function ChatMessages({ messages }: { messages: Thread['messages'] }) {
  // This snapshot belongs to the opened transcript, not the last answer in the store.
  const [existingReplies] = useState(() => new Set(messages.filter(({ role }) => role === 'assistant').map(({ id }) => id)))

  return messages.map((message) => message.role === 'user' ? (
    <article key={message.id} className="lab-chat-message mb-4 max-w-[90%] self-end">
      <p className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]">{message.text}</p>
      <MessageMeta text={message.text} time={message.time} outgoing />
    </article>
  ) : (
    <article key={message.id} className="lab-chat-message mb-5 min-w-0 text-sm leading-7">
      {!!message.publicSteps?.length && <ChatActivity label={elapsedLabel(message.startedAt, message.time)}>
        <ol>{message.publicSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>
      </ChatActivity>}
      {message.receipt ? <span role="img" title="ส่งถึงผู้รับแล้ว" aria-label="ส่งถึงผู้รับแล้ว"><CircleCheck aria-hidden="true" className="size-4 text-teal-700" /></span>
        : <ReplyText text={message.text} animate={!existingReplies.has(message.id)} />}
      {message.assessment && <AssessmentReply data={message.assessment} />}
      {!message.receipt && <MessageMeta text={message.assessment ? message.text + '\n' + assessmentText(message.assessment) : message.text} time={message.time} />}
    </article>
  ))
}

export default function LabAgentChat({ agent, formula, chat, onSelectAgent, onClose, onModeChange, progress, sampleOpen, agentDemo, screen, navigate }: {
  agent: Role
  formula?: ChatFormula
  chat: ReturnType<typeof useLabAgentChat>
  onSelectAgent: (agent: Role, threadId?: string) => void
  onClose: () => void
  onModeChange: (mode: 'demo' | 'api') => void
  progress?: Progress
  sampleOpen: number
  /** Standard Lab conversations share the project workflow's simulated events. */
  agentDemo?: AgentDemo
  screen: DemoScreen
  navigate: (screen: DemoScreen) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null | undefined>(screen.kind === 'private' ? screen.threadId : undefined)
  const [openMenu, setOpenMenu] = useState<'agents' | 'history' | null>(null)
  const [historyQuery, setHistoryQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historySearchRef = useRef<HTMLInputElement>(null)
  const shouldFocusInput = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followScroll = useRef(true)
  const job = screen.kind === 'group' ? agentDemo?.state.jobs[screen.jobId] : undefined
  const [highlightId, setHighlightId] = useState<string | null>(screen.kind === 'group' ? screen.highlightId ?? null : null)
  const role = AGENTS[agent]
  const name = role.english
  const workflowProject = agentDemo?.state.projectId
  const experimentId = agentDemo?.experimentId
  const saved = agentDemo?.history.saved
  const allHistory = useMemo(() => {
    if (!workflowProject || !experimentId || !saved) return chat.threads
    // The original per-project history has opaque IDs. Namespace them when continuing in the demo.
    const byId = new Map(saved.map((item) => [item.id, item]))
    for (const item of chat.threads) {
      const id = privateThreadId(workflowProject, experimentId, item.agent) + ':legacy:' + item.id
      const continuation = byId.get(id)
      byId.set(id, { ...item, id, messages: [...item.messages, ...(continuation?.messages ?? [])], updatedAt: continuation?.updatedAt ?? item.updatedAt })
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [chat.threads, workflowProject, experimentId, saved])
  const history = allHistory.filter((item) => item.agent === agent)
  const latestThreadId = history[0]?.id
  const chatReady = chat.ready && (agentDemo?.ready ?? true)
  const query = historyQuery.trim().toLocaleLowerCase()
  const visibleHistory = history.map((item) => ({
    ...item,
    title: item.messages.find((message) => message.role === 'user')?.text || item.messages[0]?.text || 'บทสนทนา',
  })).filter(({ title }) => title.toLocaleLowerCase().includes(query))
  const thread = selectedId === undefined ? history[0] : history.find((item) => item.id === selectedId)
  const linkedThread = screen.kind === 'private' && screen.threadId === selectedId ? screen.threadId : undefined
  const demoThread = job?.threadId ?? (agentDemo ? thread?.id ?? linkedThread ?? '' : '')
  const hasDemoMessages = agentDemo?.state.messages.some((m) => m.threadId === demoThread && (!job || messageJobId(agentDemo.state, m) === job.jobId))
  const legacyPrefix = workflowProject && experimentId ? privateThreadId(workflowProject, experimentId, agent) + ':legacy:' : ''
  const legacy = !job && legacyPrefix && chat.threads.find((item) => legacyPrefix + item.id === thread?.id)
  const archived = agentDemo && !job ? agentDemo.history.previousSession.find((row) => row.id === thread?.id) : undefined
  const priorMessages = [...(legacy ? legacy.messages : []), ...(archived?.messages ?? [])]
  const busy = thread ? chat.pending[thread.id] : false
  const failed = thread && !busy && thread.messages.at(-1)?.role === 'user'
    ? chat.errors[thread.id] || 'ข้อความนี้ยังไม่ได้รับคำตอบ'
    : ''
  const { listening, speaking, error, toggle } = useChatMicrophone(job?.jobId ?? thread?.id ?? 'new', (more) => {
    setInput((value) => [value.trimEnd(), more].filter(Boolean).join(' ').slice(0, MAX_QUESTION_LENGTH))
    shouldFocusInput.current = true
  })

  useEffect(() => {
    if (selectedId === undefined && latestThreadId && chatReady) setSelectedId(latestThreadId)
  }, [latestThreadId, selectedId, chatReady])

  useEffect(() => {
    if (!listening && shouldFocusInput.current) {
      shouldFocusInput.current = false
      inputRef.current?.focus()
    }
  }, [listening])

  useEffect(() => {
    const scroll = scrollRef.current
    const content = contentRef.current
    if (!scroll || !content) return
    followScroll.current = true
    scroll.scrollTop = scroll.scrollHeight
    const observer = new ResizeObserver(() => {
      if (followScroll.current) scroll.scrollTop = scroll.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [thread?.id, demoThread])

  // Arriving through a pointer: bring the target message into view and outline it briefly.
  useEffect(() => {
    if (!highlightId) return
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(highlightId)}"]`)
    if (target) {
      followScroll.current = false
      target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      target.focus({ preventScroll: true })
    }
    const timer = window.setTimeout(() => setHighlightId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  function pickThread(id: string | null) {
    setSelectedId(id)
    setOpenMenu(null)
    if (id === null || id !== thread?.id) setInput('')
    if (id === null) inputRef.current?.focus()
  }

  function removeThread(id: string) {
    if (agentDemo) {
      agentDemo.deleteThread(id)
      if (legacyPrefix && id.startsWith(legacyPrefix)) chat.deleteThread(id.slice(legacyPrefix.length))
    } else chat.deleteThread(id)
    if (id === thread?.id) {
      setSelectedId(null)
      setInput('')
    }
    setDeletingId(null)
    historySearchRef.current?.focus()
  }

  function send(retry = false) {
    if (agentDemo) {
      const text = input.trim()
      if (!text || listening || !chatReady) return
      followScroll.current = true
      setInput('')
      if (job) agentDemo.submitGroup(job.jobId, text)
      else {
        const id = thread?.id ?? privateThreadId(agentDemo.state.projectId, agentDemo.experimentId, agent) + ':' + makeChatId()
        setSelectedId(id)
        void agentDemo.submit(agent, text, id)
      }
      return
    }
    const text = retry ? thread?.messages.at(-1)?.text : input.trim()
    if (!text || busy || listening || !chat.ready) return
    const target: Thread = thread ?? { id: makeChatId(), agent, messages: [], updatedAt: Date.now() }
    setSelectedId(target.id)
    followScroll.current = true
    if (!retry) setInput('')
    void chat.send(agent, ROLE_LABEL[agent], role.scope, target, text, formula, retry)
  }

  if (agentDemo && screen.kind === 'inbox') return <DemoInbox demo={agentDemo} history={allHistory} onAgent={onSelectAgent}
    onGroup={(jobId) => navigate({ kind: 'group', jobId })} onClose={onClose} />

  const historyActions = <>
    <PopoverTrigger asChild>
      <button className={iconButton} type="button" aria-label="ประวัติแชต" title="ประวัติแชต"><History /></button>
    </PopoverTrigger>
    <button className={iconButton} type="button" aria-label="เริ่มแชตใหม่" title="เริ่มแชตใหม่" onClick={() => pickThread(null)}><SquarePen /></button>
  </>

  return (
    <section aria-label={`แชตกับ ${job?.title ?? name}`} className="flex h-full min-h-0 flex-col bg-white text-slate-900">
      <Popover open={openMenu === 'history'} onOpenChange={(open) => {
        setOpenMenu((menu) => open ? 'history' : menu === 'history' ? null : menu)
        if (open) {
          setHistoryQuery('')
          setDeletingId(null)
        }
      }}>
        <PopoverAnchor asChild>
          <div className="shrink-0">
          {agentDemo ? <DemoChatHeader agent={agent} job={job} viewer={agentDemo.viewer} navigate={navigate} onClose={onClose} actions={job ? undefined : historyActions} /> :
          <header className="flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3">
            <Popover open={openMenu === 'agents'} onOpenChange={(open) => setOpenMenu((menu) => open ? 'agents' : menu === 'agents' ? null : menu)}>
              <PopoverTrigger asChild>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600" aria-label={`สลับ Agent · ${name}`} title={name}>
                  <Portrait agent={agent} />
                  <span className="truncate text-sm font-semibold tracking-tight">{name}</span>
                  <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-slate-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent aria-label="เลือก Agent" align="start" sideOffset={8} className="lab-chat-scroll z-[85] max-h-[var(--radix-popover-content-available-height)] w-56 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border-slate-200 bg-white p-1.5 text-slate-900 shadow-lg data-[state=closed]:animate-none motion-reduce:animate-none">
                {(Object.keys(AGENTS) as Role[]).map((option) => (
                  <button key={option} type="button" onClick={() => {
                    setOpenMenu(null)
                    onSelectAgent(option)
                  }} aria-current={option === agent ? 'true' : undefined} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 aria-[current=true]:bg-teal-50">
                    <Portrait agent={option} />
                    <span className="flex-1">{AGENTS[option].english}</span>
                    {option === agent && <Check aria-hidden="true" className="size-4 shrink-0 text-teal-700" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            {historyActions}
            <button className={iconButton} type="button" aria-label="ปิดแชต" title="ปิดแชต" onClick={onClose}><X /></button>
          </header>}
          </div>
        </PopoverAnchor>
        <PopoverContent aria-label="ประวัติแชต" side="bottom" align="center" sideOffset={6} className="z-[85] flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-[calc(var(--radix-popover-trigger-width)-16px)] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border-slate-200 bg-white p-0 text-slate-900 shadow-lg data-[state=closed]:animate-none motion-reduce:animate-none">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3">
            <Search aria-hidden="true" className="size-4 shrink-0 text-slate-500" />
            <input ref={historySearchRef} type="search" value={historyQuery} onChange={(event) => {
              setHistoryQuery(event.target.value)
              setDeletingId(null)
            }} aria-label="ค้นหาประวัติแชต" placeholder="ค้นหาประวัติแชต" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-500" />
          </div>
          <div className="lab-chat-scroll min-h-0 overflow-y-auto overscroll-contain p-1.5">
            {!visibleHistory.length && <p className="px-2 py-3 text-xs text-slate-600">{history.length ? 'ไม่พบแชตที่ตรงกับคำค้น' : 'ยังไม่มีประวัติ'}</p>}
            {visibleHistory.map((item) => (
              <div key={item.id} className={`rounded-md ${item.id === thread?.id ? 'bg-teal-50' : 'hover:bg-slate-100'}`}>
                <div className="flex items-center pr-1">
                  <button type="button" onClick={() => pickThread(item.id)} aria-current={item.id === thread?.id ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
                    <span className="min-w-0 flex-1 truncate text-sm" title={item.title}>{item.title}</span>
                    <time dateTime={new Date(item.updatedAt).toISOString()} className="shrink-0 text-[11px] text-slate-600">{shortDate.format(item.updatedAt)}</time>
                  </button>
                  <button
                    type="button"
                    className={`${iconButton} hover:bg-rose-50 hover:text-rose-700 ${deletingId === item.id ? 'bg-rose-50 !text-rose-700' : ''}`}
                    title={deletingId === item.id ? 'กดอีกครั้งเพื่อลบ' : 'ลบบทสนทนา'}
                    aria-label={`${deletingId === item.id ? 'กดอีกครั้งเพื่อลบ' : 'ลบบทสนทนา'} ${item.title}`}
                    onKeyDown={(event) => { if (event.key === 'Enter' && event.repeat) event.preventDefault() }}
                    onClick={() => {
                      if (deletingId === item.id) removeThread(item.id)
                      else setDeletingId(item.id)
                    }}
                  >
                    {deletingId === item.id ? <Check aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {progress && <HandoffSheet key={sampleOpen} progress={progress} agent={agent} inspectSample={sampleOpen > 0} />}
      <div ref={scrollRef} className="lab-chat-scroll min-h-0 flex-1 overflow-y-auto" onScroll={(event) => {
        const scroll = event.currentTarget
        followScroll.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 56
      }}>
        <div ref={contentRef} className="flex min-h-full flex-col px-4 py-5 sm:px-5">
          {(agentDemo ? !hasDemoMessages && !priorMessages.length : !thread?.messages.length) && (
            <div className="my-auto flex justify-center">
              <Image src="/icons/logo-new.png" alt="" width={176} height={176} className="h-auto max-w-full select-none opacity-20" draggable={false} />
            </div>
          )}
          {agentDemo && priorMessages.length > 0 && <ChatMessages key={`archive-${thread?.id}`} messages={priorMessages} />}
          {agentDemo ? <AgentDemoThread key={demoThread} demo={agentDemo} threadId={demoThread} job={job} highlightId={highlightId} onOpenAgent={onSelectAgent} onOpenGroup={(jobId, messageId) => navigate({ kind: 'group', jobId, highlightId: messageId })} /> : thread && <ChatMessages key={thread.id} messages={thread.messages} />}
          {thread && busy && !agentDemo && <ChatActivity label={chat.demo ? 'กำลังเตรียมคำตอบจำลอง…' : 'กำลังทำงาน…'}>
            <ol aria-live="polite">{chat.activity[thread.id]?.map((step, index) => <li key={index}>{step}</li>)}</ol>
          </ChatActivity>}
          {failed && !agentDemo && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{failed} <button type="button" className="ml-1 font-semibold underline" disabled={listening} onClick={() => send(true)}>ลองอีกครั้ง</button></div>}
        </div>
      </div>

      <form className="shrink-0 px-3 pb-3 pt-1 sm:px-4" onSubmit={(event) => { event.preventDefault(); send() }}>
        {chat.demo && !agentDemo && <p className="mb-1 px-2 text-[11px] text-slate-500">โหมดเดโม · คำตอบจำลอง</p>}
        {!chat.demo && <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {agentDemo && <DemoCounts demo={agentDemo} />}
          <select aria-label="โหมดแชต" value={agentDemo ? 'demo' : 'api'} disabled={busy || listening}
            onChange={event => onModeChange(event.target.value === 'api' ? 'api' : 'demo')}
            className="ml-auto rounded px-1 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600">
            <option value="demo">เดโมส่งงาน</option><option value="api">แชตผ่าน API</option>
          </select>
        </div>}
        {error && <p role="status" className="mb-1 text-xs text-rose-800">{error}</p>}
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {listening ? (
            <div className="flex h-12 items-center gap-3 px-2">
              <span role="status" lang="en" className="mr-auto text-sm italic text-slate-600">Listening...</span>
              <span aria-hidden="true" data-speaking={speaking} className="lab-chat-wave">
                {waveBars.map((bar) => <span key={bar} style={{ animationDelay: `${bar * -65}ms` }} />)}
              </span>
              <button className={`${iconButton} bg-sky-100 text-sky-700`} type="button" title="หยุดฟัง" aria-label="หยุดฟัง" onClick={toggle}><Mic /></button>
            </div>
          ) : (
            <>
              <textarea ref={inputRef} value={input} rows={2} maxLength={MAX_QUESTION_LENGTH} aria-label={`ข้อความถึง ${job?.title ?? name}`} placeholder="พิมพ์ข้อความ…" onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                send()
              }} className="lab-chat-scroll block h-12 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-5 text-slate-900 caret-gray-500 outline-none placeholder:text-slate-500" />
              <div className="flex h-9 items-center gap-1">
                {formula && <span title={`สูตรที่กำลังดู · ${formula.name}`} className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600"><FlaskConical className="size-3 shrink-0" /><span className="truncate">{formula.name}</span></span>}
                <button className={`${iconButton} ml-auto`} type="button" title="พิมพ์ด้วยเสียง" aria-label="พิมพ์ด้วยเสียง" onClick={toggle}><Mic /></button>
                <button className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-700 text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-40" type="submit" disabled={!input.trim() || !chatReady || (!agentDemo && busy)} aria-label="ส่งข้อความ" title="ส่งข้อความ"><ArrowUp className="size-4" /></button>
              </div>
            </>
          )}
        </div>
      </form>
    </section>
  )
}

/** Live totals of the demo state, so the handoff outcome can be read off the screen. */
function DemoCounts({ demo }: { demo: AgentDemo }) {
  const c = counts(demo.state)
  return (
    <details className="mb-1 px-1 text-[11px] text-slate-500">
      <summary className="w-fit cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-teal-600">ข้อมูลจำลอง · {demo.experimentId}</summary>
      <p data-testid="agent-demo-counts">ส่งงาน {c.handoffs} · งาน {c.tasks} · รับงาน {c.acceptances} · ช่องกลุ่มโครงการ {c.groupThreads} · ลิงก์ {c.pointers} · ขวด {c.vials} · Node {c.formulaNodes}</p>
    </details>
  )
}
