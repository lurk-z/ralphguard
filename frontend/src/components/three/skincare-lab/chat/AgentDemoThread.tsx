'use client'

import type { ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Circle, CircleAlert, CircleCheck, Hourglass, LoaderCircle, RotateCw, Users } from 'lucide-react'
import AssessmentReply from './AssessmentReply'
import { assessmentText } from '@/lib/lab-demo/chat-assessment'
import ChatActivity, { elapsedLabel } from './ChatActivity'
import { ROLE_EN } from '@/lib/lab-demo/engine'
import type { AgentRole, ChatMessage, Handoff, HandoffStatus, Job, StepStatus, Task } from '@/lib/lab-demo/events'
import { messageJobId } from '@/lib/lab-demo/conversations'
import { AgentFace, UserFace } from './DemoConversations'
import MessageMeta from './MessageMeta'
import type { AgentDemo } from './useAgentDemo'

const STATUS: Record<HandoffStatus, { label: string; className: string; Icon: typeof CircleCheck }> = {
  sending: { label: 'กำลังส่ง', className: 'text-sky-800 bg-sky-50 ring-sky-200', Icon: LoaderCircle },
  retrying: { label: 'ส่งไม่สำเร็จ · กำลังลองใหม่', className: 'text-amber-800 bg-amber-50 ring-amber-200', Icon: LoaderCircle },
  failed: { label: 'ส่งไม่สำเร็จ', className: 'text-rose-800 bg-rose-50 ring-rose-200', Icon: CircleAlert },
  accepted: { label: 'ส่งถึงผู้รับแล้ว', className: 'text-teal-700', Icon: CircleCheck },
}

function SenderMessage({ role, first, label, children }: { role: AgentRole; first: boolean; label?: string; children: ReactNode }) {
  return <div className="flex items-start gap-2">
    {first ? <AgentFace role={role} size={28} /> : <span aria-hidden="true" className="w-7 shrink-0" />}
    <div className="min-w-0 flex-1">
      {first && <p className="mb-1 truncate text-[11px] font-normal leading-4 text-slate-500" title={ROLE_EN[role]}>
        {ROLE_EN[role]} {label && <span className="ml-1 text-[10px]">{label}</span>}
      </p>}
      {children}
    </div>
  </div>
}

