import * as THREE from 'three'
import { mergeBufferGeometries } from 'three-stdlib'
import { createGlassMaterial, createLiquidMaterial, solidTexture } from '../materials'

/**
 * Low-poly equipment kit for the skincare lab.
 *
 * Devices are modelled in centimetres and scaled into the room, where one
 * world unit ≈ 2.54 m (the GLB's 0.67-unit character = 1.70 m, see layout.ts).
 * Local frame: origin on the bench surface at the device's centre, +y up,
 * +z = the side facing the operator.
 */
export const CM = 1 / 254

export type V3 = [number, number, number]
export type Profile = [number, number][]

/* ------------------------------------------------------------------ */
/* Label atlas: every label, screen and decal shares one canvas texture */
/* ------------------------------------------------------------------ */

export type UVRect = { u0: number; v0: number; u1: number; v1: number }
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

const CELL_W = 256
const CELL_H = 128
const COLS = 8
const ROWS = 16
const PAD = 3

export class LabelAtlas {
  readonly canvas: HTMLCanvasElement
  readonly texture: THREE.CanvasTexture
  private readonly ctx: CanvasRenderingContext2D
  private readonly used: boolean[] = new Array(COLS * ROWS).fill(false)
  private readonly rects = new Map<string, UVRect>()

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = COLS * CELL_W
    this.canvas.height = ROWS * CELL_H
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 8
    this.texture.name = 'skincare-lab:labels'
  }

  /** Reserves a `cols × rows` block of 256×128 px cells, draws into it once, returns its UVs. */
  cell(key: string, cols: number, rows: number, draw: Draw): UVRect {
    const cached = this.rects.get(key)
    if (cached) return cached
    const slot = this.allocate(cols, rows)
    if (!slot) {
      console.warn(`[skincare-lab] label atlas full, "${key}" reuses an existing label`)
      return this.rects.values().next().value as UVRect
    }
    const px = slot.c * CELL_W
    const py = slot.r * CELL_H
    const w = cols * CELL_W
    const h = rows * CELL_H
    const ctx = this.ctx
    ctx.save()
    ctx.translate(px, py)
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    draw(ctx, w, h)
    ctx.restore()
    this.texture.needsUpdate = true

    const W = this.canvas.width
    const H = this.canvas.height
    const rect = {
      u0: (px + PAD) / W,
      u1: (px + w - PAD) / W,
      v0: 1 - (py + h - PAD) / H,
      v1: 1 - (py + PAD) / H,
    }
    this.rects.set(key, rect)
    return rect
  }

  private allocate(cols: number, rows: number) {
    for (let r = 0; r + rows <= ROWS; r++) {
      for (let c = 0; c + cols <= COLS; c++) {
        let free = true
        for (let y = r; y < r + rows && free; y++)
          for (let x = c; x < c + cols && free; x++) if (this.used[y * COLS + x]) free = false
        if (!free) continue
        for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) this.used[y * COLS + x] = true
        return { r, c }
      }
    }
    return null
  }

  dispose() {
    this.texture.dispose()
  }
}

export function remapUV(geometry: THREE.BufferGeometry, rect: UVRect) {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0))
  }
  uv.needsUpdate = true
  return geometry
}

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

export type Finish = 'plastic' | 'gloss' | 'metal' | 'rubber' | 'paper'

const FINISH: Record<Finish, { roughness: number; metalness: number }> = {
  plastic: { roughness: 0.62, metalness: 0.04 },
  gloss: { roughness: 0.42, metalness: 0.04 },
  // No environment map in the scene: keep metalness low or metal renders black.
  metal: { roughness: 0.38, metalness: 0.18 },
  rubber: { roughness: 0.9, metalness: 0 },
  paper: { roughness: 0.85, metalness: 0 },
}

export class Palette {
  private readonly cache = new Map<string, THREE.Material>()
  private readonly textures: THREE.Texture[] = []

  constructor(readonly atlas: LabelAtlas) {}

