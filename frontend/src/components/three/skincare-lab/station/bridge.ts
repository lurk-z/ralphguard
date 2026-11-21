import type { ArchiveRecord } from '@/lib/lab-station/archive'
import type { EndpointOutcome, TestedRevision } from '@/lib/lab-station/assessment'
import type { StationEndpointId } from '@/lib/lab-station/endpoints'

/**
 * What the station panel (DOM) asks the 3D scene to do. The scene registers an implementation;
 * every call resolves when the visible action is finished (or right away when no scene is loaded).
 * The scene only visualises: it never decides a result, and its timers never produce one.
 */
export type StationDirector = {
  /** The formulator hands over the master vial; the four aliquots of the same formula appear. */
  prepare(revision: TestedRevision, archive: ArchiveRecord[]): Promise<void>
  /** Walk, pick up the aliquot, place it in its tray, dispense one drop. */
  runTest(endpoint: StationEndpointId): Promise<void>
  /** Show the returned outcome on the tray (display card, illustrative reaction). */
  showOutcome(endpoint: StationEndpointId, outcome: EndpointOutcome | null): void
  /** Carry the aliquot to the fridge slot, door open → place → door closed. */
  store(endpoint: StationEndpointId, slot: number): Promise<void>
  /** Carry the aliquot to the bin, lid open → release → lid closed; the vial leaves the scene. */
  discard(endpoint: StationEndpointId): Promise<void>
  /** Kept vials (any revision of this project) shown in their fridge slots. */
  showArchive(records: ArchiveRecord[]): void
  /** Leave the station: hide the session's props and give the agents back to the lab loop. */
  release(): void
}

export type StationPick = { kind: 'aliquot'; endpoint: StationEndpointId } | { kind: 'stored'; slot: number }

export type StationBridge = {
  director: StationDirector | null
  /** Set by the panel: called when the user clicks a station prop in 3D. */
  onPick: ((pick: StationPick) => void) | null
  setDirector(d: StationDirector | null): void
  /** Called whenever the scene registers or drops its director. Returns an unsubscribe. */
  subscribe(fn: () => void): () => void
}

export function createStationBridge(): StationBridge {
  const listeners = new Set<() => void>()
  const bridge: StationBridge = {
    director: null,
    onPick: null,
    setDirector(d) {
      bridge.director = d
      listeners.forEach((fn) => fn())
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  return bridge
}
