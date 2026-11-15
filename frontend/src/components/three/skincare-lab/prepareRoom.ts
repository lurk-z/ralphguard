import * as THREE from 'three'
import { createGlassMaterial, createLiquidMaterial } from './materials'
import { repairRoom, type MeshRole, type RepairEntry } from './repairs'
import { applyLayout, type LayoutInfo } from './layout'
import { furnish, moveMicroscope, removeReplaced } from './skincareLab'
import type { Spinner } from './equipment/kit'
import { replaceMonitorScreen } from './monitorScreen'
import { batchStatic } from './batching'

export type WallId = 'left' | 'back' | 'right'

export type WallPart = {
  id: WallId
  /** The wall mesh, or the node holding its meshes (pre-built room). */
  mesh: THREE.Object3D
  /** True when the camera sits on the outer side of this wall. */
  isCameraOutside: (camera: THREE.Vector3) => boolean
}

export type PreparedRoom = {
  root: THREE.Group
  bounds: THREE.Box3
  walls: WallPart[]
  /** Morph-weight clips that animate the liquid fill levels. */
  liquidClips: THREE.AnimationClip[]
  /** Names of the top-level nodes left out of the room (the character rig). */
  removed: string[]
  /** What the mesh-repair pass closed or thickened, per mesh (runtime-built room only). */
  repairs?: RepairEntry[]
  /** The enlarged footprint and which assemblies were moved (runtime-built room only). */
  layout?: LayoutInfo
  /** GLB props taken out for the skincare lab, and the equipment added (runtime-built room only). */
  skincare?: { removed: string[]; added: string[] }
  /** Parts that turn continuously (stirrer shaft, viscometer spindle). */
  spinners: Spinner[]
  /** Draw-call batching: merged meshes drawn, and how many sources they replace. */
  batching: { batches: number; batchedMeshes: number }
  dispose: () => void
}

type GLTFLike = { scene: THREE.Group; animations: THREE.AnimationClip[] }

const SHELL_NAME = 'floor_and_walls'

// The character is the only skinned/rigged thing in the file: a top-level node
// holding SkinnedMeshes and the bone hierarchy. Detecting it structurally (not
// by name) means lab instruments with names like "head" or "legs" — which are
// microscope and hot-plate parts — are never mistaken for the person.
function isCharacter(node: THREE.Object3D) {
  let rigged = false
  node.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.Bone).isBone) rigged = true
  })
  return rigged
}

function isLiquid(mesh: THREE.Object3D, root: THREE.Object3D) {
  for (let o: THREE.Object3D | null = mesh; o && o !== root; o = o.parent) {
    if (/_liquid$/.test(o.name)) return true
  }
  return false
}

/**
 * Splits the single floor+walls mesh into the floor slab and one mesh per wall,
 * so a wall that blocks the view can be hidden on its own. The new geometries
 * reuse the original vertex buffers — only the index differs.
 */
function splitShell(shell: THREE.Mesh): { slab: THREE.Mesh; walls: WallPart[] } | null {
  const geo = shell.geometry
  const index = geo.index
  const pos = geo.getAttribute('position')
  if (!index || !pos) return null

  shell.updateWorldMatrix(true, false)
  const world: THREE.Vector3[] = []
  const box = new THREE.Box3()
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(shell.matrixWorld)
    world.push(v)
    box.expandByPoint(v)
  }
  const size = box.getSize(new THREE.Vector3())
  const band = Math.max(size.x, size.z) * 0.045 // a little more than wall thickness
  const slabTop = box.min.y + size.y * 0.2

  const buckets: Record<'slab' | WallId, number[]> = { slab: [], left: [], back: [], right: [] }
  for (let t = 0; t < index.count; t += 3) {
    const ia = index.getX(t)
    const ib = index.getX(t + 1)
    const ic = index.getX(t + 2)
    const a = world[ia]
    const b = world[ib]
    const c = world[ic]
    const cx = (a.x + b.x + c.x) / 3
    const cz = (a.z + b.z + c.z) / 3
    let key: 'slab' | WallId = 'slab'
    if (Math.max(a.y, b.y, c.y) > slabTop) {
      if (cx < box.min.x + band) key = 'left'
      else if (cx > box.max.x - band) key = 'right'
      else if (cz < box.min.z + band) key = 'back'
    }
    buckets[key].push(ia, ib, ic)
  }

  const part = (name: string, indices: number[]) => {
    const g = new THREE.BufferGeometry()
    for (const [attrName, attr] of Object.entries(geo.attributes)) g.setAttribute(attrName, attr)
    g.setIndex(indices)
    // Bounds from the faces this part actually uses (the vertex buffer is shared).
    const partBox = new THREE.Box3()
    const p = new THREE.Vector3()
    for (const i of indices) partBox.expandByPoint(p.fromBufferAttribute(pos, i))
    g.boundingBox = partBox
    g.boundingSphere = partBox.getBoundingSphere(new THREE.Sphere())
    const m = new THREE.Mesh(g, shell.material)
    m.name = name
    m.position.copy(shell.position)
    m.quaternion.copy(shell.quaternion)
    m.scale.copy(shell.scale)
    return m
  }

  const tests: Record<WallId, (c: THREE.Vector3) => boolean> = {
    left: (c) => c.x < box.min.x + band,
    right: (c) => c.x > box.max.x - band,
    back: (c) => c.z < box.min.z + band,
  }
  const walls: WallPart[] = (['left', 'back', 'right'] as WallId[])
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, mesh: part(`wall_${id}`, buckets[id]), isCameraOutside: tests[id] }))

  return { slab: part('floor_slab', buckets.slab), walls }
}

