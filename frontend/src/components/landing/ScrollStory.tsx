'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CHAPTERS, type Chapter } from './chapters'
import GridScanShowcase from './GridScanShowcase'
import AIAssistantShowcase from './AIAssistantShowcase'
import NodeWorkspaceShowcase from './NodeWorkspaceShowcase'
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

const HIGHLIGHT_GRADIENT =
  'bg-gradient-to-r from-brand to-emerald-300 bg-clip-text font-display text-transparent'

/** A full-viewport backdrop-filter keeps compositing every frame even at zero
 *  opacity, so hide it outright once it has faded out. */
function setScrim(el: HTMLDivElement | null, op: number) {
  if (!el) return
  el.style.opacity = String(op)
  el.style.visibility = op < 0.01 ? 'hidden' : 'visible'
}

/** Softens the 3D room behind centred copy without a card or visible edge.
 *  Shared by the hero and the closing CTA so both read the same way. */
const READABILITY_SCRIM: React.CSSProperties = {
  backdropFilter: 'blur(2.5px) brightness(0.88) saturate(0.85) contrast(0.96)',
  WebkitBackdropFilter: 'blur(2.5px) brightness(0.88) saturate(0.85) contrast(0.96)',
  background:
    'radial-gradient(58% 44% at 50% 48%, rgba(232,240,248,0.40) 0%, rgba(232,240,248,0.15) 58%, rgba(232,240,248,0) 100%), linear-gradient(rgba(226,236,246,0.24), rgba(226,236,246,0.24))',
}

function renderTitle(line: string, highlight?: string, highlightClass = HIGHLIGHT_GRADIENT) {
  if (!highlight || !line.includes(highlight)) return line
  const [before, after] = line.split(highlight)
  return (
    <>
      {before}
      <span className={highlightClass}>{highlight}</span>
      {after}
    </>
  )
}

function HeroChapter({ c }: { c: Chapter }) {
  return (
    // Plain centered copy over the full room — no card, no text shadow.
    <div className="text-center">
      {c.eyebrow && (
        <p
          data-eyebrow
          className="font-mono text-xs tracking-widest uppercase text-white/80 opacity-0"
          style={{ transform: 'translateY(8px)' }}
        >
          {c.eyebrow}
        </p>
      )}

      <h1 className="mt-3 font-sans font-bold leading-[1.08] tracking-tight text-white text-[clamp(2.5rem,6.5vw,4.5rem)]">
        {c.titleLines.map((line, i) => (
          <span key={i} className="block overflow-hidden pt-2 pb-1">
            <span data-line className="block" style={{ opacity: 0 }}>
              {renderTitle(line, c.highlight, 'font-display text-brand')}
            </span>
          </span>
        ))}
      </h1>

      <p
        data-fade
        data-sub
        className="mx-auto mt-5 max-w-2xl font-sans leading-relaxed text-white/75 text-[clamp(0.9rem,1.4vw,1.125rem)] opacity-0"
      >
        {c.body}
      </p>

      <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button
          asChild
          data-fade
          data-cta
          size="lg"
          className="rounded-full px-7 opacity-0 shadow-none"
        >
          <Link href="/assess">
            เริ่มวิเคราะห์
            <ArrowRight />
          </Link>
        </Button>
        <Button
          data-fade
          data-cta
          size="lg"
          variant="outline"
          className="rounded-full border-[#21BFAF]/45 bg-transparent px-7 text-white opacity-0 shadow-none hover:border-[#21BFAF]/70 hover:bg-[#21BFAF]/10"
          onClick={scrollToSection1}
        >
          ดูฟีเจอร์ทั้งหมด
        </Button>
      </div>
    </div>
  )
}

function DetailChapter({ c }: { c: Chapter }) {
  const highlightClass = c.highlight === 'Node graph'
    ? 'font-display text-white'
    : c.highlight === 'ทุกมุม' || c.highlight === 'AI'
      ? 'bg-gradient-to-r from-cyan-200 via-teal-200 to-emerald-200 bg-clip-text font-display text-transparent drop-shadow-[0_1px_8px_rgba(94,234,212,0.42)]'
      : HIGHLIGHT_GRADIENT

  return (
    <>
      <h2 className="mt-5 font-sans font-bold leading-[1.1] tracking-tight text-white text-[clamp(1.9rem,4.6vw,3.1rem)]">
        {c.titleLines.map((line, i) => (
          <span key={i} className="block">
            {renderTitle(line, c.highlight, highlightClass)}
          </span>
        ))}
      </h2>
      <p className="mx-auto mt-4 max-w-xl font-sans leading-relaxed text-white/80 text-[clamp(0.9rem,1.4vw,1.1rem)]">
        {c.body}
      </p>
    </>
  )
}

