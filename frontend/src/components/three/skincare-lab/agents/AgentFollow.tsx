'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { Agent } from './agent'
import type { Role, Team } from './workflow'
import { ROLE_LABEL } from './roles'

const CLICK_PX = 6 // a press that moves less than this is a click, not an orbit drag
const FOLLOW_DIST = 1.7 // camera distance when following starts (room units)
const CHEST = 0.42 // look-at height above the agent's feet

/**
 * Click an agent to follow it: the orbit pivot glides to the agent and stays
 * with it while it walks; orbiting and zooming keep working around it.
 * Click empty space, press Esc, or resize the pane to stop.
 */
export default function AgentFollow({ team, hitboxes, followed, onSelect, onStopFollowing, sample, onSample }: {
  team: Team
  hitboxes: Map<THREE.Object3D, Role>
  followed: Role | null
  onSelect?: (role: Role) => void
  onStopFollowing: () => void
  sample: THREE.Object3D
  onSample?: () => void
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const zoomRef = useRef(false)
  const tagRef = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    zoomRef.current = followed !== null
  }, [followed])

  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const boxes = [...hitboxes.keys()]
    const pick = (ev: PointerEvent): Role | 'sample' | null => {
      const r = el.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      if (onSample && sample.visible && ray.intersectObject(sample, false).length) return 'sample'
      const hit = ray.intersectObjects(boxes, false)[0]
      return hit ? hitboxes.get(hit.object) ?? null : null
    }
    let down: { x: number; y: number } | null = null
    const onDown = (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY }
    }
    const onUp = (ev: PointerEvent) => {
      if (!down) return
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y)
      down = null
      if (moved > CLICK_PX || ev.button !== 0) return
      const role = pick(ev)
      if (role === 'sample') {
        onSample?.()
        return
      }
      zoomRef.current = !!role
      if (role) onSelect?.(role)
      else onStopFollowing()
    }
    const onMove = (ev: PointerEvent) => {
      if (down) return
      el.style.cursor = pick(ev) ? 'pointer' : ''
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onStopFollowing()
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey)
      el.style.cursor = ''
    }
  }, [gl, camera, hitboxes, onSelect, onStopFollowing, sample, onSample])

  // The user grabbing the camera (wheel / pinch / drag) ends the automatic zoom-in, not the follow.
  useEffect(() => {
    if (!controls) return
    const stop = () => {
      zoomRef.current = false
    }
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])

  const want = useRef(new THREE.Vector3())
  const delta = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const agent: Agent | null = followed ? team[followed] : null
    if (tagRef.current) tagRef.current.visible = !!agent
    if (!agent || !controls) return
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6)
    want.current.set(agent.root.position.x, agent.root.position.y + CHEST, agent.root.position.z)
    // Move the pivot toward the agent and carry the camera by the same amount, so the view angle is kept.
    delta.current.subVectors(want.current, controls.target).multiplyScalar(k)
    controls.target.add(delta.current)
    camera.position.add(delta.current)
    if (zoomRef.current) {
      const off = camera.position.clone().sub(controls.target)
      const d = off.length()
      const next = THREE.MathUtils.lerp(d, FOLLOW_DIST, k)
      camera.position.copy(controls.target).add(off.setLength(next))
      if (Math.abs(next - FOLLOW_DIST) < 0.02) zoomRef.current = false
    }
    controls.update()
    if (tagRef.current) tagRef.current.position.set(agent.root.position.x, agent.root.position.y + 0.8, agent.root.position.z)
  })

  return (
    <group ref={tagRef} visible={false}>
      {followed && (
        <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <span className="whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
            {ROLE_LABEL[followed]}
          </span>
        </Html>
      )}
    </group>
  )
}
