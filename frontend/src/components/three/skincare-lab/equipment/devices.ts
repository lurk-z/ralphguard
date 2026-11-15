import * as THREE from 'three'
import { DeviceBuilder, Palette, bottle, cup, fill, glassBottle, type Spinner, type V3 } from './kit'
import {
  containerLabel,
  displayCell,
  gloveBoxCell,
  graduationCell,
  notebookCell,
  signCell,
  tagCell,
  textStrip,
  type ContainerLabel,
} from './labels'

/**
 * Skincare-lab equipment, modelled in centimetres (see kit.ts for the frame).
 * Proportions follow manufacturer references; see docs/ralph-lab/lab-room/SKINCARE_LAB_NOTES.md.
 */

export type Device = { root: THREE.Group; spinners: Spinner[] }

const C = {
  housing: '#dfe4e8',
  housingAlt: '#c6cfd5',
  panel: '#26323b',
  black: '#1c2329',
  rubber: '#262d33',
  steel: '#aab4bb',
  steelDark: '#7d8890',
  ceramic: '#eceeea',
  teal: '#0f9aa0',
  tealDark: '#0b6f74',
  stand: '#4a5661',
  white: '#f2f4f3',
  pe: '#e8eef0',
  paper: '#f7f6ef',
  cover: '#1d5e66',
  tip: '#d3e4ea',
} as const

const LIQ = {
  cream: '#efe5cf',
  creamLight: '#f5f0e4',
  gelCream: '#d6ebe8',
  gel: '#8fd3d6',
  serum: '#f0dc9a',
  serumLight: '#f3e7bd',
  serumGreen: '#e2ebc6',
  oilPhase: '#eadca0',
  amberOil: '#c98a2a',
  lotion: '#f6f0e6',
} as const

const done = (b: DeviceBuilder): Device => ({ root: b.finish(), spinners: b.spinners })
const FACE_UP: V3 = [-Math.PI / 2, 0, 0]

/* ------------------------------------------------------------------ */
/* Reusable containers                                                  */
/* ------------------------------------------------------------------ */

type BeakerSpec = {
  R: number
  H: number
  fillTo?: number
  color?: string
  glow?: number
  dip?: number
  graduated?: boolean
  facing?: number
}

/** Glass beaker with wall thickness, optional contents and printed graduations. */
export function addBeaker(b: DeviceBuilder, base: V3, s: BeakerSpec, parent?: THREE.Object3D) {
  const t = 0.22
  b.lathe(cup(s.R, s.H, t, 0.35), b.pal.glass('clear'), base, { parent })
  if (s.fillTo && s.color) {
    b.lathe(fill(s.R - t - 0.06, 0.4, s.fillTo, s.dip ?? 0), b.pal.liquid(s.color, s.glow ?? 0.45), base, { parent })
  }
  // Pouring spout on the rim, opposite the printed graduations.
  b.box([1.3, 0.35, 1.1], b.pal.glass('clear'), [base[0] - s.R - 0.3, base[1] + s.H - 0.15, base[2]], { parent })
  if (s.graduated ?? true) {
    b.wrap(graduationCell(b.atlas), s.R + 0.03, s.H * 0.6, s.H * 0.42, base, {
      facets: 2,
      facing: s.facing ?? 0,
      material: b.pal.decal,
      parent,
    })
  }
}

/** Wide-mouth HDPE ingredient tub with a coloured lid and a wrap label. */
export function addTub(
  b: DeviceBuilder,
  base: V3,
  label: ContainerLabel & { key: string },
  o: { r?: number; h?: number; lid?: string; facing?: number; parent?: THREE.Object3D } = {}
) {
  const r = o.r ?? 4.5
  const h = o.h ?? 10
  const neck = r - 0.7
  b.lathe(
    [
      [0, 0],
      [r, 0],
      [r, h - 0.7],
      [neck, h - 0.3],
      [neck, h],
      [0, h],
    ],
    b.pal.solid(C.pe, 'gloss'),
    base,
    { parent: o.parent }
  )
  b.cyl(r - 0.25, h * 0.22, b.pal.solid(o.lid ?? C.teal, 'gloss'), [base[0], base[1] + h + h * 0.11 - 0.3, base[2]], {
    parent: o.parent,
  })
  b.wrap(containerLabel(b.atlas, label.key, label), r + 0.04, h * 0.5, h * 0.44, base, {
    facets: 4,
    facing: o.facing ?? 0,
    parent: o.parent,
  })
}

/** Amber glass bottle with oil inside, black cap and label. */
export function addAmberBottle(
  b: DeviceBuilder,
  base: V3,
  label: ContainerLabel & { key: string },
  o: { r?: number; facing?: number; parent?: THREE.Object3D } = {}
) {
  const r = o.r ?? 3.6
  const body = r * 2.8
  const shoulder = r * 0.62
  const neckR = r * 0.4
  const neckH = r * 0.45
  const top = body + shoulder + neckH
  b.lathe(glassBottle(r, body, shoulder, neckR, neckH, 0.25), b.pal.glass('amber'), base, { parent: o.parent })
  b.lathe(fill(r - 0.32, 0.3, body * 0.72), b.pal.liquid(LIQ.amberOil, 0.4), base, { parent: o.parent })
  b.cyl(neckR + 0.35, neckH + 1.2, b.pal.solid(C.black), [base[0], base[1] + top + 0.1, base[2]], {
    parent: o.parent,
  })
  b.wrap(containerLabel(b.atlas, label.key, { accent: '#8a5a1c', ...label }), r + 0.05, body * 0.5, body * 0.46, base, {
    facets: 4,
    facing: o.facing ?? 0,
    parent: o.parent,
  })
}

/** Cosmetic cream jar; open jars show the product with a swirl. */
export function addCreamJar(
  b: DeviceBuilder,
  base: V3,
  label: ContainerLabel & { key: string },
  o: { color: string; open?: boolean; lid?: string; facing?: number; parent?: THREE.Object3D }
) {
  const r = 3
  const h = 3.4
  b.lathe(cup(r, h, 0.35, 0.6), b.pal.solid(C.white, 'gloss'), base, { parent: o.parent })
  if (o.open ?? true) {
    b.lathe(
      [
        [0, 0.6],
        [r - 0.4, 0.6],
        [r - 0.4, h - 0.5],
        [1.6, h - 0.15],
        [0.6, h + 0.25],
        [0, h + 0.5],
      ],
      b.pal.liquid(o.color, 0.4),
      base,
      { parent: o.parent }
    )
  } else {
    b.cyl(r + 0.15, 1.5, b.pal.solid(o.lid ?? C.teal, 'gloss'), [base[0], base[1] + h + 0.75, base[2]], {
      parent: o.parent,
    })
  }
  b.wrap(containerLabel(b.atlas, label.key, label), r + 0.04, 1.8, 1.7, base, {
    facets: 4,
    facing: o.facing ?? 0,
    parent: o.parent,
  })
}

/** Serum bottle with dropper: glass body, black collar, rubber bulb. */
export function addDropperBottle(
  b: DeviceBuilder,
  base: V3,
  label: ContainerLabel & { key: string },
  o: { color: string; amber?: boolean; bulb?: string; facing?: number; parent?: THREE.Object3D }
) {
  const top = 4.6 + 1.0 + 0.9
  b.lathe(glassBottle(1.6, 4.6, 1.0, 0.75, 0.9, 0.18), b.pal.glass(o.amber ? 'amber' : 'clear'), base, {
    parent: o.parent,
  })
  b.lathe(fill(1.32, 0.25, 3.7), b.pal.liquid(o.color, 0.5), base, { parent: o.parent })
  b.cyl(0.95, 1.4, b.pal.solid(C.black), [base[0], base[1] + top + 0.2, base[2]], { parent: o.parent })
  b.lathe(
    [
      [0, 0],
      [0.72, 0],
      [0.86, 0.8],
      [0.7, 1.9],
      [0.32, 2.5],
      [0, 2.6],
    ],
    b.pal.solid(o.bulb ?? C.tealDark, 'rubber'),
    [base[0], base[1] + top + 0.9, base[2]],
    { parent: o.parent, seg: 10 }
  )
  b.wrap(containerLabel(b.atlas, label.key, label), 1.64, 2.2, 2.4, base, {
    facets: 4,
    facing: o.facing ?? 0,
    parent: o.parent,
  })
}

