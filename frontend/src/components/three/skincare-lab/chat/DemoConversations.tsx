'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { ArrowLeft, ChevronDown, Search, Users, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listConversations, transcriptPreview, type DemoScreen } from '@/lib/lab-demo/conversations'
import { ROLE_EN } from '@/lib/lab-demo/engine'
import type { AgentRole, Job } from '@/lib/lab-demo/events'
import type { AgentDemo } from './useAgentDemo'
import type { Transcript } from '@/lib/lab-demo/chat-history'

const tool = 'grid size-9 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-600 [&>svg]:size-4'
const clock = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' })
const date = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' })

export function AgentFace({ role, size = 36 }: { role: AgentRole; size?: number }) {
  return <span aria-hidden="true" className="lab-chat-portrait rounded-full bg-slate-100" style={{ width: size, height: size }}>
    <Image src={`/images/lab-agents/${role}-Photoroom.png`} alt="" width={512} height={768} unoptimized draggable={false} />
  </span>
}

export function UserFace({ viewer }: { viewer: AgentDemo['viewer'] }) {
  return <Avatar aria-label={viewer?.name || 'คุณ'} className="size-7">
    {viewer?.image && <AvatarImage src={viewer.image} alt="" referrerPolicy="no-referrer" />}
    <AvatarFallback className="bg-teal-50 text-xs text-teal-800">{(viewer?.name || 'คุณ').trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('')}</AvatarFallback>
  </Avatar>
}

function GroupFace({ roles }: { roles: AgentRole[] }) {
  return <span aria-hidden="true" className="grid size-10 shrink-0 grid-cols-2 content-center place-items-center gap-px overflow-hidden rounded-xl bg-slate-100">
    {roles.slice(0, 4).map((role) => <AgentFace key={role} role={role} size={18} />)}
  </span>
}

export function DemoInbox({ demo, history, onAgent, onGroup, onClose }: {
  history: Transcript[]
  demo: AgentDemo; onAgent: (agent: AgentRole) => void; onGroup: (jobId: string) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const needle = search.trim().toLocaleLowerCase()
  const items = listConversations(demo.state, demo.experimentId).map((item) => {
    if (item.kind === 'group') return item
    const latest = history.find((row) => row.agent === item.agent)
    const message = latest?.messages.at(-1)
    return { ...item, time: latest?.updatedAt, preview: transcriptPreview(message) }
  }).sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).filter((item) =>
    `${item.title} ${item.preview}`.toLocaleLowerCase().includes(needle))
  return <section aria-label="รายการสนทนา" className="flex h-full min-h-0 flex-col bg-white text-slate-900">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
      <h2 className="font-semibold">แชต</h2>
      <button type="button" aria-label="ปิดแชต" className={tool} onClick={onClose}><X /></button>
    </header>
    <label className="mx-3 mt-3 flex shrink-0 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm text-slate-500">
      <Search aria-hidden="true" className="size-4" />
      <input aria-label="ค้นหาแชต" type="search" placeholder="ค้นหาแชต" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 outline-none focus-visible:underline" />
    </label>
    <ul className="lab-chat-scroll mt-2 min-h-0 flex-1 overflow-y-auto px-2">
      {items.map((item) => <li key={item.kind === 'group' ? item.jobId : item.agent}>
        <button type="button" data-conversation-kind={item.kind} onClick={() => item.kind === 'group' ? onGroup(item.jobId) : onAgent(item.agent)}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600">
          {item.kind === 'group' ? <GroupFace roles={item.agents} /> : <AgentFace role={item.agent} size={40} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="min-w-0 truncate text-sm font-semibold" title={item.title}>{item.title}</span>
              {item.kind === 'group' && <span aria-label={`สมาชิก ${item.agents.length + 1} คน`} className="shrink-0 text-xs text-slate-500">({item.agents.length + 1})</span>}
              {item.time != null && <time dateTime={new Date(item.time).toISOString()} className="ml-auto shrink-0 text-[10px] text-slate-500">
                {(new Date(item.time).toDateString() === new Date().toDateString() ? clock : date).format(item.time)}
              </time>}
            </span>
            {item.preview && <span className="mt-0.5 block truncate text-xs text-slate-600">{item.preview}</span>}
          </span>
        </button>
      </li>)}
      {!items.length && <li className="p-4 text-sm text-slate-600">ไม่พบแชตที่ตรงกับคำค้น</li>}
    </ul>
  </section>
}

export function DemoChatHeader({ agent, job, viewer, navigate, onClose, actions }: {
  actions?: ReactNode
  agent: AgentRole; job?: Job; viewer: AgentDemo['viewer']; navigate: (screen: DemoScreen) => void; onClose: () => void
}) {
  const title = job?.title ?? ROLE_EN[agent]
  return <header className="flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2">
    <button type="button" className={tool} onClick={() => navigate({ kind: 'inbox' })} aria-label="รายการแชต" title="รายการแชต"><ArrowLeft /></button>
    {job ? <GroupFace roles={job.assignees} /> : <AgentFace role={agent} size={32} />}
    <h2 title={title} className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{title}</h2>
    {job && <Popover>
      <PopoverTrigger asChild><button type="button" aria-label="ดูสมาชิกกลุ่ม" title="ดูสมาชิกกลุ่ม" className="flex min-h-9 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-600">
        <Users aria-hidden="true" className="size-4" />{job.assignees.length + 1}<ChevronDown className="size-3" />
      </button></PopoverTrigger>
      <PopoverContent align="end" aria-label="สมาชิกกลุ่ม" className="z-[86] max-h-[var(--radix-popover-content-available-height)] w-56 overflow-y-auto bg-white p-3">
        <h3 className="mb-2 text-xs font-semibold text-slate-600">สมาชิกกลุ่ม ({job.assignees.length + 1})</h3>
        <ul className="space-y-1.5 text-sm text-slate-800">
          <li className="flex items-center gap-2"><UserFace viewer={viewer} /><span className="truncate">{viewer?.name ? `${viewer.name} (คุณ)` : 'คุณ'}</span></li>
          {job.assignees.map((role) => <li key={role} className="flex items-center gap-2"><AgentFace role={role} size={28} />{ROLE_EN[role]}</li>)}
        </ul>
      </PopoverContent>
    </Popover>}
    {actions}
    <button type="button" className={tool} onClick={onClose} aria-label="ปิดแชต"><X /></button>
  </header>
}
