import * as THREE from 'three'

/**
 * Mesh repair for the lab GLB.
 *
 * Most meshes in `Lab_room.glb` are open shells: faces that were hidden in the
 * original fixed-camera render (backs against walls, undersides, the inner
 * skin of containers) were never modelled. With a free camera those gaps are
 * visible, so this module rebuilds them:
 *
 *  - `fillLoop`  closes a boundary loop with new faces (missing panels/caps)
 *  - `solidify`  gives an open shell real wall thickness (inner skin + rim)
 *
 * Everything works on a welded half-edge view of the geometry and returns a
 * new BufferGeometry — the cached GLB geometry is never modified.
 */

export type BoundaryLoop = {
  /** Welded vertex ids, ordered so the cap built from them faces outward. */
  verts: number[]
  /** An original (unwelded) vertex on the loop — its UV colours the cap. */
  uvSource: number
  /** Outward cap normal, centroid and area in world space. */
  normal: THREE.Vector3
  centroid: THREE.Vector3
  area: number
  /** True when every loop vertex lies (nearly) on one plane — a single missing face. */
  planar: boolean
}

export class MeshTopology {
  readonly geometry: THREE.BufferGeometry
  /** Welded vertex positions (local and world space). */
  readonly local: THREE.Vector3[] = []
  readonly world: THREE.Vector3[] = []
  /** Original vertex index → welded vertex id. */
  readonly weld: Int32Array
  /** Triangles as original vertex indices. */
  readonly tris: number[] = []
  readonly loops: BoundaryLoop[] = []
  /** Total surface area in world space. */
  surfaceArea = 0

  constructor(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4) {
    this.geometry = geometry
    const pos = geometry.getAttribute('position')
    const index = geometry.index

    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const diag = geometry.boundingBox!.getSize(new THREE.Vector3()).length() || 1
    const q = 1 / (diag * 2e-4)

    this.weld = new Int32Array(pos.count)
    const lookup = new Map<string, number>()
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const key = `${Math.round(v.x * q)},${Math.round(v.y * q)},${Math.round(v.z * q)}`
      let id = lookup.get(key)
      if (id === undefined) {
        id = this.local.length
        lookup.set(key, id)
        this.local.push(v.clone())
        this.world.push(v.clone().applyMatrix4(matrixWorld))
      }
      this.weld[i] = id
    }

    const count = index ? index.count : pos.count
    const at = (i: number) => (index ? index.getX(i) : i)
    // Directed edge (welded u → v) → an original vertex index at u.
    const halfEdges = new Map<number, number>()
    const n = this.local.length
    const ab = new THREE.Vector3()
    const ac = new THREE.Vector3()
    for (let t = 0; t < count; t += 3) {
      const o = [at(t), at(t + 1), at(t + 2)]
      const w = o.map((i) => this.weld[i])
      if (w[0] === w[1] || w[1] === w[2] || w[0] === w[2]) continue // degenerate
      this.tris.push(o[0], o[1], o[2])
      ab.subVectors(this.world[w[1]], this.world[w[0]])
      ac.subVectors(this.world[w[2]], this.world[w[0]])
      this.surfaceArea += ab.cross(ac).length() / 2
      for (let e = 0; e < 3; e++) halfEdges.set(w[e] * n + w[(e + 1) % 3], o[e])
    }

    // A half-edge with no opposite twin lies on a boundary.
    const next = new Map<number, { to: number; from: number }[]>()
    for (const [key, orig] of halfEdges) {
      const u = Math.floor(key / n)
      const w = key % n
      if (halfEdges.has(w * n + u)) continue
      let list = next.get(u)
      if (!list) next.set(u, (list = []))
      list.push({ to: w, from: orig })
    }

