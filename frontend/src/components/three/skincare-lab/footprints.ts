import * as THREE from 'three'
import { AGENT_HEIGHT, METRES_PER_UNIT } from './layout'

/**
 * Debug-only standing-space check for the seven future agents.
 *
 * Each footprint is a capsule the size of the GLB's original character
 * (0.67 units tall); its radius is a provisional 0.10 units ≈ 0.25 m, i.e. a
 * 0.5 m wide body. The markers are shown only with `/lab-room?debug`.
 */

export const AGENT_RADIUS = 0.1

export type Footprint = { id: string; label: string; x: number; z: number }

export const FOOTPRINTS: Footprint[] = [
  { id: 'weighing', label: 'ชั่ง · วัตถุดิบ', x: -0.2, z: -0.46 },
  { id: 'storage', label: 'ตู้เก็บตัวอย่าง', x: -0.22, z: -0.8 },
  { id: 'mixing', label: 'ผสมสูตร', x: 0.39, z: -0.74 },
  { id: 'cleanup', label: 'อ่างล้าง', x: 0.86, z: -0.74 },
  { id: 'checks', label: 'ตรวจตัวอย่าง', x: 1.18, z: -0.42 },
  { id: 'data-review', label: 'ทบทวนข้อมูล', x: 1.15, z: 0.52 },
  { id: 'filling', label: 'บรรจุ · เทียบ', x: 2.33, z: -0.8 },
]

/** Main aisle: in from the open front, along the counter, round the island. */
export const AISLE: [number, number][] = [
  [0.4, 0.6],
  [0.4, -0.64],
  [1.9, -0.64],
  [2.2, -0.35],
  [2.2, 0.55],
]

export type ClearanceReport = {
  agent: { height: number; radius: number; metresPerUnit: number }
  footprints: { id: string; clearance: number; nearest: string }[]
  aisle: { minClearance: number; nearest: string; at: [number, number] }
  /** Smallest gap between any two footprints (edge to edge). */
  minSpacing: number
}

type Obstacle = { name: string; minX: number; maxX: number; minZ: number; maxZ: number }

function gap(o: Obstacle, x: number, z: number) {
  const dx = Math.max(o.minX - x, 0, x - o.maxX)
  const dz = Math.max(o.minZ - z, 0, z - o.maxZ)
  return Math.hypot(dx, dz) - AGENT_RADIUS
}

/** Measures free space round every footprint and along the aisle (world units). */
export function measureClearance(root: THREE.Object3D, floorY: number): ClearanceReport {
  root.updateMatrixWorld(true)
  const obstacles: Obstacle[] = []
  const box = new THREE.Box3()
  for (const child of root.children) {
    // Floor, and cables lying along bench edges, are not obstacles.
    if (/^(tile|floor_slab|floor_and_walls|device_cables|render_batches)$/.test(child.name)) continue
    // Precise (per-vertex) bounds so rotated parts do not inflate the box — except
    // split wall parts, which share the shell vertex buffer and carry their own bounds.
    box.setFromObject(child, !child.name.startsWith('wall_'))
    if (box.isEmpty()) continue
    // Ignore things an agent steps over or walks under.
    if (box.max.y < floorY + 0.03 || box.min.y > floorY + AGENT_HEIGHT) continue
    obstacles.push({ name: child.name, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z })
  }
  const nearest = (x: number, z: number) => {
    let best = { clearance: Infinity, nearest: '' }
    for (const o of obstacles) {
      const g = gap(o, x, z)
      if (g < best.clearance) best = { clearance: g, nearest: o.name }
    }
    return best
  }

  const footprints = FOOTPRINTS.map((f) => ({ id: f.id, ...nearest(f.x, f.z) }))

  const aisle = { minClearance: Infinity, nearest: '', at: [0, 0] as [number, number] }
  for (let i = 0; i + 1 < AISLE.length; i++) {
    const [ax, az] = AISLE[i]
    const [bx, bz] = AISLE[i + 1]
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.04)
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps
      const z = az + ((bz - az) * s) / steps
      const n = nearest(x, z)
      if (n.clearance < aisle.minClearance) {
        aisle.minClearance = n.clearance
        aisle.nearest = n.nearest
        aisle.at = [x, z]
      }
    }
  }

  let minSpacing = Infinity
  for (let i = 0; i < FOOTPRINTS.length; i++) {
    for (let k = i + 1; k < FOOTPRINTS.length; k++) {
      const d = Math.hypot(FOOTPRINTS[i].x - FOOTPRINTS[k].x, FOOTPRINTS[i].z - FOOTPRINTS[k].z) - AGENT_RADIUS * 2
      minSpacing = Math.min(minSpacing, d)
    }
  }

  return {
    agent: { height: AGENT_HEIGHT, radius: AGENT_RADIUS, metresPerUnit: METRES_PER_UNIT },
    footprints,
    aisle,
    minSpacing,
  }
}
