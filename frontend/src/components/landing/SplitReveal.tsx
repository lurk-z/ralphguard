'use client'

import { useRef, useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

/**
 * Reveals its content word-by-word (SplitText) with a stagger when it scrolls
 * into view, and reverses (hides word-by-word) when it scrolls out — in both
 * directions. Mark text with `data-split` (split into words) and any other
 * element with `data-fade` (fades as one, e.g. a button).
 */
export default function SplitReveal({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, SplitText)
    const root = ref.current
    if (!root) return

    const splits: SplitText[] = []

    const ctx = gsap.context(() => {
      const words: Element[] = []
      const fades: Element[] = []

      // Walk targets in DOM order so the stagger runs top → bottom
      root.querySelectorAll<HTMLElement>('[data-split], [data-fade]').forEach((node) => {
        if (node.hasAttribute('data-split')) {
          const s = SplitText.create(node, { type: 'words', wordsClass: 'rg-word' })
          splits.push(s)
          words.push(...s.words)
        } else {
          fades.push(node)
        }
      })

      gsap.set(words, { display: 'inline-block', opacity: 0, yPercent: 60 })
      gsap.set(fades, { opacity: 0, y: 16 })

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          start: 'top 78%',
          end: 'bottom 22%',
          toggleActions: 'play reverse play reverse',
        },
      })

      tl.to(
        words,
        { opacity: 1, yPercent: 0, stagger: 0.045, duration: 0.5, ease: 'power3.out' },
        0
      ).to(
        fades,
        { opacity: 1, y: 0, stagger: 0.08, duration: 0.45, ease: 'power3.out' },
        0.15
      )
    }, ref)

    return () => {
      splits.forEach((s) => s.revert())
      ctx.revert()
    }
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
