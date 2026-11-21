'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { MessageCircle } from 'lucide-react'
import StationPanel from './station/StationPanel'
import { createStationBridge } from './station/bridge'
import { ROLE_LABEL } from './agents/roles'
import { HANDOFFS, type Progress } from './agents/handoffDemo'
import type { Role } from './agents/workflow'
import LabAgentChat from './chat/LabAgentChat'
import { useLabAgentChat, type ChatFormula } from './chat/useLabAgentChat'
import { useAgentDemo } from './chat/useAgentDemo'
import type { DemoScreen } from '@/lib/lab-demo/conversations'

// WebGL scene — client-only.
const LabRoomCanvas = dynamic(() => import('./LabRoomCanvas'), { ssr: false })

/**
 * The 3D lab room with its agents, plus the four-endpoint testing station panel.
 * `embedded`: fill the nearest positioned parent instead of the whole window (used as a tab inside /assess).
 */
const CHAT_WIDTH_KEY = 'ralphlab:agent-chat:width'
const CHAT_MIN_WIDTH = 290
const CHAT_MAX_WIDTH = 560
const MIN_ROOM_WIDTH = 365

export default function LabRoomExplorer({ embedded = false, projectId = null, formula }: {
  embedded?: boolean
  projectId?: number | null
  formula?: ChatFormula
} = {}) {
  const [ready, setReady] = useState(false)
  const [agent, setAgent] = useState<Role | null>(null)
  const [cameraAgent, setCameraAgent] = useState<Role | null>(null)
  const [chatWidth, setChatWidth] = useState(400)
  const [demoChat, setDemoChat] = useState(false)
  // Normal Lab entry uses the project-scoped handoff chat with simulated agents.
  const [agentDemoOn, setAgentDemoOn] = useState(true)
  const [demoScreen, setDemoScreen] = useState<DemoScreen>({ kind: 'private' })
  const agentDemo = useAgentDemo(projectId)
  const [progress, setProgress] = useState<Progress>()
  const [sampleOpen, setSampleOpen] = useState(0)
  const splitRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; x: number; width: number; maxWidth: number; nextWidth: number } | null>(null)
  const resizeFrame = useRef(0)
  const chat = useLabAgentChat(projectId, demoChat, progress)
  const handleReady = useCallback(() => setReady(true), [])
  const selectAgent = useCallback((role: Role | null, threadId?: string) => {
    setDemoScreen({ kind: 'private', threadId })
    setSampleOpen(0)
    setAgent(role)
    setCameraAgent(role)
  }, [])
  const inspectSample = useCallback(() => {
    setAgent('analyst')
    setCameraAgent(null)
    setSampleOpen(value => value + 1)
  }, [])
  const stopFollowing = useCallback(() => setCameraAgent(null), [])
  // Shared between the DOM panel and the 3D scene (the scene registers its director here).
  const [bridge] = useState(createStationBridge)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const scriptedRoom = params.get('demoChat') === '1'
    setDemoChat(scriptedRoom)
    setAgentDemoOn(params.has('agentDemo') ? params.get('agentDemo') === '1' : !scriptedRoom)
    try {
      const value = Number(window.localStorage.getItem(CHAT_WIDTH_KEY))
      if (value >= CHAT_MIN_WIDTH && value <= CHAT_MAX_WIDTH) setChatWidth(value)
    } catch { /* Browser storage may be disabled. */ }
    return () => window.cancelAnimationFrame(resizeFrame.current)
  }, [])

  function maxChatWidth() {
    const splitWidth = splitRef.current?.clientWidth ?? CHAT_MAX_WIDTH + MIN_ROOM_WIDTH
    return Math.max(CHAT_MIN_WIDTH, Math.min(CHAT_MAX_WIDTH, splitWidth - MIN_ROOM_WIDTH))
  }

  function chooseChatMode(mode: 'demo' | 'api') {
    const demo = mode === 'demo'
    setAgentDemoOn(demo)
    setDemoChat(false)
    setDemoScreen({ kind: 'private' })
    const url = new URL(window.location.href)
    url.searchParams.delete('demoChat')
    url.searchParams.set('agentDemo', demo ? '1' : '0')
    window.history.replaceState(window.history.state, '', url)
  }

  function commitWidth(width: number) {
    panelRef.current?.style.setProperty('--chat-width', `${width}px`)
    setChatWidth(width)
    try { window.localStorage.setItem(CHAT_WIDTH_KEY, String(width)) } catch { /* Browser storage may be disabled. */ }
  }

  function moveDivider(pointerId: number, x: number) {
    const current = drag.current
    if (!current || current.pointerId !== pointerId) return
    const width = Math.round(Math.max(CHAT_MIN_WIDTH, Math.min(current.maxWidth, current.width + current.x - x)))
    if (width === current.nextWidth) return
    current.nextWidth = width
    // Update the pane boundary once per paint, then commit React state at the end.
    if (resizeFrame.current) return
    resizeFrame.current = window.requestAnimationFrame(() => {
      resizeFrame.current = 0
      panelRef.current?.style.setProperty('--chat-width', `${current.nextWidth}px`)
    })
  }

  function finishDrag(pointerId: number) {
    const current = drag.current
    if (!current || current.pointerId !== pointerId) return
    window.cancelAnimationFrame(resizeFrame.current)
    resizeFrame.current = 0
    drag.current = null
    commitWidth(current.nextWidth)
  }

  return (
    <main className={`${embedded ? 'absolute' : 'fixed'} lab-chat-workspace inset-0 overflow-hidden bg-[#c9d5df] text-slate-800`}>
      <div ref={splitRef} className="lab-chat-split">
        <div className="relative min-h-0 min-w-0 flex-1 select-none overflow-hidden">
          <div className="lab-room-viewport">
            <LabRoomCanvas onReady={handleReady} bridge={bridge} chatOpen={agent !== null} cameraAgent={cameraAgent} onAgentSelect={selectAgent} onStopFollowing={stopFollowing} onHandoff={demoChat ? setProgress : undefined} onSample={demoChat ? inspectSample : undefined} />
          </div>
          {demoChat ? progress && (
            <button type="button" onClick={() => selectAgent(HANDOFFS[progress.index].from)} className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 px-3 py-2 text-left text-xs shadow-sm">
              <span className="block text-teal-700">โครงการจำลอง D01 · {progress.index + 1}/{HANDOFFS.length}</span>
              {HANDOFFS[progress.index].title} · {progress.delivered ? 'ส่งถึงแล้ว' : 'กำลังส่ง'}
            </button>
          ) : <StationPanel bridge={bridge} />}
          {!ready && <div className="absolute inset-0 grid place-items-center bg-[#c9d5df] text-sm text-slate-500">กำลังโหลดห้องแล็บ</div>}
          {(ready || agentDemoOn) && (
            <div className="absolute left-3 top-3 z-[21] flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-xs shadow-sm ring-1 ring-slate-200">
              {agentDemoOn ? <button type="button" aria-label="เปิดรายการแชต" title="เปิดรายการแชต" className="flex items-center gap-1 rounded-full px-1 py-1 text-teal-800 hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-600" onClick={() => {
                setAgent((value) => value ?? 'director')
                setCameraAgent(null)
                setDemoScreen({ kind: 'inbox' })
              }}><MessageCircle aria-hidden="true" className="size-3.5" />แชต</button> : <MessageCircle aria-hidden="true" className="size-3.5 text-teal-700" />}
              <select aria-label="เลือก Agent สำหรับแชต" value={agentDemoOn && demoScreen.kind !== 'private' ? '' : agent ?? ''} onChange={(event) => selectAgent((event.target.value || null) as Role | null)} className="max-w-[140px] bg-transparent py-0.5 text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                <option value="">แชตกับ Agent</option>
                {(Object.keys(ROLE_LABEL) as Role[]).map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
              </select>
            </div>
          )}
        </div>
        {agent && (
          <div ref={panelRef} className="lab-chat-panel" style={{ '--chat-width': `${chatWidth}px` } as CSSProperties}>
            <div
              className="lab-chat-divider"
              role="separator"
              tabIndex={0}
              aria-label="ปรับความกว้างแชต"
              aria-orientation="vertical"
              aria-valuemin={CHAT_MIN_WIDTH}
              aria-valuemax={CHAT_MAX_WIDTH}
              aria-valuenow={chatWidth}
              onPointerDown={(event) => {
                if (event.button !== 0 || drag.current) return
                const width = panelRef.current?.clientWidth ?? chatWidth
                drag.current = { pointerId: event.pointerId, x: event.clientX, width, maxWidth: maxChatWidth(), nextWidth: width }
                stopFollowing()
                event.currentTarget.setPointerCapture(event.pointerId)
                event.preventDefault()
              }}
              onPointerMove={(event) => moveDivider(event.pointerId, event.clientX)}
              onPointerUp={(event) => {
                moveDivider(event.pointerId, event.clientX)
                finishDrag(event.pointerId)
              }}
              onPointerCancel={(event) => finishDrag(event.pointerId)}
              onLostPointerCapture={(event) => finishDrag(event.pointerId)}
              onKeyDown={(event) => {
                const direction = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0
                if (!direction || drag.current) return
                event.preventDefault()
                const width = panelRef.current?.clientWidth ?? chatWidth
                stopFollowing()
                commitWidth(Math.max(CHAT_MIN_WIDTH, Math.min(maxChatWidth(), width + direction * 24)))
              }}
            />
            <LabAgentChat key={`${projectId ?? 'standalone'}:${agent}:${agentDemoOn ? agentDemo.userId : 'chat'}:${demoScreen.kind === 'group' ? demoScreen.jobId : demoScreen.kind === 'private' ? demoScreen.threadId ?? 'private' : 'inbox'}`}
              agent={agent} formula={demoChat || agentDemoOn ? undefined : formula} chat={chat} onSelectAgent={selectAgent} onClose={() => selectAgent(null)} progress={demoChat ? progress : undefined}
              onModeChange={chooseChatMode}
              sampleOpen={sampleOpen} agentDemo={agentDemoOn ? agentDemo : undefined} screen={demoScreen} navigate={setDemoScreen} />
          </div>
        )}
      </div>
    </main>
  )
}
