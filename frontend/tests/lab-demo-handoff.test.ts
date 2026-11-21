import assert from "node:assert/strict";
import test from "node:test";

import { counts, type DemoScope, type LabEvent } from "../src/lib/lab-demo/events.ts";
import { createDemoStore, createLabDemo, createMockTransport, type Fault, type Playbook } from "../src/lib/lab-demo/engine.ts";
import { classifyIntent } from "../src/lib/lab-demo/intent.ts";

const P1: DemoScope = { userId: "demo-user", projectId: "demo-p1", mode: "demo" };
const P2: DemoScope = { userId: "demo-user", projectId: "demo-p2", mode: "demo" };
const CLEANSER = "ช่วยทำคลีนเซอร์สำหรับผิวเป็นสิวง่ายให้หน่อย";

/** The milestone-1 totals (group-chat totals are checked separately). */
function core(state: Parameters<typeof counts>[0]) {
  const { handoffs, tasks, acceptances, handoffLines, vials, formulaNodes } = counts(state);
  return { handoffs, tasks, acceptances, handoffLines, vials, formulaNodes };
}

function setup(faults: Fault[] = []) {
  const store = createDemoStore();
  const transport = createMockTransport({ faults });
  const p1 = createLabDemo({ store, scope: P1, experimentId: "D01", transport });
  const p2 = createLabDemo({ store, scope: P2, experimentId: "D01", transport });
  return { store, transport, p1, p2 };
}

/** Compact, readable event trace: "3 handoff.sent analyst→director #1". */
function trace(log: LabEvent[]) {
  return log.map((e) => {
    switch (e.type) {
      case "message.user": return `${e.sequence} message.user →${e.to}`;
      case "message.agent": return `${e.sequence} message.agent ${e.from}`;
      case "handoff.sent": return `${e.sequence} handoff.sent ${e.from}→${e.to} #${e.attempt}`;
      case "handoff.attempt_failed": return `${e.sequence} handoff.attempt_failed #${e.attempt} ${e.reason}`;
      case "handoff.gave_up": return `${e.sequence} handoff.gave_up #${e.attempt}`;
      case "handoff.accepted": return `${e.sequence} handoff.accepted by ${e.by} #${e.attempt} ${e.receiptId}`;
      case "job.promoted": return `${e.sequence} job.promoted [${e.assignees.join(",")}]`;
      case "job.group_requested":
      case "job.group_declined": return `${e.sequence} ${e.type}`;
      case "task.started": return `${e.sequence} task.started ${e.owner}`;
      case "task.planned": return `${e.sequence} task.planned ${e.taskId.split(":").at(-1)} ${e.steps.length}`;
      case "task.step": return `${e.sequence} task.step ${e.stepId} ${e.status}`;
      case "task.completed": return `${e.sequence} task.completed ${e.taskId.split(":").at(-1)}`;
    }
  });
}

test("Analyst delegates the cleanser brief to the Director; lost first ack is retried once and replays the receipt", async (t) => {
  const { p1, transport } = setup([{ attempt: 1, kind: "ack-lost" }]);
  const result = await p1.submit("analyst", CLEANSER);
  const state = p1.state();
  const sequence = trace(state.log);
  t.diagnostic(sequence.join("\n"));

  assert.deepEqual(sequence, [
    "1 message.user →analyst",
    "2 message.agent analyst",
    "3 handoff.sent analyst→director #1",
    "4 handoff.attempt_failed #1 ack-lost",
    "5 handoff.sent analyst→director #2",
    `6 handoff.accepted by director #2 rcpt:${result.handoffId}`,
  ]);
  // The recipient processed attempt 1, lost the ack, then replayed the same receipt on attempt 2.
  assert.deepEqual(transport.calls.map((c) => `${c.attempt}:${c.outcome}`), ["1:ack-lost", "2:replayed"]);
  assert.equal(transport.receiptsCreated(), 1);

  assert.deepEqual(core(state), { handoffs: 1, tasks: 1, acceptances: 1, handoffLines: 1, vials: 0, formulaNodes: 0 });
  const [task] = Object.values(state.tasks);
  assert.equal(task.owner, "director");
  assert.equal(task.taskId, result.taskId);
  const handoff = state.handoffs[result.handoffId!];
  assert.equal(handoff.status, "accepted");
  assert.equal(handoff.attempts, 2);
  assert.equal(handoff.from, "analyst");
  assert.equal(handoff.experimentId, "D01");
  assert.deepEqual(state.threads[handoff.threadId].participants, ["analyst"]);
  assert.deepEqual(state.threads[handoff.recipientThreadId!].participants, ["director"]);
});