/** Lotion pump bottle: PE body, collar, stem and actuator with nozzle. */
export function addPumpBottle(
  b: DeviceBuilder,
  base: V3,
  label: ContainerLabel & { key: string },
  o: { facing?: number; parent?: THREE.Object3D } = {}
) {
  const top = 8 + 1.4 + 0.8
  b.lathe(bottle(1.8, 8, 1.4, 0.8, 0.8), b.pal.solid(C.pe, 'gloss'), base, { parent: o.parent })
  b.cyl(1.15, 1.2, b.pal.solid(C.housingAlt), [base[0], base[1] + top + 0.2, base[2]], { parent: o.parent })
  b.cyl(0.32, 1.5, b.pal.solid(C.white), [base[0], base[1] + top + 1.5, base[2]], { parent: o.parent, seg: 8 })
  const yaw = (o.facing ?? 0) + Math.PI / 2
  const f = b.frame([base[0], base[1] + top + 2.7, base[2]], [0, yaw, 0], o.parent)
  b.box([1.4, 1.1, 1.4], b.pal.solid(C.white), [0, 0, 0], { parent: f })
  b.box([0.6, 0.6, 2.4], b.pal.solid(C.white), [0, 0.1, 1.6], { parent: f })
  b.wrap(containerLabel(b.atlas, label.key, label), 1.84, 4, 4.2, base, {
    facets: 4,
    facing: o.facing ?? 0,
    parent: o.parent,
  })
}

function rubberFeet(b: DeviceBuilder, xs: number[], zs: number[], r = 1.1, h = 0.6) {
  for (const x of xs) for (const z of zs) b.cyl(r, h, b.pal.solid(C.rubber, 'rubber'), [x, h / 2, z], { seg: 8 })
}

/* ------------------------------------------------------------------ */
/* Zone 1 · weighing and raw materials                                  */
/* ------------------------------------------------------------------ */

/** Where the balance's power inlet sits (cm, local) — the cable starts here. */
export const BALANCE_INLET: V3 = [5, 2.6, -18.2]

/**
 * Compact top-loading precision balance (≈20 × 31 × 9 cm): chamfered housing,
 * adjustable feet, sloped keypad with labelled keys, pan on a four-arm
 * support inside a low draft ring, level bubble and a rear power inlet.
 */
export function precisionBalance(pal: Palette): Device {
  const b = new DeviceBuilder('precision_balance', pal)
  const housing = pal.solid(C.housing)
  const alt = pal.solid(C.housingAlt)
  const steel = pal.solid(C.steel, 'metal')
  const panel = pal.solid(C.panel)
  const black = pal.solid(C.black)

  // Adjustable feet (rubber pad + threaded stem).
  for (const [x, z] of [[-7.8, -12.6], [7.8, -12.6], [-7.8, 12.6], [7.8, 12.6]] as [number, number][]) {
    b.cyl(1.3, 0.5, pal.solid(C.rubber, 'rubber'), [x, 0.25, z], { seg: 10 })
    b.cyl(0.45, 0.7, steel, [x, 0.85, z], { seg: 6 })
  }

  // Housing: lower shell, chamfered upper deck, accent line.
  b.box([20, 4.2, 31], housing, [0, 3.2, 0])
  // Raised deck behind the keypad (the keypad slopes down in front of it).
  b.box([19, 1.2, 21], housing, [0, 5.9, -4.7])
  for (const x of [-9.75, 9.75]) b.box([0.5, 1.0, 20.6], alt, [x, 5.6, -4.7], { rot: [0, 0, x < 0 ? 0.6 : -0.6] })
  b.box([20.1, 0.45, 0.3], pal.solid(C.teal), [0, 1.6, 15.55])
  for (const x of [-10.05, 10.05]) b.box([0.12, 0.45, 26], pal.solid(C.teal), [x, 1.6, 0])

  // Sloped keypad: bezel, display, four keys and their printed names.
  const p = b.frame([0, 5.9, 11.0], [0.42, 0, 0])
  b.box([19.4, 1.2, 6.6], panel, [0, 0, 0], { parent: p })
  b.box([11.2, 0.2, 4.9], pal.solid('#161d22'), [-3.7, 0.65, -0.3], { parent: p })
  b.plane(displayCell(pal.atlas, 'balance', { main: '12.480', unit: 'g', sub: 'tare 1.912 g · stable' }), 10.4, 4.3, [-3.7, 0.77, -0.3], pal.display, {
    parent: p,
    rot: FACE_UP,
  })
  ;[2.9, 4.65, 6.4, 8.15].forEach((x, i) => {
    b.box([1.45, 0.45, 1.6], pal.solid(i === 3 ? C.teal : '#d5dce1', 'gloss'), [x, 0.8, -0.9], { parent: p })
  })
  b.plane(textStrip(pal.atlas, 'balance-keys', ['ON', 'CAL', 'MENU', '→0←'], '#c7d2d8', C.panel), 7.0, 1.3, [5.5, 0.62, 1.3], pal.label, {
    parent: p,
    rot: FACE_UP,
  })

  // Capacity plate on the deck (rating, not a certification).
  b.plane(textStrip(pal.atlas, 'balance-capacity', ['Max 620 g', 'd = 0.001 g'], '#4c5d68', '#eef1f3'), 7.5, 1.7, [-5.2, 6.52, 4.4], pal.label, {
    rot: FACE_UP,
  })

  // Pan on a four-arm support, inside a low clear draft ring.
  b.cyl(1.2, 0.8, steel, [0, 6.9, -2.2], { seg: 10 })
  for (let i = 0; i < 4; i++) {
    b.box([8.6, 0.35, 0.8], steel, [0, 7.3, -2.2], { rot: [0, (i * Math.PI) / 4 + Math.PI / 8, 0] })
  }
  b.cyl(6.2, 0.45, steel, [0, 7.65, -2.2], { seg: 18 })
  b.cyl(6.25, 0.15, pal.solid(C.steelDark, 'metal'), [0, 7.92, -2.2], { seg: 18, rTop: 5.9 })
  b.lathe(
    [
      [7.7, 0],
      [7.7, 3.4],
      [7.45, 3.4],
      [7.45, 0],
    ],
    pal.glass('clear'),
    [0, 6.5, -2.2],
    { seg: 18 }
  )

  // Weighing boat with powder on the pan.
  b.cyl(3.0, 1.2, pal.solid(C.white, 'gloss'), [0, 8.6, -2.2], { seg: 4, rTop: 4.2, rot: [0, Math.PI / 4, 0] })
  b.cyl(2.0, 0.9, pal.solid('#f1eee6'), [0.3, 9.65, -2.0], { seg: 7, rTop: 0.15 })

  // Level bubble.
  b.cyl(1.1, 0.35, alt, [6.6, 6.65, -12.6], { seg: 12 })
  b.cyl(0.85, 0.4, pal.glass('clear'), [6.6, 6.9, -12.6], { seg: 12 })
  b.cyl(0.32, 0.2, pal.solid('#7fd1c7'), [6.8, 6.95, -12.5], { seg: 8 })

  // Rear power inlet with the cable connector pushed in.
  b.box([3.2, 2.4, 0.4], panel, [BALANCE_INLET[0], BALANCE_INLET[1], -15.7])
  b.box([2.4, 1.9, 1.8], black, [BALANCE_INLET[0], BALANCE_INLET[1], -16.7])
  b.cyl(0.45, 1.0, black, [BALANCE_INLET[0], BALANCE_INLET[1], -17.8], { seg: 8, rTop: 0.65, rot: [Math.PI / 2, 0, 0] })
  return done(b)
}

/** A stack of three anti-static weighing boats. */
export function weighingBoats(pal: Palette): Device {
  const b = new DeviceBuilder('weighing_boats', pal)
  for (let i = 0; i < 3; i++) {
    b.cyl(3.0, 1.2, pal.solid(C.white, 'gloss'), [0, 0.6 + i * 0.55, 0], {
      seg: 4,
      rTop: 4.2,
      rot: [0, Math.PI / 4 + i * 0.05, 0],
    })
  }
  return done(b)
}

/** Steel cup holding spatulas. */
export function spatulaCup(pal: Palette): Device {
  const b = new DeviceBuilder('spatula_cup', pal)
  const steel = pal.solid(C.steel, 'metal')
  b.lathe(cup(3.2, 9, 0.3), steel, [0, 0, 0], { seg: 10 })
  const spatulas: [V3, V3][] = [
    [[-0.8, 1, 0.3], [0, 0, 0.12]],
    [[0.9, 1, -0.5], [0, 0.6, -0.1]],
    [[0.1, 1, 0.9], [0.12, 1.2, 0]],
  ]
  for (const [pos, rot] of spatulas) {
    const f = b.frame(pos, rot)
    b.box([0.8, 16, 0.25], steel, [0, 8, 0], { parent: f })
    b.box([1.6, 3, 0.2], steel, [0, 16.5, 0], { parent: f })
  }
  return done(b)
}

const RAW: (ContainerLabel & { key: string; lid: string })[] = [
  { key: 'rm-glycerin', code: 'RM-001 · humectant', name: 'GLYCERIN', sub: 'lot 2026-10A · 1 kg', lid: C.teal },
  { key: 'rm-cetearyl', code: 'RM-004 · emulsifier', name: 'CETEARYL ALCOHOL', sub: 'flakes · 500 g', lid: '#d9a441' },
  { key: 'rm-xanthan', code: 'RM-007 · thickener', name: 'XANTHAN GUM', sub: 'powder · 250 g', lid: '#7d8a93' },
  { key: 'rm-niacinamide', code: 'RM-011 · active', name: 'NIACINAMIDE', sub: 'powder · 250 g', lid: '#3f74c9' },
  { key: 'rm-hyaluronate', code: 'RM-015 · humectant', name: 'SODIUM HYALURONATE', sub: 'powder · 50 g', lid: '#7e5bb5' },
  { key: 'rm-panthenol', code: 'RM-025 · conditioning', name: 'PANTHENOL', sub: 'liquid · 250 g', lid: C.teal },
]
const AMBER: (ContainerLabel & { key: string })[] = [
  { key: 'rm-tocopherol', code: 'RM-040 · antioxidant', name: 'TOCOPHEROL', sub: 'oil · 100 ml' },
  { key: 'rm-squalane', code: 'RM-018 · emollient', name: 'SQUALANE', sub: 'oil · 250 ml' },
  { key: 'rm-cct', code: 'RM-022 · emollient', name: 'CAPRYLIC/CAPRIC TG', sub: 'oil · 250 ml' },
  { key: 'rm-phenoxy', code: 'RM-044 · preservative', name: 'PHENOXYETHANOL', sub: 'liquid · 100 ml' },
]

/** Labelled raw materials for the top shelf of the left shelving unit. */
export function rawMaterialShelf(pal: Palette): Device {
  const b = new DeviceBuilder('raw_materials', pal)
  RAW.forEach((l, i) => addTub(b, [-45 + i * 18, 0, -12], l, { lid: l.lid }))
  AMBER.forEach((l, i) => addAmberBottle(b, [-45 + i * 14, 0, 7], l))
  addTub(b, [20, 0, 7], { key: 'rm-allantoin', code: 'RM-031 · soothing', name: 'ALLANTOIN', sub: 'powder · 100 g' }, { r: 3.4, h: 7, lid: '#d9a441' })
  addTub(b, [34, 0, 7], { key: 'rm-bisabolol', code: 'RM-048 · soothing', name: 'BISABOLOL', sub: 'liquid · 50 g' }, { r: 3.4, h: 7, lid: '#7d8a93' })
  return done(b)
}

/** Bulk humectant / water-phase tubs on the lower shelf. */
export function rawMaterialBulk(pal: Palette): Device {
  const b = new DeviceBuilder('raw_materials_bulk', pal)
  addTub(b, [-7, 0, 0], { key: 'rm-glycerin-bulk', code: 'RM-001 · humectant', name: 'GLYCERIN', sub: 'bulk · 5 kg' }, { r: 6, h: 14 })
  addTub(b, [8, 0, 0], { key: 'rm-propanediol', code: 'RM-003 · humectant', name: 'PROPANEDIOL', sub: 'bulk · 5 kg' }, { r: 6, h: 14, lid: '#7d8a93' })
  return done(b)
}

/** Materials in use beside the balance. */
export function weighingSupplies(pal: Palette): Device {
  const b = new DeviceBuilder('weighing_supplies', pal)
  addAmberBottle(b, [-14, 0, 0], AMBER[0])
  addTub(b, [-1, 0, 0], RAW[3], { lid: RAW[3].lid })
  addTub(b, [12, 0, 0], RAW[2], { lid: RAW[2].lid })
  return done(b)
}

/* ------------------------------------------------------------------ */
/* Zone 2 · mixing and formulation                                      */
/* ------------------------------------------------------------------ */

/** Box whose top edges are chamfered (low-poly "rounded" housing). `at` = [x, bottom y, z]. */
function chamferBox(b: DeviceBuilder, w: number, h: number, d: number, material: THREE.Material, at: V3, c: number, parent?: THREE.Object3D) {
  const [x, y0, z] = at
  b.box([w, h - c, d], material, [x, y0 + (h - c) / 2, z], { parent })
  b.box([w - 2 * c, c, d - 2 * c], material, [x, y0 + h - c / 2, z], { parent })
  const s = c * Math.SQRT2
  for (const sz of [-1, 1]) b.box([w - 2 * c, s, s], material, [x, y0 + h - c, z + sz * (d / 2 - c)], { rot: [Math.PI / 4, 0, 0], parent })
  for (const sx of [-1, 1]) b.box([s, s, d - 2 * c], material, [x + sx * (w / 2 - c), y0 + h - c, z], { rot: [0, 0, Math.PI / 4], parent })
}

/** Thumb screw: threaded stem plus knurled knob, pointing along +x of its frame. */
function thumbScrew(b: DeviceBuilder, pos: V3, rot: V3, size = 1) {
  const f = b.frame(pos, rot)
  b.cyl(0.22 * size, 1.6 * size, b.pal.solid(C.steel, 'metal'), [0.8 * size, 0, 0], { seg: 6, rot: [0, 0, Math.PI / 2], parent: f })
  b.cyl(0.75 * size, 0.6 * size, b.pal.solid('#3a444c'), [1.8 * size, 0, 0], { seg: 8, rot: [0, 0, Math.PI / 2], parent: f })
}

