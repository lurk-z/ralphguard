import * as THREE from 'three'
import { CM, LabelAtlas, Palette, place, type Spinner, type V3 } from './equipment/kit'
import * as D from './equipment/devices'

/**
 * Turns the enlarged GLB room into a skincare formulation lab:
 *  1. removeReplaced()  — takes out props this lab doesn't need, as whole assemblies
 *  2. moveMicroscope()  — keeps one microscope and moves it to the sample-check bench
 *  3. furnish()         — adds the new equipment zone by zone
 *
 * Coordinates are world units after layout.ts (room widened, island moved).
 */

/** Top-level GLB nodes (names as sanitised by GLTFLoader) removed with their contents. */
export const REPLACED: Record<string, string[]> = {
  'old microscope + slides (left bench)': ['old_microscope', 'Micro', 'Micro001', 'Micro1'],
  'flask stand with two flasks': ['hanger', 'flask13', 'flask13_liquid', 'flask14', 'flask14_liquid'],
  'loupe, funnel, tube, dishes (left bench)': ['loupe', 'funnel', 'tube', 'Petri_dish12', 'plate8'],
  'old balance': ['scales'],
  'bottle, flask and tube rack (left bench)': [
    'bottle3',
    'bottle3_liquid',
    'flask12002',
    'flask12002_liquid',
    'berth001',
    'tubes001',
    'tubes001_tube0_liquid',
    'tubes001_tube1_liquid',
    'tubes001_tube2_liquid',
  ],
  'grill hot plate + its cable': ['base002', 'frame', 'plate', 'legs', 'button', 'conductor3', 'hole', 'flask12', 'flask12_liquid'],
  'pink flask, bottles, dishes (rear counter)': [
    'big_flask',
    'big_flask_liquid',
    'bottle001',
    'bottle001_liquid',
    'bottle002',
    'Petri_dish2',
    'Petri_dish4',
  ],
  'clamp stand and flask (island)': ['bar', 'large_flask', 'large_flask_liquid'],
  'CRT computer (corner desk)': ['computer_1'],
  'glassware in the storage unit': [
    'flask14001',
    'flask14001_liquid',
    'flask12001',
    'flask12001_liquid',
    'bottle003',
    'bottle003_liquid',
    'flask_drying3',
    'holder3',
    'flask_drying3_tube0_liquid',
    'flask_drying3_tube1_liquid',
    'flask_drying3_tube2_liquid',
    'flask_drying3_tube3_liquid',
  ],
  'wall leaf and pin (shelving)': ['leaf2', 'point9'],
}

/** The microscope on the rear counter (kept, moved to the sample-check bench). */
const MICROSCOPE = ['lower_base', 'midle_base', 'adapter', 'head', 'eye1', 'eye2', 'lights', 'knob1', 'knob2', 'iron', 'plates', 'plate2', 'leg']

export function removeReplaced(root: THREE.Object3D) {
  const removed: string[] = []
  const missing: string[] = []
  for (const names of Object.values(REPLACED)) {
    for (const name of names) {
      const o = root.getObjectByName(name)
      if (!o) {
        missing.push(name)
        continue
      }
      o.parent?.remove(o)
      removed.push(name)
    }
  }
  if (missing.length) console.warn('[skincare-lab] not found for removal:', missing.join(', '))
  return removed
}

/** Moves and turns the microscope assembly as one rigid group. */
export function moveMicroscope(root: THREE.Object3D, target: { x: number; z: number }, yaw = Math.PI) {
  const parts = MICROSCOPE.map((n) => root.getObjectByName(n)).filter(Boolean) as THREE.Object3D[]
  if (!parts.length) return
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  parts.forEach((p) => box.expandByObject(p))
  const c = box.getCenter(new THREE.Vector3())
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  for (const p of parts) {
    const offset = p.position.clone().sub(new THREE.Vector3(c.x, p.position.y, c.z)).applyQuaternion(turn)
    p.position.set(target.x + offset.x, p.position.y, target.z + offset.z)
    p.quaternion.premultiply(turn)
  }
  root.updateMatrixWorld(true)
}

/* ------------------------------------------------------------------ */

const BENCH = -0.04 // top of every bench / counter / desk
const RIGHT = Math.PI / 2 // device front toward +x
const BACK = Math.PI // device front toward -z

/** Shelf heights measured from the GLB (world y of the surface). */
const SHELF = {
  rawTop: 0.0,
  rawLower: -0.185,
  storageBottom: -0.04,
  storageMiddle: 0.11,
  storageTop: 0.23,
}

export type Station = { id: string; label: string; devices: string[] }

export const STATIONS: Station[] = [
  { id: 'weighing', label: 'ชั่งและวัตถุดิบ', devices: ['precision_balance', 'weighing_supplies', 'raw_materials', 'spatula_cup', 'weighing_boats'] },
  { id: 'mixing', label: 'ผสมสูตร', devices: ['hotplate_stirrer', 'overhead_stirrer', 'mixing_glassware', 'wash_bottle'] },
  { id: 'checks', label: 'ตรวจตัวอย่าง', devices: ['ph_meter', 'viscometer', 'ph_buffers', 'head', 'lower_base'] },
  { id: 'filling', label: 'บรรจุ · เทียบตัวอย่าง', devices: ['sample_tray', 'batch_notebook', 'pipette_station'] },
  { id: 'storage', label: 'เก็บ · ล้าง', devices: ['retained_samples', 'glove_dispenser', 'towel_dispenser'] },
]

export function furnish(root: THREE.Object3D) {
  const atlas = new LabelAtlas()
  const pal = new Palette(atlas)
  const spinners: Spinner[] = []
  const added: string[] = []
  const add = (d: D.Device, x: number, y: number, z: number, ry = 0) => {
    place(d.root, x, y, z, ry)
    root.add(d.root)
    spinners.push(...d.spinners)
    added.push(d.root.name)
    return d.root
  }

  // Zone 1 · weighing and raw materials (left bench + shelving: dry, away from the sink).
  const balance = add(D.precisionBalance(pal), -0.49, BENCH, -0.27, RIGHT)
  add(D.weighingBoats(pal), -0.425, BENCH, -0.165, RIGHT)
  add(D.spatulaCup(pal), -0.565, BENCH, -0.13)
  add(D.weighingSupplies(pal), -0.505, BENCH, -0.5, RIGHT)
  add(D.rawMaterialShelf(pal), -0.46, SHELF.rawTop, 0.38, RIGHT)
  add(D.rawMaterialBulk(pal), -0.45, SHELF.rawLower, 0.18, RIGHT)
  const wallSocket = add(D.wallSocket(pal), -0.636, -0.005, -0.27, RIGHT)
  add(D.signPlate(pal, 'sign_raw_materials', 'RAW MATERIALS', 'weigh on the dry bench', 22), -0.348, -0.018, 0.38, RIGHT)

  // Zone 2 · mixing (rear counter, left of the sink, under the wall cabinets).
  add(D.hotplateStirrer(pal), 0.265, BENCH, -1.1)
  add(D.overheadStirrer(pal), 0.39, BENCH, -1.1)
  add(D.mixingGlassware(pal), 0.495, BENCH, -1.16)
  add(D.washBottle(pal), 0.475, BENCH, -0.985)

  // Zone 3 · sample checks (island, operator side faces the rear counter).
  add(D.phMeter(pal), 1.13, BENCH, -0.12, BACK)
  add(D.viscometer(pal), 1.27, BENCH, -0.115, BACK)
  add(D.phBuffers(pal), 1.2, BENCH, -0.015, BACK)
  const strip = { x: 1.13, z: 0.045 }
  add(D.powerStrip(pal), strip.x, BENCH, strip.z)

  // Zone 4 · filling and sample comparison (corner desk, CRT removed).
  add(D.sampleTray(pal), 1.89, BENCH, -1.1)
  add(D.batchNotebook(pal), 2.09, BENCH, -1.075)
  add(D.pipetteStation(pal), 1.995, BENCH, -1.205)

  // Zone 5 · storage and cleanup.
  add(D.retainedSamples(pal, { top: (SHELF.storageTop - SHELF.storageBottom) / CM, middle: (SHELF.storageMiddle - SHELF.storageBottom) / CM }), -0.5, SHELF.storageBottom, -0.83, RIGHT)
  add(D.signPlate(pal, 'sign_retained_samples', 'RETAINED SAMPLES', 'label · date · version', 20), -0.366, 0.44, -0.83, RIGHT)
  add(D.gloveDispenser(pal), 0.755, 0.065, -1.245)
  add(D.towelDispenser(pal), 0.905, 0.135, -1.245)

  // Power cables (world space): instruments → outlets along bench edges.
  const worldOf = (device: THREE.Object3D, local: V3): V3 => {
    const v = device.localToWorld(new THREE.Vector3(...local).multiplyScalar(CM))
    return [v.x, v.y, v.z]
  }
  const plugAt = (i: number): V3 => [
    strip.x + D.POWER_STRIP.outlets[i] * CM,
    BENCH + D.POWER_STRIP.plugTop * CM,
    strip.z + D.POWER_STRIP.cableExitZ * CM,
  ]
  const socket: V3 = [0.634, 0.012, -1.24]
  add(
    D.cables(pal, [
      [[0.241, -0.03, -1.165], [0.245, -0.037, -1.215], [0.4, -0.0375, -1.233], [0.6, -0.0375, -1.236], [socket[0] - 0.004, socket[1], socket[2]]],
      [[0.402, -0.03, -1.181], [0.41, -0.037, -1.222], [0.58, -0.0375, -1.232], [socket[0] + 0.004, socket[1] - 0.002, socket[2]]],
      // Balance inlet → along the bench → up the wall into the plug's boot (one unbroken cable).
      (() => {
        const a = worldOf(balance, D.BALANCE_INLET)
        const z = worldOf(wallSocket, D.WALL_PLUG_CABLE)
        const lie = BENCH + 0.0013
        return [a, [a[0] - 0.008, lie + 0.002, a[2]], [a[0] - 0.03, lie, a[2] + 0.004], [z[0] + 0.006, lie, z[2] - 0.006], [z[0] + 0.0015, lie + 0.012, z[2]], [z[0], z[1] - 0.008, z[2]], z] as V3[]
      })(),
      // pH meter and viscometer → their plugs in the desk power strip.
      [[1.13, -0.03, -0.088], [1.125, -0.0375, -0.03], [plugAt(1)[0] + 0.002, -0.034, 0.018], plugAt(1)],
      [[1.286, -0.03, -0.065], [1.25, -0.0375, -0.01], [1.15, -0.0375, 0.01], [plugAt(2)[0] + 0.002, -0.033, 0.02], plugAt(2)],
      // Strip cord over the island edge to the floor.
      [[strip.x + D.POWER_STRIP.cordExitX * CM, BENCH + D.POWER_STRIP.cordY * CM, strip.z], [1.058, -0.045, strip.z], [1.057, -0.2, 0.05], [1.065, -0.38, 0.07]],
    ]),
    0,
    0,
    0
  )

  // Remaining GLB sample tubes (island rack) get skincare product colours.
  const tubeColours: [string, number][] = [
    ['#efe5cf', 0.4],
    ['#f0dc9a', 0.5],
    ['#8fd3d6', 0.6],
    ['#f5f0e4', 0.4],
    ['#e2ebc6', 0.5],
  ]
  tubeColours.forEach(([color, glow], i) => {
    const tube = root.getObjectByName(`staff2_tube${i}_liquid`) as THREE.Mesh | undefined
    if (tube?.isMesh) tube.material = pal.liquid(color, glow)
  })

  return {
    added,
    spinners,
    dispose: () => {
      pal.dispose()
      atlas.dispose()
      for (const name of added) {
        root.getObjectByName(name)?.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.isMesh) m.geometry.dispose()
        })
      }
    },
  }
}