test("redelivered and late events change nothing after acceptance", async () => {
  const { p1, store } = setup([{ attempt: 1, kind: "ack-lost" }]);
  const { handoffId } = await p1.submit("analyst", CLEANSER);
  const accepted = p1.state();
  const acceptEvent = accepted.log.find((e) => e.type === "handoff.accepted")!;

  store.apply(P1, acceptEvent); // same event id again
  store.apply(P1, { ...acceptEvent, eventId: "demo-p1:late-dup", sequence: 99 }); // duplicate receipt, new id
  store.emit(P1, { type: "handoff.attempt_failed", handoffId: handoffId!, attempt: 1, reason: "ack-lost", experimentId: "D01", threadId: acceptEvent.threadId });
  store.emit(P1, { type: "handoff.gave_up", handoffId: handoffId!, attempt: 2, experimentId: "D01", threadId: acceptEvent.threadId });

  const after = p1.state();
  assert.equal(after, accepted, "state object is unchanged");
  assert.equal(after.handoffs[handoffId!].status, "accepted");
  assert.deepEqual(core(after), { handoffs: 1, tasks: 1, acceptances: 1, handoffLines: 1, vials: 0, formulaNodes: 0 });
});

test("two failed attempts offer a manual retry on the same handoff; success clears it without duplicates", async () => {
  const { p1, transport } = setup([
    { attempt: 1, kind: "unreachable" },
    { attempt: 2, kind: "ack-lost" },
  ]);
  const { handoffId } = await p1.submit("analyst", CLEANSER);
  assert.equal(p1.state().handoffs[handoffId!].status, "failed");
  assert.equal(Object.keys(p1.state().tasks).length, 0, "no acknowledged task yet");

  await p1.retry(handoffId!);
  const state = p1.state();
  assert.equal(state.handoffs[handoffId!].status, "accepted");
  assert.equal(state.handoffs[handoffId!].attempts, 3);
  assert.deepEqual(transport.calls.map((c) => `${c.attempt}:${c.outcome}`), ["1:unreachable", "2:ack-lost", "3:replayed"]);
  assert.deepEqual(core(state), { handoffs: 1, tasks: 1, acceptances: 1, handoffLines: 1, vials: 0, formulaNodes: 0 });

  await p1.retry(handoffId!); // no longer offered: no-op
  assert.equal(p1.state(), state);
});

test("a read-only question creates zero tasks, handoffs or formulas", async () => {
  const { p1, transport } = setup();
  const result = await p1.submit("analyst", "V1 มีอะไรบ้าง");
  assert.equal(result.intent.kind, "read");
  const state = p1.state();
  assert.deepEqual(core(state), { handoffs: 0, tasks: 0, acceptances: 0, handoffLines: 0, vials: 0, formulaNodes: 0 });
  assert.deepEqual(state.messages.map((m) => m.kind), ["user", "agent"]);
  assert.equal(transport.calls.length, 0);
});

test("retrying in one project cannot change another project's state", async () => {
  const { p1, p2, store } = setup([{ attempt: 1, kind: "unreachable" }, { attempt: 2, kind: "unreachable" }]);
  await p2.submit("researcher", "V1 มีอะไรบ้าง");
  const p2Before = p2.state();

  const { handoffId } = await p1.submit("analyst", CLEANSER);
  await p1.retry(handoffId!);
  // An event stamped for P1 but applied to P2 is ignored.
  const foreign = p1.state().log.at(-1)!;
  store.apply(P2, foreign);

  assert.equal(p2.state(), p2Before);
  assert.deepEqual(core(p2.state()), { handoffs: 0, tasks: 0, acceptances: 0, handoffLines: 0, vials: 0, formulaNodes: 0 });
  assert.equal(counts(p1.state()).tasks, 1);
  // Same experiment name in both projects, different identities.
  assert.ok(Object.keys(p1.state().handoffs).every((id) => id.startsWith("demo-p1:D01:")));
});

test("intent: questions read, orders commission, unclear input asks back", () => {
  assert.equal(classifyIntent("V1 มีอะไรบ้าง").kind, "read");
  assert.equal(classifyIntent("ใน V1 มีน้ำหอมไหม").kind, "read");
  assert.equal(classifyIntent("ช่วยดูข้อจำกัดของผลนี้").kind, "read");
  assert.deepEqual(classifyIntent(CLEANSER), { kind: "commission", multiRole: true, title: CLEANSER });
  assert.equal(classifyIntent("ลองสูตรไม่มีน้ำหอมอีกทาง").kind, "commission");
  assert.equal(classifyIntent("น้ำหอม").kind, "clarify");
});

// ---------------------------------------------------------------- group chat (milestone 3)

/** Small fixture for isolating the promotion boundary and transport-failure cases. */
const twoRoleFixture: Playbook = (handoff) => {
  if (handoff.to === "director") {
    return {
      steps: [
        { id: "brief", label: "อ่านโจทย์และข้อจำกัด" },
        { id: "criteria", label: "กำหนดเกณฑ์และจำนวนรอบ (สูงสุด 2 รุ่น)" },
        { id: "assign", label: "มอบหมาย Researcher", handoff: { to: "researcher", title: "ศึกษาเบสล้าง A/B และหลักฐานที่ยังขาด" } },
      ],
      summary: "เปิดโจทย์ D01 แล้ว · Researcher รับงานหลักฐาน",
    };
  }
  if (handoff.to === "researcher") {
    return {
      steps: [
        { id: "records", label: "ค้นบันทึกหลักฐาน E01" },
        { id: "bases", label: "เทียบหน้าที่เบสล้าง A/B", waitFor: "รอหลักฐานความระคายเคืองของเบส B" },
        { id: "gaps", label: "สรุปข้อมูลที่ยังขาด" },
      ],
      summary: "เสนอเบส A เป็นฐานเปรียบเทียบ · หลักฐานประสิทธิผลด้านสิวยังขาด",
    };
  }
  return null;
};

function setupWithScript(faults: Fault[] = []) {
  const store = createDemoStore();
  const transport = createMockTransport({ faults });
  const p1 = createLabDemo({ store, scope: P1, experimentId: "D01", transport, playbook: twoRoleFixture });
  return { store, transport, p1 };
}

async function acceptInvitation(demo: ReturnType<typeof createLabDemo>, jobId: string) {
  await demo.idle();
  assert.equal(demo.state().jobs[jobId].invitation?.status, "pending");
  demo.decideGroup(jobId, true);
  await demo.idle();
}

test("Researcher receives the handoff in private and the approved group links to its first message", async (t) => {
  const { p1 } = setupWithScript([{ attempt: 1, kind: "ack-lost" }]);
  const { jobId } = await p1.submit("analyst", CLEANSER);
  await acceptInvitation(p1, jobId!);
  const state = p1.state();
  t.diagnostic(trace(state.log).join(" | "));

  // Handoff and promotion events only, in order; task steps are checked in the checklist tests.
  const handoffTrace = trace(state.log.filter((e) => !e.type.startsWith("task."))).map((line) => line.replace(/ rcpt:.*/, "").replace(/^\d+ /, ""));
  assert.deepEqual(handoffTrace, [
    "message.user →analyst",
    "message.agent analyst",
    "handoff.sent analyst→director #1",
    "handoff.attempt_failed #1 ack-lost",
    "handoff.sent analyst→director #2",
    "handoff.accepted by director #2",
    "handoff.sent director→researcher #1",
    "handoff.attempt_failed #1 ack-lost",
    "handoff.sent director→researcher #2",
    "handoff.accepted by researcher #2",
    "job.group_requested",
    "job.promoted [analyst,director,researcher]",
  ]);

  const job = state.jobs[jobId!];
  const privateId = "demo-p1:D01:private:analyst";
  const groupId = "demo-p1:group";
  assert.deepEqual(job.assignees, ["analyst", "director", "researcher"]);
  assert.equal(job.threadId, groupId);
  assert.equal(job.originThreadId, privateId);
  assert.deepEqual(counts(state), { handoffs: 2, tasks: 2, acceptances: 2, handoffLines: 2, groupThreads: 1, pointers: 1, vials: 0, formulaNodes: 0 });

  assert.deepEqual(state.threads[privateId].participants, ["analyst"]);
  const inThread = (id: string) => state.messages.filter((m) => m.threadId === id).map((m) => m.kind === "agent" || m.kind === "acceptance" ? `${m.kind}:${m.from}` : m.kind);
  assert.deepEqual(inThread(privateId), ["user", "agent:analyst", "handoff", "pointer"]);
  assert.deepEqual(inThread(job.invitation!.threadId), ["agent:director", "acceptance:researcher", "group-invite"]);
  assert.deepEqual(inThread(groupId), ["job-intro", "agent:researcher", "agent:researcher"]);

  // The pointer resolves to the first group message of this job, labelled with the experiment.
  const pointer = state.messages.find((m) => m.kind === "pointer")!;
  assert.equal(pointer.kind === "pointer" && pointer.targetThreadId, groupId);
  const target = state.messages.find((m) => m.messageId === (pointer.kind === "pointer" ? pointer.targetMessageId : ""))!;
  assert.equal(target.kind, "job-intro");
  assert.equal(target.kind === "job-intro" && target.experimentId, "D01");
  assert.equal(target.kind === "job-intro" && target.jobId, jobId);
});

test("no group with one or two assignees; replays and redeliveries never promote twice", async () => {
  const { p1 } = setup([{ attempt: 1, kind: "ack-lost" }]); // no script: stops at the Director
  await p1.submit("analyst", CLEANSER);
  assert.equal(counts(p1.state()).groupThreads, 0);

  const scripted = setupWithScript();
  const { jobId } = await scripted.p1.submit("analyst", CLEANSER);
  await acceptInvitation(scripted.p1, jobId!);
  const promoted = scripted.p1.state();
  const promotion = promoted.log.find((e) => e.type === "job.promoted")!;
  scripted.store.apply(P1, promotion);
  scripted.store.apply(P1, { ...promotion, eventId: "demo-p1:dup-promote", sequence: 99, pointerMessageId: "x", introMessageId: "y" });
  assert.equal(scripted.p1.state(), promoted);
  assert.equal(promoted.messages.filter((m) => m.kind === "pointer" && m.jobId === jobId).length, 1);
});

test("viewing the group adds no participant; a new private request stays private after the group exists", async () => {
  const { p1 } = setupWithScript();
  const { jobId } = await p1.submit("analyst", CLEANSER);
  await acceptInvitation(p1, jobId!);
  const before = p1.state();
  const group = before.threads["demo-p1:group"];
  // Reading state (what opening the group view does) is side-effect free.
  void before.messages.filter((m) => m.threadId === group.threadId);
  assert.equal(p1.state(), before);
  assert.deepEqual(group.participants, ["analyst", "director", "researcher"]);

  await p1.submit("evaluator", "V1 มีอะไรบ้าง");
  const after = p1.state();
  assert.deepEqual(after.threads["demo-p1:group"].participants, group.participants, "the Evaluator did not join the group");
  assert.equal(after.messages.filter((m) => m.threadId === "demo-p1:group").length, 3);
  assert.deepEqual(after.messages.filter((m) => m.threadId === "demo-p1:D01:private:evaluator").map((m) => m.kind), ["user", "agent"]);
  assert.equal(counts(after).tasks, 2);
});

// ---------------------------------------------------------------- progress checklist (milestone 4)

const stepsOf = (state: ReturnType<ReturnType<typeof createLabDemo>["state"]>, owner: string) => {
  const task = Object.values(state.tasks).find((item) => item.owner === owner)!;
  return { status: task.status, summary: task.summary, steps: task.steps.map((s) => `${s.stepId}:${s.status}`) };
};

