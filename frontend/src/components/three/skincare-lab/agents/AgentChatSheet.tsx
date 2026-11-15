'use client'

import { useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { EditSheet } from '@/components/kit/edit-sheet'
import { FormulaCard } from '@/components/kit/formula-card'
import { ScoreList } from '@/components/kit/score-card'
import { ChainOfThought, Confirmation, InlineCitation, Plan, PromptInput, Suggestion, Suggestions, TestResults, type WorkStep } from '@/components/ai'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Message, MessageContent } from '@/components/ui/message'
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerViewport } from '@/components/ui/message-scroller'
import { Persona, type PersonaState } from '@/components/ui/persona'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useStreamedText } from '@/components/ai/use-streamed-text'
import { AGENTS, AGENT_BY_ID, type AgentId } from './agents'
import type { Card } from './script'
import type { AgentLab, AgentStatus, ChatMessage } from './useAgentLab'

const STATUS_TEXT: Record<AgentStatus, string> = { idle: 'ว่าง', working: 'กำลังทำงาน', walking: 'กำลังเดินส่งงาน' }

function personaState(status: AgentStatus, typing = false): PersonaState {
  if (status === 'working') return 'thinking'
  if (status === 'walking') return 'speaking'
  return typing ? 'listening' : 'idle'
}

/** The agent's avatar everywhere (sheet header, messages, strip). */
export function AgentPersona({
  id,
  status = 'idle',
  typing,
  state,
  animate,
  className,
}: {
  id: AgentId
  status?: AgentStatus
  typing?: boolean
  state?: PersonaState
  /** Default: animate only when the agent is doing something (idle stones stay still, which keeps lists cheap). */
  animate?: boolean
  className?: string
}) {
  const a = AGENT_BY_ID[id]
  const s = state ?? personaState(status, typing)
  return <Persona name={a.name} color={a.color} state={s} animate={animate ?? s !== 'idle'} className={cn('size-10', className)} />
}

/** Endpoint keys, so each row gets its category icon. */
const ENDPOINT_KEY: Record<string, string> = { ระคายเคืองผิว: 'skin', ระคายเคืองตา: 'eye', แพ้ผิวหนัง: 'sens', พิษเฉียบพลัน: 'acute' }

const done = (labels: string[]): WorkStep[] => labels.map((label) => ({ label, status: 'done' }))