  private get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined
    if (!m) {
      m = make()
      this.cache.set(key, m)
    }
    return m
  }

  solid(color: string, finish: Finish = 'plastic') {
    return this.get(`solid:${color}:${finish}`, () => {
      const m = new THREE.MeshStandardMaterial({ color, flatShading: true, ...FINISH[finish] })
      m.name = `kit:${finish}:${color}`
      return m
    })
  }

  glass(kind: 'clear' | 'amber' = 'clear') {
    return this.get(`glass:${kind}`, () => {
      const tex = solidTexture(kind === 'amber' ? '#7c3f0b' : '#d4eaf2')
      this.textures.push(tex)
      const m =
        kind === 'amber'
          ? createGlassMaterial({ name: 'amber', map: tex, emissiveMap: null }, { tintMix: 0.04, alphaBase: 0.74, rim: '#2b1404' })
          : createGlassMaterial({ name: 'clear', map: tex, emissiveMap: null })
      m.userData = { noShadow: true, renderOrder: 2 }
      return m
    })
  }

  /** Product or sample in a vessel. `glow` < 1 keeps creams reading as lit rather than lit-up. */
  liquid(color: string, glow: number) {
    return this.get(`liquid:${color}:${glow}`, () => {
      const tex = solidTexture(color)
      this.textures.push(tex)
      const m = createLiquidMaterial({ name: color, map: tex, emissiveMap: null }, { glow })
      m.userData = { noShadow: true }
      return m
    })
  }

  /** Printed paper labels (opaque, lit). */
  get label() {
    return this.get('label', () => {
      const m = new THREE.MeshStandardMaterial({ map: this.atlas.texture, roughness: 0.8, metalness: 0, flatShading: true })
      m.name = 'kit:label'
      m.userData = { noShadow: true }
      return m
    })
  }

  /** Self-lit instrument displays — kept under the bloom threshold. */
  get display() {
    return this.get('display', () => {
      const m = new THREE.MeshBasicMaterial({ map: this.atlas.texture, color: new THREE.Color(0.92, 0.92, 0.92) })
      m.name = 'kit:display'
      m.userData = { noShadow: true }
      return m
    })
  }

  /** Printed marks on glass (graduations): transparent cells of the atlas. */
  get decal() {
    return this.get('decal', () => {
      const m = new THREE.MeshBasicMaterial({
        map: this.atlas.texture,
        transparent: true,
        depthWrite: false,
        color: new THREE.Color(0.85, 0.85, 0.85),
      })
      m.name = 'kit:decal'
      m.userData = { noShadow: true, renderOrder: 3 }
      return m
    })
  }

  dispose() {
    this.cache.forEach((m) => m.dispose())
    this.textures.forEach((t) => t.dispose())
  }
}

/* ------------------------------------------------------------------ */
/* Profiles for lathe-turned parts (radius, height) in cm               */
/* ------------------------------------------------------------------ */

/** Solid cylinder-ish body. */
export const solid = (r: number, h: number): Profile => [
  [0, 0],
  [r, 0],
  [r, h],
  [0, h],
]

/** Open vessel with wall thickness: outer wall, rim, inner wall, inner floor. */
export const cup = (r: number, h: number, t: number, floor = t): Profile => [
  [0, 0],
  [r, 0],
  [r, h],
  [r - t, h],
  [r - t, floor],
  [0, floor],
]

/** Solid bottle: body, shoulder, neck. */
export const bottle = (r: number, body: number, shoulder: number, neckR: number, neckH: number): Profile => [
  [0, 0],
  [r, 0],
  [r, body],
  [neckR, body + shoulder],
  [neckR, body + shoulder + neckH],
  [0, body + shoulder + neckH],
]

/** Hollow glass bottle (wall thickness `t`) so its contents show through. */
export const glassBottle = (r: number, body: number, shoulder: number, neckR: number, neckH: number, t: number): Profile => {
  const top = body + shoulder + neckH
  return [
    [0, 0],
    [r, 0],
    [r, body],
    [neckR, body + shoulder],
    [neckR, top],
    [neckR - t, top],
    [neckR - t, body + shoulder],
    [r - t, body],
    [r - t, t],
    [0, t],
  ]
}

/** Liquid volume inside a vessel, optionally with a stirring vortex (dip). */
export const fill = (rIn: number, bottom: number, top: number, dip = 0): Profile => [
  [0, bottom],
  [rIn, bottom],
  [rIn, top],
  [rIn * 0.45, top - dip * 0.55],
  [0, top - dip],
]

/* ------------------------------------------------------------------ */
/* Device builder                                                       */
/* ------------------------------------------------------------------ */

export type Spinner = { object: THREE.Object3D; speed: number }

type AddOpts = { rot?: V3; parent?: THREE.Object3D }

export class DeviceBuilder {
  readonly root = new THREE.Group()
  readonly parts = new THREE.Group()
  readonly spinners: Spinner[] = []

  constructor(
    name: string,
    readonly pal: Palette
  ) {
    this.root.name = name
    this.parts.name = `${name}:parts`
    this.parts.scale.setScalar(CM)
    this.root.add(this.parts)
  }

  get atlas() {
    return this.pal.atlas
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, pos: V3 = [0, 0, 0], o: AddOpts = {}) {
    const m = new THREE.Mesh(geometry, material)
    m.position.set(...pos)
    if (o.rot) m.rotation.set(...o.rot)
    ;(o.parent ?? this.parts).add(m)
    return m
  }

  /** A transform frame for sub-assemblies (e.g. a sloped control panel). */
  frame(pos: V3, rot: V3 = [0, 0, 0], parent?: THREE.Object3D) {
    const g = new THREE.Group()
    g.position.set(...pos)
    g.rotation.set(...rot)
    ;(parent ?? this.parts).add(g)
    return g
  }

