"use client"

/*
 * AI chat patterns (Tailwind 3 / Radix takes on the shadcn.io AI patterns).
 * Built from the ports in components/ui: Trace, Message, Bubble, Persona, Message Scroller.
 */

import * as React from "react"
import { ArrowUp, Check, CircleCheck, CircleX, ExternalLink, Loader2, ShieldQuestion, Square, Wrench } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

/* ------------------------------------------------------------------ */
/* Steps shared by Chain of Thought and Plan                          */
/* ------------------------------------------------------------------ */

export type StepStatus = "done" | "running" | "pending" | "error"
export type WorkStep = { label: string; status: StepStatus; detail?: React.ReactNode }

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <Loader2 className="animate-spin motion-reduce:animate-none" />
  if (status === "error") return <CircleX />
  if (status === "pending") return <span className="size-3 rounded-full border border-current" />
  return <CircleCheck />
}

function StepLine({ step }: { step: WorkStep }) {
  const line = (
    <TraceLine status={step.status === "done" ? undefined : step.status}>
      <TraceIcon>
        <StepIcon status={step.status} />
      </TraceIcon>
      <TraceTitle>{step.label}</TraceTitle>
    </TraceLine>
  )
  if (!step.detail) return line
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{step.detail}</TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

/* ------------------------------------------------------------------ */
/* Chain of Thought: an agent's work folded under one line             */
/* ------------------------------------------------------------------ */

/**
 * Open while the agent works ("กำลังทำงาน…"), folds to "ทำแล้ว N ขั้นตอน" when the answer arrives.
 * The reader can open or close it any time; their choice wins over the running state.
 */
export function ChainOfThought({ steps, running = false, className }: { steps: WorkStep[]; running?: boolean; className?: string }) {
  const [open, setOpen] = React.useState<boolean>()
  if (steps.length === 0) return null
  const failed = steps.filter((s) => s.status === "error").length
  const done = steps.filter((s) => s.status === "done").length
  const title = running ? "กำลังทำงาน…" : `ทำแล้ว ${done} ขั้นตอน${failed ? ` · ไม่สำเร็จ ${failed}` : ""}`
  return (
    <Trace className={className}>
      <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine status={running ? "running" : failed ? "error" : undefined}>
            <TraceIcon>{running ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Wrench />}</TraceIcon>
            <TraceTitle>{title}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            {steps.map((s) => (
              <StepLine key={s.label} step={s} />
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

/* ------------------------------------------------------------------ */
/* Plan: the steps an agent plans to take and how far it has got      */
/* ------------------------------------------------------------------ */

export function Plan({ title, steps, defaultOpen = true, className }: { title: string; steps: WorkStep[]; defaultOpen?: boolean; className?: string }) {
  const done = steps.filter((s) => s.status === "done").length
  const running = steps.some((s) => s.status === "running")
  return (
    <div className={cn("space-y-2", className)}>
      <Trace>
        <TraceCollapsible defaultOpen={defaultOpen}>
          <TraceCollapsibleTrigger>
            <TraceLine status={running ? "running" : undefined} className="font-medium text-foreground">
              <TraceTitle>{title}</TraceTitle>
              <TraceDescription>
                {done}/{steps.length}
              </TraceDescription>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              {steps.map((s) => (
                <StepLine key={s.label} step={s} />
              ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(done / Math.max(steps.length, 1)) * 100}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Test Results: pass/fail per check, one summary line                 */
/* ------------------------------------------------------------------ */

export type TestRow = { label: string; pass: boolean; detail?: string }

export function TestResults({ title, rows, className }: { title?: string; rows: TestRow[]; className?: string }) {
  const failed = rows.filter((r) => !r.pass).length
  const passed = rows.length - failed
  return (
    <div className={className}>
      <Trace>
        <TraceCollapsible defaultOpen>
          <TraceCollapsibleTrigger>
            <TraceLine className={cn("font-medium", failed ? "text-red-700" : "text-emerald-700")}>
              <TraceIcon>{failed ? <CircleX /> : <CircleCheck />}</TraceIcon>
              <TraceTitle>{title ?? (failed ? "ไม่ผ่านเกณฑ์" : "ผ่านเกณฑ์")}</TraceTitle>
              <TraceDescription>
                ผ่าน {passed} · ไม่ผ่าน {failed}
              </TraceDescription>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              {rows.map((r) => (
                <TraceLine key={r.label} className={r.pass ? undefined : "text-red-700"}>
                  <TraceIcon>{r.pass ? <Check className="text-emerald-600" /> : <CircleX />}</TraceIcon>
                  <TraceTitle className="whitespace-normal">{r.label}</TraceTitle>
                  {r.detail && <TraceDescription className="whitespace-normal">{r.detail}</TraceDescription>}
                </TraceLine>
              ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Confirmation: ask before a risky step                              */
/* ------------------------------------------------------------------ */

export type ConfirmationState = "pending" | "approved" | "denied"

export function Confirmation({
  title,
  description,
  state,
  onApprove,
  onDeny,
  className,
}: {
  title: string
  description?: React.ReactNode
  state: ConfirmationState
  onApprove?: () => void
  onDeny?: () => void
  className?: string
}) {
  return (
    <div role="group" aria-label={title} className={cn("rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950", className)}>
      <div className="flex items-start gap-2.5">
        <ShieldQuestion className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          {description && <div className="mt-0.5 text-sm text-amber-900/80">{description}</div>}
        </div>
      </div>
      {state === "pending" ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onDeny} className="bg-card">
            ไม่อนุมัติ
          </Button>
          <Button size="sm" onClick={onApprove}>
            อนุมัติ
          </Button>
        </div>
      ) : (
        <div className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium", state === "approved" ? "text-emerald-700" : "text-red-700")}>
          {state === "approved" ? <CircleCheck className="size-3.5" /> : <CircleX className="size-3.5" />}
          {state === "approved" ? "อนุมัติแล้ว" : "ไม่อนุมัติ"}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inline Citation: a source chip at the end of the sentence it backs  */
/* ------------------------------------------------------------------ */

export function InlineCitation({ href, label, title }: { href: string; label: string; title?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="ml-1 inline-flex translate-y-[-1px] items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted-foreground no-underline outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {label}
          <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">(เปิดในแท็บใหม่)</span>
        </a>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        {title ?? href}
      </TooltipContent>
    </Tooltip>
  )
}

/* ------------------------------------------------------------------ */
/* Suggestion: one-click prompts above the field                       */
/* ------------------------------------------------------------------ */

export function Suggestions({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" aria-label="คำสั่งแนะนำ" className={cn("flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} {...props} />
}

export function Suggestion({ suggestion, onClick, className }: { suggestion: string; onClick: (s: string) => void; className?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      title={suggestion}
      onClick={() => onClick(suggestion)}
      className={cn("h-8 max-w-[16rem] shrink-0 rounded-full font-normal text-muted-foreground", className)}
    >
      <span className="truncate">{suggestion}</span>
    </Button>
  )
}

/* ------------------------------------------------------------------ */
/* Prompt Input: textarea + send that turns into stop while working    */
/* ------------------------------------------------------------------ */

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  working = false,
  placeholder,
  label,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  /** Shown as a stop button while `working`. */
  onStop?: () => void
  working?: boolean
  placeholder?: string
  label: string
  className?: string
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  // Grow with the text up to ~6 lines. Also re-measure when the field's width changes: measuring while a sheet
  // is still sliding in (zero width) used to leave an empty field stuck at full height.
  const fit = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    if (el.value) el.style.height = `${Math.min(el.scrollHeight, 152)}px`
  }, [])
  React.useLayoutEffect(fit, [value, fit])
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])
  const send = () => {
    if (value.trim()) onSubmit(value)
  }
  return (
    <form
      className={cn(
        "flex items-end gap-2 rounded-2xl border border-input bg-background p-2 shadow-sm transition-[box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
        className
      )}
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter is a new line; ignore Enter while a Thai/CJK IME is composing.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        }}
        className="max-h-[152px] min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
      {working && onStop ? (
        <Button type="button" size="icon" variant="outline" onClick={onStop} aria-label="หยุด" className="shrink-0 rounded-full">
          <Square className="fill-current" />
        </Button>
      ) : (
        <Button type="submit" size="icon" aria-label="ส่ง" disabled={!value.trim()} className="shrink-0 rounded-full">
          <ArrowUp />
        </Button>
      )}
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Agent card: who the agent is and what it can use                    */
/* ------------------------------------------------------------------ */

export function AgentCard({
  name,
  role,
  model,
  tools,
  avatar,
  className,
}: {
  name: string
  role: string
  model?: string
  tools: { name: string; description: string }[]
  avatar?: React.ReactNode
  className?: string
}) {
  return (
    <Collapsible className={className}>
      <CollapsibleTrigger className="group/agent flex w-full items-center gap-3 rounded-xl py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold">{name}</span>
            {model && <Badge variant="muted">{model}</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">{role}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground group-data-[state=open]/agent:hidden">เครื่องมือ {tools.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ul className="space-y-2 pb-1 pl-1 pt-3 text-sm">
          {tools.map((t) => (
            <li key={t.name} className="flex gap-2">
              <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-muted-foreground">{t.description}</div>
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

