import { Cancelled, type Agent, type Sample } from './agent'
import { HANDOFFS, type Progress } from './handoffDemo'

export type Role = 'director' | 'researcher' | 'formulator' | 'analyst' | 'evaluator'
export type Team = Record<Role, Agent>

/**
 * Rework routes the evaluator cycles through (step 5 of the lab workflow):
 *  - screening says the risk is above the limit   → researcher + formulator
 *  - the formula breaks a constraint              → formulator
 *  - not enough evidence for an ingredient         → researcher
 *  - prediction unreliable / outside the domain    → analyst (model expert)
 */
const ROUTES: Role[][] = [['researcher', 'formulator'], ['formulator'], ['researcher'], ['analyst']]

/** Walk to `target`'s visiting spot and talk; a standing owner turns round and answers. */
async function visit(team: Team, from: Role, target: Role) {
  const a = team[from]
  const b = team[target]
  await a.walkTo(b.cfg.visit)
  if (b.cfg.station.kind === 'stand') {
    await b.faceTowards(a.pos)
    void b.talk(1)
  }
  await a.talk(1)
  if (b.cfg.station.kind === 'stand') {
    await b.turnTo(b.cfg.station.yaw)
    b.play(b.cfg.station.clip)
  }
}

/** Leave the station (standing up first when seated), visit, then come back. */
async function errand(team: Team, from: Role, targets: Role[]) {
  const a = team[from]
  if (a.seated) await a.standUp()
  for (const t of targets) await visit(team, from, t)
  await a.goHome()
}

/** One pass through the five-step lab workflow. */
async function cycle(team: Team, sample: Sample, n: number) {
  const { director, researcher, formulator, analyst, evaluator } = team
  // 1. The lab director takes the brief at the Formulation Notes board, then opens the project with the researcher.
  await director.talk(1)
  await errand(team, 'director', ['researcher'])
  // 2. The researcher studies the options and brings a proposal to the formulator.
  await researcher.work(4)
  await errand(team, 'researcher', ['formulator'])
  // 3. The formulator builds sample V1 at the bench and carries it to the analyst.
  await formulator.work(formulator.duration('Bench_Work'))
  sample.pickUp(formulator)
  await formulator.walkTo(analyst.cfg.visit)
  await formulator.talk(1)
  sample.putDown()
  await formulator.goHome()
  // 4. The analyst runs every endpoint (QSAR etc.) and reports to the evaluator.
  await analyst.work(6)
  await errand(team, 'analyst', ['evaluator'])
  // 5. The evaluator compares the results with the brief and routes the rework.
  await evaluator.talk(1)
  await errand(team, 'evaluator', ROUTES[n % ROUTES.length])
  sample.reset()
  await director.wait(2)
}

export async function runWorkflow(team: Team, sample: Sample, signal: { cancelled: boolean }, publish?: (progress: Progress) => void) {
  try {
    if (publish) {
      sample.hide()
      for (const [index, row] of HANDOFFS.entries()) {
        if (signal.cancelled) return
        if (row.item === 'sample') sample.hide()
        publish({ index, delivered: false })
        const sender = team[row.from]
        await sender.work(2)
        if (sender.seated) await sender.standUp()
        if (row.item === 'sample') {
          sample.reset()
          sample.pickUp(sender)
        }
        if (row.item === 'report') sample.carryReport(sender)
        await visit(team, row.from, row.to)
        if (signal.cancelled) return
        if (row.item === 'sample') sample.putDown()
        sample.hideReport()
        publish({ index, delivered: true })
        await sender.goHome()
      }
      return
    }
    for (let n = 0; !signal.cancelled; n++) await cycle(team, sample, n)
  } catch (e) {
    if (!(e instanceof Cancelled)) throw e
  }
}