    const used = new Set<number>()
    for (const [start, outs] of next) {
      for (const first of outs) {
        if (used.has(start * n + first.to)) continue
        used.add(start * n + first.to)
        const chain = [start]
        let cur = first.to
        let closed = false
        for (let guard = 0; guard < 4096; guard++) {
          if (cur === start) {
            closed = true
            break
          }
          chain.push(cur)
          const step = next.get(cur)?.find((s) => !used.has(cur * n + s.to))
          if (!step) break
          used.add(cur * n + step.to)
          cur = step.to
        }
        if (!closed || chain.length < 3) continue
        // The cap must run against the boundary direction to face outward.
        const verts = chain.reverse()
        const { normal, centroid, area, planar } = this.measure(verts)
        if (area < 1e-9) continue
        this.loops.push({ verts, uvSource: first.from, normal, centroid, area, planar })
      }
    }
  }

  private measure(verts: number[]) {
    const normal = new THREE.Vector3()
    const centroid = new THREE.Vector3()
    for (let i = 0; i < verts.length; i++) {
      const a = this.world[verts[i]]
      const b = this.world[verts[(i + 1) % verts.length]]
      normal.x += (a.y - b.y) * (a.z + b.z)
      normal.y += (a.z - b.z) * (a.x + b.x)
      normal.z += (a.x - b.x) * (a.y + b.y)
      centroid.add(a)
    }
    centroid.divideScalar(verts.length)
    const area = normal.length() / 2
    normal.normalize()
    let deviation = 0
    let extent = 0
    const d = new THREE.Vector3()
    for (const id of verts) {
      d.subVectors(this.world[id], centroid)
      deviation = Math.max(deviation, Math.abs(d.dot(normal)))
      extent = Math.max(extent, d.length())
    }
    const planar = deviation < Math.max(0.0015, extent * 0.04)
    return { normal, centroid, area, planar }
  }

  /** True when the mesh is a flat sheet (paper, leaf) — nothing to close. */
  get isSheet() {
    const loopArea = this.loops.reduce((s, l) => s + l.area, 0)
    return this.loops.length > 0 && loopArea > this.surfaceArea * 0.85
  }
}

const MAX_LOOP = 72

/**
 * Triangulates a (possibly non-planar) boundary loop.
 *
 * Many holes wrap round a corner — e.g. a cabinet missing its back *and*
 * bottom is one L-shaped loop. A minimum-area fill would cut the corner off
 * diagonally, so the cost favours axis-aligned faces: the fill then lands on
 * the missing back and bottom planes, restoring the box.
 */
export function fillLoop(topology: MeshTopology, loop: BoundaryLoop): number[] | null {
  const ids = loop.verts
  const n = ids.length
  if (n > MAX_LOOP) return null
  const P = ids.map((i) => topology.world[i])
  if (n === 3) return [ids[0], ids[1], ids[2]]

  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const weight = (i: number, k: number, j: number) => {
    ab.subVectors(P[k], P[i])
    ac.subVectors(P[j], P[i])
    nrm.crossVectors(ab, ac)
    const area = nrm.length() / 2
    if (area < 1e-10) return 0
    nrm.normalize()
    const skew = 1 - Math.max(Math.abs(nrm.x), Math.abs(nrm.y), Math.abs(nrm.z))
    const folded = nrm.dot(loop.normal) < -0.3 ? 20 : 0
    return area * (1 + 10 * skew + folded)
  }

  const cost: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n))
  const split: Int16Array[] = Array.from({ length: n }, () => new Int16Array(n).fill(-1))
  for (let gap = 2; gap < n; gap++) {
    for (let i = 0; i + gap < n; i++) {
      const j = i + gap
      let best = Infinity
      let bestK = -1
      for (let k = i + 1; k < j; k++) {
        const c = cost[i][k] + cost[k][j] + weight(i, k, j)
        if (c < best) {
          best = c
          bestK = k
        }
      }
      cost[i][j] = best
      split[i][j] = bestK
    }
  }

  const out: number[] = []
  const emit = (i: number, j: number) => {
    if (j - i < 2) return
    const k = split[i][j]
    out.push(ids[i], ids[k], ids[j])
    emit(i, k)
    emit(k, j)
  }
  emit(0, n - 1)
  return out
}

type Extra = { positions: number[]; uvs: number[] }

function pushTri(extra: Extra, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uv: [number, number][]) {
  extra.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  for (const [u, v] of uv) extra.uvs.push(u, v)
}

