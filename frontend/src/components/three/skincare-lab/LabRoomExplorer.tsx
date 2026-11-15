'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Layers, RotateCcw, Sparkles, Users } from 'lucide-react'
import type { CameraRigHandle } from './CameraRig'
import { OVERVIEW, ROOM_VIEWS, type RoomView } from './views'
import type { AgentId } from './agents/agents'
import { AgentChatSheet, AgentStrip } from './agents/AgentChatSheet'
import { useAgentLab } from './agents/useAgentLab'

// WebGL scene — client-only.
const LabRoomCanvas = dynamic(() => import('./LabRoomCanvas'), { ssr: false })

const panel =
  'rounded-2xl border border-white/60 bg-white/75 shadow-[0_8px_30px_rgba(15,35,55,0.12)] backdrop-blur-md'

function Toggle({
  pressed,
  onClick,
  icon,
  label,
  hint,
}: {
  pressed: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={`${label} (${hint})`}
      className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        pressed ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-900/5'
      }`}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      <span>{label}</span>
      <span
        className={`rounded px-1 font-mono text-[10px] ${pressed ? 'bg-white/20' : 'bg-slate-900/5 text-slate-400'}`}
      >
        {hint}
      </span>
    </button>
  )
}

/** `embedded`: fill the nearest positioned parent instead of the whole window (used as a tab inside /assess). */
export default function LabRoomExplorer({ embedded = false }: { embedded?: boolean } = {}) {
  const rigRef = useRef<CameraRigHandle>(null)
  // Embedded (Lab tab): five scripted AI agents with a chat sheet each.
  const agentLab = useAgentLab()
  const [chatWith, setChatWith] = useState<AgentId | null>(null)
  const openChat = useCallback(
    (id: AgentId | null) => {
      setChatWith(id)
      agentLab.setOpen(id)
    },
    [agentLab]
  )
  const [ready, setReady] = useState(false)
  const [effects, setEffects] = useState(true)
  const [cutaway, setCutaway] = useState(true)
  const [people, setPeople] = useState(true)
  const [activeView, setActiveView] = useState<string | null>(OVERVIEW.id)
  const [focusName, setFocusName] = useState<string | null>(null)
  const [autoReduced, setAutoReduced] = useState(false)

  const goTo = useCallback((view: RoomView, duration?: number) => {
    rigRef.current?.goTo(view, duration)
    setActiveView(view.id)
    setFocusName(null)
  }, [])

  const reset = useCallback(() => {
    goTo(OVERVIEW, 0.8)
    setCutaway(true)
  }, [goTo])

  const handleReady = useCallback(() => setReady(true), [])
  const handleFocus = useCallback((name: string | null) => {
    setFocusName(name)
    setActiveView(null)
  }, [])
  const handleManual = useCallback(() => setActiveView(null), [])
  const handlePerformanceDrop = useCallback(() => {
    setEffects(false)
    setAutoReduced(true)
  }, [])

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const key = e.key.toLowerCase()
      // Embedded (tab in /assess): walls and staff positions are fixed on, camera shortcuts are off; only E (light effects) works.
      if (embedded) {
        if (key === 'e') setEffects((v) => !v)
        return
      }
      const view = ROOM_VIEWS.find((v) => v.key === key)
      if (view) goTo(view)
      else if (key === 'r' || key === '0') reset()
      else if (key === 'e') setEffects((v) => !v)
      else if (key === 'w') setCutaway((v) => !v)
      else if (key === 'p') setPeople((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, reset, embedded])

  return (
    <main className={`${embedded ? "absolute" : "fixed"} inset-0 select-none overflow-hidden bg-[#c9d5df] text-slate-800`}>
      <LabRoomCanvas
        rigRef={rigRef}
        effects={effects}
        cutaway={cutaway}
        people={people}
        onReady={handleReady}
        onFocus={handleFocus}
        onManualControl={handleManual}
        onPerformanceDrop={handlePerformanceDrop}
        noFocus={embedded}
        onBackgroundClick={embedded ? () => openChat(null) : undefined}
        agents={
          embedded
            ? { walksRef: agentLab.walksRef, selected: chatWith, status: agentLab.status, unread: agentLab.unread, onSelect: openChat }
            : undefined
        }
      />

      {!ready && (
        <div className={`absolute inset-0 grid place-items-center bg-[#c9d5df] text-sm text-slate-500`}>
          กำลังโหลดห้องแล็บสกินแคร์…
        </div>
      )}

      {/* Title (full-page version only) */}
      {!embedded && (
        <header className={`absolute left-3 top-3 flex items-center gap-3 px-3 py-2 sm:left-5 sm:top-5 ${panel}`}>
          <Link
            href="/"
            aria-label="กลับหน้าแรก"
            className="grid size-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="pr-1 leading-tight">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand">Ralph Lab</p>
            <h1 className="text-sm font-bold">ห้องแล็บสกินแคร์ 3 มิติ</h1>
          </div>
        </header>
      )}

      {/* Display toggles (full-page version only) */}
      {!embedded && (
      <div className={`absolute right-3 top-3 flex flex-col gap-1 p-1.5 sm:right-5 sm:top-5 sm:flex-row ${panel}`}>
        <Toggle
          pressed={effects}
          onClick={() => setEffects((v) => !v)}
          icon={<Sparkles />}
          label="เอฟเฟกต์แสง"
          hint="E"
        />
        <Toggle
          pressed={cutaway}
          onClick={() => setCutaway((v) => !v)}
          icon={<Layers />}
          label="ซ่อนผนังที่บัง"
          hint="W"
        />
        <Toggle
          pressed={people}
          onClick={() => setPeople((v) => !v)}
          icon={<Users />}
          label="ตำแหน่งคน"
          hint="P"
        />
      </div>
      )}

      {/* Shown once if effects were switched off to keep the frame rate up. */}
      {autoReduced && !effects && (
        <button
          type="button"
          onClick={() => setAutoReduced(false)}
          className={`absolute right-3 top-[7.25rem] px-3 py-1.5 text-xs text-slate-600 sm:right-5 sm:top-20 ${panel}`}
        >
          ปิดเอฟเฟกต์แสงอัตโนมัติเพื่อให้ลื่นขึ้น · กด E เพื่อเปิดอีกครั้ง
        </button>
      )}

      {!embedded && (
        <>
      {/* Focused object */}
      {focusName && (
        <div
          className={`pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 px-3 py-1.5 text-xs sm:top-5 ${panel}`}
        >
          <span className="text-slate-500">โฟกัส</span> <span className="font-mono font-medium">{focusName}</span>
        </div>
      )}

      {/* View shortcuts */}
      <nav
        aria-label="มุมกล้อง"
        className={`absolute inset-x-3 bottom-3 mx-auto flex w-fit max-w-full items-center gap-1 overflow-x-auto p-1.5 sm:bottom-5 ${panel}`}
      >
        {ROOM_VIEWS.map((view) => {
          const active = activeView === view.id
          return (
            <button
              key={view.id}
              type="button"
              aria-pressed={active}
              onClick={() => goTo(view)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-900/5'
              }`}
            >
              <span>{view.label}</span>
              <span
                className={`rounded px-1 font-mono text-[10px] ${active ? 'bg-white/20' : 'bg-slate-900/5 text-slate-400'}`}
              >
                {view.key}
              </span>
            </button>
          )
        })}
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-slate-900/10" />
        <button
          type="button"
          onClick={reset}
          title="รีเซ็ตมุมกล้อง (R)"
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <RotateCcw className="size-4" />
          <span>รีเซ็ต</span>
        </button>
      </nav>

      {/* Controls hint */}
      <p className="pointer-events-none absolute inset-x-3 bottom-[4.5rem] text-center text-[11px] text-slate-600/80 sm:bottom-[5.25rem]">
        <span className="sm:hidden">ลากเพื่อหมุน · สองนิ้วเพื่อเลื่อนและซูม · แตะสองครั้งเพื่อโฟกัส</span>
        <span className="hidden sm:inline">
          ลากเพื่อหมุน · คลิกขวาเพื่อเลื่อน · scroll เพื่อซูม · ดับเบิลคลิกวัตถุเพื่อโฟกัส
        </span>
      </p>
        </>
      )}

      {embedded && (
        <>
          <AgentStrip lab={agentLab} selected={chatWith} onSelect={openChat} />
          <AgentChatSheet agentId={chatWith} lab={agentLab} onClose={() => openChat(null)} onOpenAgent={openChat} />
        </>
      )}
      {embedded && (
        <p className="pointer-events-none absolute inset-x-3 bottom-3 text-center text-xs text-slate-600/80">
          ลากเพื่อหมุน · คลิกขวาเพื่อเลื่อน · scroll เพื่อซูม · กด E เพื่อเปิด/ปิดเอฟเฟกต์แสง
        </p>
      )}
    </main>
  )
}
