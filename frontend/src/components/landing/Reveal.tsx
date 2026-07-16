'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Dir = 'up' | 'left' | 'right'

/**
 * Fade + slide in when scrolled into view (IntersectionObserver).
 * `delay` (ms) lets a mockup appear right after its text — the landing uses
 * 500ms so the image reveals half a second behind the copy.
 */
export default function Reveal({
  children,
  delay = 0,
  from = 'up',
  className = '',
}: {
  children: ReactNode
  delay?: number
  from?: Dir
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const hidden =
    from === 'left'
      ? '-translate-x-10 opacity-0'
      : from === 'right'
        ? 'translate-x-10 opacity-0'
        : 'translate-y-10 opacity-0'

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-500 ease-out ${
        shown ? 'translate-x-0 translate-y-0 opacity-100' : hidden
      } ${className}`}
    >
      {children}
    </div>
  )
}
