'use client'

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { NavGrid } from '../agents/nav'
import type { LabRoom } from '../plainRoom'
import type { LoopControl } from '../agents/loopControl'
import type { Team } from '../agents/workflow'
import type { StationBridge } from './bridge'
import { StationSceneDirector } from './stationDirector'
import { StationProps } from './stationProps'

const AGENT_RADIUS = 0.05
const CLICK_PX = 6

/**
 * The four-endpoint testing station in the right room (the `test_station` group baked into
 * Lab_room_3room.glb), plus its director for the panel.
 */
export default function StationScene({
  room,
  team,
  nav,
  loop,
  bridge,
}: {
  room: LabRoom
  team: Team
  nav: NavGrid
  loop: LoopControl
  bridge: StationBridge
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const props = useMemo(() => {
    const station = room.root.getObjectByName('test_station')
    return station ? new StationProps(station, room.animations) : null
  }, [room])

  // the station's furniture is solid for everyone's walking paths
  useEffect(() => {
    if (!props) return
    for (const b of props.blockers) {
      const box = new THREE.Box3().setFromObject(b)
      nav.block(box.min.x - AGENT_RADIUS, box.max.x + AGENT_RADIUS, box.min.z - AGENT_RADIUS, box.max.z + AGENT_RADIUS)
    }
  }, [props, nav])

  useEffect(() => {
    if (!props) return
    const director = new StationSceneDirector(props, team, loop)
    bridge.setDirector(director)
    if (new URLSearchParams(window.location.search).has('debug')) {
      ;(window as unknown as { __labStation?: unknown }).__labStation = { props, director, team, camera, gl, THREE }
    }
    return () => {
      director.release()
      bridge.setDirector(null)
    }
  }, [props, team, loop, bridge, camera, gl])

  // click a vial in the rack (start its test) or in the fridge (open its record)
  useEffect(() => {
    if (!props) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const pick = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const targets = [...props.hitboxes.keys()].filter((h) => {
        let o: THREE.Object3D | null = h
        while (o) {
          if (!o.visible) return false
          o = o.parent
        }
        return true
      })
      const hit = ray.intersectObjects(targets, false)[0]
      return hit ? props.hitboxes.get(hit.object) ?? null : null
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
      const p = pick(ev)
      if (p) bridge.onPick?.(p)
    }
    const onMove = (ev: PointerEvent) => {
      if (down || !bridge.onPick) return
      if (pick(ev)) el.style.cursor = 'pointer'
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointermove', onMove)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointermove', onMove)
    }
  }, [gl, camera, props, bridge])

  useFrame((_, delta) => props?.update(Math.min(delta, 0.1)))

  // the station is part of the room scene already; nothing extra to mount
  return null
}
