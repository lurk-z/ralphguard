import * as THREE from 'three'
import type { Spot } from '../agents/agent'
import { BAND_TH, type EndpointOutcome } from '@/lib/lab-station/assessment'
import { STATION_ENDPOINTS, stationEndpoint, type StationEndpointId } from '@/lib/lab-station/endpoints'

/**
 * The `test_station` group in Lab_room_3room.glb and everything that moves them: hand-off between hands, slots,
 * fridge and bin; the hinge clips; the drop; the tray display cards and illustrative reactions.
 * Node names come from build_test_station.py; per-endpoint nodes are derived from the endpoint id,
 * so a moved tray or an added endpoint needs no code change here.
 */

type Tween = {
  obj: THREE.Object3D
  p0: THREE.Vector3
  p1: THREE.Vector3
  q0: THREE.Quaternion
  q1: THREE.Quaternion
  s0: THREE.Vector3
  s1: THREE.Vector3
  t: number
  dur: number
  done?: () => void
}

type Fade = { mat: THREE.Material & { opacity: number }; from: number; to: number; t: number; dur: number }

export type AliquotPlace = 'rack' | 'hand' | 'tray' | 'fridge' | 'gone'

const HIT_GEO = new THREE.CylinderGeometry(0.014, 0.014, 0.07, 10).translate(0, 0.03, 0)
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false })

function labelTexture(lines: { text: string; size: number; color: string; weight?: number }[], w: number, h: number, bg = '#f4f6f7') {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  let y = 0
  const gap = h / (lines.length + 0.6)
  for (const l of lines) {
    y += gap
    g.fillStyle = l.color
    g.font = `${l.weight ?? 500} ${l.size}px "Leelawadee UI", "Noto Sans Thai", "IBM Plex Sans Thai", sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(l.text, w / 2, y, w - 12)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false // glTF UVs
  tex.anisotropy = 4
  return tex
}

export class StationProps {
  readonly root: THREE.Object3D
  private readonly mixer: THREE.AnimationMixer
  private readonly clips = new Map<string, THREE.AnimationAction>()
  private readonly tweens: Tween[] = []
  private readonly fades: Fade[] = []
  private readonly drops: { mesh: THREE.Mesh; v: number; floor: number; life: number }[] = []
  private readonly home = new Map<THREE.Object3D, { parent: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }>()
  readonly place = new Map<StationEndpointId, AliquotPlace>()
  readonly hitboxes = new Map<THREE.Object3D, { kind: 'aliquot'; endpoint: StationEndpointId } | { kind: 'stored'; slot: number }>()
  private readonly fridgeVials = new Map<number, THREE.Object3D>()
  private readonly displayMats = new Map<StationEndpointId, THREE.MeshStandardMaterial>()
  private readonly reaction = new Map<string, { mat: THREE.MeshStandardMaterial; swell: THREE.Object3D[] }>()
  private readonly dropTemplate: THREE.Mesh | null
  readonly blockers: THREE.Object3D[] = []

  constructor(scene: THREE.Object3D, animations: THREE.AnimationClip[]) {
    this.root = scene
    this.root.name = 'test_station'
    this.mixer = new THREE.AnimationMixer(scene)
    scene.traverse((o) => {
      if (o.name && !this.nodes.has(o.name)) this.nodes.set(o.name, o)
    })
    for (const clip of animations) this.clips.set(clip.name, this.mixer.clipAction(clip))
    // The room's shadow map is baked once, so only static furniture may cast into it:
    // anything that moves (vials, dropper, door, lid, effects) casts no shadow.
    const MOVING = /^(aliquot_|master_vial$|fridge_door_hinge$|bin_lid_hinge$|fx_)/
    const moving = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p && p !== scene; p = p.parent) if (MOVING.test(p.name)) return true
      return false
    }
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && moving(m)) m.castShadow = false
      if (o.userData?.blocker) this.blockers.push(o)
    })
    // remember where every movable prop belongs
    const remember = (o: THREE.Object3D | undefined) => {
      if (!o || !o.parent) return
      this.home.set(o, { parent: o.parent, pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.clone() })
    }
    remember(this.node('master_vial'))
    for (const ep of STATION_ENDPOINTS) {
      remember(this.node(`aliquot_${ep.id}`))
      remember(this.node(`aliquot_${ep.id}_dropper`))
      const hit = new THREE.Mesh(HIT_GEO, HIT_MAT)
      hit.name = `pick_aliquot_${ep.id}`
      this.node(`aliquot_${ep.id}`)?.add(hit)
      this.hitboxes.set(hit, { kind: 'aliquot', endpoint: ep.id })
      this.place.set(ep.id, 'rack')
      this.setupDisplay(ep.id)
      this.setupLabels(ep.id)
    }
    // effects start hidden; each gets its own material so trays never share an opacity
    for (const name of ['fx_skin_redness', 'fx_sens_redness', 'fx_eye_redness']) {
      const fx = this.node(name) as THREE.Mesh | undefined
      if (!fx) continue
      const mat = (fx.material as THREE.MeshStandardMaterial).clone()
      mat.transparent = true
      mat.opacity = 0
      mat.depthWrite = false
      fx.material = mat
      fx.visible = false
      const ep = name.split('_')[1]
      const swell = ep === 'eye' ? [] : ['dermis', 'epidermis'].map((l) => this.node(`tray_${ep}_skin_${l}`)).filter(Boolean) as THREE.Object3D[]
      this.reaction.set(ep, { mat, swell })
      fx.userData.fx = true
    }
    this.dropTemplate = (this.node('fx_drop') as THREE.Mesh) ?? null
    if (this.dropTemplate) this.dropTemplate.visible = false
    this.clearSession()
  }

  /** Nodes by name, cached at load: a prop held in a hand is no longer under the station root. */
  private readonly nodes = new Map<string, THREE.Object3D>()

  node(name: string) {
    return this.nodes.get(name) ?? this.root.getObjectByName(name) ?? undefined
  }

  /** Standing spot from an approach empty (its local -Y in Blender = +Z here = the facing). */
  spot(name: string): Spot {
    const o = this.node(name)
    if (!o) throw new Error(`station node ${name} missing`)
    o.updateWorldMatrix(true, false)
    const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld)
    return { pos: new THREE.Vector2(p.x, p.z), yaw: Math.atan2(fwd.x, fwd.z) }
  }

  private world(o: THREE.Object3D) {
    o.updateWorldMatrix(true, false)
    return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)
  }

  // ------------------------------------------------------------------ session visibility
  /** Hide the master vial and all aliquots, put them back where they belong, clear the cards. */
  clearSession() {
    // hinges closed (the exported rest pose carries whatever the hinge clips last left)
    for (const a of this.clips.values()) a.stop()
    for (const name of ['fridge_door_hinge', 'bin_lid_hinge']) this.node(name)?.quaternion.identity()
    for (const [o, h] of this.home) {
      h.parent.add(o)
      o.position.copy(h.pos)
      o.quaternion.copy(h.quat)
      o.scale.copy(h.scale)
    }
    const mv = this.node('master_vial')
    if (mv) mv.visible = false
    for (const ep of STATION_ENDPOINTS) {
      const a = this.node(`aliquot_${ep.id}`)
      if (a) a.visible = false
      this.place.set(ep.id, 'rack')
      this.showOutcome(ep.id, null)
    }
    this.tweens.length = 0
    for (const [hit] of this.hitboxes) {
      const m = hit.name.match(/^pick_aliquot_(\w+)$/)
      if (m) this.hitboxes.set(hit, { kind: 'aliquot', endpoint: m[1] as StationEndpointId })
    }
    this.showArchive([])
  }

  /** Aliquots of this revision appear in the rack (except those already in the fridge). */
  showAliquots(except: StationEndpointId[]) {
    for (const ep of STATION_ENDPOINTS) {
      const a = this.node(`aliquot_${ep.id}`)
      if (!a) continue
      const stored = except.includes(ep.id)
      this.place.set(ep.id, stored ? 'gone' : 'rack')
      a.visible = !stored
      if (!stored) {
        const s = a.scale.clone()
        a.scale.setScalar(0.001)
        this.tween(a, a.position.clone(), a.quaternion.clone(), s, 0.45)
      }
    }
  }

  // ------------------------------------------------------------------ hands, slots, tweens
  /** Snap a prop into a hand socket so its grip node sits on the socket, standing upright. */
  holdUpright(prop: THREE.Object3D, grip: THREE.Object3D | undefined, socket: THREE.Object3D) {
    const sock = this.world(socket)
    const gripLocal = grip ? grip.position.clone() : new THREE.Vector3()
    this.root.attach(prop)
    prop.quaternion.identity()
    prop.scale.setScalar(1)
    prop.position.copy(this.root.worldToLocal(sock.clone())).sub(gripLocal)
    prop.visible = true
    socket.attach(prop)
  }

  /** The hand closes on the prop where it is (the clip's hand is on it): keep its world pose. */
  grab(prop: THREE.Object3D, socket: THREE.Object3D) {
    socket.attach(prop)
  }

  /** Release a prop into a slot and settle it onto the slot's origin (or a given local pose). */
  settle(prop: THREE.Object3D, slot: THREE.Object3D, local = new THREE.Vector3(), dur = 0.15) {
    slot.attach(prop)
    this.tween(prop, local, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1), dur)
  }

  /** Dropper back into its own vial at its seated pose. */
  reseat(dropper: THREE.Object3D) {
    const h = this.home.get(dropper)
    if (!h) return
    h.parent.attach(dropper)
    this.tween(dropper, h.pos.clone(), h.quat.clone(), h.scale.clone(), 0.12)
  }

  private tween(obj: THREE.Object3D, p1: THREE.Vector3, q1: THREE.Quaternion, s1: THREE.Vector3, dur: number, done?: () => void) {
    for (let i = this.tweens.length - 1; i >= 0; i--) if (this.tweens[i].obj === obj) this.tweens.splice(i, 1)
    this.tweens.push({ obj, p0: obj.position.clone(), p1, q0: obj.quaternion.clone(), q1, s0: obj.scale.clone(), s1, t: 0, dur, done })
  }

  /** Released over the bin: the vial falls in and leaves the scene. */
  dropIntoBin(prop: THREE.Object3D) {
    const bin = this.node('bin')
    if (!bin) {
      prop.visible = false
      return
    }
    bin.attach(prop)
    const target = new THREE.Vector3(0, 0.05, 0)
    this.tween(prop, target, prop.quaternion.clone(), prop.scale.clone(), 0.35, () => {
      prop.visible = false
    })
  }

  // ------------------------------------------------------------------ prop clips and the drop
  playProp(name: string) {
    const a = this.clips.get(name)
    if (!a) return
    for (const other of this.clips.values()) {
      if (other !== a && other.getClip().tracks.some((t) => a.getClip().tracks.some((u) => u.name === t.name))) other.stop()
    }
    a.reset()
    a.setLoop(THREE.LoopOnce, 1)
    a.clampWhenFinished = true
    a.play()
  }

  /** One drop leaves the dropper tip and falls onto the tray's drop target. */
  dispenseDrop(ep: StationEndpointId) {
    const tip = this.node(`aliquot_${ep}_dropper_tip`)
    const target = this.node(`tray_${ep}_drop_target`)
    if (!this.dropTemplate || !tip || !target) return
    const drop = this.dropTemplate.clone()
    drop.material = (this.dropTemplate.material as THREE.Material).clone()
    drop.visible = true
    this.root.add(drop)
    drop.position.copy(this.root.worldToLocal(this.world(tip)))
    drop.position.y -= 0.004
    this.drops.push({ mesh: drop, v: 0, floor: this.root.worldToLocal(this.world(target)).y, life: 0 })
  }

  // ------------------------------------------------------------------ fridge
  fridgeSlot(slot: number) {
    return this.node(`fridge_slot_${slot}`)
  }

  /** A session aliquot that was just put away becomes the fridge's vial for that slot. */
  adoptIntoFridge(ep: StationEndpointId, slot: number) {
    const a = this.node(`aliquot_${ep}`)
    if (!a) return
    this.place.set(ep, 'fridge')
    this.fridgeVials.get(slot)?.removeFromParent()
    this.fridgeVials.set(slot, a)
    for (const [hit, info] of this.hitboxes) if (info.kind === 'aliquot' && info.endpoint === ep) this.hitboxes.set(hit, { kind: 'stored', slot })
  }

  /** Kept vials of the project, one per occupied slot (clones of the aliquot model). */
  showArchive(records: { slot: number; endpoint: StationEndpointId }[]) {
    const wanted = new Map(records.map((r) => [r.slot, r]))
    for (const [slot, obj] of this.fridgeVials) {
      if (wanted.has(slot)) continue
      if (obj.userData.archiveClone) obj.removeFromParent()
      this.fridgeVials.delete(slot)
    }
    for (const [hit, info] of [...this.hitboxes]) if (info.kind === 'stored' && !wanted.has(info.slot) && hit.parent?.userData.archiveClone) this.hitboxes.delete(hit)
    for (const r of records) {
      if (this.fridgeVials.has(r.slot)) continue
      const slot = this.fridgeSlot(r.slot)
      const template = this.node(`aliquot_${r.endpoint}`)
      if (!slot || !template) continue
      const clone = template.clone(true)
      clone.userData.archiveClone = true
      clone.visible = true
      const oldHits: THREE.Object3D[] = []
      clone.traverse((o) => {
        if (o.name.startsWith('pick_')) oldHits.push(o)
      })
      for (const o of oldHits) o.removeFromParent()
      clone.position.set(0, 0, 0)
      clone.quaternion.identity()
      clone.scale.setScalar(1)
      slot.add(clone)
      const hit = new THREE.Mesh(HIT_GEO, HIT_MAT)
      clone.add(hit)
      this.hitboxes.set(hit, { kind: 'stored', slot: r.slot })
      this.fridgeVials.set(r.slot, clone)
    }
  }

  // ------------------------------------------------------------------ cards and reactions
  private setupDisplay(ep: StationEndpointId) {
    const face = this.node(`tray_${ep}_display_face`) as THREE.Mesh | undefined
    if (!face) return
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 })
    face.material = mat
    this.displayMats.set(ep, mat)
  }

  private setupLabels(ep: StationEndpointId) {
    const add = (plateName: string, w: number, h: number) => {
      const plate = this.node(plateName)
      if (!plate?.parent) return
      const tex = labelTexture([{ text: ep, size: 44, color: '#1f3b38', weight: 700 }], 256, 64, '#e9ecee')
      tex.flipY = true
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }))
      m.name = `${plateName}_text`
      m.position.copy(plate.position).add(new THREE.Vector3(-0.0008, 0, 0))
      m.rotation.y = -Math.PI / 2
      plate.parent.add(m)
    }
    add(`tray_${ep}_label`, 0.058, 0.0075)
    add(`rack_label_${ep}`, 0.026, 0.0055)
  }

  /** Card + illustration for one tray. `null` = not tested yet. */
  showOutcome(ep: StationEndpointId, outcome: EndpointOutcome | null) {
    const mat = this.displayMats.get(ep)
    const info = stationEndpoint(ep)
    if (mat) {
      const lines: { text: string; size: number; color: string; weight?: number }[] = [
        { text: `${ep} · ${info.labelTh}`, size: 22, color: '#334155', weight: 600 },
      ]
      if (!outcome) lines.push({ text: 'ยังไม่ทดสอบ', size: 30, color: '#94a3b8' })
      else if (outcome.kind === 'loading') lines.push({ text: 'รอผลประเมิน…', size: 30, color: '#64748b' })
      else if (outcome.kind === 'failed') lines.push({ text: 'ไม่มีผล (ล้มเหลว)', size: 30, color: '#be123c' })
      else if (outcome.kind === 'unavailable') lines.push({ text: 'ไม่มีข้อมูล', size: 30, color: '#475569' })
      else if (outcome.kind === 'insufficient') lines.push({ text: 'หลักฐานไม่เพียงพอ', size: 30, color: '#475569' })
      else {
        lines.push({ text: `${Math.round(outcome.score * 10) / 10} / 100`, size: 46, color: '#0f172a', weight: 700 })
        lines.push({ text: `ระดับ${BAND_TH[outcome.band]} · ${outcome.confidence?.level ?? '-'}`, size: 22, color: '#334155' })
      }
      lines.push({
        text: info.visual === 'skin-reaction-illustrative' ? 'ผลคัดกรอง · ปฏิกิริยาเป็นภาพประกอบ' : 'ผลคัดกรองจากแบบจำลอง',
        size: 18,
        color: '#64748b',
      })
      mat.map?.dispose()
      mat.map = labelTexture(lines, 384, 236)
      mat.needsUpdate = true
    }
    // Illustration only, from the returned score; acute never gets a tissue look.
    const r = this.reaction.get(ep)
    if (!r) return
    const k = outcome?.kind === 'result' ? THREE.MathUtils.clamp(outcome.score / 100, 0, 1) : 0
    const fx = this.node(ep === 'eye' ? 'fx_eye_redness' : `fx_${ep}_redness`)
    if (fx) fx.visible = k > 0
    this.fades.push({ mat: r.mat, from: r.mat.opacity, to: k > 0 ? 0.08 + 0.72 * k : 0, t: 0, dur: 1.2 })
    for (const s of r.swell) s.scale.set(1, 1 + 0.25 * k, 1)
  }

  update(dt: number) {
    this.mixer.update(dt)
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]
      tw.t += dt
      const k = THREE.MathUtils.smoothstep(Math.min(1, tw.t / tw.dur), 0, 1)
      tw.obj.position.lerpVectors(tw.p0, tw.p1, k)
      tw.obj.quaternion.slerpQuaternions(tw.q0, tw.q1, k)
      tw.obj.scale.lerpVectors(tw.s0, tw.s1, k)
      if (tw.t >= tw.dur) {
        this.tweens.splice(i, 1)
        tw.done?.()
      }
    }
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i]
      f.t += dt
      f.mat.opacity = THREE.MathUtils.lerp(f.from, f.to, Math.min(1, f.t / f.dur))
      if (f.t >= f.dur) this.fades.splice(i, 1)
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      d.life += dt
      if (d.mesh.position.y > d.floor) {
        d.v += 1.6 * dt
        d.mesh.position.y = Math.max(d.floor, d.mesh.position.y - d.v * dt)
      } else {
        d.mesh.scale.set(1.6, 0.35, 1.6)
        ;(d.mesh.material as THREE.Material).opacity = Math.max(0, 0.75 - (d.life - 0.4))
        if (d.life > 1.4) {
          d.mesh.removeFromParent()
          ;(d.mesh.material as THREE.Material).dispose()
          this.drops.splice(i, 1)
        }
      }
    }
  }
}
