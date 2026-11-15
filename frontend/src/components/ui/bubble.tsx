import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * Bubble (port of shadcn.io "Bubble", Base UI + tailwind-variants → Radix Slot + cva, Tailwind 3).
 * The coloured box around a chat message. Variants style the inner BubbleContent.
 */

function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="bubble-group" className={cn("flex min-w-0 flex-col gap-2", className)} {...props} />
}

const bubbleVariants = cva(
  "group/bubble relative flex w-fit min-w-0 max-w-[85%] flex-col gap-1 data-[align=end]:self-end",
  {
    variants: {
      variant: {
        default: "[&>[data-slot=bubble-content]]:bg-primary [&>[data-slot=bubble-content]]:text-primary-foreground",
        muted: "[&>[data-slot=bubble-content]]:bg-muted",
        outline: "[&>[data-slot=bubble-content]]:border-border [&>[data-slot=bubble-content]]:bg-card",
        tinted: "[&>[data-slot=bubble-content]]:bg-accent [&>[data-slot=bubble-content]]:text-foreground",
        destructive: "[&>[data-slot=bubble-content]]:bg-destructive/10 [&>[data-slot=bubble-content]]:text-destructive",
        ghost:
          "max-w-full [&>[data-slot=bubble-content]]:rounded-none [&>[data-slot=bubble-content]]:border-0 [&>[data-slot=bubble-content]]:bg-transparent [&>[data-slot=bubble-content]]:p-0",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & {
    /** `start` (theirs) or `end` (yours). */
    align?: "start" | "end"
  }) {
  return (
    <div
      data-slot="bubble"
      data-align={align}
      data-variant={variant}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  )
}

/** The box itself. `asChild` renders it as your own element (e.g. a button). */
function BubbleContent({ className, asChild, ...props }: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      data-slot="bubble-content"
      className={cn(
        "w-fit min-w-0 max-w-full overflow-hidden break-words rounded-2xl border border-transparent px-3.5 py-2 text-sm leading-relaxed group-data-[align=end]/bubble:self-end group-data-[align=end]/bubble:rounded-br-md group-data-[align=start]/bubble:rounded-bl-md",
        className
      )}
      {...props}
    />
  )
}

export { Bubble, BubbleContent, BubbleGroup, bubbleVariants }
