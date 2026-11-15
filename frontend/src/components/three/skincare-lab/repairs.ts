import * as THREE from 'three'
import { MeshTopology, addFills, addShell, buildRepaired, type BoundaryLoop } from './meshRepair'

export type MeshRole = 'solid' | 'glass' | 'liquid'

export type RepairEntry = {
  /** Top-level GLB node and mesh the repair was applied to. */
  object: string
  mesh: string
  /** Open boundary loops found in the source mesh. */
  openLoops: number
  /** Loops closed with new faces (missing backs, sides, undersides). */
  filled: number
  /** Whole panels added to a box-shaped cabinet (e.g. "-z" = back). */
  panels: string[]
  /** Wall thickness added to an open shell, in world units (0 = none). */
  shell: number
  /** Loops still open afterwards: intentional mouths, or holes not handled. */
  remaining: number
}

type Side = '-x' | '+x' | '-y' | '+y' | '-z' | '+z'

type Policy = {
  /** Leave the whole object untouched. */
  skip?: boolean
  /** Add wall thickness (world units) so the open shell gets an inner skin and rim. */
  shell?: number
  /** Also keep downward-facing openings (e.g. a lamp shade). */
  keepDown?: boolean
  /**
   * Box-shaped furniture missing whole faces: add a flat panel on each listed
   * side of its bounding box (world axes). One hole in these meshes usually
   * wraps round several missing faces, which a single cap cannot close cleanly.
   */
  panels?: Side[]
  /** Limit panels to the carcass when an open door makes the bounding box deeper (world z). */
  panelZMax?: number
  /** Never cap holes (open drawers, open compartments); panels still apply. */
  keepOpen?: boolean
  /** Close holes that bend round a corner with the axis-preferring fill. */
  fillBent?: boolean
}

// World-space wall thickness for vessels. The room is ~2.9 units wide, so
// these read as a few millimetres of glass / plastic at the model's scale.
const GLASS_WALL = 0.0016
const VESSEL_WALL = 0.002
// Panels sit just inside the bounding box so they never fight existing faces.
const PANEL_INSET = 0.002

/**
 * Per-object repair decisions, keyed by top-level node name (as sanitised by
 * GLTFLoader). Anything not listed gets the default: cap every flat hole.
 * Containers (a `shell` policy, or glass) keep the openings that face upward.
 */
const POLICIES: Record<string, Policy> = {
  // The room shell is handled by the wall splitter; the floor tiles sit on it.
  floor_and_walls: { skip: true },
  tile: { skip: true },

  // Rear-counter base cabinets: modelled with front, top and one side only.
  // No bottom panels: they sit a few millimetres above the floor tiles and
  // z-fight with them. The drawer unit (bottom_shelf1) only needs its back.
  bottom_shelf1: { panels: ['-z'], keepOpen: true },
  bottom_shelf2: { panels: ['+x', '-z'] },
  bottom_shelf3: { panels: ['+x', '-z'] },
  bottom_shelf4: { panels: ['-z'] },
  // Wall cabinets and the glass-door storage unit: no back / hidden side.
  // Wall cabinets: back plus both end panels (both ends were open), kept to
  // the carcass depth so the open door does not stretch them forward.
  tweezers: { panels: ['-z', '-x', '+x'], panelZMax: -1.035 },
  main: { panels: ['-x', '-y', '-z'] },

  // Open containers: keep the mouth, add an inner wall, rim and bottom.
  basket: { shell: 0.005, fillBent: true },
  big_flask001: { shell: VESSEL_WALL },
  small_flask: { shell: VESSEL_WALL },
  bottle002: { shell: VESSEL_WALL },
  bottle002001: { shell: VESSEL_WALL },
  tube: { shell: 0.0012 },
  tubes: { shell: 0.0012 },
  funnel: { shell: 0.0012, keepDown: true },
  plate8: { shell: 0.0015 },
  Petri_dish: { shell: 0.0015 },
  Petri_dish2: { shell: 0.0015 },
  Petri_dish4: { shell: 0.0015 },
  Petri_dish12: { shell: 0.0015 },

  // Magazine files on the shelves are open at the top.
  folder_for_paper1: { shell: 0.001 },
  folder_for_paper2: { shell: 0.001 },
  folder_for_paper1001: { shell: 0.001 },
  folder_for_paper1002: { shell: 0.001 },
  folder_for_paper1003: { shell: 0.001 },
  folder_for_paper1007: { shell: 0.001 },
  folder_for_paper1008: { shell: 0.001 },
  folder_for_paper1009: { shell: 0.001 },

  // The desk lamp's shade opens downward.
  lamp: { keepDown: true },

  // Holes that bend round an edge: instrument bases, chair bases, the floor
  // sterilizer's back, the monitor shell and the desks' inner skin.
  lower_base: { fillBent: true },
  base002: { fillBent: true },
  head: { fillBent: true },
  back1: { fillBent: true },
  back1001: { fillBent: true },
  back1002: { fillBent: true },
  legs001: { fillBent: true },
  screen001: { fillBent: true },
  table1: { fillBent: true },
  table2: { fillBent: true },
  table2001: { fillBent: true },
}

const UP = 0.5

function topLevelName(object: THREE.Object3D, root: THREE.Object3D) {
  let o = object
  while (o.parent && o.parent !== root) o = o.parent
  return o.name
}

