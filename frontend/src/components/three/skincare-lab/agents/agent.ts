import * as THREE from 'three'
import type { NavGrid } from './nav'

export type Clip =
  | 'Idle_Stand'
  | 'Walk'
  | 'Talk_Gesture'
  | 'Sit_Down'
  | 'Stand_Up'
  | 'Seated_Work'
  | 'Bench_Work'
  // testing-station clips (analyst_station.glb / formulator_station.glb)
  | 'Idle_Carry'
  | 'Walk_Carry'
  | 'Station_Pick'
  | 'Station_Place'
  | 'Station_Dispense'
  | 'Fridge_Open'
  | 'Fridge_Close'
  | 'Bin_Release'
export type StationKind = 'seated' | 'bench' | 'stand'
export type Spot = { pos: THREE.Vector2; yaw: number }

export type AgentConfig = {
  role: string
  station: Spot & { kind: StationKind; clip: Clip }
  visit: Spot
  chair?: { node: THREE.Object3D; seated: THREE.Vector3; standing: THREE.Vector3 }
}

export class Cancelled extends Error {}

const FADE = 0.35
const TURN_RATE = 5 // rad/s
const ARRIVE = 0.02

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

type Task =
  | { kind: 'walk'; path: THREE.Vector2[]; done: () => void }
  | { kind: 'turn'; yaw: number; done: () => void }
  | { kind: 'wait'; left: number; done: () => void }

/**
 * One lab agent: plays its baked clips with cross-fades, walks along nav-grid
 * paths with the Walk clip's own stride speed, and moves its desk chair in step
 * with Sit_Down / Stand_Up. Every action returns a promise the workflow awaits.
 */
export class Agent {
  readonly root = new THREE.Group()
  readonly pos = new THREE.Vector2()
  yaw = 0
  seated = false
  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<Clip, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private task: Task | null = null
  private chairMove: { from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number; action: THREE.AnimationAction } | null = null
  readonly rightHand: THREE.Object3D | null
  /** Hand sockets baked in Blender (the grip point between thumb and fingers), if the model has them. */
  readonly sockets: { left: THREE.Object3D | null; right: THREE.Object3D | null }
  /** While true, walking and idling use the carry clips (left hand holds a vial). */
  carrying = false
  private events: { action: THREE.AnimationAction; list: { t: number; fn: () => void; done: boolean }[] } | null = null

