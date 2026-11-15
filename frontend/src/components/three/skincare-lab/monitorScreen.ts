import * as THREE from 'three'

/**
 * Replaces the generic desktop picture on the central monitor (`screen.001` in
 * the GLB) with a screenshot of RalphGuard's own assessment page.
 *
 * The screen face is found from the mesh itself: the only faces whose UVs span
 * a large part of the texture (every other face samples a single palette
 * pixel). A new quad is laid just in front of that face, with the screenshot
 * mapped in the same orientation as the original picture.
 */

const SCREEN_MESH = 'screen001'
/** Screen face aspect in the GLB is ≈ 1.92 : 1; the capture is 16 : 9. */
const SCREEN_ASPECT = 1.92

export function replaceMonitorScreen(root: THREE.Object3D, url: string) {
  const host = root.getObjectByName(SCREEN_MESH) as THREE.Mesh | undefined
  if (!host?.isMesh) return null
  const geo = host.geometry
  const pos = geo.getAttribute('position')
  const uv = geo.getAttribute('uv')
  if (!pos || !uv) return null

  const index = geo.index
  const count = index ? index.count : pos.count
  const at = (i: number) => (index ? index.getX(i) : i)

  const picked: number[] = []
  for (let t = 0; t < count; t += 3) {
    const ids = [at(t), at(t + 1), at(t + 2)]
    const us = ids.map((i) => uv.getX(i))
    const vs = ids.map((i) => uv.getY(i))
    if (Math.max(...us) - Math.min(...us) > 0.1 && Math.max(...vs) - Math.min(...vs) > 0.1) picked.push(...ids)
  }
  if (picked.length < 6) return null

  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  for (const i of picked) {
    u0 = Math.min(u0, uv.getX(i))
    u1 = Math.max(u1, uv.getX(i))
    v0 = Math.min(v0, uv.getY(i))
    v1 = Math.max(v1, uv.getY(i))
  }

  // Face normal (local) to lift the new quad off the original picture.
  const a = new THREE.Vector3().fromBufferAttribute(pos, picked[0])
  const b = new THREE.Vector3().fromBufferAttribute(pos, picked[1])
  const c = new THREE.Vector3().fromBufferAttribute(pos, picked[2])
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
  const lift = normal.multiplyScalar(0.01)

  const positions = new Float32Array(picked.length * 3)
  const uvs = new Float32Array(picked.length * 2)
  picked.forEach((i, k) => {
    positions[k * 3] = pos.getX(i) + lift.x
    positions[k * 3 + 1] = pos.getY(i) + lift.y
    positions[k * 3 + 2] = pos.getZ(i) + lift.z
    uvs[k * 2] = (uv.getX(i) - u0) / (u1 - u0)
    uvs[k * 2 + 1] = (uv.getY(i) - v0) / (v1 - v0)
  })
  const quad = new THREE.BufferGeometry()
  quad.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  quad.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  quad.computeVertexNormals()

  const texture = new THREE.TextureLoader().load(url, (t) => {
    // Crop the 16:9 capture top/bottom to the panel's wider aspect.
    const img = t.image as { width: number; height: number }
    const keep = Math.min(1, img.width / SCREEN_ASPECT / img.height)
    t.repeat.set(1, keep)
    t.offset.set(0, (1 - keep) / 2)
    t.needsUpdate = true
  })
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.name = 'skincare-lab:monitor-assess'

  // Self-lit, a little below white so the bloom threshold is never crossed.
  const material = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(0.86, 0.86, 0.86) })
  material.name = 'monitor-screen'
  const screen = new THREE.Mesh(quad, material)
  screen.name = 'monitor_screen'
  host.add(screen)

  return {
    dispose: () => {
      quad.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
