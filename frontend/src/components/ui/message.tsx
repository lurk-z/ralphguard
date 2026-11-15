import type * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Message (port of shadcn.io "Message", Base UI + Tailwind 4 → plain React + Tailwind 3).
 * One turn of a chat laid out on the sender's side: avatar, content, header and footer.
 */

function MessageGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="message-group" className={cn("flex min-w-0 flex-col gap-2", className)} {...props} />
}

function Message({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & {
  /** `start` (theirs) or `end` (yours). */
  align?: "start" | "end"
}) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn("group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse", className)}
      {...props}
    />
  )
}

function MessageAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-avatar"
      className={cn("flex w-fit min-w-8 shrink-0 items-center justify-center self-start overflow-hidden rounded-full", className)}
      {...props}
    />
  )
}

function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex w-full min-w-0 flex-col gap-2.5 break-words group-data-[align=end]/message:items-end",
        className
      )}
      {...props}
    />
  )
}

function MessageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-header"
      className={cn("flex min-w-0 max-w-full items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  )
}

function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        "flex min-w-0 max-w-full items-center gap-1.5 text-xs text-muted-foreground group-data-[align=end]/message:justify-end",
        className
      )}
      {...props}
    />
  )
}

export { Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader }
