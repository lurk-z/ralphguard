import * as THREE from 'three'
import { mergeBufferGeometries } from 'three-stdlib'

/**
 * Draw-call batching for the static room.
 *
 * The prepared room has ~290 meshes; most never move and share a handful of
 * materials. Every static opaque mesh is baked into one merged mesh per
 * (material, shadow flags). The source meshes stay in the scene, hidden and
 * flagged `userData.batched`, so object focus (raycast on double-click), view
 * framing and clearance checks keep working on real objects.
 *
 * Glass and decals are batched too (per material, keeping their render order,
 * so they still draw after the liquids they contain).
 *
 * Left unbatched: liquids with morph targets (animated fill levels), cut-away
 * walls (toggled per frame) and anything under a spinning frame.
 */

export const BATCH_GROUP = 'render_batches'

function skip(mesh: THREE.Mesh, root: THREE.Object3D) {
  if (Array.isArray(mesh.material)) return true
  if (mesh.morphTargetInfluences?.length || mesh.userData.noBatch) return true
  if (/^wall_/.test(mesh.name)) return true
  for (let p: THREE.Object3D | null = mesh; p && p !== root; p = p.parent) {
    if (p.userData.spin || !p.visible) return true
  }
  return false
}

export function batchStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const rel = new THREE.Matrix4()
  const buckets = new Map<
    string,
    { material: THREE.Material; cast: boolean; receive: boolean; order: number; geos: THREE.BufferGeometry[] }
  >()
  const sources: THREE.Mesh[] = []

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || skip(mesh, root)) return
    const material = mesh.material as THREE.Material
    rel.multiplyMatrices(inv, mesh.matrixWorld)

    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    g.morphAttributes = {}
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
    g.applyMatrix4(rel)
    // A mirrored transform flips winding once it is baked in — restore it.
    if (rel.determinant() < 0) {
      for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
        const n = attr.itemSize
        const arr = attr.array as Float32Array
        for (let t = 0; t < attr.count; t += 3) {
          for (let k = 0; k < n; k++) {
            const i1 = (t + 1) * n + k
            const i2 = (t + 2) * n + k
            const tmp = arr[i1]
            arr[i1] = arr[i2]
            arr[i2] = tmp
          }
        }
        attr.needsUpdate = true
      }
    }

    const key = `${material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`
    let bucket = buckets.get(key)
    if (!bucket)
      buckets.set(key, (bucket = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, order: mesh.renderOrder, geos: [] }))
    bucket.geos.push(g)
    sources.push(mesh)
  })

  const group = new THREE.Group()
  group.name = BATCH_GROUP
  const created: THREE.BufferGeometry[] = []
  for (const { material, cast, receive, order, geos } of buckets.values()) {
    const merged = mergeBufferGeometries(geos)
    geos.forEach((g) => g.dispose())
    if (!merged) continue
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    const m = new THREE.Mesh(merged, material)
    m.name = `batch:${material.name || material.type}`
    m.castShadow = cast
    m.receiveShadow = receive
    m.renderOrder = order
    m.userData.renderBatch = true
    // Picking goes to the hidden source meshes, never the batch.
    m.raycast = () => {}
    group.add(m)
    created.push(merged)
  }

  for (const mesh of sources) {
    mesh.visible = false
    mesh.userData.batched = true
  }
  root.add(group)

  return {
    batches: group.children.length,
    batchedMeshes: sources.length,
    dispose: () => created.forEach((g) => g.dispose()),
  }
}

/** True when a hit object is really on screen (batched sources count as shown). */
export function isPickable(object: THREE.Object3D) {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (o.userData.renderBatch) return false
    if (!o.visible && !o.userData.batched) return false
  }
  return true
}
