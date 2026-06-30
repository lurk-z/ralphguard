'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { scrollState } from '@/app/_lib/scroll'

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother)

    // Always land on the hero on (re)load instead of restoring a mid-tour
    // scroll position.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    const ctx = gsap.context(() => {
      // Inertial smooth scroll — higher `smooth` = slower / less rushed
      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current!,
        content: contentRef.current!,
        smooth: 1.6,
        effects: false,
        smoothTouch: 0.1,
      })
      // Expose for debugging / programmatic scroll (e.g. nav anchors, tests).
      ;(window as unknown as { __smoother?: unknown }).__smoother = smoother

      // Feed the smoothed scroll progress to the 3D camera rig
      ScrollTrigger.create({
        trigger: contentRef.current!,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          scrollState.progress = self.progress
        },
      })
    })

    return () => ctx.revert()
  }, [])

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  )
}
