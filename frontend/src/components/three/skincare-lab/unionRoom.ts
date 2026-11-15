import * as THREE from 'three'
import { createGlassMaterial, createLiquidMaterial, solidTexture } from './materials'
import { batchStatic } from './batching'
import type { PreparedRoom, WallId, WallPart } from './prepareRoom'

/**
 * Loader for `Lab_room_Union.glb`, the pre-built skincare lab.
 *
 * The GLB is the scene `prepareRoom` builds at runtime (repaired GLB + skincare
 * equipment), exported once and finished in Blender by
 * `scripts/blender/build_lab_room_union.py`, which only adds hole patches
 * (`<object>_fill`) and changes nothing else. The liquids are kept, frozen at
 * rest, and nothing in the room moves.
 *
 * glTF cannot carry the custom glass/liquid shaders, so each of those materials
 * stores its shader settings in `extras` (→ `material.userData`) and is rebuilt
 * here with the same factories the runtime build uses. Shadow flags and render
 * order travel in node `extras` (`userData.render`). Everything else is used as
 * exported.
 */

type GLTFLike = { scene: THREE.Group }

type ShaderExtras = {
  shader?: 'glass' | 'liquid'
  mapColor?: string
  emissiveColor?: string
  tintMix?: number
  alphaBase?: number
  rim?: string
  glowScale?: number
}

type RenderExtras = { castShadow?: boolean; receiveShadow?: boolean; renderOrder?: number }

const WALLS: WallId[] = ['left', 'back', 'right']

function renderFlags(object: THREE.Object3D, root: THREE.Object3D): RenderExtras | undefined {
  for (let o: THREE.Object3D | null = object; o && o !== root; o = o.parent) {
    const r = o.userData.render as RenderExtras | undefined
    if (r) return r
  }
  return undefined
}

export function prepareUnionRoom(gltf: GLTFLike): PreparedRoom {
  const root = new THREE.Group()
  root.name = 'SkincareLab'
  // The Blender export keeps the runtime root node; its children are the room.
  const source = gltf.scene.getObjectByName('SkincareLab') ?? gltf.scene
  // Clone so the cached GLB is never mutated (clones share geometry).
  for (const child of source.children) root.add(child.clone(true))

  const created: (THREE.Material | THREE.Texture)[] = []
  const rebuilt = new Map<THREE.Material, THREE.Material>()
  const texture = (color?: string) => {
    if (!color) return null
    const t = solidTexture(color)
    created.push(t)
    return t
  }

  const rebuild = (src: THREE.Material): THREE.Material => {
    const extras = src.userData as ShaderExtras
    if (!extras.shader) return src
    let m = rebuilt.get(src)
    if (m) return m
    const s = src as THREE.MeshStandardMaterial
    const name = s.name.replace(/^(glass|liquid):/, '')
    const map = s.map ?? texture(extras.mapColor)
    if (extras.shader === 'glass') {
      m = createGlassMaterial(
        { name, map, emissiveMap: null },
        { tintMix: extras.tintMix, alphaBase: extras.alphaBase, rim: extras.rim }
      )
    } else {
      m = createLiquidMaterial(
        { name, map, emissiveMap: s.emissiveMap ?? texture(extras.emissiveColor) },
        { glow: extras.glowScale }
      )
    }
    rebuilt.set(src, m)
    created.push(m)
    return m
  }

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(rebuild) : rebuild(mesh.material)
    const flags = renderFlags(mesh, root)
    if (flags) {
      mesh.castShadow = !!flags.castShadow
      mesh.receiveShadow = !!flags.receiveShadow
      mesh.renderOrder = flags.renderOrder ?? 0
    }
    // The rack-tube liquids were animated (ripple morph) in the runtime build and
    // so drawn on their own; keep them that way so each tube keeps its own shading seed.
    if (/_liquid$/.test(mesh.name) || /_liquid$/.test(mesh.parent?.name ?? '')) mesh.userData.noBatch = true
  })

  root.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(root)

  // Same cut-away tests as the runtime-built room: a wall hides when the camera
  // is beyond its outer face.
  const size = bounds.getSize(new THREE.Vector3())
  const band = Math.max(size.x, size.z) * 0.045
  const tests: Record<WallId, (c: THREE.Vector3) => boolean> = {
    left: (c) => c.x < bounds.min.x + band,
    right: (c) => c.x > bounds.max.x - band,
    back: (c) => c.z < bounds.min.z + band,
  }
  const walls: WallPart[] = []
  for (const id of WALLS) {
    const node = root.getObjectByName(`wall_${id}`)
    if (node) walls.push({ id, mesh: node, isCameraOutside: tests[id] })
  }

  const batching = batchStatic(root)

  return {
    root,
    bounds,
    walls,
    liquidClips: [],
    removed: [],
    spinners: [],
    batching: { batches: batching.batches, batchedMeshes: batching.batchedMeshes },
    dispose: () => {
      batching.dispose()
      created.forEach((m) => m.dispose())
    },
  }
}
