import type { ArchiveRecord } from '@/lib/lab-station/archive'
import type { EndpointOutcome, TestedRevision } from '@/lib/lab-station/assessment'
import type { StationEndpointId } from '@/lib/lab-station/endpoints'
import { Cancelled, type Agent, type Clip } from '../agents/agent'
import type { LoopControl } from '../agents/loopControl'
import type { Team } from '../agents/workflow'
import type { StationDirector } from './bridge'
import type { StationProps } from './stationProps'
import CLIPS from './stationClips.json'

const EV = CLIPS.events as Record<string, Record<string, number>>

/**
 * Drives the analyst (and the formulator's hand-off) through the station with the baked clips.
 * One reusable pick → place → dispense sequence serves every tray; the targets come from the
 * station's approach / slot empties, so trays can move or be added without touching this file.
 * Operations run one after another; leaving the station cancels whatever is running.
 */
export class StationSceneDirector implements StationDirector {
  private signal = { cancelled: false }
  private queue: Promise<unknown> = Promise.resolve()
  private active = false

  constructor(
    private readonly props: StationProps,
    private readonly team: Team,
    private readonly loop: LoopControl
  ) {}

  private get analyst() {
    return this.team.analyst
  }

  /** Queue an operation; it runs after the previous one, under this session's signal. */
  private run<T>(op: (sig: { cancelled: boolean }) => Promise<T>): Promise<T> {
    const sig = this.signal
    const next = this.queue.then(() => {
      if (sig.cancelled) throw new Cancelled()
      return op(sig)
    })
    this.queue = next.catch(() => {})
    return next
  }

  private take(agent: Agent, sig: { cancelled: boolean }) {
    agent.signal = sig
    agent.clearTask()
  }

  private async perform(agent: Agent, clip: Clip, on: Record<string, () => void> = {}) {
    await agent.perform(clip, EV[clip] ?? {}, on)
  }

  private async standUp(agent: Agent) {
    if (agent.seated) await agent.standUp()
  }

  // ------------------------------------------------------------------ StationDirector
  prepare(revision: TestedRevision, archive: ArchiveRecord[]) {
    this.release(false)
    this.props.showArchive(archive) // release() cleared the fridge too
    this.active = true
    this.loop.pause(['analyst', 'formulator'])
    const stored = archive.filter((r) => r.assessmentId === revision.assessmentId).map((r) => r.endpoint)
    return this.run(async (sig) => {
      const { formulator, analyst } = this.team
      this.take(formulator, sig)
      this.take(analyst, sig)
      const props = this.props
      // The formulator brings the master vial (the already mixed formula) to its stand.
      const master = props.node('master_vial')!
      const handoff = (async () => {
        if (!formulator.sockets.left) {
          master.visible = true
          return
        }
        props.holdUpright(master, props.node('master_vial_grip'), formulator.sockets.left)
        formulator.carrying = true
        await formulator.walkTo(props.spot('master_vial_approach'))
        await this.perform(formulator, 'Station_Place', {
          release: () => {
            props.settle(master, props.node('master_vial_slot')!)
            formulator.carrying = false
          },
        })
        formulator.carrying = false
        props.showAliquots(stored)
        void formulator.goHome().catch(() => {})
      })()
      // The analyst leaves the desk and waits at the rack.
      const ready = (async () => {
        await this.standUp(analyst)
        analyst.carrying = false
        await analyst.walkTo(props.spot('rack_slot_skin_approach'))
      })()
      await Promise.all([handoff, ready])
    })
  }

  runTest(ep: StationEndpointId) {
    return this.run(async () => {
      const a = this.analyst
      const p = this.props
      const aliquot = p.node(`aliquot_${ep}`)!
      const dropper = p.node(`aliquot_${ep}_dropper`)!
      await this.standUp(a)
      // pick the aliquot from the rack (left hand)
      await a.walkTo(p.spot(`rack_slot_${ep}_approach`))
      await this.perform(a, 'Station_Pick', {
        grab: () => {
          p.grab(aliquot, a.sockets.left!)
          p.place.set(ep, 'hand')
          a.carrying = true
        },
      })
      // put it in its tray
      await a.walkTo(p.spot(`tray_${ep}_approach`))
      await this.perform(a, 'Station_Place', {
        release: () => {
          p.settle(aliquot, p.node(`tray_${ep}_vial_slot`)!)
          p.place.set(ep, 'tray')
          a.carrying = false
        },
      })
      // dropper out of the vial, one drop over the insert, dropper back (right hand)
      await this.perform(a, 'Station_Dispense', {
        grab: () => p.grab(dropper, a.sockets.right!),
        drop: () => p.dispenseDrop(ep),
        release: () => p.reseat(dropper),
      })
    })
  }

  showOutcome(ep: StationEndpointId, outcome: EndpointOutcome | null) {
    this.props.showOutcome(ep, outcome)
  }

  private async pickFromTray(ep: StationEndpointId) {
    const a = this.analyst
    const p = this.props
    const aliquot = p.node(`aliquot_${ep}`)!
    await this.standUp(a)
    await a.walkTo(p.spot(`tray_${ep}_approach`))
    await this.perform(a, 'Station_Pick', {
      grab: () => {
        p.grab(aliquot, a.sockets.left!)
        p.place.set(ep, 'hand')
        a.carrying = true
      },
    })
    return aliquot
  }

  store(ep: StationEndpointId, slot: number) {
    return this.run(async () => {
      const a = this.analyst
      const p = this.props
      const aliquot = await this.pickFromTray(ep)
      await a.walkTo(p.spot('fridge_door_open_approach'))
      p.playProp('Fridge_Door_Open')
      await this.perform(a, 'Fridge_Open')
      await a.walkTo(p.spot(`fridge_slot_${slot}_approach`))
      await this.perform(a, 'Station_Place', {
        release: () => {
          p.settle(aliquot, p.fridgeSlot(slot)!)
          p.adoptIntoFridge(ep, slot)
          a.carrying = false
        },
      })
      await a.walkTo(p.spot('fridge_door_close_approach'))
      p.playProp('Fridge_Door_Close')
      await this.perform(a, 'Fridge_Close')
      await a.walkTo(p.spot('rack_slot_skin_approach'))
    })
  }

  discard(ep: StationEndpointId) {
    return this.run(async () => {
      const a = this.analyst
      const p = this.props
      const aliquot = await this.pickFromTray(ep)
      await a.walkTo(p.spot('bin_approach'))
      p.playProp('Bin_Lid_Open')
      await a.wait(0.35)
      await this.perform(a, 'Bin_Release', {
        release: () => {
          p.dropIntoBin(aliquot)
          p.place.set(ep, 'gone')
          a.carrying = false
        },
      })
      p.playProp('Bin_Lid_Close')
      await a.walkTo(p.spot('rack_slot_skin_approach'))
    })
  }

  showArchive(records: ArchiveRecord[]) {
    this.props.showArchive(records)
  }

  /** Leave the station. `resumeLoop` false is used internally when a new session replaces this one. */
  release(resumeLoop = true) {
    this.signal.cancelled = true
    this.signal = { cancelled: false }
    this.queue = Promise.resolve()
    this.props.clearSession()
    for (const r of ['analyst', 'formulator'] as const) {
      this.team[r].carrying = false
      this.team[r].clearTask()
    }
    if (resumeLoop && this.active) {
      this.active = false
      this.loop.resume()
    }
  }
}