  /** A frame that turns about its local Y axis every frame (stirrer shafts, spindles). */
  spin(pos: V3, speed: number, parent?: THREE.Object3D) {
    const g = this.frame(pos, [0, 0, 0], parent)
    g.userData.spin = true
    this.spinners.push({ object: g, speed })
    return g
  }

  box(size: V3, material: THREE.Material, center: V3, o: AddOpts = {}) {
    return this.mesh(new THREE.BoxGeometry(...size), material, center, o)
  }

  cyl(
    r: number,
    h: number,
    material: THREE.Material,
    center: V3,
    o: AddOpts & { seg?: number; rTop?: number; open?: boolean } = {}
  ) {
    const g = new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.seg ?? 12, 1, o.open ?? false)
    return this.mesh(g, material, center, o)
  }

  lathe(profile: Profile, material: THREE.Material, base: V3, o: AddOpts & { seg?: number } = {}) {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      o.seg ?? 12
    )
    return this.mesh(g, material, base, o)
  }

  /** Cable / wire / bent rod along a smooth path. */
  tube(points: V3[], r: number, material: THREE.Material, o: { parent?: THREE.Object3D; seg?: number } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal')
    const g = new THREE.TubeGeometry(curve, o.seg ?? Math.max(6, points.length * 6), r, 5, false)
    return this.mesh(g, material, [0, 0, 0], { parent: o.parent })
  }

  /**
   * A label wrapped round `facets` of a lathe body with `seg` segments, centred
   * on the facet facing `facing` (radians, 0 = +z). `facets` must be even so
   * the label edges line up with the body's facet edges.
   */
  wrap(
    rect: UVRect,
    r: number,
    h: number,
    centerY: number,
    base: V3,
    o: { seg?: number; facets?: number; facing?: number; material?: THREE.Material; parent?: THREE.Object3D } = {}
  ) {
    const seg = o.seg ?? 12
    const facets = o.facets ?? 4
    const span = (facets * Math.PI * 2) / seg
    const g = new THREE.CylinderGeometry(r, r, h, facets, 1, true, (o.facing ?? 0) - span / 2, span)
    remapUV(g, rect)
    return this.mesh(g, o.material ?? this.pal.label, [base[0], base[1] + centerY, base[2]], { parent: o.parent })
  }

  /** A flat printed or self-lit panel facing +z in its frame. */
  plane(rect: UVRect, w: number, h: number, center: V3, material: THREE.Material, o: AddOpts = {}) {
    return this.mesh(remapUV(new THREE.PlaneGeometry(w, h), rect), material, center, o)
  }

  /** Merges every static part per material and returns the finished device root. */
  finish() {
    this.root.updateMatrixWorld(true)
    const inv = this.parts.matrixWorld.clone().invert()
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
    const consumed: THREE.Mesh[] = []
    const rel = new THREE.Matrix4()

    this.parts.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      for (let p = mesh.parent; p && p !== this.parts; p = p.parent) if (p.userData.spin) return
      const material = mesh.material as THREE.Material
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      rel.multiplyMatrices(inv, mesh.matrixWorld)
      g.applyMatrix4(rel)
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
      if (!g.getAttribute('normal')) g.computeVertexNormals()
      g = g.index ? g.toNonIndexed() : g
      let list = buckets.get(material)
      if (!list) buckets.set(material, (list = []))
      list.push(g)
      consumed.push(mesh)
    })

    for (const mesh of consumed) {
      mesh.parent?.remove(mesh)
      mesh.geometry.dispose()
    }
    // Empty helper frames left behind are harmless but clutter the graph.
    for (const child of [...this.parts.children]) {
      if (!(child as THREE.Mesh).isMesh && child.children.length === 0 && !child.userData.spin) this.parts.remove(child)
    }

    for (const [material, list] of buckets) {
      const merged = mergeBufferGeometries(list)
      list.forEach((g) => g.dispose())
      if (!merged) continue
      merged.computeBoundingBox()
      merged.computeBoundingSphere()
      const m = new THREE.Mesh(merged, material)
      m.name = `${this.root.name}:${material.name || 'mat'}`
      this.parts.add(m)
    }

    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const ud = (mesh.material as THREE.Material).userData ?? {}
      mesh.castShadow = !ud.noShadow
      mesh.receiveShadow = !ud.noShadow
      if (ud.renderOrder) mesh.renderOrder = ud.renderOrder
    })
    return this.root
  }
}

/** Places a finished device in world space (bench top `y`, yaw `ry` in radians). */
export function place(device: THREE.Object3D, x: number, y: number, z: number, ry = 0) {
  device.position.set(x, y, z)
  device.rotation.set(0, ry, 0)
  device.updateMatrixWorld(true)
  return device
}