function CTAChapter({ c }: { c: Chapter }) {
  return (
    <>
      {c.eyebrow && (
        <p className="font-mono text-xs tracking-widest uppercase text-white/80">
          {c.eyebrow}
        </p>
      )}

      <h2 className="mt-3 font-sans font-bold leading-[1.08] tracking-tight text-white text-[clamp(2.25rem,6vw,4rem)]">
        {c.titleLines.map((line, i) => (
          <span key={i} className="block overflow-hidden pt-2 pb-1">
            <span className="block">
              {renderTitle(line, c.highlight, 'font-display text-brand')}
            </span>
          </span>
        ))}
      </h2>

      <p className="mx-auto mt-5 max-w-2xl font-sans leading-relaxed text-white/75 text-[clamp(0.9rem,1.4vw,1.125rem)]">
        {c.body}
      </p>

      <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg" className="rounded-full px-7 shadow-none">
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
        <h2 className="font-sans font-bold leading-[1.1] tracking-tight text-white text-[clamp(1.6rem,3.6vw,2.6rem)]">
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
  const ctaScrimRef = useRef<HTMLDivElement>(null)
  const heroScrimRef = useRef<HTMLDivElement>(null)

  // Per-frame crossfade driven by shared scroll progress.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const update = (time = 0) => {
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

        if (i === 1) {
          const cardProgress = reduceMotion ? 1 : smoothstep(op)
          const cards = el.querySelectorAll<HTMLElement>('[data-scan-card]')
          const beams = el.querySelectorAll<HTMLElement>('[data-scan-beam]')
          cards.forEach((card, cardIndex) => {
            const direction = cardIndex - 1
            const delay = cardIndex * 0.08
            const localProgress = reduceMotion
              ? 1
              : smoothstep(Math.max(0, Math.min(1, (cardProgress - delay) / (1 - delay))))
            const drift = reduceMotion ? 0 : Math.sin(time * 1.15 + cardIndex * (Math.PI * 2 / 3)) * 3 * localProgress
            const x = direction * (1 - localProgress) * 86
            const y = (1 - localProgress) * 20 + drift
            const rotation = direction * ((1 - localProgress) * 4.5 + 0.8)
            card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`
          })
          beams.forEach((beam, beamIndex) => {
            if (reduceMotion || op < 0.05) {
              beam.style.opacity = '0'
              return
            }
            const phase = (time * 0.18 + beamIndex * 0.47) % 1
            beam.style.top = `${8 + phase * 84}%`
            beam.style.opacity = String(Math.sin(phase * Math.PI) * 0.85 * op)
          })
        }

        if (i === 2) {
          const cards = el.querySelectorAll<HTMLElement>('[data-ai-card]')
          cards.forEach((card, cardIndex) => {
            const delay = cardIndex * 0.09
            const localProgress = reduceMotion
              ? 1
              : smoothstep(Math.max(0, Math.min(1, (op - delay) / (1 - delay))))
            const enterX = cardIndex === 0 ? -54 : cardIndex === 1 ? 54 : 0
            const enterY = cardIndex === 2 ? 52 : 12
            const float = reduceMotion ? 0 : Math.sin(time * 1.05 + cardIndex * 2.1) * 2.5 * localProgress
            card.style.opacity = String(localProgress)
            card.style.transform = `translate3d(${enterX * (1 - localProgress)}px, ${enterY * (1 - localProgress) + float}px, 0)`
          })
          el.querySelectorAll<HTMLElement>('[data-ai-flow]').forEach((flow) => {
            flow.style.opacity = String(Math.max(0, (op - 0.18) / 0.82))
          })
          const confirm = el.querySelector<HTMLElement>('[data-ai-confirm]')
          if (confirm) {
            const glow = reduceMotion ? 0 : (Math.sin(time * 2.2) + 1) / 2
            confirm.style.boxShadow = `0 0 ${6 + glow * 12}px rgba(0,159,165,${0.12 + glow * 0.16})`
          }
        }

        if (i === 3) {
          const progress = reduceMotion ? 1 : smoothstep(op)
          const workspace = el.querySelector<HTMLElement>('[data-node-workspace]')
          if (workspace) {
            workspace.style.opacity = String(progress)
            workspace.style.transform = `translate3d(${-70 * (1 - progress)}px, ${18 * (1 - progress)}px, 0) scale(${0.97 + progress * 0.03})`
          }
          const scan = el.querySelector<HTMLElement>('[data-node-scan]')
          if (scan) {
            const phase = reduceMotion ? 0.55 : (time * 0.13) % 1
            scan.style.top = `${phase * 100}%`
            scan.style.opacity = String(reduceMotion ? 0.35 : Math.sin(phase * Math.PI) * 0.65 * progress)
          }
        }
      }
      const heroOp = k === 0 ? 1 - smoothstep(Math.min(move / 0.6, 1)) : 0
      if (chevronRef.current) chevronRef.current.style.opacity = String(heroOp * 0.5)
      setScrim(heroScrimRef.current, heroOp)
      const ctaIdx = CHAPTERS.length - 1
      let ctaOp = 0
      if (ctaIdx === k) {
        ctaOp = 1 - smoothstep(Math.min(move / 0.6, 1))
      } else if (ctaIdx === k + 1) {
        ctaOp = smoothstep(Math.max((move - 0.4) / 0.6, 0))
      }
      setScrim(ctaScrimRef.current, ctaOp)
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
      {/* Both scrims fade with their own chapter, so the middle chapters keep
          the room crisp. */}
      <div
        ref={heroScrimRef}
        aria-hidden
        className="absolute inset-0"
        style={{ opacity: 0, visibility: 'hidden', ...READABILITY_SCRIM }}
      />

      <div
        ref={ctaScrimRef}
        aria-hidden
        className="absolute inset-0"
        style={{ opacity: 0, visibility: 'hidden', ...READABILITY_SCRIM }}
      />

      {CHAPTERS.map((c, i) => {
        const isHero = c.hero
        const wrapperClass =
          isHero || i === 1 || i === 4 || i === 6
            ? 'absolute inset-0 flex items-center justify-center'
            : 'absolute inset-0'

        let innerClass = ''
        let innerStyle: React.CSSProperties = {}

        if (isHero) {
          innerClass = 'w-full max-w-2xl px-4 sm:px-6'
        } else if (i === 1) {
          return (
            <div
              key={i}
              ref={(el) => { chapterRefs.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'opacity, transform', textShadow: '0 1px 14px rgba(8,20,24,0.6), 0 1px 3px rgba(8,20,24,0.55)' }}
            >
              <div className="absolute inset-x-0 top-[12%] px-6 text-center">
                <DetailChapter c={c} />
              </div>
              <div
                className="absolute inset-x-0 top-[42%] flex justify-center px-4"
                style={{ textShadow: 'none' }}
              >
                <GridScanShowcase />
              </div>
            </div>
          )
        } else if (i === 2) {
          return (
            <div
              key={i}
              ref={(el) => { chapterRefs.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'opacity, transform', textShadow: '0 1px 14px rgba(8,20,24,0.6), 0 1px 3px rgba(8,20,24,0.55)' }}
            >
              <div className="absolute inset-x-0 top-[7%] px-6 text-center lg:inset-x-auto lg:left-[7%] lg:top-[38%] lg:max-w-[31rem] lg:text-left">
                <DetailChapter c={c} />
              </div>
              <div className="absolute left-1/2 top-[31%] -translate-x-1/2 lg:left-auto lg:right-[2%] lg:top-[6%] lg:translate-x-0" style={{ textShadow: 'none' }}>
                <AIAssistantShowcase />
              </div>
            </div>
          )
        } else if (i === 3) {
          return (
            <div
              key={i}
              ref={(el) => { chapterRefs.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'opacity, transform', textShadow: '0 1px 14px rgba(8,20,24,0.6), 0 1px 3px rgba(8,20,24,0.55)' }}
            >
              <div className="absolute inset-x-0 top-[7%] px-6 text-center lg:inset-x-auto lg:right-[4%] lg:top-[24%] lg:max-w-[27rem] lg:text-right">
                <DetailChapter c={c} />
              </div>
              <div className="absolute left-1/2 top-[43%] -translate-x-1/2 lg:left-[3%] lg:top-[26%] lg:translate-x-0" style={{ textShadow: 'none' }}>
                <NodeWorkspaceShowcase />
              </div>
            </div>
          )
        } else if (i === 4) {
          innerClass = 'w-full max-w-2xl px-6 text-center'
        } else if (i === 5) {
          return (
            <div
              key={i}
              ref={(el) => { chapterRefs.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'opacity, transform', textShadow: '0 1px 14px rgba(8,20,24,0.6), 0 1px 3px rgba(8,20,24,0.55)' }}
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
            style={{ opacity: 0, willChange: 'opacity, transform', textShadow: '0 1px 14px rgba(8,20,24,0.6), 0 1px 3px rgba(8,20,24,0.55)' }}
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
        <ChevronDown className="h-5 w-5 text-white/75 animate-scroll-hint" />
      </div>
    </div>
  )
}