  constructor(
    readonly cfg: AgentConfig,
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    scale: number,
    floorY: number,
    private readonly nav: NavGrid,
    private readonly walkSpeed: number,
    private readonly chairTiming: { sitDown: [number, number]; standUp: [number, number] },
    private readonly onSceneChange: () => void,
    /** Replaced for each workflow run; a cancelled run's pending steps then throw and stop. */
    public signal: { cancelled: boolean }
  ) {
    model.scale.setScalar(scale)
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh
      if (m.isMesh) {
        m.frustumCulled = false
        m.castShadow = false
        m.receiveShadow = true
      }
    })
    this.root.add(model)
    this.root.position.y = floorY
    this.root.name = `agent_${cfg.role}`
    this.rightHand = model.getObjectByName('RightHand') ?? null
    let left: THREE.Object3D | null = null
    let right: THREE.Object3D | null = null
    model.traverse((o) => {
      if (o.name.endsWith('hand_socket_L')) left = o
      if (o.name.endsWith('hand_socket_R')) right = o
    })
    this.sockets = { left, right }
    this.mixer = new THREE.AnimationMixer(model)
    for (const clip of clips) {
      const a = this.mixer.clipAction(clip)
      this.actions.set(clip.name as Clip, a)
    }
    this.mixer.addEventListener('finished', (e) => {
      const ev = e as unknown as { action: THREE.AnimationAction }
      const cb = this.onceDone.get(ev.action)
      if (cb) {
        this.onceDone.delete(ev.action)
        cb()
      }
    })
    // Start at the station, already doing the station's work.
    this.pos.copy(cfg.station.pos)
    this.yaw = cfg.station.yaw
    this.seated = cfg.station.kind === 'seated'
    this.play(cfg.station.clip, { fade: 0 })
    this.sync()
  }

  private readonly onceDone = new Map<THREE.AnimationAction, () => void>()

  has(clip: Clip) {
    return this.actions.has(clip)
  }

  duration(clip: Clip) {
    return this.actions.get(clip)?.getClip().duration ?? 0
  }

  private check() {
    if (this.signal.cancelled) throw new Cancelled()
  }

  /** Cross-fade to a clip. `once` clips hold their last frame and resolve when they end. */
  play(clip: Clip, opts: { once?: boolean; fade?: number } = {}): Promise<void> {
    const next = this.actions.get(clip)
    if (!next) return Promise.resolve()
    if (next === this.current && !opts.once && next.isRunning()) return Promise.resolve() // already looping: keep its phase
    const fade = opts.fade ?? FADE
    next.reset()
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    next.clampWhenFinished = !!opts.once
    next.enabled = true
    if (this.current && this.current !== next && fade > 0) {
      next.crossFadeFrom(this.current, fade, false)
    } else if (this.current && this.current !== next) {
      this.current.stop()
    }
    next.play()
    this.current = next
    if (!opts.once) return Promise.resolve()
    return new Promise((resolve) => this.onceDone.set(next, resolve))
  }

  private setTask(t: Task) {
    this.task = t
  }

  wait(seconds: number) {
    this.check()
    return new Promise<void>((done) => this.setTask({ kind: 'wait', left: seconds, done }))
  }

  turnTo(yaw: number) {
    this.check()
    return new Promise<void>((done) => this.setTask({ kind: 'turn', yaw, done }))
  }

  faceTowards(p: THREE.Vector2) {
    return this.turnTo(Math.atan2(p.x - this.pos.x, p.y - this.pos.y))
  }

  private walkClip(): Clip {
    return this.carrying && this.has('Walk_Carry') ? 'Walk_Carry' : 'Walk'
  }

  idleClip(): Clip {
    return this.carrying && this.has('Idle_Carry') ? 'Idle_Carry' : 'Idle_Stand'
  }

  /** Walk to a spot along the nav grid, then turn to the spot's facing. */
  async walkTo(spot: Spot) {
    this.check()
    const path = this.nav.findPath(this.pos, spot.pos)
    this.play(this.walkClip())
    await new Promise<void>((done) => this.setTask({ kind: 'walk', path, done }))
    this.check()
    this.play(this.idleClip())
    await this.turnTo(spot.yaw)
  }

  /**
   * Play a one-shot clip and fire callbacks at its baked event times (seconds into the clip),
   * e.g. `{ grab: attach, release: detach }`. Resolves when the clip ends; the agent then idles.
   */
  async perform(clip: Clip, eventTimes: Record<string, number>, on: Record<string, () => void> = {}, fade = 0.25) {
    this.check()
    const action = this.actions.get(clip)
    if (!action) throw new Error(`clip ${clip} missing on ${this.cfg.role}`)
    const list = Object.entries(on)
      .filter(([k]) => k in eventTimes)
      .map(([k, fn]) => ({ t: eventTimes[k], fn, done: false }))
      .sort((a, b) => a.t - b.t)
    const finished = this.play(clip, { once: true, fade })
    this.events = { action, list }
    await finished
    // a clip that ended before an event (very short frames) still fires it, in order
    for (const e of list) if (!e.done) {
      e.done = true
      e.fn()
    }
    this.events = null
    this.check()
    this.play(this.idleClip(), { fade: 0.2 })
  }

  /** Duration of a clip in seconds (0 when missing). */
  clipDuration(clip: Clip) {
    return this.duration(clip)
  }

  /** Talk once (one Talk_Gesture cycle), then settle back to idle. */
  async talk(cycles = 1) {
    this.check()
    this.play('Talk_Gesture')
    await this.wait(this.duration('Talk_Gesture') * cycles - FADE)
    this.check()
  }

  async standUp() {
    this.check()
    if (!this.seated) return
    const a = this.actions.get('Stand_Up')
    if (this.cfg.chair && a) {
      const [t0, t1] = this.chairTiming.standUp
      this.chairMove = { from: this.cfg.chair.seated, to: this.cfg.chair.standing, t0, t1, action: a }
    }
    await this.play('Stand_Up', { once: true, fade: 0.2 })
    this.seated = false
    this.play('Idle_Stand', { fade: 0.25 })
  }

  async sitDown() {
    this.check()
    const a = this.actions.get('Sit_Down')
    if (this.cfg.chair && a) {
      const [t0, t1] = this.chairTiming.sitDown
      this.chairMove = { from: this.cfg.chair.standing, to: this.cfg.chair.seated, t0, t1, action: a }
    }
    await this.play('Sit_Down', { once: true, fade: 0.25 })
    this.seated = true
    this.play('Seated_Work', { fade: 0.1 })
  }

  /** Go back to the station and resume its work clip. */
  async goHome() {
    const st = this.cfg.station
    if (this.seated) {
      // already in the chair: just keep working
      this.play(st.clip)
      return
    }
    await this.walkTo(st)
    if (st.kind === 'seated') await this.sitDown()
    else this.play(st.clip)
  }

  /** Keep doing the station's work for a while (sitting/bench/idle). */
  async work(seconds: number) {
    this.play(this.cfg.station.clip)
    await this.wait(seconds)
  }

  private sync() {
    this.root.position.x = this.pos.x
    this.root.position.z = this.pos.y
    this.root.rotation.y = this.yaw
  }

  update(dt: number) {
    this.mixer.update(dt)
    if (this.events) {
      const time = this.events.action.time
      for (const e of this.events.list) {
        if (!e.done && time >= e.t) {
          e.done = true
          e.fn()
        }
      }
    }
    const t = this.task
    if (t?.kind === 'wait') {
      t.left -= dt
      if (t.left <= 0) this.finish()
    } else if (t?.kind === 'turn') {
      const d = wrap(t.yaw - this.yaw)
      const step = TURN_RATE * dt
      if (Math.abs(d) <= step) {
        this.yaw = t.yaw
        this.finish()
      } else this.yaw += Math.sign(d) * step
    } else if (t?.kind === 'walk') {
      let travel = this.walkSpeed * dt
      while (travel > 0 && t.path.length) {
        const target = t.path[0]
        const to = new THREE.Vector2().subVectors(target, this.pos)
        const dist = to.length()
        if (dist < ARRIVE) {
          t.path.shift()
          continue
        }
        const want = Math.atan2(to.x, to.y)
        const d = wrap(want - this.yaw)
        this.yaw += THREE.MathUtils.clamp(d, -TURN_RATE * dt, TURN_RATE * dt)
        // Slow down while the body is still turning toward the next leg.
        const speedK = Math.abs(d) > 1.0 ? 0.25 : 1
        const step = Math.min(dist, travel * speedK)
        this.pos.addScaledVector(to.normalize(), step)
        travel -= step / speedK
        if (speedK < 1) break
      }
      if (!t.path.length) this.finish()
    }
    if (this.chairMove && this.cfg.chair) {
      const m = this.chairMove
      const time = m.action.time
      const k = THREE.MathUtils.smoothstep(time, m.t0, m.t1)
      this.cfg.chair.node.position.lerpVectors(m.from, m.to, k)
      this.onSceneChange()
      if (time >= m.t1 || !m.action.isRunning()) {
        this.cfg.chair.node.position.copy(m.to)
        this.chairMove = null
        this.onSceneChange()
      }
    }
    this.sync()
  }

  private finish() {
    const t = this.task
    this.task = null
    t?.done()
  }

  /** Drop whatever the agent was doing (its promise never settles; the run that awaited it is cancelled). */
  clearTask() {
    this.task = null
    this.events = null
  }
}