/** Adds the faces that close `loops` (triangles from `fillLoop`) to `extra`. */
export function addFills(topology: MeshTopology, loops: BoundaryLoop[], extra: Extra) {
  const uvAttr = topology.geometry.getAttribute('uv')
  let filled = 0
  for (const loop of loops) {
    const tris = fillLoop(topology, loop)
    if (!tris) continue
    // One flat colour per cap: the palette UV of a vertex on the hole's rim.
    const uv: [number, number] = uvAttr ? [uvAttr.getX(loop.uvSource), uvAttr.getY(loop.uvSource)] : [0, 0]
    for (let t = 0; t < tris.length; t += 3) {
      pushTri(extra, topology.local[tris[t]], topology.local[tris[t + 1]], topology.local[tris[t + 2]], [uv, uv, uv])
    }
    filled++
  }
  return filled
}

/**
 * Gives an open shell wall thickness: an inner skin offset along the smoothed
 * vertex normals, plus a rim joining the two skins along every open edge.
 * `thickness` is in the geometry's local units.
 */
export function addShell(topology: MeshTopology, loops: BoundaryLoop[], thickness: number, extra: Extra) {
  const { local, weld, tris, geometry } = topology
  const uvAttr = geometry.getAttribute('uv')
  const uvOf = (i: number): [number, number] => (uvAttr ? [uvAttr.getX(i), uvAttr.getY(i)] : [0, 0])

  // Area-weighted smooth normal per welded vertex.
  const normals = local.map(() => new THREE.Vector3())
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  for (let t = 0; t < tris.length; t += 3) {
    const a = weld[tris[t]]
    const b = weld[tris[t + 1]]
    const c = weld[tris[t + 2]]
    ab.subVectors(local[b], local[a])
    ac.subVectors(local[c], local[a])
    ab.cross(ac)
    normals[a].add(ab)
    normals[b].add(ab)
    normals[c].add(ab)
  }
  const inner = local.map((p, i) => p.clone().addScaledVector(normals[i].normalize(), -thickness))

  // Inner skin: every face again, offset inward and wound the other way.
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]]
    pushTri(extra, inner[weld[c]], inner[weld[b]], inner[weld[a]], [uvOf(c), uvOf(b), uvOf(a)])
  }

  // Rim: bridge outer and inner skins around each opening.
  for (const loop of loops) {
    const uv = uvOf(loop.uvSource)
    const v = loop.verts
    for (let i = 0; i < v.length; i++) {
      const a = v[i]
      const b = v[(i + 1) % v.length]
      pushTri(extra, local[a], local[b], inner[b], [uv, uv, uv])
      pushTri(extra, local[a], inner[b], inner[a], [uv, uv, uv])
    }
  }
}

/** Original faces + the repair faces, as a new geometry (flat-shaded additions). */
export function buildRepaired(topology: MeshTopology, extra: Extra): THREE.BufferGeometry {
  const base = topology.geometry.index ? topology.geometry.toNonIndexed() : topology.geometry
  const basePos = base.getAttribute('position')
  const baseNrm = base.getAttribute('normal')
  const baseUv = base.getAttribute('uv')
  const added = extra.positions.length / 3
  const total = basePos.count + added

  const positions = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)
  const uvs = new Float32Array(total * 2)
  for (let i = 0; i < basePos.count; i++) {
    positions.set([basePos.getX(i), basePos.getY(i), basePos.getZ(i)], i * 3)
    if (baseNrm) normals.set([baseNrm.getX(i), baseNrm.getY(i), baseNrm.getZ(i)], i * 3)
    if (baseUv) uvs.set([baseUv.getX(i), baseUv.getY(i)], i * 2)
  }
  positions.set(extra.positions, basePos.count * 3)
  uvs.set(extra.uvs, basePos.count * 2)

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = basePos.count; i < total; i += 3) {
    a.fromArray(positions, i * 3)
    b.fromArray(positions, (i + 1) * 3)
    c.fromArray(positions, (i + 2) * 3)
    b.sub(a)
    c.sub(a)
    b.cross(c).normalize()
    for (let k = 0; k < 3; k++) normals.set([b.x, b.y, b.z], (i + k) * 3)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.name = `${topology.geometry.name || 'mesh'}:repaired`
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  if (base !== topology.geometry) base.dispose()
  return geometry
}