/** Control knob with skirt, grip fin and indicator, on a frame's +y face. */
function knob(b: DeviceBuilder, parent: THREE.Object3D, pos: V3, r = 1.6) {
  b.cyl(r + 0.5, 0.3, b.pal.solid('#3a444c'), [pos[0], pos[1] + 0.15, pos[2]], { seg: 12, parent })
  b.cyl(r, 1.3, b.pal.solid(C.black), [pos[0], pos[1] + 0.95, pos[2]], { seg: 10, parent })
  b.box([0.45, 0.55, r * 1.7], b.pal.solid(C.black), [pos[0], pos[1] + 1.8, pos[2]], { parent })
  b.box([0.3, 0.12, 0.9], b.pal.solid(C.white), [pos[0], pos[1] + 2.1, pos[2] + r * 0.45], { parent })
}

/**
 * Hot-plate magnetic stirrer (≈22 × 10.5 × 33 cm, 18 cm ceramic plate):
 * chamfered housing, framed plate with hot-surface mark, two knobs with
 * legends and LEDs, rear rod boss with support rod, cross clamp, probe holder
 * and temperature probe, rear inlet and probe socket.
 */
export function hotplateStirrer(pal: Palette): Device {
  const b = new DeviceBuilder('hotplate_stirrer', pal)
  const steel = pal.solid(C.steel, 'metal')
  const black = pal.solid(C.black)
  const panel = pal.solid(C.panel)
  rubberFeet(b, [-9, 9], [-14, 14])
  chamferBox(b, 22, 7.6, 33, pal.solid(C.housing), [0, 0.6, 0], 0.8)
  b.box([22.1, 0.5, 0.3], pal.solid(C.teal), [0, 2.0, 16.55])

  // Plate seat, ceramic plate, steel frame, hot-surface mark.
  b.box([20, 0.8, 20], pal.solid(C.housingAlt), [0, 8.6, -5.5])
  b.box([18, 0.45, 18], pal.solid(C.ceramic, 'gloss'), [0, 9.2, -5.5])
  for (const z of [-14.7, 3.7]) b.box([18.8, 0.55, 0.4], steel, [0, 9.2, z])
  for (const x of [-9.2, 9.2]) b.box([0.4, 0.55, 18.8], steel, [x, 9.2, -5.5])
  b.cyl(1.2, 0.1, pal.solid('#f0a030'), [8.2, 9.05, 4.6], { seg: 3, rot: [0, Math.PI, 0] })

  // Control panel: knobs with legends, LEDs, display.
  const p = b.frame([0, 8.0, 11.6], [0.3, 0, 0])
  b.box([21, 1.0, 8.6], panel, [0, 0, 0], { parent: p })
  knob(b, p, [-6.6, 0.5, 0.2])
  knob(b, p, [6.6, 0.5, 0.2])
  b.box([7.8, 0.2, 3.8], pal.solid('#161d22'), [0, 0.55, -0.4], { parent: p })
  b.plane(displayCell(pal.atlas, 'hotplate', { main: '75.0', unit: '°C', sub: 'stir 600 rpm' }), 7.2, 3.3, [0, 0.67, -0.4], pal.display, {
    parent: p,
    rot: FACE_UP,
  })
  b.plane(textStrip(pal.atlas, 'hotplate-legend', ['HEAT', '', 'STIR'], '#c7d2d8', C.panel), 19.8, 1.3, [0, 0.52, 3.55], pal.label, {
    parent: p,
    rot: FACE_UP,
  })
  b.box([0.7, 0.2, 0.7], pal.solid('#3ec46d', 'gloss'), [-2.9, 0.6, 2.0], { parent: p })
  b.box([0.7, 0.2, 0.7], pal.solid('#f0a030', 'gloss'), [2.9, 0.6, 2.0], { parent: p })

  // Rear: power inlet and probe socket.
  b.box([3.2, 2.4, 0.4], panel, [-6, 2.6, -16.6])
  b.box([2.4, 1.9, 1.0], black, [-6, 2.55, -16.9])
  b.box([1.8, 1.8, 0.5], panel, [4, 6, -16.6])

  // Support rod in its boss, cross clamp, arm, probe holder, probe.
  b.box([3.2, 3.2, 3.2], pal.solid(C.housingAlt), [8.5, 9.4, -15])
  b.cyl(0.9, 0.8, steel, [8.5, 11.4, -15], { seg: 8 })
  b.cyl(0.6, 38, steel, [8.5, 30.6, -15], { seg: 8 })
  b.cyl(0.7, 0.5, black, [8.5, 49.85, -15], { seg: 8 })
  b.box([2.6, 2.6, 2.6], black, [8.5, 30, -15])
  thumbScrew(b, [9.8, 30, -15], [0, 0, 0])
  b.tube([[8.5, 30, -15], [5.4, 30, -10.3], [2.2, 30, -5.5]], 0.35, steel)
  b.box([1.9, 1.9, 1.9], black, [2.2, 30, -5.5])
  thumbScrew(b, [2.2, 30, -4.55], [0, -Math.PI / 2, 0], 0.7)
  b.cyl(0.6, 3.2, black, [2.2, 32.6, -5.5], { seg: 8 })
  b.cyl(0.28, 17.5, steel, [2.2, 21.2, -5.5], { seg: 6 })
  b.tube([[2.2, 34.2, -5.5], [4.5, 38, -9.5], [9, 34, -16], [6, 14, -17.6], [4, 6, -17]], 0.3, black)

  // 600 ml beaker: heated oil phase, vortex from the stir bar.
  addBeaker(b, [0, 9.425, -5.5], { R: 4.6, H: 12, fillTo: 8.6, color: LIQ.oilPhase, glow: 0.5, dip: 1.6 })
  return done(b)
}

/**
 * Overhead stirrer on a plate stand (motor ≈ 8.8 × 29 × 21 cm): chamfered plate
 * with rod boss, rod with cap, boss head with two thumb screws, extension arm,
 * motor housing with recessed front panel, speed knob, side vents and switch,
 * keyed chuck turning with the shaft, mixing a 2 L emulsion batch.
 */
