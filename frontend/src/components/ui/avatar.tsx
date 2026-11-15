"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

type AvatarSize = "sm" | "default" | "lg"

/** shadcn Avatar: sizes sm 24px / default 32px / lg 40px, optional status badge, and a group that overlaps. */
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & { size?: AvatarSize }
>(({ className, size = "default", ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    data-slot="avatar"
    data-size={size}
    className={cn(
      "group/avatar relative flex size-8 shrink-0 select-none rounded-full data-[size=lg]:size-10 data-[size=sm]:size-6",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    data-slot="avatar-image"
    className={cn("aspect-square size-full rounded-full object-cover", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    data-slot="avatar-fallback"
    className={cn(
      "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

/** Small status dot at the bottom-right corner (online, busy...). Set the colour with a bg-* class. */
function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute bottom-0 right-0 z-10 inline-flex select-none items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=default]/avatar:size-2.5 group-data-[size=lg]/avatar:size-3",
        className
      )}
      {...props}
    />
  )
}

/** Avatars side by side, overlapping, each with a background-coloured ring. */
function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn("group/avatar-group flex -space-x-2 [&_[data-slot=avatar]]:ring-2 [&_[data-slot=avatar]]:ring-background", className)}
      {...props}
    />
  )
}

/** "+3" bubble at the end of a group. */
function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount }
