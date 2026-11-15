"use client"

import type * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Persona · Obsidian (look of shadcn.io "Persona" obsidian, rebuilt for speed; styles in globals.css `.persona-*`).
 * A cut stone of 18 facets that shows what the assistant is doing: idle breathes, listening draws ripples in,
 * thinking sweeps light round the stone, speaking pushes the facets apart like a voice, asleep dims.
 *
 * Performance: the original animated one clock variable that made the browser recompute cos()/pow() for every
 * facet on every frame (~0.8 s of style work per second with a few stones on screen). Here the facet shading is
 * computed once in JS and every animation is a plain transform/opacity keyframe, so the browser only repaints.
 * `animate={false}` holds a still pose (use it for small idle stones, e.g. in lists).
 */

export type PersonaState = "idle" | "listening" | "thinking" | "speaking" | "asleep"

const STATE_TH: Record<PersonaState, string> = {
  idle: "ว่าง",
  listening: "กำลังฟัง",
  thinking: "กำลังคิด",
  speaking: "กำลังตอบ",
  asleep: "พัก",
}

/** A point `r` from the centre of the 100 × 100 box, at `deg` (0° right, 90° down). */
const at = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180
  return `${Number((50 + r * Math.cos(rad)).toFixed(2))},${Number((50 + r * Math.sin(rad)).toFixed(2))}`
}

/** Light from the top-left, same formula as the original (light theme): brighter facets face the light. */
const SUN = 225
function shade(base: number, facing: number) {
  const c = Math.cos(((facing - SUN) * Math.PI) / 180)
  const lit = base + 0.12 * c + 0.5 * Math.max(0, c) ** 6
  return Math.min(1, Math.max(0.1, 0.93 - lit))
}

/**
 * The stone's 18 facets: six kites from the rim, six star facets between them, and the six faces of a low
 * pyramid on top. `e` is how far a facet moves out when the stone speaks.
 */
const FACETS = [0, 1, 2, 3, 4, 5].flatMap((k) => {
  const rim = -90 + 60 * k
  const facet = (key: string, points: string, b: number, e: number, f: number) => {
    const rad = (f * Math.PI) / 180
    return { key, points, opacity: shade(b, f), dx: Number((Math.cos(rad) * e * 2.4).toFixed(2)), dy: Number((Math.sin(rad) * e * 2.4).toFixed(2)) }
  }
  return [
    facet(`kite-${k}`, [at(rim, 47), at(rim + 60, 47), at(rim + 30, 24)].join(" "), 0.03, 1, rim + 30),
    facet(`star-${k}`, [at(rim - 30, 24), at(rim, 47), at(rim + 30, 24)].join(" "), 0, 0.85, rim),
    facet(`top-${k}`, ["50,50", at(rim + 30, 24), at(rim + 90, 24)].join(" "), 0.1, 0.45, rim + 60),
  ]
})

/** The stone's outline as a CSS clip-path (percent of the box), used to clip the moving light when it thinks. */
const HEX_CLIP = [0, 1, 2, 3, 4, 5]
  .map((k) => at(-90 + 60 * k, 47).split(",").map((n) => `${n}%`).join(" "))
  .join(", ")

export type PersonaProps = React.ComponentProps<"div"> & {
  state?: PersonaState
  /** Stone colour (any CSS colour). Defaults to the theme foreground, like the original. */
  color?: string
  /** Who it is, for the accessible name ("หัวหน้าแล็บ กำลังคิด"). */
  name?: string
  /** false: still pose, no animation (small idle stones). Default true. */
  animate?: boolean
}

export function Persona({ state = "idle", color, name, animate = true, className, style, ...props }: PersonaProps) {
  return (
    <div
      role="img"
      aria-label={`${name ?? "ผู้ช่วย"} ${STATE_TH[state]}`}
      data-slot="persona"
      data-state={state}
      data-animate={animate ? "" : undefined}
      data-variant="obsidian"
      className={cn("persona relative isolate size-16 shrink-0 select-none", className)}
      style={{ ...(color ? ({ "--persona-ink": color } as React.CSSProperties) : null), ...style }}
      {...props}
    >
      <div aria-hidden="true" className="persona-scene">
        {state === "listening" && (
          <span className="persona-ripples">
            {[0, 1, 2].map((i) => (
              <span key={i} className="persona-ripple" style={{ ["--persona-i" as string]: i }} />
            ))}
          </span>
        )}
        <span className="persona-shadow" />
        <svg className="persona-obsidian" viewBox="0 0 100 100">
          {FACETS.map((f) => (
            <polygon
              key={f.key}
              className="persona-facet"
              points={f.points}
              fillOpacity={f.opacity}
              style={{ ["--fx" as string]: `${f.dx}px`, ["--fy" as string]: `${f.dy}px` }}
            />
          ))}
        </svg>
        {/* Thinking: a band of light turns round the stone, clipped to its outline. */}
        {state === "thinking" && (
          <span className="persona-sheen-clip" style={{ clipPath: `polygon(${HEX_CLIP})` }}>
            <span className="persona-sheen" />
          </span>
        )}
      </div>
    </div>
  )
}