export function overheadStirrer(pal: Palette): Device {
  const b = new DeviceBuilder('overhead_stirrer', pal)
  const steel = pal.solid(C.steel, 'metal')
  const black = pal.solid(C.black)
  const panel = pal.solid(C.panel)
  rubberFeet(b, [-10, 10], [-18, 10], 1.1, 0.5)
  chamferBox(b, 24, 2.2, 32, pal.solid(C.stand), [0, 0.5, -4], 0.6)

  // Rod, boss head, arm.
  b.cyl(1.6, 1.4, steel, [0, 3.4, -16], { seg: 10 })
  b.cyl(0.8, 61, steel, [0, 34.6, -16], { seg: 8 })
  b.cyl(0.95, 0.6, black, [0, 65.4, -16], { seg: 8 })
  b.box([3.6, 3.6, 3.6], black, [0, 44, -16])
  thumbScrew(b, [1.8, 44, -16], [0, 0, 0])
  thumbScrew(b, [0, 45.8, -16], [0, 0, Math.PI / 2])
  b.cyl(0.65, 9, steel, [0, 44, -11.5], { seg: 8, rot: [Math.PI / 2, 0, 0] })

  // Motor housing.
  chamferBox(b, 8.8, 25, 14, pal.solid(C.housing), [0, 24.5, 0], 0.7)
  b.box([9.0, 1.2, 14.2], pal.solid(C.teal), [0, 50.1, 0])
  b.box([5.6, 0.45, 0.9], pal.solid(C.tealDark), [0, 50.9, 0])
  b.box([7.2, 11, 0.3], panel, [0, 40.5, 7.05])
  b.plane(displayCell(pal.atlas, 'overhead', { main: '450', unit: 'rpm', sub: 'mixing 12:40' }), 6.2, 3.0, [0, 43.6, 7.22], pal.display)
  const front = b.frame([0, 38.4, 7.2], [Math.PI / 2, 0, 0])
  knob(b, front, [0, 0, 0], 1.35)
  b.plane(textStrip(pal.atlas, 'overhead-legend', ['SPEED'], '#c7d2d8', C.panel), 4.4, 1.1, [0, 35.6, 7.22], pal.label)
  b.box([0.6, 0.6, 0.2], pal.solid('#3ec46d', 'gloss'), [2.6, 41.2, 7.25])
  for (const x of [-4.42, 4.42]) for (let i = 0; i < 5; i++) b.box([0.15, 0.45, 7], panel, [x, 27.2 + i * 1.1, -1])
  b.box([0.5, 1.8, 1.2], black, [4.55, 31.5, 4.2])
  b.box([0.4, 1.1, 0.8], pal.solid('#e8583f', 'gloss'), [4.75, 31.6, 4.2], { rot: [0.25, 0, 0] })
  b.cyl(0.6, 1.2, black, [2.5, 26, -7.4], { seg: 8, rot: [Math.PI / 2, 0, 0] })
  b.tube([[2.5, 26, -7.8], [3, 22, -12], [3, 8, -17.5], [3, 3, -20.5]], 0.3, black)

  // Hex collar (fixed), then the turning chuck and shaft.
  b.cyl(1.9, 1.0, steel, [0, 24, 0], { seg: 6 })
  const shaft = b.spin([0, 0, 0], 7)
  b.cyl(1.6, 3, steel, [0, 22, 0], { seg: 10, parent: shaft })
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3
    b.box([0.5, 1.1, 0.6], pal.solid(C.steelDark, 'metal'), [Math.sin(a) * 0.8, 20.2, Math.cos(a) * 0.8], { parent: shaft, rot: [0, a, 0] })
  }
  b.cyl(0.4, 18, steel, [0, 11.4, 0], { seg: 6, parent: shaft })
  b.box([1.3, 0.9, 0.5], steel, [0.55, 18.8, 0], { parent: shaft })
  for (let i = 0; i < 4; i++) {
    const blade = b.frame([0, 4.8, 0], [0, (i * Math.PI) / 2, 0], shaft)
    b.box([3.0, 0.25, 1.1], steel, [1.8, 0, 0], { parent: blade, rot: [0.4, 0, 0] })
  }
  addBeaker(b, [0, 2.7, 0], { R: 6.5, H: 17, fillTo: 11, color: LIQ.cream, glow: 0.4, dip: 1.0 })
  return done(b)
}

/** Spare beakers: an empty 250 ml and a 400 ml with gel phase and a stirring rod. */
export function mixingGlassware(pal: Palette): Device {
  const b = new DeviceBuilder('mixing_glassware', pal)
  addBeaker(b, [-4.5, 0, 0], { R: 3.4, H: 9.5 })
  addBeaker(b, [4.2, 0, 1], { R: 4.1, H: 11, fillTo: 5.4, color: LIQ.gel, glow: 0.6 })
  const rod = b.frame([4.6, 0.6, 1], [0, 0, -0.3])
  b.cyl(0.28, 17, pal.glass('clear'), [0, 8.5, 0], { seg: 6, parent: rod })
  return done(b)
}

/** Squeeze wash bottle with bent nozzle. */
export function washBottle(pal: Palette): Device {
  const b = new DeviceBuilder('wash_bottle', pal)
  const top = 11 + 1.5 + 1.0
  b.lathe(bottle(3.0, 11, 1.5, 1.2, 1.0), pal.solid('#e6eef2', 'gloss'), [0, 0, 0])
  b.cyl(1.45, 1.8, pal.solid('#3f74c9', 'gloss'), [0, top + 0.6, 0])
  b.tube([[0, top + 1.4, 0], [0, top + 4.6, 0], [1.4, top + 6.0, 0.3], [4.4, top + 5.0, 0.8], [5.6, top + 3.6, 0.9]], 0.32, pal.solid('#e6eef2', 'gloss'))
  b.wrap(containerLabel(pal.atlas, 'wash-di', { code: 'RINSE', name: 'DI WATER', sub: 'refill daily', accent: '#3f74c9' }), 3.04, 4.6, 5.4, [0, 0, 0], {
    facets: 4,
  })
  return done(b)
}

/* ------------------------------------------------------------------ */
/* Zone 3 · basic sample checks                                         */
/* ------------------------------------------------------------------ */

/**
 * Benchtop pH meter: chamfered housing, sloped deck with display, keypad and
 * legends, status LED, rear connector panel (BNC + temperature + power), and a
 * stand-alone electrode arm (weighted base, rod, two-segment arm with joints,
 * two-hole holder) carrying a pH electrode and a temperature probe in the sample.
 */
