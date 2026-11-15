'use client'

import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { AGENT_RADIUS } from '../footprints'
import { AGENT_HEIGHT } from '../layout'
import { AGENTS, homeOf, type AgentDef, type AgentId } from './agents'
import type { AgentStatus, Walk } from './useAgentLab'

/** Point along a polyline at fraction t (0–1) of its length. */
function pointAt(path: [number, number][], t: number): [number, number] {
  const lens: number[] = []
  let total = 0
  for (let k = 1; k < path.length; k++) {
    const l = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1])
    lens.push(l)
    total += l
  }
  let d = Math.min(Math.max(t, 0), 1) * total
  for (let k = 0; k < lens.length; k++) {
    if (d <= lens[k] || k === lens.length - 1) {
      const f = lens[k] ? d / lens[k] : 1
      const [a, b] = [path[k], path[k + 1]]
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
    }
    d -= lens[k]
  }
  return path[path.length - 1]
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

function Figure({
  agent,
  floorY,
  walksRef,
  selected,
  status,
  unread,
  onSelect,
}: {
  agent: AgentDef
  floorY: number
  walksRef: MutableRefObject<Map<AgentId, Walk>>
  selected: boolean
  status: AgentStatus
  unread: number
  onSelect: (id: AgentId) => void
}) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const sample = useRef<THREE.Mesh>(null)
  const home = useMemo(() => homeOf(agent.id), [agent.id])

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const w = walksRef.current.get(agent.id)
    let [x, z] = home
    let moving = false
    if (w) {
      const t = (performance.now() - w.start) / w.duration
      ;[x, z] = pointAt(w.path, ease(Math.min(t, 1)))
      moving = t < 1
      if (sample.current) sample.current.visible = w.carry && moving
    } else if (sample.current) {
      sample.current.visible = false
    }
    g.position.set(x, floorY, z)
    // Small bob while walking, slow breathing while working.
    const time = state.clock.elapsedTime
    if (body.current) {
      body.current.position.y =
        AGENT_HEIGHT / 2 + (moving ? Math.abs(Math.sin(time * 9)) * 0.012 : status === 'working' ? Math.sin(time * 4) * 0.006 : 0)
    }
  })

  const select = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    onSelect(agent.id)
  }

  return (
    <group ref={group} name={`agent-${agent.id}`}>
      <mesh
        ref={body}
        position={[0, AGENT_HEIGHT / 2, 0]}
        castShadow
        onClick={select}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <capsuleGeometry args={[AGENT_RADIUS, AGENT_HEIGHT - AGENT_RADIUS * 2, 6, 16]} />
        <meshStandardMaterial color={agent.color} roughness={0.45} emissive={agent.color} emissiveIntensity={selected ? 0.35 : 0.08} />
      </mesh>
      {/* Sample being carried to the next station */}
      <mesh ref={sample} position={[AGENT_RADIUS * 1.2, AGENT_HEIGHT * 0.55, 0]} visible={false}>
        <cylinderGeometry args={[0.028, 0.028, 0.07, 16]} />
        <meshStandardMaterial color="#e0f7f8" emissive="#009FA5" emissiveIntensity={0.6} />
      </mesh>
      {/* Floor ring: brighter and wider when selected */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={selected ? [AGENT_RADIUS * 1.15, AGENT_RADIUS * 1.55, 32] : [AGENT_RADIUS * 0.9, AGENT_RADIUS * 1.08, 32]} />
        <meshBasicMaterial color={agent.color} transparent opacity={selected ? 0.9 : 0.6} />
      </mesh>
      <Html position={[0, AGENT_HEIGHT + 0.06, 0]} center zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={(e) => {
            // Do not let the canvas count this as a click on the empty room (that closes the chat).
            e.stopPropagation()
            onSelect(agent.id)
          }}
          aria-pressed={selected}
          className="relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-md outline-none ring-offset-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-white"
          style={{ backgroundColor: agent.color, boxShadow: selected ? `0 0 0 3px #fff, 0 0 0 5px ${agent.color}` : undefined }}
        >
          {status !== 'idle' && <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />}
          {agent.name}
          {status === 'working' && <span className="sr-only">กำลังทำงาน</span>}
          {status === 'walking' && <span className="sr-only">กำลังเดินส่งงาน</span>}
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-white text-[10px] font-bold" style={{ color: agent.color }}>
              {unread}
            </span>
          )}
        </button>
      </Html>
    </group>
  )
}

export type AgentFiguresProps = {
  walksRef: MutableRefObject<Map<AgentId, Walk>>
  selected: AgentId | null
  status: Record<AgentId, AgentStatus>
  unread: Record<AgentId, number>
  onSelect: (id: AgentId) => void
}

/** The five agents standing at their stations; they walk the aisle to hand work over. */
export default function AgentFigures({ floorY, ...props }: AgentFiguresProps & { floorY: number }) {
  return (
    <group name="agents">
      {AGENTS.map((agent) => (
        <Figure
          key={agent.id}
          agent={agent}
          floorY={floorY}
          walksRef={props.walksRef}
          selected={props.selected === agent.id}
          status={props.status[agent.id]}
          unread={props.unread[agent.id]}
          onSelect={props.onSelect}
        />
      ))}
    </group>
  )
}
