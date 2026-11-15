"use client"

import type * as React from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

/*
 * Trace (port of shadcn.io "Trace", Base UI + Tailwind 4 → Radix Collapsible + Tailwind 3).
 * Lines that report an agent's work. The base of Chain of Thought, Plan and Test Results.
 * A running line's title shimmers (`.trace-shimmer` in globals.css); error lines are red; pending lines are dimmed.
 * Write each title in the tense that matches its state ("กำลังค้น…" / "ค้นแล้ว") — the colour is not announced.
 */

function Trace({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="trace" className={cn("flex w-full min-w-0 flex-col gap-2", className)} {...props} />
}

function TraceLine({
  className,
  status,
  ...props
}: React.ComponentProps<"span"> & {
  /** The state of the work the line reports. */
  status?: "running" | "error" | "pending"
}) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "flex w-fit min-w-0 max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors data-[status=error]:text-destructive data-[status=pending]:opacity-60",
        className
      )}
      {...props}
    />
  )
}

function TraceIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="trace-icon"
      className={cn("flex size-4 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none", className)}
      {...props}
    />
  )
}

function TraceTitle({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="trace-title" className={cn("min-w-0 truncate", className)} {...props} />
}

function TraceDescription({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="trace-description" className={cn("shrink-0 tabular-nums text-muted-foreground/70", className)} {...props} />
}

function TraceCollapsible({ className, ...props }: React.ComponentProps<typeof Collapsible>) {
  return <Collapsible data-slot="trace-collapsible" className={cn("flex w-full min-w-0 flex-col", className)} {...props} />
}

function TraceCollapsibleTrigger({ className, children, ...props }: React.ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="trace-collapsible-trigger"
      className={cn(
        "group/trace-trigger flex w-fit min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-md text-start text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 has-[[data-status=error]]:text-destructive [&_[data-slot=trace-line]]:text-inherit",
        className
      )}
      {...props}
    >
      {children}
      <TraceIcon className="transition-transform group-data-[state=open]/trace-trigger:rotate-90 motion-reduce:transition-none">
        <ChevronRight />
      </TraceIcon>
    </CollapsibleTrigger>
  )
}

function TraceCollapsibleContent({ className, children, ...props }: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="trace-collapsible-content"
      className="min-w-0 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none"
      {...props}
    >
      <div
        data-slot="trace-collapsible-content-inner"
        className={cn("mb-1 ml-[7px] mt-2 min-w-0 break-words border-l pl-4 pr-1 leading-relaxed text-muted-foreground", className)}
      >
        {children}
      </div>
    </CollapsibleContent>
  )
}

export { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle }
