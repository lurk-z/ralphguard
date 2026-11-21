import type { Sample } from './agent'
import { runWorkflow, type Role, type Team } from './workflow'
import type { Progress } from './handoffDemo'

const ROLES: Role[] = ['director', 'researcher', 'formulator', 'analyst', 'evaluator']

/**
 * Starts, pauses and resumes the ambient lab workflow. While the testing station is in use the
 * loop is paused: the agents the station needs are handed over, the others go back to their stations.
 */
export type LoopControl = {
  start(): void
  /** Stop the loop; `handOver` agents are left idle for the caller, the rest walk home. */
  pause(handOver: Role[]): void
  /** Everyone walks home, then the workflow loop runs again. */
  resume(): void
  stop(): void
}

export function createLoopControl(team: Team, sample: Sample, publish?: (progress: Progress) => void): LoopControl {
  let signal = { cancelled: false }
  let paused = false

  const fresh = () => {
    signal.cancelled = true
    signal = { cancelled: false }
    for (const r of ROLES) {
      team[r].signal = signal
      team[r].clearTask()
    }
    return signal
  }

  const homeAll = (roles: Role[]) => Promise.all(roles.map((r) => team[r].goHome().catch(() => {})))

  return {
    start() {
      paused = false
      const s = fresh()
      sample.reset()
      void runWorkflow(team, sample, s, publish)
    },
    pause(handOver) {
      if (paused) return
      paused = true
      fresh()
      sample.hide()
      void homeAll(ROLES.filter((r) => !handOver.includes(r)))
    },
    resume() {
      if (!paused) return
      paused = false
      const s = fresh()
      for (const r of ROLES) team[r].carrying = false
      void homeAll(ROLES).then(() => {
        if (s.cancelled) return
        sample.reset()
        void runWorkflow(team, sample, s, publish)
      })
    },
    stop() {
      signal.cancelled = true
      for (const r of ROLES) team[r].clearTask()
    },
  }
}
