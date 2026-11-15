"use client"

import * as React from "react"
import { Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

/*
 * Edit sheet (Radix + Tailwind 3 version, ported from ui-library `edit-sheet`).
 * A panel that slides in from the right (150 ms) for editing one record without leaving the page.
 * Header: title, delete (optional), save, close. Body: a scrolling stack of white cards (EditSheetSection).
 * The left edge is a resize handle: drag it, or focus it and use the arrow keys (Home/End jump to the limits).
 * UI only and controlled: the parent owns `open`, the field values, saving and deleting
 * (ask for confirmation in `onDelete` before removing anything).
 */

export type EditSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Called when the form is submitted (Save button or Enter in a field). */
  onSave?: () => void
  /** Shows the delete button. */
  onDelete?: () => void
  saving?: boolean
  saveLabel?: string
  /** Width in px; uncontrolled when left out. */
  width?: number
  defaultWidth?: number
  onWidthChange?: (width: number) => void
  minWidth?: number
  maxWidth?: number
  /** Shown before the title (e.g. a coloured avatar). */
  icon?: React.ReactNode
  /** Fixed area under the scrolling body (e.g. a chat input). */
  footer?: React.ReactNode
  /** Extra buttons in the header, just before the close button (e.g. an icon button). */
  headerActions?: React.ReactNode
  /**
   * false: no dimmed backdrop and the page behind stays clickable; the sheet closes
   * only from its own close button. Default true.
   */
  modal?: boolean
  bodyClassName?: string
  /** Slim header (just the title and a bare close icon) and no divider lines. For chat-like panels. */
  compact?: boolean
  children: React.ReactNode
  className?: string
}

const KEY_STEP = 16

function EditSheet({
  open,
  onOpenChange,
  title,
  description,
  onSave,
  onDelete,
  saving = false,
  saveLabel = "บันทึก",
  width,
  defaultWidth = 520,
  onWidthChange,
  minWidth = 360,
  maxWidth = 960,
  icon,
  footer,
  headerActions,
  modal = true,
  bodyClassName,
  compact = false,
  children,
  className,
}: EditSheetProps) {
  const formId = React.useId()
  const [innerWidth, setInnerWidth] = React.useState(defaultWidth)
  const [resizing, setResizing] = React.useState(false)
  const dragRef = React.useRef<{ x: number; width: number; live: number } | null>(null)
  const popupRef = React.useRef<HTMLDivElement>(null)
  const current = width ?? innerWidth

  const clampWidth = (next: number) => {
    // Never wider than the window minus a small gap, so the page behind stays visible
    const limit = typeof window === "undefined" ? maxWidth : Math.min(maxWidth, window.innerWidth - 32)
    return Math.round(Math.min(Math.max(next, minWidth), Math.max(minWidth, limit)))
  }
  const resize = (next: number) => {
    const clamped = clampWidth(next)
    if (width === undefined) setInnerWidth(clamped)
    onWidthChange?.(clamped)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, width: current, live: current }
    setResizing(true)
  }
  // While dragging only the CSS variable is written (no React render, so the form inside is not re-rendered per move);
  // the width is committed once on release.
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    drag.live = clampWidth(drag.width + (drag.x - event.clientX)) // dragging left makes the sheet wider
    popupRef.current?.style.setProperty("--edit-sheet-width", `${drag.live}px`)
  }
  const endDrag = () => {
    const drag = dragRef.current
    dragRef.current = null
    setResizing(false)
    if (drag && drag.live !== drag.width) resize(drag.live)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowLeft" ? current + KEY_STEP : event.key === "ArrowRight" ? current - KEY_STEP : event.key === "Home" ? maxWidth : event.key === "End" ? minWidth : null
    if (next === null) return
    event.preventDefault()
    resize(next)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetContent
        ref={popupRef}
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/30"
        onInteractOutside={modal ? undefined : (event) => event.preventDefault()}
        style={{ "--edit-sheet-width": `${current}px` } as React.CSSProperties}
        className={cn(
          // Quick slide from the right edge; resizing changes only the width variable, so it stays instant
          "flex w-full flex-col gap-0 bg-background p-0 shadow-lg data-[state=closed]:duration-150 data-[state=open]:duration-150 sm:w-[var(--edit-sheet-width)] sm:max-w-[calc(100vw-2rem)]",
          resizing && "select-none",
          className
        )}
      >
        {/* Resize handle on the left edge (hidden on phones, where the sheet is full width) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="ปรับความกว้างแผง"
          aria-valuenow={current}
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          className="group/handle absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-ew-resize touch-none items-center justify-center outline-none sm:flex"
        >
          <span
            aria-hidden
            className={cn(
              "h-full w-0.5 bg-transparent transition-colors duration-150 group-hover/handle:bg-ring/60 group-focus-visible/handle:bg-ring",
              resizing && "bg-ring"
            )}
          />
          <span aria-hidden className="absolute top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-full bg-card px-0.5 py-1.5 shadow-sm">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="size-1 rounded-full bg-muted-foreground" />
            ))}
          </span>
        </div>

        <header className={cn("flex items-center gap-3", compact ? "bg-background py-2 pl-4 pr-2" : "border-b bg-card px-5 py-4")}>
          {icon}
          <div className="min-w-0 flex-1">
            <SheetTitle className={cn("truncate font-semibold", compact ? "text-sm" : "text-base")}>{title}</SheetTitle>
            <SheetDescription className={cn("truncate", !description && "sr-only")}>{description ?? title}</SheetDescription>
          </div>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              aria-label={`ลบ ${title}`}
              title="ลบ"
              disabled={saving}
              onClick={onDelete}
              className="size-11 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive [&_svg]:size-5"
            >
              <Trash2 />
            </Button>
          )}
          {headerActions}
          {onSave && (
            <Button type="submit" size="lg" form={formId} disabled={saving}>
              {saving ? "กำลังบันทึก..." : saveLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={compact ? "ghost" : "outline"}
            aria-label="ปิด"
            title="ปิด"
            onClick={() => onOpenChange(false)}
            className={compact ? "size-8 text-muted-foreground [&_svg]:size-4" : "size-11 [&_svg]:size-5"}
          >
            <X />
          </Button>
        </header>

        {onSave ? (
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault()
              onSave()
            }}
            className={cn("flex-1 space-y-4 overflow-y-auto overscroll-contain bg-muted/50 p-4 [contain:content]", bodyClassName)}
          >
            {children}
          </form>
        ) : (
          <div className={cn("flex-1 space-y-4 overflow-y-auto overscroll-contain bg-muted/50 p-4", bodyClassName)}>{children}</div>
        )}
        {footer && <div className={compact ? "bg-background px-3 pb-3 pt-1" : "border-t bg-card p-3"}>{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}

/** The white card used inside the sheet: icon + title, a divider, then the fields (a shadcn Card). Also usable on its own. */
function EditSheetSection({ icon, title, children, className }: { icon?: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="border-b">
        <CardTitle>
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

export { EditSheet, EditSheetSection }
