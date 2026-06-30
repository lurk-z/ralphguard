'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CHAPTERS, type Chapter } from './chapters'
import { scrollState } from '@/app/_lib/scroll'
import { storyState, smoothstep } from '@/app/_lib/story'

function scrollToSection1() {
  const el = document.getElementById('section-1')
  if (!el) return
  const smoother = (window as unknown as { __smoother?: { scrollTo: (el: HTMLElement, smooth: boolean) => void } }).__smoother
  if (smoother) smoother.scrollTo(el, true)
  else el.scrollIntoView({ behavior: 'smooth' })
}

const TRANSITIONS = CHAPTERS.length - 1

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function renderTitle(line: string, highlight?: string) {
  if (!highlight || !line.includes(highlight)) return line
  const [before, after] = line.split(highlight)
  return (
    <>
      {before}
      <span className="bg-gradient-to-r from-brand to-emerald-300 bg-clip-text font-display text-transparent">
        {highlight}
      </span>
      {after}
    </>
  )
}

function HeroChapter({ c }: { c: Chapter }) {
  return (
    <>
      {c.eyebrow && (
        <p
          data-eyebrow
          className="font-mono text-xs tracking-widest uppercase text-brand/70 opacity-0"
          style={{ transform: 'translateY(8px)' }}
        >
          {c.eyebrow}
        </p>
      )}

      <h1 className="mt-3 font-sans font-bold leading-[1.08] tracking-tight text-foreground text-[clamp(2.5rem,6.5vw,4.5rem)]">
        {c.titleLines.map((line, i) => (
          <span key={i} className="block overflow-hidden pt-2 pb-1">
            <span data-line className="block" style={{ opacity: 0 }}>
              {renderTitle(line, c.highlight)}
            </span>
          </span>
        ))}
      </h1>

      <p
        data-fade
        data-sub
        className="mx-auto mt-5 max-w-2xl font-sans leading-relaxed text-foreground/65 text-[clamp(0.9rem,1.4vw,1.125rem)] opacity-0"
      >
        {c.body}
      </p>

      <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          asChild
          data-fade
          data-cta
          size="lg"
          className="rounded-full px-7 opacity-0 shadow-[0_0_30px_-8px] shadow-brand/50"
        >
          <Link href="/login">
            เริ่มวิเคราะห์
            <ArrowRight />
          </Link>
        </Button>
        <Button
          data-fade
          data-cta
          size="lg"
          variant="outline"
          className="rounded-full border-brand/40 bg-transparent px-7 text-foreground opacity-0 backdrop-blur-sm hover:bg-brand/10 hover:border-brand/70"
          onClick={scrollToSection1}
        >
          ดูฟีเจอร์ทั้งหมด
        </Button>
      </div>
    </>
  )
}

function DetailChapter({ c }: { c: Chapter }) {
  return (
    <>
      <h2 className="mt-5 font-sans font-bold leading-[1.1] tracking-tight text-foreground text-[clamp(1.9rem,4.6vw,3.1rem)]">
        {c.titleLines.map((line, i) => (
          <span key={i} className="block">
            {renderTitle(line, c.highlight)}
          </span>
        ))}
      </h2>
      <p className="mx-auto mt-4 max-w-xl font-sans leading-relaxed text-foreground/65 text-[clamp(0.9rem,1.4vw,1.1rem)]">
        {c.body}
      </p>
    </>
  )
}

function CTAChapter({ c }: { c: Chapter }) {
  return (
    <>
      {c.eyebrow && (
        <p className="font-mono text-xs tracking-widest uppercase text-brand/70">
          {c.eyebrow}
        </p>
      )}

      <h2 className="mt-3 font-sans font-bold leading-[1.08] tracking-tight text-foreground text-[clamp(2.25rem,6vw,4rem)]">
        {c.titleLines.map((line, i) => (
          <span key={i} className="block overflow-hidden pt-2 pb-1">
            <span className="block">
              {renderTitle(line, c.highlight)}
            </span>
          </span>
        ))}
      </h2>

      <p className="mx-auto mt-5 max-w-2xl font-sans leading-relaxed text-foreground/65 text-[clamp(0.9rem,1.4vw,1.125rem)]">
        {c.body}
      </p>

      <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          asChild
          size="lg"
          className="rounded-full px-7 shadow-[0_0_30px_-8px] shadow-brand/50"
        >
          <a href="/assess">เริ่มใช้งาน</a>
        </Button>
      </div>
    </>
  )
}

function Chapter5Layout({ c }: { c: Chapter }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-x-0 top-[10%] text-center px-6">
        <h2 className="font-sans font-bold leading-[1.1] tracking-tight text-foreground text-[clamp(1.6rem,3.6vw,2.6rem)]">
          {c.titleLines.map((line, i) => (
            <span key={i} className="block">{renderTitle(line, c.highlight)}</span>
          ))}
        </h2>
      </div>
    </div>
  )
}

/**
 * The 3D canvas and this overlay are both fixed
 * (so the "section" stays put), while the spacer sections in <SmoothScroll>
 * provide the scroll distance. Each chapter crossfades in/out based on the same
 * scroll progress the camera rig uses, so copy and camera move together.
 */
