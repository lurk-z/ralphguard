import * as THREE from 'three'

/**
 * Loader for `Lab_room_3room.glb`, the three-room Ralph Lab finished in Blender.
 *
 * The GLB already holds the final layout, furniture, props and the monitor and
 * board images, so it is shown as exported. The only runtime work is shadow
 * flags and splitting the room shell so walls can be hidden.
 */

export type WallId = 'left' | 'back' | 'right'

export type WallPart = {
  id: WallId
  mesh: THREE.Object3D
  /** True when the camera sits on the outer side of this wall. */
  isCameraOutside: (camera: THREE.Vector3) => boolean
}

export type LabRoom = {
  root: THREE.Group
  bounds: THREE.Box3
  walls: WallPart[]
  /** Prop clips baked with the room (testing-station fridge door and bin lid). */
  animations: THREE.AnimationClip[]
}

type GLTFLike = { scene: THREE.Group; animations?: THREE.AnimationClip[] }

const SHELL_NAME = 'floor_and_walls'

function isSeeThrough(material: THREE.Material | THREE.Material[]) {
  const list = Array.isArray(material) ? material : [material]
  return list.some((m) => m.transparent || m.opacity < 1)
}

/**
 * Splits the single floor+walls mesh into the floor slab and three hideable
 * wall parts. The shell holds the slab, the back wall, both outer walls and
 * the two partitions; each partition goes with the outer wall on its side, so
 * a camera looking in from that side sees through both into the centre room.
 * The new geometries reuse the shell's vertex buffers — only the index differs.
 */
function splitShell(shell: THREE.Mesh): { slab: THREE.Mesh; walls: WallPart[] } | null {
  const geo = shell.geometry
  const pos = geo.getAttribute('position')
  if (!pos) return null
  const index = geo.index
  const count = index ? index.count : pos.count
  const at = (i: number) => (index ? index.getX(i) : i)

  shell.updateWorldMatrix(true, false)
  const world: THREE.Vector3[] = []
  const box = new THREE.Box3()
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(shell.matrixWorld)
    world.push(v)
    box.expandByPoint(v)
  }
  const size = box.getSize(new THREE.Vector3())
  const midX = (box.min.x + box.max.x) / 2
  const slabTop = box.min.y + size.y * 0.2
  const backDepth = 0.1 // a little more than the back wall's thickness

  const buckets: Record<'slab' | WallId, number[]> = { slab: [], left: [], back: [], right: [] }
  for (let t = 0; t < count; t += 3) {
    const ids = [at(t), at(t + 1), at(t + 2)]
    const [a, b, c] = ids.map((i) => world[i])
    let key: 'slab' | WallId = 'slab'
    if (Math.max(a.y, b.y, c.y) > slabTop) {
      const cx = (a.x + b.x + c.x) / 3
      const cz = (a.z + b.z + c.z) / 3
      if (cz < box.min.z + backDepth) key = 'back'
      else key = cx < midX ? 'left' : 'right'
    }
    buckets[key].push(...ids)
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
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  // A wall hides when the camera is beyond its outer face.
  const band = Math.max(size.x, size.z) * 0.045
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

export function prepareRoom(gltf: GLTFLike): LabRoom {
  const root = new THREE.Group()
  root.name = 'SkincareLab'
  // Clone so the cached GLB is never mutated (clones share geometry and materials).
  gltf.scene.updateMatrixWorld(true)
  for (const child of gltf.scene.children) root.add(child.clone(true))

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const opaque = !isSeeThrough(mesh.material)
    mesh.castShadow = opaque
    mesh.receiveShadow = opaque
  })

  // Split the room shell so the walls in front of the camera can be hidden.
  let walls: WallPart[] = []
  const shell = root.getObjectByName(SHELL_NAME) as THREE.Mesh | undefined
  if (shell?.isMesh && shell.parent === root) {
    const split = splitShell(shell)
    if (split) {
      root.add(split.slab, ...split.walls.map((w) => w.mesh))
      root.remove(shell)
      walls = split.walls
    }
  }

  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)
  return { root, bounds, walls, animations: gltf.animations ?? [] }
}
