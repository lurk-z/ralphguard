import * as THREE from 'three'

/**
 * Camera shortcuts. Each view frames the listed GLB objects (looked up by node
 * name) from `direction`; leaving `objects` empty frames the whole room.
 * The same registry can later anchor Ralph Lab "stations" to places in the room.
 */
export type RoomView = {
  id: string
  label: string
  /** Keyboard shortcut. */
  key: string
  objects?: string[]
  /** Direction from the framed target toward the camera (normalised on use). */
  direction: [number, number, number]
  /** Distance multiplier on the fitted bounding sphere (1 = tight fit). */
  fit: number
}

export const ROOM_VIEWS: RoomView[] = [
  { id: 'overview', label: 'ภาพรวม', key: '1', direction: [0.5, 0.72, 1], fit: 0.88 },
  {
    id: 'weighing',
    label: 'ชั่ง · วัตถุดิบ',
    key: '2',
    objects: ['precision_balance', 'weighing_supplies', 'raw_materials', 'spatula_cup'],
    direction: [1, 0.55, 0.25],
    fit: 1.05,
  },
  {
    id: 'mixing',
    label: 'ผสมสูตร',
    key: '3',
    objects: ['hotplate_stirrer', 'overhead_stirrer', 'mixing_glassware', 'wash_bottle'],
    direction: [0.15, 0.5, 1],
    fit: 1.15,
  },
  {
    id: 'checks',
    label: 'ตรวจตัวอย่าง',
    key: '4',
    objects: ['ph_meter', 'viscometer', 'ph_buffers', 'head', 'lower_base'],
    direction: [0.2, 0.62, -1],
    fit: 1.1,
  },
  {
    id: 'filling',
    label: 'บรรจุ · เทียบ',
    key: '5',
    objects: ['sample_tray', 'batch_notebook', 'pipette_station'],
    direction: [-0.15, 0.7, 1],
    fit: 1.1,
  },
  {
    id: 'storage',
    label: 'ตู้เก็บตัวอย่าง',
    key: '6',
    objects: ['main', 'retained_samples'],
    direction: [1, 0.3, 0.2],
    fit: 1.05,
  },
]

export const OVERVIEW = ROOM_VIEWS[0]

export type CameraPose = { position: THREE.Vector3; target: THREE.Vector3 }

/** Distance at which a sphere of `radius` fills the narrower field of view. */
export function fitDistance(radius: number, camera: THREE.PerspectiveCamera) {
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  return radius / Math.sin(Math.min(vFov, hFov) / 2)
}

export function poseForView(
  view: RoomView,
  root: THREE.Object3D,
  roomBounds: THREE.Box3,
  camera: THREE.PerspectiveCamera
): CameraPose {
  let box = roomBounds
  if (view.objects?.length) {
    const b = new THREE.Box3()
    for (const name of view.objects) {
      const o = root.getObjectByName(name)
      if (o) b.expandByObject(o)
    }
    if (!b.isEmpty()) box = b
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const dir = new THREE.Vector3(...view.direction).normalize()
  const distance = fitDistance(sphere.radius, camera) * view.fit
  return {
    target: sphere.center.clone(),
    position: sphere.center.clone().addScaledVector(dir, distance),
  }
}