function CardView({ card }: { card: Card }) {
  // Laid straight on the page (no outer box), like the reply text around them.
  const box = 'overflow-hidden text-sm'
  switch (card.kind) {
    case 'brief':
      return (
        <dl className={cn(box, 'divide-y')}>
          {card.rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )
    case 'options':
      return (
        <ul className={cn(box, 'divide-y')}>
          {card.rows.map((r) => (
            <li key={r.name} className="py-2">
              <div className="font-medium">{r.name}</div>
              <div className="text-muted-foreground">
                {r.why}
                {r.source && <InlineCitation href={r.source.href} label={r.source.label} title={`${r.name} บน ${r.source.label}`} />}
              </div>
            </li>
          ))}
        </ul>
      )
    case 'formula': {
      // Same FormulaCard as the assess page, read-only: no edit, remove or add.
      const water = card.rows.find((r) => r.name === 'Water')
      return (
        <FormulaCard
          name={`สูตร ${card.version}`}
          productType="สูตรทำความสะอาด"
          basePercent={water?.pct}
          ingredients={card.rows.filter((r) => r !== water).map((r) => ({ name: r.name, percent: r.pct, property: r.note }))}
        />
      )
    }
    case 'scores':
      // Same ScoreList as the assess page (rings, level, model reliability).
      return (
        <ScoreList
          title={`ผลประเมิน ${card.version}`}
          caption="ใบหน้า"
          items={card.rows.map((r) => ({
            key: ENDPOINT_KEY[r.label] ?? r.label,
            label: r.label,
            score: r.score,
            band: r.band,
            confidence: 'medium' as const,
          }))}
        />
      )
    case 'verdict':
      return (
        <div className="space-y-1.5">
          <TestResults rows={card.rows} />
          {card.note && <p className="text-xs text-muted-foreground">{card.note}</p>}
        </div>
      )
  }
}

function HandoffNote({ m, self, onOpenAgent }: { m: ChatMessage; self: AgentId; onOpenAgent: (id: AgentId) => void }) {
  const h = m.handoff!
  const outgoing = h.from === self
  const other = AGENT_BY_ID[outgoing ? h.to : h.from]
  return (
    <button
      type="button"
      onClick={() => onOpenAgent(other.id)}
      title={`เปิดแชท${other.name}`}
      className="group flex w-full items-center gap-2 rounded-md text-left text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <ArrowRight className={cn('size-4 shrink-0', !outgoing && 'rotate-180')} aria-hidden />
      <span className="shrink-0">{outgoing ? 'ส่งต่อให้' : 'รับงานจาก'}</span>
      <AgentPersona id={other.id} className="size-5" />
      <span className="shrink-0 font-medium" style={{ color: other.color }}>
        {other.name}
      </span>
      <span className="min-w-0 truncate">· {outgoing ? m.text : m.text.replace(/^ได้รับงานจาก[^:]*:\s*/, '')}</span>
    </button>
  )
}

function AgentReply({ m, agentId, lab }: { m: ChatMessage; agentId: AgentId; lab: AgentLab }) {
  const { parts, text, done: finished } = useStreamedText(m.id, m.text, m.at)
  return (
    <Message>
      <MessageContent className="gap-3">
        {m.steps && m.steps.length > 0 && <ChainOfThought steps={done(m.steps)} />}
        <p className="whitespace-pre-wrap leading-relaxed">
          {finished
            ? text
            : parts.map((w, i) => (
                <span key={i} className="animate-in fade-in-0 duration-300 ease-out">
                  {w}
                </span>
              ))}
          {!finished && <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-foreground/60" />}
        </p>
        {finished && m.card && (
          <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
            <CardView card={m.card} />
          </div>
        )}
        {finished && m.confirm && (
          <Confirmation
            className="animate-in fade-in-0 duration-300 motion-reduce:animate-none"
            title={m.confirm.title}
            description={m.confirm.description}
            state={m.confirm.state}
            onApprove={() => lab.answer(m.id, true)}
            onDeny={() => lab.answer(m.id, false)}
          />
        )}
      </MessageContent>
    </Message>
  )
}

function Turn({ m, agentId, lab, onOpenAgent }: { m: ChatMessage; agentId: AgentId; lab: AgentLab; onOpenAgent: (id: AgentId) => void }) {
  if (m.handoff) return <HandoffNote m={m} self={agentId} onOpenAgent={onOpenAgent} />
  if (m.from === 'system') return <p className="text-center text-xs text-muted-foreground">{m.text}</p>
  if (m.from === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent>{m.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }
  return <AgentReply m={m} agentId={agentId} lab={lab} />
}

/** The lab lead's view of the whole experiment: one step per station. */
function ProjectPlan({ lab }: { lab: AgentLab }) {
  const steps: WorkStep[] = AGENTS.map((a) => ({
    label: `${a.name} · ${a.role}`,
    status: lab.status[a.id] !== 'idle' ? 'running' : lab.done.includes(a.id) ? 'done' : 'pending',
  }))
  return <Plan title="แผนโครงการทดลอง" steps={steps} />
}

export function AgentChatSheet({ agentId, lab, onClose, onOpenAgent }: { agentId: AgentId | null; lab: AgentLab; onClose: () => void; onOpenAgent: (id: AgentId) => void }) {
  const [text, setText] = useState('')
  const agent = agentId ? AGENT_BY_ID[agentId] : null
  const messages = agentId ? lab.messages[agentId] : []
  const live = agentId ? lab.steps[agentId] : []
  const status = agentId ? lab.status[agentId] : 'idle'
  const hasHistory = Object.values(lab.messages).some((list) => list.length > 0)

  const send = (value: string) => {
    if (!agentId || !value.trim()) return
    lab.send(agentId, value)
    setText('')
  }

  return (
    <EditSheet
      open={Boolean(agent)}
      onOpenChange={(open) => !open && onClose()}
      modal={false}
      defaultWidth={460}
      minWidth={380}
      maxWidth={760}
      title={agent?.name ?? ''}
      compact
      headerActions={
        hasHistory && (
          <Button variant="ghost" size="icon-sm" onClick={lab.clear} aria-label="ล้างประวัติทุกตัว" title="ล้างประวัติทุกตัว" className="text-muted-foreground [&_svg]:size-4">
            <RotateCcw />
          </Button>
        )
      }
      bodyClassName="flex flex-col space-y-0 overflow-hidden bg-background p-0"
      footer={
        agent && (
          <div className="space-y-2">
            {/* Only before the first message: once the chat has started the suggestions go away. */}
            {messages.length === 0 && (
              <Suggestions>
                {agent.examples.map((ex) => (
                  <Suggestion key={ex} suggestion={ex} onClick={send} />
                ))}
              </Suggestions>
            )}
            <PromptInput
              value={text}
              onChange={setText}
              onSubmit={send}
              working={lab.busy}
              onStop={lab.stop}
              label={`ข้อความถึง${agent.name}`}
              placeholder={`สั่งงาน${agent.name}…`}
            />
          </div>
        )
      }
    >
      {agent && agentId && (
        <TooltipProvider delayDuration={200}>
          <MessageScroller key={agentId}>
            <MessageScrollerViewport>
              <MessageScrollerContent>
                {agentId === 'lead' && <ProjectPlan lab={lab} />}

                {messages.map((m) => (
                  <MessageScrollerItem key={m.id}>
                    <Turn m={m} agentId={agentId} lab={lab} onOpenAgent={onOpenAgent} />
                  </MessageScrollerItem>
                ))}

                {/* Work in progress: Chain of Thought opens while it runs */}
                {status === 'working' && live.length > 0 && (
                  <MessageScrollerItem>
                    <Message>
                      <MessageContent>
                        <ChainOfThought
                          running
                          steps={live.map((s, i) => ({
                            label: s.label,
                            status: s.done ? 'done' : i === live.findIndex((x) => !x.done) ? 'running' : 'pending',
                          }))}
                        />
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )}

              </MessageScrollerContent>
            </MessageScrollerViewport>
            {/* Empty chat: the agent's stone in the middle, idle until the first message */}
            {messages.length === 0 && live.length === 0 && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.22]">
                <AgentPersona id={agentId} state="idle" animate className="size-36" />
              </div>
            )}
            <MessageScrollerButton />
          </MessageScroller>
        </TooltipProvider>
      )}
    </EditSheet>
  )
}

/** Fallback way to open a chat (and the easy one on phones): the five agents as live orbs. */
export function AgentStrip({ lab, selected, onSelect }: { lab: AgentLab; selected: AgentId | null; onSelect: (id: AgentId) => void }) {
  return (
    <nav aria-label="เจ้าหน้าที่ AI" className="absolute bottom-3 left-3 flex gap-1 rounded-full border bg-card/90 p-1.5 shadow-md backdrop-blur">
      {AGENTS.map((a) => {
        const st = lab.status[a.id]
        const unread = lab.unread[a.id]
        return (
          <button
            key={a.id}
            type="button"
            title={`${a.name} · ${STATUS_TEXT[st]}`}
            aria-label={`เปิดแชท${a.name}`}
            aria-pressed={selected === a.id}
            onClick={() => onSelect(a.id)}
            className={cn(
              'relative rounded-full p-0.5 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40',
              selected === a.id && 'bg-accent'
            )}
          >
            <AgentPersona id={a.id} status={st} className="size-9" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-white">{unread}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