export function prepareRoom(gltf: GLTFLike): PreparedRoom {
  const root = new THREE.Group()
  root.name = 'SkincareLab'
  const removed: string[] = []

  // Clone so the cached GLB (shared with the landing page's LabScene) is never
  // mutated. Clones share geometry with the source — nothing is duplicated.
  gltf.scene.updateMatrixWorld(true)
  for (const child of gltf.scene.children) {
    if ((child as THREE.Camera).isCamera) continue
    if (isCharacter(child)) {
      removed.push(child.name)
      continue
    }
    root.add(child.clone(true))
  }

  // Take out props the skincare lab replaces (whole assemblies, contents included).
  const replaced = removeReplaced(root)

  // Widen the room and move furniture groups before anything else is derived.
  const layout = applyLayout(root)

  // One microscope stays: from the rear counter to the sample-check bench.
  moveMicroscope(root, { x: 1.385, z: -0.135 })

  const created: THREE.Material[] = []
  const opaque = new Map<string, THREE.Material>()
  const glass = new Map<string, THREE.Material>()
  const liquid = new Map<string, THREE.Material>()
  const cached = (
    map: Map<string, THREE.Material>,
    src: THREE.MeshStandardMaterial,
    make: (s: THREE.MeshStandardMaterial) => THREE.Material
  ) => {
    let m = map.get(src.uuid)
    if (!m) {
      m = make(src)
      map.set(src.uuid, m)
      created.push(m)
    }
    return m
  }

  const makeOpaque = (src: THREE.MeshStandardMaterial) => {
    const m = src.clone()
    // The palette is authored for a matte, faceted look and the scene has no
    // environment map, so keep metalness low (metal would render near-black).
    if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.08)
    if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.6)
    // Self-lit surfaces (screens, the wall frame) stay under the bloom
    // threshold so only the liquids glow.
    if (m.emissiveIntensity !== undefined) m.emissiveIntensity = Math.min(m.emissiveIntensity, 0.85)
    m.side = THREE.DoubleSide // thin props (papers, leaves) are single-layer
    m.transparent = false
    m.depthWrite = true
    return m
  }

  const roles = new Map<THREE.Mesh, MeshRole>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const sources = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
    let seeThrough = false
    const next = sources.map((src) => {
      if (isLiquid(mesh, root)) return cached(liquid, src, createLiquidMaterial)
      if (src.transparent || src.opacity < 1) {
        seeThrough = true
        return cached(glass, src, createGlassMaterial)
      }
      return cached(opaque, src, makeOpaque)
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]

    const glows = isLiquid(mesh, root)
    roles.set(mesh, glows ? 'liquid' : seeThrough ? 'glass' : 'solid')
    mesh.castShadow = !seeThrough && !glows
    mesh.receiveShadow = !seeThrough && !glows
    if (seeThrough) mesh.renderOrder = 2 // glass after the liquid it contains
  })

  // Close missing faces and add wall thickness before anything is measured.
  const repair = repairRoom(root, roles)

  // Watertight solids render single-sided: correct lighting, and a cap that
  // rests on a worktop is back-facing from above so it cannot z-fight with it.
  // Meshes that are still open (lamp shade, chair shells) stay double-sided.
  const singleSided = new Map<string, THREE.Material>()
  for (const mesh of repair.closed) {
    if (roles.get(mesh) !== 'solid') continue
    const toFront = (m: THREE.Material) =>
      cached(singleSided, m as THREE.MeshStandardMaterial, (src) => {
        const front = src.clone()
        front.side = THREE.FrontSide
        return front
      })
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toFront) : toFront(mesh.material)
  }

  // Split the room shell so individual walls can be hidden.
  let walls: WallPart[] = []
  const shell = root.getObjectByName(SHELL_NAME) as THREE.Mesh | undefined
  if (shell?.isMesh) {
    const split = splitShell(shell)
    if (split) {
      for (const m of [split.slab, ...split.walls.map((w) => w.mesh)]) {
        m.castShadow = true
        m.receiveShadow = true
        root.add(m)
      }
      root.remove(shell)
      walls = split.walls
    }
  }

  // New equipment is built complete, so it is added after the repair pass.
  const equipment = furnish(root)

  // The central monitor shows RalphGuard's assessment page (with the 3D face).
  const monitor = replaceMonitorScreen(root, '/textures/skincare-lab/monitor-assess.jpg')

  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)

  // Last: bake static opaque meshes into a few draw calls.
  const batching = batchStatic(root)

  // Keep only the morph-weight clips (liquid levels) whose vessels are still in
  // the room. Clips that drive transforms belong to the removed character.
  const liquidClips = gltf.animations.filter(
    (clip) =>
      clip.tracks.length > 0 &&
      clip.tracks.every(
        (t) =>
          /\.morphTargetInfluences/.test(t.name) &&
          !!root.getObjectByName(THREE.PropertyBinding.parseTrackName(t.name).nodeName)
      )
  )

  return {
    root,
    bounds,
    walls,
    liquidClips,
    removed,
    repairs: repair.report,
    layout: layout.info,
    skincare: { removed: replaced, added: equipment.added },
    spinners: equipment.spinners,
    batching: { batches: batching.batches, batchedMeshes: batching.batchedMeshes },
    dispose: () => {
      batching.dispose()
      monitor?.dispose()
      equipment.dispose()
      created.forEach((m) => m.dispose())
      repair.dispose()
      layout.dispose()
    },
  }
}

/** The top-level room object (direct child of the room root) that owns `object`. */
export function topLevelOf(object: THREE.Object3D, root: THREE.Object3D) {
  let o = object
  while (o.parent && o.parent !== root) o = o.parent
  return o
}