test("each owner's checklist follows its own step events, and both tasks complete", async (t) => {
  const { p1 } = setupWithScript();
  const { jobId } = await p1.submit("analyst", CLEANSER);
  await acceptInvitation(p1, jobId!);
  const state = p1.state();
  t.diagnostic(trace(state.log).join(" | "));

  const director = stepsOf(state, "director");
  const researcher = stepsOf(state, "researcher");
  assert.deepEqual(director.steps, ["brief:done", "criteria:done", "assign:done"]);
  assert.equal(director.status, "completed");
  assert.equal(director.summary, "เปิดโจทย์ D01 แล้ว · Researcher รับงานหลักฐาน");
  assert.deepEqual(researcher.steps, ["records:done", "bases:done", "gaps:done"]);
  assert.equal(researcher.status, "completed");

  // One `done` event per step, no extras.
  const doneEvents = (suffix: string) => state.log.filter((e) => e.type === "task.step" && e.status === "done" && e.taskId.endsWith(suffix)).length;
  assert.equal(doneEvents(":task:researcher"), 3);
  // The Researcher's evidence step waited, observably, before finishing.
  assert.ok(state.log.some((e) => e.type === "task.step" && e.stepId === "bases" && e.status === "waiting" && e.note === "รอหลักฐานความระคายเคืองของเบส B"));
  // The Director's "assign" step finished only once the Researcher accepted.
  const assignDone = state.log.findIndex((e) => e.type === "task.step" && e.stepId === "assign" && e.status === "done");
  const researcherAccepted = state.log.findIndex((e) => e.type === "handoff.accepted" && e.by === "researcher");
  assert.ok(researcherAccepted >= 0 && researcherAccepted < assignDone);
  assert.deepEqual(core(state), { handoffs: 2, tasks: 2, acceptances: 2, handoffLines: 2, vials: 0, formulaNodes: 0 });
});

test("redelivered or stale step events add no steps and never reopen a finished step", async () => {
  const { p1, store } = setupWithScript();
  const { jobId } = await p1.submit("analyst", CLEANSER);
  await acceptInvitation(p1, jobId!);
  const done = p1.state();
  const taskEvents = done.log.filter((e) => e.type.startsWith("task."));
  for (const e of taskEvents) store.apply(P1, e); // same ids again
  const active = taskEvents.find((e) => e.type === "task.step" && e.status === "active")!;
  store.apply(P1, { ...active, eventId: "demo-p1:stale-active", sequence: 500 }); // late "active" after done
  const planned = taskEvents.find((e) => e.type === "task.planned")!;
  store.apply(P1, { ...planned, eventId: "demo-p1:replan", sequence: 501 });
  assert.equal(p1.state(), done);
});

test("a failed child handoff leaves the Director's step waiting; manual retry finishes both checklists", async () => {
  const child = "demo-p1:D01:job:demo-p1:D01:msg-1:handoff:director->researcher";
  const { p1 } = setupWithScript([
    { attempt: 1, kind: "unreachable", handoffId: child },
    { attempt: 2, kind: "unreachable", handoffId: child },
  ]);
  await p1.submit("analyst", CLEANSER);
  await p1.idle();
  let state = p1.state();
  assert.equal(state.handoffs[child].status, "failed");
  const director = Object.values(state.tasks).find((task) => task.owner === "director")!;
  assert.equal(director.status, "working");
  assert.deepEqual(director.steps.map((s) => `${s.stepId}:${s.status}`), ["brief:done", "criteria:done", "assign:waiting"]);
  assert.equal(director.steps[2].note, "ส่งงานไม่สำเร็จ · รอลองอีกครั้ง");

  await p1.retry(child);
  await acceptInvitation(p1, state.handoffs[child].jobId);
  state = p1.state();
  assert.equal(stepsOf(state, "director").status, "completed");
  assert.equal(stepsOf(state, "researcher").status, "completed");
  assert.deepEqual(core(state), { handoffs: 2, tasks: 2, acceptances: 2, handoffLines: 2, vials: 0, formulaNodes: 0 });
});
