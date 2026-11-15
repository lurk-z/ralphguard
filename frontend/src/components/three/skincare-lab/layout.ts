import * as THREE from 'three'

/**
 * Room enlargement for seven future agents.
 *
 * The room is widened along X by exactly two floor-tile periods (+15.9% of
 * the inner width), so the tile grid continues without a seam. Depth is
 * unchanged. Furniture keeps its size; assemblies are moved as groups:
 *
 *  - everything in the right-hand bay (corner desk, its chair, the wall clock)
 *    travels with the right wall;
 *  - the central island (desks, chairs, monitor, bin…) moves one tile, which
 *    splits the new space between the main aisle and the right-hand aisle.
 *
 * Scale: the GLB's character is 0.67 units tall, so 1 unit ≈ 2.54 m for a
 * 1.70 m person. Inner width goes 2.672 → 3.097 units (≈ 6.8 m → 7.9 m).
 */

export const TILE_PERIOD = 0.2125
export const WIDEN_BY = TILE_PERIOD * 2
export const ISLAND_SHIFT = TILE_PERIOD
/** The island also moves toward the open front, widening the aisle along the rear counter. */
export const ISLAND_FORWARD = 0.1
/** World X of the grout line where the floor is cut and extended. */
const CUT_X = 1.2755

/** Character height in the source GLB (world units) — the scale reference. */
export const AGENT_HEIGHT = 0.67
export const METRES_PER_UNIT = 1.7 / AGENT_HEIGHT

const SHELL = 'floor_and_walls'
const TILE = 'tile'

export type LayoutInfo = {
  widenBy: number
  innerWidthBefore: number
  innerWidthAfter: number
  innerDepth: number
  metresPerUnit: number
  moved: { rightBay: string[]; island: string[] }
}

function cloneGeometry(mesh: THREE.Mesh) {
  mesh.geometry = mesh.geometry.clone()
  return mesh.geometry
}

/** Stretches the floor slab and back wall by moving the right wall outward. */
function widenShell(shell: THREE.Mesh, created: THREE.BufferGeometry[]) {
  shell.updateWorldMatrix(true, false)
  const geo = cloneGeometry(shell)
  created.push(geo)
  const pos = geo.getAttribute('position')
  const scaleX = shell.matrixWorld.elements[0] || 1
  const v = new THREE.Vector3()
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(shell.matrixWorld)
    if (v.x > CUT_X) pos.setX(i, pos.getX(i) + WIDEN_BY / scaleX)
    min = Math.min(min, v.x)
    max = Math.max(max, v.x)
  }
  pos.needsUpdate = true
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return { min, max }
}

/**
 * Extends the tiled floor: faces left of the cut stay, and everything from two
 * periods before the cut onward is repeated two periods further right — the
 * grid is periodic, so the copy lines up tile for tile. Faces spanning the
 * floor (the base under the tiles) are stretched instead.
 */
function widenTiles(tile: THREE.Mesh, created: THREE.BufferGeometry[]) {
  tile.updateWorldMatrix(true, false)
  const src = tile.geometry.index ? tile.geometry.toNonIndexed() : tile.geometry
  const pos = src.getAttribute('position')
  const nrm = src.getAttribute('normal')
  const uv = src.getAttribute('uv')
  const scaleX = tile.matrixWorld.elements[0] || 1
  const shift = WIDEN_BY / scaleX

  const P: number[] = []
  const N: number[] = []
  const U: number[] = []
  const wx = [0, 0, 0]
  const v = new THREE.Vector3()
  const emit = (i: number, dx: number) => {
    P.push(pos.getX(i) + dx, pos.getY(i), pos.getZ(i))
    if (nrm) N.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
    if (uv) U.push(uv.getX(i), uv.getY(i))
  }
  for (let t = 0; t < pos.count; t += 3) {
    for (let k = 0; k < 3; k++) wx[k] = v.fromBufferAttribute(pos, t + k).applyMatrix4(tile.matrixWorld).x
    const extent = Math.max(...wx) - Math.min(...wx)
    if (extent > TILE_PERIOD * 1.5) {
      for (let k = 0; k < 3; k++) emit(t + k, wx[k] > CUT_X ? shift : 0)
      continue
    }
    const centre = (wx[0] + wx[1] + wx[2]) / 3
    if (centre < CUT_X) for (let k = 0; k < 3; k++) emit(t + k, 0)
    if (centre > CUT_X - WIDEN_BY) for (let k = 0; k < 3; k++) emit(t + k, shift)
  }

  const geo = new THREE.BufferGeometry()
  geo.name = 'tile:widened'
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  if (nrm) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  if (src !== tile.geometry) src.dispose()
  tile.geometry = geo
  created.push(geo)
}

/** Applies the enlarged layout to the freshly cloned room (before repairs). */
export function applyLayout(root: THREE.Object3D) {
  const created: THREE.BufferGeometry[] = []
  root.updateMatrixWorld(true)

  // Decide every move from the original positions first.
  const rightBay: THREE.Object3D[] = []
  const island: THREE.Object3D[] = []
  const box = new THREE.Box3()
  const c = new THREE.Vector3()
  for (const child of root.children) {
    if (child.name === SHELL || child.name === TILE) continue
    box.setFromObject(child)
    if (box.isEmpty()) continue
    box.getCenter(c)
    if (c.x > 1.3 && c.z < -0.75) rightBay.push(child)
    else if (c.x > 0.8 && c.x < 1.85 && c.z > -0.6 && c.z < 0.5) island.push(child)
  }
  rightBay.forEach((o) => (o.position.x += WIDEN_BY))
  island.forEach((o) => {
    o.position.x += ISLAND_SHIFT
    o.position.z += ISLAND_FORWARD
  })

  let innerBefore = 0
  const shell = root.getObjectByName(SHELL) as THREE.Mesh | undefined
  if (shell?.isMesh) {
    const { min, max } = widenShell(shell, created)
    // Walls are ~0.09 thick on both sides.
    innerBefore = max - min - 0.18
  }
  const tile = root.getObjectByName(TILE) as THREE.Mesh | undefined
  if (tile?.isMesh) widenTiles(tile, created)

  root.updateMatrixWorld(true)
  const info: LayoutInfo = {
    widenBy: WIDEN_BY,
    innerWidthBefore: innerBefore,
    innerWidthAfter: innerBefore + WIDEN_BY,
    innerDepth: 1.923,
    metresPerUnit: METRES_PER_UNIT,
    moved: { rightBay: rightBay.map((o) => o.name), island: island.map((o) => o.name) },
  }
  return { info, dispose: () => created.forEach((g) => g.dispose()) }
}
