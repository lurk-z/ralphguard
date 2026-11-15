"use client"

import { useEffect, useState } from "react"

/*
 * Reveals a reply word by word, like a model streaming its answer (shadcn.io Chat demo).
 * Time-based (not a fixed interval) so the pace is even on slow frames, and it returns the words
 * so each one can fade in softly. Only messages that arrived just now stream; history loaded from
 * storage shows at once, and a message that has finished streaming never streams again.
 */

const streamed = new Set<string>()
/** A message newer than this (ms) counts as "just arrived". */
const FRESH_MS = 4000
/** Words (Thai segments) revealed per second. */
const WORDS_PER_SECOND = 22

function words(text: string): string[] {
  // Thai has no spaces between words: split with the browser's word segmenter when available.
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("th", { granularity: "word" })
    return Array.from(seg.segment(text), (s) => s.segment)
  }
  return text.split(/(\s+)/)
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function useStreamedText(id: string, text: string, at: number) {
  const [fresh] = useState(() => !streamed.has(id) && Date.now() - at < FRESH_MS && !reducedMotion())
  const [parts] = useState(() => words(text))
  const [count, setCount] = useState(() => (fresh ? 0 : parts.length))

  useEffect(() => {
    if (!fresh) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const n = Math.min(parts.length, Math.floor(((now - start) / 1000) * WORDS_PER_SECOND))
      setCount((c) => (c === n ? c : n))
      if (n < parts.length) frame = requestAnimationFrame(tick)
      else streamed.add(id)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [fresh, id, parts.length])

  const done = count >= parts.length
  return { parts: parts.slice(0, count), text, done }
}