export function phMeter(pal: Palette): Device {
  const b = new DeviceBuilder('ph_meter', pal)
  const steel = pal.solid(C.steel, 'metal')
  const black = pal.solid(C.black)
  const panel = pal.solid(C.panel)
  rubberFeet(b, [-8, 8], [-6.5, 6.5])
  chamferBox(b, 20, 4.2, 16, pal.solid(C.housing), [0, 0.6, 0], 0.7)
  b.box([20.1, 0.5, 0.3], pal.solid(C.teal), [0, 1.6, 8.05])

  const p = b.frame([0, 5.25, 0.6], [0.24, 0, 0])
  b.box([19.4, 1.3, 13.4], pal.solid(C.housingAlt), [0, 0, 0], { parent: p })
  b.box([11.2, 0.2, 5.8], pal.solid('#161d22'), [-3.2, 0.68, -1.2], { parent: p })
  b.plane(displayCell(pal.atlas, 'ph', { main: 'pH 5.42', sub: '25.0 °C · sample V2-A' }), 10.6, 5.2, [-3.2, 0.8, -1.2], pal.display, {
    parent: p,
    rot: FACE_UP,
  })
  b.plane(textStrip(pal.atlas, 'ph-legend', ['CAL', 'READ', 'MODE'], '#4c5d68', C.housingAlt), 9.0, 1.1, [-3.2, 0.66, 2.6], pal.label, {
    parent: p,
    rot: FACE_UP,
  })
  const keys: [number, number, string][] = [
    [4.6, -4.0, '#e9eef1'],
    [7.4, -4.0, '#e9eef1'],
    [4.6, -1.6, '#e9eef1'],
    [7.4, -1.6, '#e9eef1'],
    [4.6, 0.8, '#e9eef1'],
    [7.4, 0.8, '#e9eef1'],
  ]
  for (const [x, z, color] of keys) b.box([2.0, 0.5, 1.6], pal.solid(color, 'gloss'), [x, 0.85, z], { parent: p })
  b.box([4.8, 0.55, 1.8], pal.solid(C.teal, 'gloss'), [6.0, 0.88, 3.4], { parent: p })
  b.box([0.6, 0.2, 0.6], pal.solid('#3ec46d', 'gloss'), [-8.6, 0.7, -5.4], { parent: p })

  // Rear connector panel: electrode (BNC), temperature, power.
  b.box([11, 2.6, 0.3], panel, [-2, 2.8, -8.15])
  b.cyl(0.6, 0.9, steel, [-5.5, 2.8, -8.7], { seg: 8, rot: [Math.PI / 2, 0, 0] })
  b.cyl(0.45, 0.9, steel, [-3.4, 2.8, -8.7], { seg: 8, rot: [Math.PI / 2, 0, 0] })
  b.box([2.0, 1.6, 0.8], black, [0, 2.8, -8.6])

  // Electrode arm: weighted base, rod, two-segment arm with joints, holder.
  b.cyl(3.6, 1.4, pal.solid(C.stand), [-14, 0.7, 1])
  b.cyl(3.7, 0.3, pal.solid(C.rubber, 'rubber'), [-14, 0.15, 1])
  b.cyl(1.0, 1.0, steel, [-14, 1.9, 1], { seg: 8 })
  b.cyl(0.55, 27, steel, [-14, 15.9, 1], { seg: 8 })
  b.cyl(0.65, 0.5, black, [-14, 29.65, 1], { seg: 8 })
  b.box([2.2, 2.6, 2.2], black, [-14, 26.5, 1])
  thumbScrew(b, [-12.9, 26.5, 1], [0, 0, 0], 0.7)
  b.box([1.4, 1.2, 4.6], black, [-14, 26.5, 3.4])
  b.cyl(1.0, 1.6, pal.solid('#3a444c'), [-14, 26.5, 5.8], { seg: 10 })
  b.box([1.4, 1.2, 4.2], black, [-14, 26.5, 8.0])
  b.box([5.4, 1.8, 2.8], black, [-13.8, 26.5, 10.4])

  // pH electrode: cap, glass body with inner element and fill port, bulb.
  b.cyl(0.85, 3.2, pal.solid('#2e3a44'), [-15, 29.0, 10.4], { seg: 8 })
  b.cyl(0.6, 25.5, pal.glass('clear'), [-15, 14.75, 10.4], { seg: 8 })
  b.cyl(0.26, 22, pal.solid('#dfe9ee'), [-15, 15.5, 10.4], { seg: 6 })
  b.cyl(0.3, 0.6, pal.solid(C.white), [-14.45, 23.5, 10.4], { seg: 6, rot: [0, 0, Math.PI / 2] })
  b.mesh(new THREE.IcosahedronGeometry(0.75, 0), pal.glass('clear'), [-15, 2.0, 10.4])
  // Temperature probe: handle and steel sheath.
  b.cyl(0.55, 4, black, [-12.6, 26.6, 10.4], { seg: 8 })
  b.cyl(0.3, 21, steel, [-12.6, 14.1, 10.4], { seg: 6 })
  // Cables to the rear sockets.
  b.tube([[-15, 30.6, 10.4], [-15.5, 35, 6], [-11, 31, -4], [-7, 12, -9.6], [-5.5, 2.8, -9.2]], 0.3, black)
  b.tube([[-12.6, 28.6, 10.4], [-11.5, 33, 7], [-8.5, 29, -3], [-4.5, 11, -9.8], [-3.4, 2.8, -9.2]], 0.26, black)

  addBeaker(b, [-13.8, 0, 10.4], { R: 2.8, H: 7, fillTo: 4.6, color: LIQ.lotion, glow: 0.42, graduated: false })
  return done(b)
}

/** pH calibration buffers (standard values, not a claim about any product). */
export function phBuffers(pal: Palette): Device {
  const b = new DeviceBuilder('ph_buffers', pal)
  const buffers: [string, string, string][] = [
    ['4.01', '#c9533f', 'buffer-4'],
    ['7.00', '#3e9a5b', 'buffer-7'],
    ['10.01', '#3f74c9', 'buffer-10'],
  ]
  buffers.forEach(([value, color, key], i) => {
    const base: V3 = [-5.2 + i * 5.2, 0, 0]
    b.lathe(bottle(2.1, 6, 1.0, 0.9, 0.8), pal.solid(C.pe, 'gloss'), base)
    b.cyl(1.05, 1.4, pal.solid(color, 'gloss'), [base[0], 7.9, base[2]], { seg: 12 })
    b.wrap(containerLabel(pal.atlas, key, { code: 'CALIBRATION', name: `pH ${value}`, sub: 'buffer · 25 °C', accent: color }), 2.14, 3.2, 3.2, base, {
      facets: 4,
    })
  })
  return done(b)
}

/**
 * Rotational viscometer on a rack-and-pinion lab stand: base with levelling
 * screws, rod with toothed rack, carriage with height knob, head with display,
 * keys, legends and level bubble, spindle (turning) with guard leg, and a
 * temperature probe in the cream sample.
 */
export function viscometer(pal: Palette): Device {
  const b = new DeviceBuilder('viscometer', pal)
  const steel = pal.solid(C.steel, 'metal')
  const black = pal.solid(C.black)
  const panel = pal.solid(C.panel)
  for (const [x, z] of [[-8, -12], [8, -12], [0, 8.5]] as [number, number][]) {
    b.cyl(1.0, 0.5, black, [x, 0.25, z], { seg: 8 })
    b.cyl(1.3, 0.7, pal.solid('#3a444c'), [x, 0.85, z], { seg: 10 })
  }
  chamferBox(b, 20, 2.2, 24, pal.solid(C.stand), [0, 1.2, -2], 0.6)
  b.box([2.2, 1.6, 0.8], black, [-4, 2.4, -14.2])

  // Rod with rack, carriage and height knob.
  b.cyl(1.8, 1.2, steel, [0, 4.0, -11], { seg: 10 })
  b.cyl(1.0, 41, steel, [0, 25.1, -11], { seg: 8 })
  b.cyl(1.15, 0.6, black, [0, 45.9, -11], { seg: 8 })
  b.box([0.9, 22, 0.5], pal.solid('#5d6870', 'metal'), [0, 29, -9.85])
  b.box([4.6, 6, 4.6], black, [0, 33, -11])
  b.cyl(1.8, 1.2, pal.solid('#3a444c'), [3.0, 33, -11], { seg: 10, rot: [0, 0, Math.PI / 2] })
  b.cyl(0.6, 1.4, black, [4.2, 33, -11], { seg: 8, rot: [0, 0, Math.PI / 2] })
  thumbScrew(b, [-2.3, 31.5, -11], [0, Math.PI, 0], 0.8)
  b.box([3, 2.4, 6], black, [0, 33, -6.5])

  // Head.
  chamferBox(b, 15, 14, 11, pal.solid(C.housing), [0, 26, 2], 0.8)
  b.box([15.3, 0.9, 11.3], pal.solid(C.teal), [0, 40.45, 2])
  b.box([13, 11, 0.3], panel, [0, 33.5, 7.6])
  b.box([11.6, 5.8, 0.2], pal.solid('#161d22'), [0, 35.6, 7.8])
  b.plane(displayCell(pal.atlas, 'visc', { main: '4,850', unit: 'cP', sub: 'spindle 04 · 20 rpm' }), 11, 5.2, [0, 35.6, 7.92], pal.display)
  for (let i = 0; i < 4; i++) b.box([2.2, 1.1, 0.5], pal.solid(i === 3 ? C.teal : '#d5dce1', 'gloss'), [-4.5 + i * 3, 31.3, 7.85])
  b.plane(textStrip(pal.atlas, 'visc-legend', ['MOTOR', 'SPEED', 'SPDL', 'AUTO'], '#c7d2d8', C.panel), 12, 1.2, [0, 29.6, 7.78], pal.label)
  b.cyl(1.1, 0.4, pal.solid(C.housingAlt), [5, 41.1, -1.5], { seg: 12 })
  b.cyl(0.85, 0.45, pal.glass('clear'), [5, 41.4, -1.5], { seg: 12 })
  b.cyl(0.32, 0.2, pal.solid('#7fd1c7'), [5.2, 41.45, -1.4], { seg: 8 })
  b.box([0.4, 1.4, 1.4], black, [-7.7, 28, 3])
  b.cyl(1.3, 2.2, steel, [0, 24.9, 2], { seg: 10 })

  // Guard leg and turning spindle.
  b.tube([[4.0, 25.6, 2], [4.0, 15, 2], [4.0, 6.8, 2], [0.4, 6.3, 2]], 0.25, steel)
  const spindle = b.spin([0, 0, 2], 2.2)
  b.cyl(0.28, 15, steel, [0, 16.3, 0], { seg: 6, parent: spindle })
  b.box([1.1, 0.7, 0.45], steel, [0.45, 21, 0], { parent: spindle })
  b.cyl(2.0, 0.5, steel, [0, 8.4, 0], { seg: 12, parent: spindle })

  // Temperature probe into the sample, cable to the head's side port.
  b.cyl(0.5, 2, black, [-2.6, 18, 3.2], { seg: 8 })
  b.cyl(0.25, 10, steel, [-2.6, 12, 3.2], { seg: 6 })
  b.tube([[-2.6, 19, 3.2], [-6, 22.5, 4], [-8.2, 27, 3], [-7.9, 28, 3]], 0.22, black)

  addBeaker(b, [0, 3.4, 2], { R: 4.6, H: 12, fillTo: 9.6, color: LIQ.cream, glow: 0.4 })
  return done(b)
}