function isIntentionalOpening(loop: BoundaryLoop, policy: Policy) {
  if (policy.shell && loop.normal.y > UP) return true
  if (policy.keepDown && loop.normal.y < -UP) return true
  return false
}

type Extra = { positions: number[]; uvs: number[] }

/** Adds flat panels on the given sides of the mesh's world bounding box. */
function addPanels(mesh: THREE.Mesh, topology: MeshTopology, sides: Side[], extra: Extra, zMax?: number) {
  const box = new THREE.Box3()
  topology.world.forEach((p) => box.expandByPoint(p))
  if (zMax !== undefined) box.max.z = Math.min(box.max.z, zMax)
  const toLocal = mesh.matrixWorld.clone().invert()
  const uvAttr = topology.geometry.getAttribute('uv')
  // Colour the panel like the carcass: the palette UV on the largest hole's rim.
  const source = [...topology.loops].sort((a, b) => b.area - a.area)[0]?.uvSource ?? 0
  const uv: [number, number] = uvAttr ? [uvAttr.getX(source), uvAttr.getY(source)] : [0, 0]

  const { min, max } = box
  const i = PANEL_INSET
  for (const side of sides) {
    const axis = side[1] as 'x' | 'y' | 'z'
    const positive = side[0] === '+'
    const at = positive ? max[axis] - i : min[axis] + i
    // Corners wound counter-clockwise when seen from outside the box.
    let quad: [number, number, number][]
    if (axis === 'x') {
      quad = [
        [at, min.y, min.z],
        [at, min.y, max.z],
        [at, max.y, max.z],
        [at, max.y, min.z],
      ]
      if (positive) quad.reverse()
    } else if (axis === 'y') {
      quad = [
        [min.x, at, min.z],
        [max.x, at, min.z],
        [max.x, at, max.z],
        [min.x, at, max.z],
      ]
      if (positive) quad.reverse()
    } else {
      quad = [
        [min.x, min.y, at],
        [min.x, max.y, at],
        [max.x, max.y, at],
        [max.x, min.y, at],
      ]
      if (positive) quad.reverse()
    }
    const p = quad.map((c) => new THREE.Vector3(...c).applyMatrix4(toLocal))
    for (const [a, b, c] of [
      [0, 1, 2],
      [0, 2, 3],
    ]) {
      extra.positions.push(p[a].x, p[a].y, p[a].z, p[b].x, p[b].y, p[b].z, p[c].x, p[c].y, p[c].z)
      extra.uvs.push(...uv, ...uv, ...uv)
    }
  }
}

/**
 * Closes missing faces and adds wall thickness across the room. Returns a
 * report (for the debug view / hand-off notes), the meshes that ended up
 * watertight, and a disposer for the geometries it created.
 */
export function repairRoom(root: THREE.Object3D, roles: Map<THREE.Mesh, MeshRole>) {
  const report: RepairEntry[] = []
  const closed = new Set<THREE.Mesh>()
  const created: THREE.BufferGeometry[] = []
  root.updateMatrixWorld(true)

  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })

  for (const mesh of meshes) {
    const role = roles.get(mesh) ?? 'solid'
    if (role === 'liquid') continue // closed volumes with morph targets
    const object = topLevelName(mesh, root)
    const policy: Policy = POLICIES[object] ?? {}
    if (policy.skip) continue

    let topology = new MeshTopology(mesh.geometry, mesh.matrixWorld)
    const openLoops = topology.loops.length
    if (openLoops === 0) {
      closed.add(mesh)
      continue
    }
    if (topology.isSheet) continue

    const scale = mesh.matrixWorld.getMaxScaleOnAxis() || 1
    // Glass vessels are always open shells: keep every mouth, add thickness.
    const shell = role === 'glass' ? GLASS_WALL : (policy.shell ?? 0)
    let geometry = mesh.geometry
    let filled = 0
    const replace = (next: THREE.BufferGeometry) => {
      if (geometry !== mesh.geometry) {
        geometry.dispose()
        created.splice(created.indexOf(geometry), 1)
      }
      geometry = next
      created.push(next)
      topology = new MeshTopology(next, mesh.matrixWorld)
    }

    if (role !== 'glass') {
      const extra: Extra = { positions: [], uvs: [] }
      const toFill = topology.loops.filter(
        (l) => !policy.keepOpen && !isIntentionalOpening(l, policy) && (l.planar || policy.fillBent)
      )
      filled = addFills(topology, toFill, extra)
      if (policy.panels) addPanels(mesh, topology, policy.panels, extra, policy.panelZMax)
      if (extra.positions.length) replace(buildRepaired(topology, extra))
    }

    if (shell > 0 && topology.loops.length) {
      const extra: Extra = { positions: [], uvs: [] }
      addShell(topology, topology.loops, shell / scale, extra)
      replace(buildRepaired(topology, extra))
    }

    if (geometry === mesh.geometry) continue
    mesh.geometry = geometry
    if (topology.loops.length === 0) closed.add(mesh)
    report.push({
      object,
      mesh: mesh.name,
      openLoops,
      filled,
      panels: policy.panels ?? [],
      shell: shell > 0 ? shell : 0,
      remaining: topology.loops.length,
    })
  }

  return { report, closed, dispose: () => created.forEach((g) => g.dispose()) }
}
