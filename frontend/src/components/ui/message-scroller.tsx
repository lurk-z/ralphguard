"use client"

import * as React from "react"
import { ArrowDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/*
 * Message Scroller (simplified Tailwind 3 / React 18 take on shadcn.io "Message Scroller").
 * The original is built on `@shadcn/react`, which needs React 19, so this keeps only what the chat uses:
 * follow new messages while the reader is at the bottom, stop following when they scroll up,
 * and a button to jump back to the end. It fills its parent, so give the parent a height.
 */

type Ctx = { viewport: React.RefObject<HTMLDivElement>; atEnd: boolean; scrollToEnd: (smooth?: boolean) => void }
const ScrollerContext = React.createContext<Ctx | null>(null)

function useScroller() {
  const ctx = React.useContext(ScrollerContext)
  if (!ctx) throw new Error("MessageScroller parts must be inside <MessageScroller>")
  return ctx
}

/** Distance from the bottom (px) that still counts as "at the end". */
const END_SLOP = 48

function MessageScroller({ className, children, ...props }: React.ComponentProps<"div">) {
  const viewport = React.useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = React.useState(true)
  const follow = React.useRef(true)
  const frame = React.useRef(0)

  /** Ease toward the bottom (a share of the remaining distance per frame) instead of jumping. */
  const glide = React.useCallback(() => {
    if (frame.current) return
    const step = () => {
      frame.current = 0
      const el = viewport.current
      if (!el || !follow.current) return
      const target = el.scrollHeight - el.clientHeight
      const gap = target - el.scrollTop
      if (gap < 0.5) return
      el.scrollTop += Math.max(0.6, gap * 0.18)
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [])

  const scrollToEnd = React.useCallback(
    (smooth = true) => {
      const el = viewport.current
      if (!el) return
      follow.current = true
      setAtEnd(true)
      if (smooth) glide()
      else el.scrollTop = el.scrollHeight
    },
    [glide]
  )

  React.useEffect(() => {
    const el = viewport.current
    if (!el) return
    // Only the reader scrolling up stops the follow: our own gliding also fires scroll events,
    // and a tall card can briefly leave us far from the end.
    const leave = () => {
      follow.current = false
      setAtEnd(false)
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) leave()
    }
    let touchY = 0
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0].clientY > touchY + 4) leave()
    }
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(e.key)) leave()
    }
    const onScroll = () => {
      const end = el.scrollHeight - el.scrollTop - el.clientHeight < END_SLOP
      if (end) {
        follow.current = true
        setAtEnd(true)
      } else if (!frame.current && !follow.current) {
        setAtEnd(false)
      }
    }
    const content = el.firstElementChild
    const ro = new ResizeObserver(() => {
      if (follow.current) glide()
    })
    if (content) ro.observe(content)
    el.addEventListener("wheel", onWheel, { passive: true })
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })
    el.addEventListener("keydown", onKey)
    el.addEventListener("scroll", onScroll, { passive: true })
    el.scrollTop = el.scrollHeight
    return () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
      ro.disconnect()
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("keydown", onKey)
      el.removeEventListener("scroll", onScroll)
    }
  }, [glide])

  return (
    <ScrollerContext.Provider value={{ viewport, atEnd, scrollToEnd }}>
      <div data-slot="message-scroller" className={cn("relative flex min-h-0 flex-1 flex-col", className)} {...props}>
        {children}
      </div>
    </ScrollerContext.Provider>
  )
}

function MessageScrollerViewport({ className, children, ...props }: React.ComponentProps<"div">) {
  const { viewport } = useScroller()
  return (
    <div
      ref={viewport}
      tabIndex={0}
      role="region"
      aria-label="ข้อความ"
      data-slot="message-scroller-viewport"
      className={cn("thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/40", className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** The column of turns: a polite live region, so screen readers hear new messages. */
function MessageScrollerContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="log" data-slot="message-scroller-content" className={cn("flex flex-col gap-5 p-4", className)} {...props} />
}

function MessageScrollerItem({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-scroller-item" className={cn("animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none", className)} {...props} />
}

/** Jump-to-end button; shows only when the reader has scrolled up. */
function MessageScrollerButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { atEnd, scrollToEnd } = useScroller()
  if (atEnd) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label="ไปข้อความล่าสุด"
      onClick={() => scrollToEnd()}
      className={cn("absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-md", className)}
      {...props}
    >
      <ArrowDown />
    </Button>
  )
}

export { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerViewport }
