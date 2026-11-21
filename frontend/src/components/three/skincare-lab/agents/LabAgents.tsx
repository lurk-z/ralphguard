'use client'

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import labAgents from '../labAgents.json'
import type { LabRoom } from '../plainRoom'
import { NavGrid, type GridData } from './nav'
import { Agent, Sample, type Clip, type StationKind } from './agent'
import type { Role, Team } from './workflow'
import type { Progress } from './handoffDemo'
import AgentFollow from './AgentFollow'
import { createLoopControl } from './loopControl'
import StationScene from '../station/StationScene'
import type { StationBridge } from '../station/bridge'

/** Shape of labAgents.json (baked in Blender from Lab2_3room_agents.blend). */
type Vec2 = [number, number]
type Vec3 = [number, number, number]
type AgentData = {
  file: string
  station: { pos: Vec2; yaw: number; kind: StationKind; clip: Clip }
  visit: { pos: Vec2; yaw: number }
  chair?: { node: string; seated: Vec3; standing: Vec3 }
}
type LabAgentsData = {
  scale: number
  walkSpeed: number
  floorY: number
  grid: GridData
  agents: Record<Role, AgentData>
  sample: { start: Vec3; drop: Vec3 }
  chairTiming: { sitDown: [number, number]; standUp: [number, number] }
}

const DATA = labAgents as unknown as LabAgentsData
const ROLES: Role[] = ['director', 'researcher', 'formulator', 'analyst', 'evaluator']
// The analyst and formulator carry the testing-station clips and hand sockets in their own files;
// the other three use the production files unchanged.
const STATION_FILES: Partial<Record<Role, string>> = {
  analyst: '/models/agents/analyst_station.glb',
  formulator: '/models/agents/formulator_station.glb',
}
const URLS = ROLES.map((r) => STATION_FILES[r] ?? DATA.agents[r].file)

/** A soft dark disc under each agent: the room's shadow map is static, so agents don't cast into it. */
function blobShadow() {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 20),
    new THREE.MeshBasicMaterial({ color: '#1c2733', transparent: true, opacity: 0.22, depthWrite: false })
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.003
  m.renderOrder = 1
  return m
}

/**
 * The five Ralph Lab agents, each at its own station, walking the lab workflow:
 * brief → research → sample V1 → endpoint checks → evaluation and rework, then again.
 */
export default function LabAgents({ room, bridge, followed, onSelect, onStopFollowing, onHandoff, onSample }: {
  room: LabRoom
  bridge?: StationBridge
  followed: Role | null
  onSelect?: (role: Role) => void
  onStopFollowing: () => void
  onHandoff?: (progress: Progress) => void
  onSample?: () => void
}) {
  const gltfs = useGLTF(URLS)
  const gl = useThree((s) => s.gl)

  const { team, sample, group, blobs, hitboxes, nav } = useMemo(() => {
    const hitboxes = new Map<THREE.Object3D, Role>()
    // Invisible pick volume per agent (easier to click than the skinned mesh, and it never changes shape).
    const hitGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.74, 10)
    hitGeo.translate(0, 0.37, 0)
    const hitMat = new THREE.MeshBasicMaterial({ visible: false })
    const nav = new NavGrid(DATA.grid)
    const group = new THREE.Group()
    group.name = 'lab_agents'
    const markShadow = () => {
      gl.shadowMap.needsUpdate = true
    }
    const signal = { cancelled: false }
    const blobs: THREE.Mesh[] = []
    const team = {} as Team
    ROLES.forEach((role, i) => {
      const d = DATA.agents[role]
      const model = SkeletonUtils.clone(gltfs[i].scene)
      let chair
      if (d.chair) {
        const node = room.root.getObjectByName(d.chair.node)
        if (node) chair = { node, seated: new THREE.Vector3(...d.chair.seated), standing: new THREE.Vector3(...d.chair.standing) }
      }
      const agent = new Agent(
        {
          role,
          station: { pos: new THREE.Vector2(...d.station.pos), yaw: d.station.yaw, kind: d.station.kind, clip: d.station.clip },
          visit: { pos: new THREE.Vector2(...d.visit.pos), yaw: d.visit.yaw },
          chair,
        },
        model,
        gltfs[i].animations,
        DATA.scale,
        DATA.floorY,
        nav,
        DATA.walkSpeed,
        DATA.chairTiming,
        markShadow,
        signal
      )
      const blob = blobShadow()
      blobs.push(blob)
      agent.root.add(blob)
      const hit = new THREE.Mesh(hitGeo, hitMat)
      hit.name = `pick_${role}`
      agent.root.add(hit)
      hitboxes.set(hit, role)
      group.add(agent.root)
      team[role] = agent
    })
    const sample = new Sample(group, new THREE.Vector3(...DATA.sample.start), new THREE.Vector3(...DATA.sample.drop), DATA.scale)
    return { team, sample, group, blobs, hitboxes, nav }
  }, [gltfs, room, gl])

  const loop = useMemo(() => createLoopControl(team, sample, onHandoff), [team, sample, onHandoff])

  useEffect(() => {
    // A fresh token per run: in development React runs effects twice, and the first run must stop for good.
    loop.start()
    // `/lab-room?debug`: inspect or fast-forward the agents from the console.
    const w = window as unknown as { __labAgents?: unknown }
    if (new URLSearchParams(window.location.search).has('debug')) w.__labAgents = { team, sample, nav: DATA.grid, loop }
    return () => loop.stop()
  }, [team, sample, loop])

  useEffect(
    () => () => {
      sample.dispose()
      for (const b of blobs) {
        b.geometry.dispose()
        ;(b.material as THREE.Material).dispose()
      }
      const anyHit = hitboxes.keys().next().value as THREE.Mesh | undefined
      anyHit?.geometry.dispose()
      ;(anyHit?.material as THREE.Material | undefined)?.dispose()
    },
    [sample, blobs, hitboxes]
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    for (const r of ROLES) team[r].update(dt)
  })

  return (
    <>
      <primitive object={group} />
      <AgentFollow team={team} hitboxes={hitboxes} followed={followed} onSelect={onSelect} onStopFollowing={onStopFollowing} sample={sample.mesh} onSample={onSample} />
      {bridge && <StationScene room={room} team={team} nav={nav} loop={loop} bridge={bridge} />}
    </>
  )
}

useGLTF.preload(URLS)