export default function ScrollStory() {
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([])
  const chevronRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const ctaScrimRef = useRef<HTMLDivElement>(null)

  // Per-frame crossfade driven by shared scroll progress.
  useEffect(() => {
    const update = () => {
      const p = scrollState.progress
      const { k, move } = storyState(p, TRANSITIONS)
      for (let i = 0; i < CHAPTERS.length; i++) {
        const el = chapterRefs.current[i]
        if (!el) continue
        let op = 0
        let y = 0
        if (i === k) {
          op = 1 - smoothstep(Math.min(move / 0.6, 1))
          y = -(1 - op) * 26
        } else if (i === k + 1) {
          op = smoothstep(Math.max((move - 0.4) / 0.6, 0))
          y = (1 - op) * 26
        }
        el.style.opacity = String(op)
        el.style.transform = `translate3d(0, ${y}px, 0)`
        el.style.visibility = op < 0.01 ? 'hidden' : 'visible'
        el.style.pointerEvents = op > 0.6 ? 'auto' : 'none'
      }
      const heroOp = k === 0 ? 1 - smoothstep(Math.min(move / 0.6, 1)) : 0
      if (chevronRef.current) chevronRef.current.style.opacity = String(heroOp * 0.5)
      if (scrimRef.current) scrimRef.current.style.opacity = String(heroOp)
      const ctaIdx = CHAPTERS.length - 1
      let ctaOp = 0
      if (ctaIdx === k) {
        ctaOp = 1 - smoothstep(Math.min(move / 0.6, 1))
      } else if (ctaIdx === k + 1) {
        ctaOp = smoothstep(Math.max((move - 0.4) / 0.6, 0))
      }
      if (ctaScrimRef.current) ctaScrimRef.current.style.opacity = String(ctaOp)
    }
    gsap.ticker.add(update)
    update()
    return () => gsap.ticker.remove(update)
  }, [])

  // One-time entrance reveal for the hero chapter only.
  useIsoLayoutEffect(() => {
    const hero = chapterRefs.current[0]
    if (!hero) return
    const ctx = gsap.context(() => {
      const lines = gsap.utils.toArray<HTMLElement>('[data-line]')
      const fades = gsap.utils.toArray<HTMLElement>('[data-fade]')
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set([...lines, ...fades], { opacity: 1, yPercent: 0, y: 0 })
      })
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.set(lines, { yPercent: 110, opacity: 0 })
        gsap.set(fades, { opacity: 0, y: 18 })
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.to('[data-eyebrow]', { opacity: 1, y: 0, duration: 0.6 }, 0.1)
          .to(lines, { yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.12, ease: 'power4.out' }, 0.2)
          .to('[data-sub]', { opacity: 1, y: 0, duration: 0.7 }, 0.7)
          .to('[data-cta]', { opacity: 1, y: 0, duration: 0.6, stagger: 0.1 }, 0.85)
      })
    }, hero)
    return () => ctx.revert()
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <div
        ref={scrimRef}
        className="absolute inset-x-0 top-0 h-[75%]"
        style={{
          background: 'linear-gradient(to bottom,#070b0c 0%,#070b0c 35%,rgba(7,11,12,0.88) 55%,transparent 100%)',
        }}
      />
      <div
        ref={ctaScrimRef}
        className="absolute inset-x-0 top-0 h-[75%]"
        style={{
          opacity: 0,
          background: 'linear-gradient(to bottom,#070b0c 0%,#070b0c 35%,rgba(7,11,12,0.88) 55%,transparent 100%)',
        }}
      />

      {CHAPTERS.map((c, i) => {
        const isHero = c.hero
        const wrapperClass =
          i === 1 || i === 4 || i === 6
            ? 'absolute inset-0 flex items-center justify-center'
            : 'absolute inset-0'

        let innerClass = ''
        let innerStyle: React.CSSProperties = {}

        if (isHero) {
          innerClass = 'mx-auto w-full max-w-3xl px-6 text-center pt-[clamp(4rem,11vh,7.5rem)]'
        } else if (i === 1) {
          innerClass = 'w-full max-w-2xl px-6 text-center'
        } else if (i === 2) {
          innerClass = 'absolute text-left max-w-2xl px-6'
          innerStyle = { left: '15%', top: '42%', transform: 'translateY(-50%)' }
        } else if (i === 3) {
          innerClass = 'absolute text-right max-w-sm px-6'
          innerStyle = { right: '15%', top: '30%', transform: 'translateY(-50%)' }
        } else if (i === 4) {
          innerClass = 'w-full max-w-2xl px-6 text-center'
        } else if (i === 5) {
          return (
            <div
              key={i}
              ref={(el) => { chapterRefs.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'opacity, transform' }}
            >
              <Chapter5Layout c={c} />
            </div>
          )
        } else if (i === 6) {
          innerClass = 'w-full max-w-2xl px-6 text-center'
        } else if (c.cta) {
          innerClass = 'mx-auto w-full max-w-3xl px-6 text-center pt-[clamp(4rem,11vh,7.5rem)]'
        } else {
          innerClass = 'mx-auto w-full max-w-3xl px-6 text-center pt-[clamp(4rem,11vh,7.5rem)]'
        }

        return (
          <div
            key={i}
            ref={(el) => { chapterRefs.current[i] = el }}
            className={wrapperClass}
            style={{ opacity: 0, willChange: 'opacity, transform' }}
          >
            <div className={innerClass} style={innerStyle}>
              {isHero ? <HeroChapter c={c} /> : c.cta ? <CTAChapter c={c} /> : <DetailChapter c={c} />}
            </div>
          </div>
        )
      })}

      <div
        ref={chevronRef}
        className="absolute bottom-5 left-0 right-0 z-10 flex justify-center"
        style={{ opacity: 0 }}
      >
        <ChevronDown className="h-5 w-5 text-foreground animate-scroll-hint" />
      </div>
    </div>
  )
}