function HandoffLine({ handoff, onRetry, onOpen }: { handoff: Handoff; onRetry: () => void; onOpen?: () => void }) {
  const status = STATUS[handoff.status]
  const spinning = handoff.status === 'sending' || handoff.status === 'retrying'
  return (
    <div className="border-l-2 border-teal-200 pl-3 text-xs text-slate-700" data-handoff-id={handoff.handoffId} data-status={handoff.status}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-slate-600">{ROLE_EN[handoff.from]}</span>
        <ArrowRight aria-label="ส่งถึง" className="size-3.5 shrink-0 text-slate-400" />
        {onOpen ? <button type="button" onClick={onOpen} aria-label={`เปิดแชต ${ROLE_EN[handoff.to]}`} title={`เปิดแชต ${ROLE_EN[handoff.to]}`}
          className="inline-flex items-center gap-0.5 rounded py-1 font-semibold text-teal-800 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600">
          {ROLE_EN[handoff.to]}<ArrowUpRight aria-hidden="true" className="size-3" />
        </button> : <strong className="py-1 font-semibold">{ROLE_EN[handoff.to]}</strong>}
        <span role="status" title={status.label} className={`inline-flex items-center gap-1 rounded ${status.className}`}>
          <status.Icon aria-hidden="true" className={`size-3.5 ${spinning ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          <span className={handoff.status === 'accepted' ? 'sr-only' : ''}>{status.label}</span>
        </span>
      </div>
      <p className="break-words py-0.5 text-sm leading-5 text-slate-800">{handoff.title}</p>
        {handoff.status === 'failed' && (
          <button type="button" onClick={onRetry} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-teal-700 px-3 text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
            <RotateCw aria-hidden="true" className="size-3.5" /> ลองอีกครั้ง
          </button>
        )}
    </div>
  )
}

const STEP: Record<StepStatus, { label: string; Icon: typeof Circle; className: string }> = {
  done: { label: 'เสร็จแล้ว', Icon: CircleCheck, className: 'text-emerald-700' },
  active: { label: 'กำลังทำ', Icon: LoaderCircle, className: 'text-sky-700 animate-spin motion-reduce:animate-none' },
  waiting: { label: 'รอ', Icon: Hourglass, className: 'text-amber-700' },
  pending: { label: 'ยังไม่เริ่ม', Icon: Circle, className: 'text-slate-400' },
}

/**
 * Expandable progress of one task, under its owner's acceptance message. Each message keeps
 * its own open state, so folding one agent's list never folds another's. Rows update in place.
 */
function TaskChecklist({ task, elapsed }: { task: Task; elapsed: string }) {
  const active = task.steps.find((step) => step.status === 'waiting' || step.status === 'active')
  const label = task.status === 'completed' ? elapsed : active?.note || active?.label || 'กำลังทำงาน…'
  return (
    <div data-task-id={task.taskId} data-task-status={task.status}>
      <ChatActivity label={label}>
        <ol className="space-y-1">
          {task.steps.map((step) => {
            const look = STEP[step.status]
            return (
              <li key={step.stepId} className="flex items-start gap-2" data-step={step.stepId} data-step-status={step.status}>
                <look.Icon aria-hidden="true" className={`mt-0.5 size-3.5 shrink-0 ${look.className}`} />
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  <span className="sr-only">{look.label}: </span>
                  <span className={step.status === 'pending' ? 'text-slate-500' : 'text-slate-800'}>{step.label}</span>
                  {step.note && <span className="block text-amber-800">{step.note}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </ChatActivity>
    </div>
  )
}

/**
 * One thread rendered from the shared demo state: an agent's private thread, or the project
 * group (`group`), where every message carries its experiment label.
 */
export default function AgentDemoThread({ demo, threadId, job, highlightId, onOpenGroup, onOpenAgent }: {
  demo: AgentDemo
  threadId: string
  job?: Job
  /** Message the user arrived at through a pointer: briefly outlined. */
  highlightId?: string | null
  onOpenGroup: (jobId: string, targetMessageId?: string) => void
  onOpenAgent: (agent: AgentRole, threadId: string) => void
}) {
  const messages = demo.state.messages.filter((m) => m.threadId === threadId && (!job || messageJobId(demo.state, m) === job.jobId))
  const times = new Map(demo.state.log.map((event) => [event.sequence, event.occurredAt]))
  const requests = new Map(messages.filter(m => m.kind === 'user').map(m => [m.messageId, times.get(m.sequence)]))
  const answered = new Set(messages.flatMap(m => m.kind === 'agent' && m.inReplyTo ? [m.inReplyTo] : []))
  const started = new Map<string, number | undefined>()
  const finished = new Map<string, number | undefined>()
  for (const e of demo.state.log) {
    if (e.type === 'task.planned') started.set(e.taskId, e.occurredAt)
    if (e.type === 'task.completed') finished.set(e.taskId, e.occurredAt)
  }
  let lastSpeaker: AgentRole | 'user' | 'system' | null = null

  return messages.map((message: ChatMessage) => {
    const speaker: AgentRole | 'user' | 'system' = message.kind === 'user' ? 'user'
      : message.kind === 'handoff' ? demo.state.handoffs[message.handoffId].from
      : message.kind === 'pointer' || message.kind === 'job-intro' ? 'system'
      : message.from
    const showSpeaker = speaker !== 'user' && speaker !== 'system' && speaker !== lastSpeaker
    lastSpeaker = speaker
    const common = {
      'data-message-id': message.messageId,
      'data-kind': message.kind,
      tabIndex: -1,
      className: `mb-4 min-w-0 rounded-xl outline-none transition-shadow ${message.messageId === highlightId ? 'ring-2 ring-teal-600 ring-offset-4' : ''}`,
    }
    if (message.kind === 'user') {
      return (
        <article key={message.messageId} {...common} className={`${common.className} lab-chat-message flex flex-col`}>
          <div className="flex max-w-[90%] items-start gap-2 self-end">
          <div className="min-w-0">
            <p className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-teal-50 px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere]">{message.text}</p>
            <MessageMeta text={message.text} time={times.get(message.sequence)} outgoing />
          </div>
          <UserFace viewer={demo.viewer} />
          </div>
          {!answered.has(message.messageId) && <p role="status" className="mt-3 text-xs text-slate-500">{ROLE_EN[message.to]} กำลังดูคำขอ…</p>}
        </article>
      )
    }
    if (message.kind === 'handoff') {
      const handoff = demo.state.handoffs[message.handoffId]
      return (
        <article key={message.messageId} {...common}>
          <HandoffLine handoff={handoff} onRetry={() => void demo.retry(handoff.handoffId)}
            onOpen={!job && handoff.recipientThreadId && handoff.recipientThreadId !== threadId ? () => onOpenAgent(handoff.to, handoff.recipientThreadId!) : undefined} />
        </article>
      )
    }
    if (message.kind === 'pointer') {
      return (
        <article key={message.messageId} {...common}>
          <button type="button" onClick={() => onOpenGroup(message.jobId, message.targetMessageId)} className="flex w-full min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-left text-xs text-teal-900 hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
            <Users aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold [overflow-wrap:anywhere]">{demo.state.jobs[message.jobId].title}</span>
              <span className="block text-teal-800">{message.experimentId} · เปิดข้อความในกลุ่ม</span>
            </span>
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </button>
        </article>
      )
    }
    if (message.kind === 'job-intro') {
      return (
        <article key={message.messageId} {...common} className={`${common.className} border-y border-slate-200 py-2 text-xs text-slate-600`}>
          <p className="font-semibold text-slate-800">Researcher เปิดกลุ่มตามที่คุณยืนยัน</p>
          <p className="mt-0.5">ผู้รับผิดชอบ: {message.assignees.map((role) => ROLE_EN[role]).join(', ')}</p>
        </article>
      )
    }
    if (message.kind === 'group-invite') {
      const invitation = demo.state.jobs[message.jobId].invitation
      return <article key={message.messageId} {...common}>
        <SenderMessage role="researcher" first={showSpeaker}>
          <p className="text-sm leading-7">{message.text}</p>
          {invitation?.status === 'pending' ? <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button type="button" className="rounded-lg bg-teal-700 px-3 py-2 text-white hover:bg-teal-800" onClick={() => { demo.decideGroup(message.jobId, true); onOpenGroup(message.jobId) }}>สร้างกลุ่ม</button>
            <button type="button" className="rounded-lg px-2 py-2 text-slate-600 hover:bg-slate-100" onClick={() => demo.decideGroup(message.jobId, false)}>คุยแยกต่อ</button>
          </div> : invitation?.status === 'accepted'
            ? <button type="button" className="py-1 text-xs text-teal-700 hover:underline" onClick={() => onOpenGroup(message.jobId)}>เปิดข้อความในกลุ่ม →</button>
            : <p className="text-xs text-slate-500">คุยงานต่อในแชตส่วนตัว</p>}
        </SenderMessage>
      </article>
    }
    const taskId = message.kind === 'acceptance' ? demo.state.handoffs[message.handoffId]?.taskId : message.taskId
    const task = taskId ? demo.state.tasks[taskId] : undefined
    const receipt = message.kind === 'acceptance' || (!!taskId && !!message.inReplyTo)
    const assessment = message.kind === 'agent' ? message.assessment : undefined
    return (
      <article key={message.messageId} {...common} className={`${common.className} lab-chat-message text-sm leading-7`}>
        <SenderMessage role={message.from} first={showSpeaker} label={job?.experimentId}>
          {message.kind === 'agent' && message.activity && <ChatActivity label={elapsedLabel(requests.get(message.inReplyTo ?? ''), times.get(message.sequence))}>{message.activity}</ChatActivity>}
          {receipt ? <span role="img" aria-label="ส่งถึงผู้รับแล้ว" title="ส่งถึงผู้รับแล้ว" className="inline-flex align-middle text-teal-700"><CircleCheck aria-hidden="true" className="size-4" /></span>
            : <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{message.text}</p>}
          {assessment && <AssessmentReply data={assessment} />}
          {task?.workThreadId === threadId && task.steps.length > 0 && <TaskChecklist task={task} elapsed={elapsedLabel(started.get(task.taskId), finished.get(task.taskId))} />}
          {!receipt && <MessageMeta text={assessment ? message.text + '\n' + assessmentText(assessment) : message.text} time={times.get(message.sequence)} />}
        </SenderMessage>
      </article>
    )
  })
}