/** The sample (formula V1) handed between stations: a small vial. */
export class Sample {
  readonly mesh: THREE.Mesh
  private report?: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>

  carryReport(agent: Agent) {
    const hand = agent.sockets.right ?? agent.rightHand
    if (!hand) return
    this.report ??= new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.19, 0.014), new THREE.MeshStandardMaterial({ color: '#f3f5ee' }))
    hand.add(this.report)
    this.report.position.set(0, 0.055, 0.025)
    this.report.visible = true
  }

  hideReport() {
    if (this.report) this.report.visible = false
  }

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly start: THREE.Vector3,
    private readonly drop: THREE.Vector3,
    private readonly scale: number
  ) {
    const geo = new THREE.CylinderGeometry(0.016, 0.016, 0.1, 10)
    geo.translate(0, 0.05, 0)
    const mat = new THREE.MeshStandardMaterial({ color: '#2fb3a8', roughness: 0.4, emissive: '#0b5c56', emissiveIntensity: 0.6 })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.name = 'sample_v1'
    this.reset()
  }

  private place(p: THREE.Vector3) {
    this.scene.add(this.mesh)
    this.mesh.position.copy(p)
    this.mesh.rotation.set(0, 0, 0)
    this.mesh.scale.setScalar(this.scale)
  }

  reset() {
    this.mesh.visible = true
    this.place(this.start)
  }

  hide() {
    this.mesh.visible = false
  }

  putDown() {
    this.place(this.drop)
  }

  /** Carried in the right hand (bone space is in character metres). */
  pickUp(agent: Agent) {
    const hand = agent.rightHand
    if (!hand) return
    hand.add(this.mesh)
    this.mesh.position.set(0, 0.07, 0.025)
    this.mesh.rotation.set(0, 0, 0)
    this.mesh.scale.setScalar(1)
  }

  dispose() {
    this.report?.removeFromParent()
    this.report?.geometry.dispose()
    this.report?.material.dispose()
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