/* ------------------------------------------------------------------ */
/* Zone 4 · filling and sample comparison                               */
/* ------------------------------------------------------------------ */

const VERSIONS = [
  { tag: 'V1', key: 'v1', color: '#5b6b77', cream: LIQ.cream, serum: LIQ.serum },
  { tag: 'V2-A', key: 'v2a', color: C.teal, cream: LIQ.creamLight, serum: LIQ.serumLight },
  { tag: 'V2-B', key: 'v2b', color: '#7e5bb5', cream: LIQ.gelCream, serum: LIQ.serumGreen },
]

/** Labelled comparison tray: one column per formula version (jar, serum dropper, pump). */
export function sampleTray(pal: Palette): Device {
  const b = new DeviceBuilder('sample_tray', pal)
  const tray = pal.solid(C.white, 'gloss')
  b.box([31, 0.8, 21], tray, [0, 0.4, 0])
  for (const z of [-10.2, 10.2]) b.box([31, 2.6, 0.6], tray, [0, 1.3, z])
  for (const x of [-15.2, 15.2]) b.box([0.6, 2.6, 21], tray, [x, 1.3, 0])
  for (const x of [-5.15, 5.15]) b.box([0.4, 1.8, 19.8], pal.solid(C.housingAlt), [x, 1.7, 0])

  VERSIONS.forEach((v, i) => {
    const x = -10.2 + i * 10.2
    b.plane(tagCell(pal.atlas, v.key, v.tag, v.color), 6, 1.9, [x, 1.35, 10.52], pal.label)
    addCreamJar(b, [x, 0.8, 5.0], { key: `jar-${v.key}`, code: `RL-S-031 · ${v.tag}`, name: 'MOISTURE CREAM', sub: 'sample 50 g', accent: v.color }, { color: v.cream })
    addDropperBottle(b, [x - 1.6, 0.8, -1.4], { key: `serum-${v.key}`, code: v.tag, name: 'SERUM', sub: 'RL-S-032', accent: v.color }, { color: v.serum, amber: i === 0 })
    addPumpBottle(b, [x + 2.4, 0.8, -6.2], { key: `lotion-${v.key}`, code: v.tag, name: 'LOTION', sub: 'RL-S-033', accent: v.color })
  })
  return done(b)
}

/** Open batch record with a pen. */
export function batchNotebook(pal: Palette): Device {
  const b = new DeviceBuilder('batch_notebook', pal)
  b.box([22.4, 0.5, 15.6], pal.solid(C.cover), [0, 0.25, 0])
  for (const x of [-5.45, 5.45]) b.box([10.8, 0.7, 14.8], pal.solid(C.paper, 'paper'), [x, 0.85, 0])
  b.plane(notebookCell(pal.atlas), 21.6, 14.6, [0, 1.215, 0], pal.label, { rot: FACE_UP })
  const pen = b.frame([7, 1.65, 9.6], [0, 0.35, 0])
  b.cyl(0.45, 12, pal.solid(C.teal, 'gloss'), [0, 0, 0], { seg: 8, rot: [0, 0, Math.PI / 2], parent: pen })
  b.cyl(0.45, 1.6, pal.solid(C.black), [-6.8, 0, 0], { seg: 8, rTop: 0.1, rot: [0, 0, Math.PI / 2], parent: pen })
  return done(b)
}

/** Linear stand with three micropipettes, plus a tip box. */
export function pipetteStation(pal: Palette): Device {
  const b = new DeviceBuilder('pipette_station', pal)
  const housing = pal.solid(C.housing)
  b.box([17, 1.2, 8], pal.solid(C.housingAlt), [0, 0.6, 0])
  for (const x of [-7.6, 7.6]) b.box([1.2, 20, 1.2], housing, [x, 11.2, -2.6])
  b.box([16.4, 1.4, 1.4], housing, [0, 20.6, -2.6])
  const steel = pal.solid(C.steel, 'metal')
  ;[-4.6, 0, 4.6].forEach((x, i) => {
    b.cyl(0.75, 1.4, pal.solid([C.teal, '#d9a441', '#7e5bb5'][i], 'gloss'), [x, 23.3, -1.2], { seg: 8 })
    b.cyl(0.3, 1.6, steel, [x, 21.8, -1.2], { seg: 6 })
    b.lathe(
      [
        [0, 0],
        [0.85, 0],
        [1.15, 3.5],
        [1.25, 8.5],
        [1.05, 10],
        [0, 10],
      ],
      housing,
      [x, 11.6, -1.2],
      { seg: 8 }
    )
    b.box([1.2, 0.6, 2.2], housing, [x, 21.0, -2.2])
    b.cyl(0.45, 6, steel, [x, 8.6, -1.2], { seg: 6 })
    b.cyl(0.08, 4.2, pal.solid(C.tip, 'gloss'), [x, 3.5, -1.2], { seg: 6, rTop: 0.45 })
  })
  b.box([8.5, 3.6, 6.5], pal.solid('#2a8f95', 'gloss'), [13.5, 1.8, 0])
  b.box([8.7, 0.5, 6.7], pal.solid('#e6eef0', 'gloss'), [13.5, 3.85, 0])
  return done(b)
}

/* ------------------------------------------------------------------ */
/* Zone 5 · storage and cleanup                                         */
/* ------------------------------------------------------------------ */

/** Retained samples for the glass-door storage unit (three shelves, local y in cm). */
export function retainedSamples(pal: Palette, shelves: { top: number; middle: number }): Device {
  const b = new DeviceBuilder('retained_samples', pal)
  ;[-27, -9, 9, 27].forEach((x, i) => {
    const v = VERSIONS[i % 3]
    addCreamJar(
      b,
      [x, shelves.top, 2],
      { key: `ret-jar-${i}`, code: `RETAIN · ${v.tag}`, name: `RL-S-0${12 + i * 6}`, sub: `kept ${3 + i} NOV 2026`, accent: '#5b6b77' },
      { color: v.cream, open: false, lid: v.color }
    )
  })
  ;[-28, -20, -12].forEach((x, i) =>
    addDropperBottle(
      b,
      [x, shelves.middle, 2],
      { key: `ret-serum-${i}`, code: 'RETAIN', name: VERSIONS[i].tag, sub: 'RL-S-032', accent: '#5b6b77' },
      { color: VERSIONS[i].serum, amber: true }
    )
  )
  ;[2, 12, 22].forEach((x, i) => addPumpBottle(b, [x, shelves.middle, 2], { key: `ret-lotion-${i}`, code: 'RETAIN', name: VERSIONS[i].tag, sub: 'RL-S-033', accent: '#5b6b77' }))
  ;[-25, -12, 1].forEach((x, i) => addAmberBottle(b, [x, 0, 0], AMBER[(i + 1) % AMBER.length], { r: 3.2 }))
  b.box([12, 6, 9], pal.solid('#d9e2e6'), [20, 3, 0])
  b.plane(containerLabel(pal.atlas, 'ret-box', { code: 'RETAINED', name: 'SAMPLE VIALS', sub: 'batch RL-B026' }), 9, 4.5, [20, 3, 4.52], pal.label)
  return done(b)
}

/** Wall-mounted glove box holder. */
export function gloveDispenser(pal: Palette): Device {
  const b = new DeviceBuilder('glove_dispenser', pal)
  const steel = pal.solid(C.steelDark, 'metal')
  b.box([14, 25, 0.4], steel, [0, 12.5, 0.2])
  for (const x of [-7.0, 7.0]) b.box([0.4, 24, 8], steel, [x, 12.5, 4.2])
  b.box([14, 0.4, 8.2], steel, [0, 0.2, 4.3])
  b.box([12.5, 24, 7.5], pal.solid('#f4f7f8'), [0, 12.6, 4.4])
  b.box([7.5, 3.2, 0.2], pal.solid(C.panel), [0, 8, 8.2])
  const glove = pal.solid('#5a97dd', 'rubber')
  b.mesh(new THREE.IcosahedronGeometry(1.4, 0), glove, [0, 8.2, 8.6]).scale.set(1.6, 0.9, 0.8)
  b.mesh(new THREE.IcosahedronGeometry(0.9, 0), glove, [1.2, 8.9, 8.9])
  b.plane(gloveBoxCell(pal.atlas), 11, 5.5, [0, 17.5, 8.17], pal.label)
  return done(b)
}

/** Wall-mounted paper towel dispenser. */
export function towelDispenser(pal: Palette): Device {
  const b = new DeviceBuilder('towel_dispenser', pal)
  b.box([27, 25, 10], pal.solid('#f2f4f4', 'gloss'), [0, 12.5, 5])
  b.box([18, 1.6, 0.3], pal.solid(C.teal), [0, 17, 10.1])
  b.box([22, 0.6, 1.4], pal.solid(C.panel), [0, 0.4, 7.5])
  b.box([18, 6, 0.15], pal.solid('#fbfbf7', 'paper'), [0, -2.8, 7.6], { rot: [0.12, 0, 0] })
  return done(b)
}

/* ------------------------------------------------------------------ */
/* Small fixtures                                                        */
/* ------------------------------------------------------------------ */

/** Outlet positions along the power strip (cm from its centre) and where plug cables leave. */
export const POWER_STRIP = {
  outlets: [-10.5, -4.5, 1.5, 7.5],
  /** Outlets with a plug in them. */
  used: [1, 2],
  plugTop: 4.5,
  cableExitZ: -3.2,
  cordExitX: -16.8,
  cordY: 1.4,
}

/** Desk power strip: four universal outlets, lit master switch, cord, two plugs in use. */
export function powerStrip(pal: Palette): Device {
  const b = new DeviceBuilder('power_strip', pal)
  const body = pal.solid(C.white, 'gloss')
  const dark = pal.solid('#3a444c')
  const hole = pal.solid('#11161a')
  const black = pal.solid(C.black)
  rubberFeet(b, [-12, 12], [-1.6, 1.6], 0.7, 0.3)
  // Body with a chamfered top.
  b.box([30, 2.1, 5.4], body, [0, 1.35, 0])
  b.box([29, 1.0, 4.6], body, [0, 2.9, 0])
  for (const x of [-15, 15]) b.box([0.6, 2.6, 5.0], pal.solid(C.housingAlt), [x, 1.7, 0])

  // Outlets: recessed face, two slots and a round earth pin hole.
  const top = 3.4
  for (const x of POWER_STRIP.outlets) {
    b.box([4.6, 0.2, 4.0], dark, [x, top + 0.05, 0])
    for (const dx of [-0.9, 0.9]) b.box([0.45, 0.12, 1.3], hole, [x + dx, top + 0.18, 0.35])
    b.cyl(0.42, 0.12, hole, [x, top + 0.18, -1.15], { seg: 8 })
  }

  // Master switch with lit rocker.
  b.box([3.6, 0.5, 3.6], dark, [12.6, top + 0.1, 0])
  b.box([2.8, 0.9, 2.8], pal.solid('#e8583f', 'gloss'), [12.6, top + 0.55, 0], { rot: [0, 0, 0.16] })

  // Cord leaving the end through a strain relief.
  b.cyl(0.85, 2.4, black, [-16.2, POWER_STRIP.cordY, 0], { seg: 8, rot: [0, 0, Math.PI / 2] })

  // Plugs in use: body with grip ridges and a cable boot toward the instruments.
  for (const i of POWER_STRIP.used) {
    const x = POWER_STRIP.outlets[i]
    b.box([3.6, 2.2, 3.4], black, [x, top + 1.15, 0])
    for (const dz of [-1.0, 0, 1.0]) b.box([3.8, 0.25, 0.3], pal.solid('#2b333a'), [x, top + 1.6, dz])
    b.cyl(0.5, 1.6, black, [x, POWER_STRIP.plugTop, -2.3], { seg: 8, rTop: 0.7, rot: [Math.PI / 2, 0, 0] })
  }
  return done(b)
}

/** Where the plug's cable boot ends (cm, local) — the balance cable arrives here. */
export const WALL_PLUG_CABLE: V3 = [0, 0.6, 2.2]

/** Wall socket plate with a plug in it (for the balance on the left bench). */
export function wallSocket(pal: Palette): Device {
  const b = new DeviceBuilder('wall_socket', pal)
  const black = pal.solid(C.black)
  b.box([8.4, 8.4, 0.8], pal.solid(C.white, 'gloss'), [0, 4.2, 0.4])
  b.box([5.6, 5.6, 0.3], pal.solid('#e3e8eb'), [0, 4.2, 0.9])
  // Plug: body, grip ridges, cable boot pointing down.
  b.box([3.4, 4.0, 2.6], black, [0, 4.6, 2.3])
  for (const y of [3.6, 4.6, 5.6]) b.box([3.6, 0.3, 2.0], pal.solid('#2b333a'), [0, y, 2.4])
  b.cyl(0.45, 2.0, black, [0, 1.6, 2.2], { seg: 8, rTop: 0.75 })
  return done(b)
}

/** Zone sign plate (two atlas cells wide). */
export function signPlate(pal: Palette, name: string, text: string, sub: string, w = 22): Device {
  const b = new DeviceBuilder(name, pal)
  const h = w / 4
  b.box([w + 0.6, h + 0.6, 0.4], pal.solid(C.tealDark), [0, 0, 0])
  b.plane(signCell(pal.atlas, name, text, sub), w, h, [0, 0, 0.21], pal.label)
  return done(b)
}

/** Power cables between instruments and outlets, given as world-space paths. */
export function cables(pal: Palette, paths: V3[][]): Device {
  const b = new DeviceBuilder('device_cables', pal)
  const black = pal.solid(C.black)
  const inv = 1 / (1 / 254)
  for (const path of paths) {
    b.tube(
      path.map(([x, y, z]) => [x * inv, y * inv, z * inv] as V3),
      0.32,
      black,
      { seg: path.length * 10 }
    )
  }
  return done(b)
}
