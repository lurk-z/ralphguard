import assert from "node:assert/strict";
import test from "node:test";
import { createDemoStore, createLabDemo, createMockTransport, DEMO_PLAYBOOK, type Fault } from "../src/lib/lab-demo/engine.ts";
import { counts, type AgentRole } from "../src/lib/lab-demo/events.ts";

const roles: AgentRole[] = ["director", "researcher", "formulator", "analyst", "evaluator"];
const brief = "ทำสูตรลดสิวให้หน่อย";

function rehearsal(faults: Fault[] = []) {
  return createLabDemo({
    store: createDemoStore(), scope: { userId: "guest", projectId: "qa", mode: "demo" },
    experimentId: "D01", transport: createMockTransport({ faults }), playbook: DEMO_PLAYBOOK,
  });
}

for (const role of roles) {
  test(`commission from ${role} reaches the Evaluator once despite lost acknowledgements`, async () => {
    const demo = rehearsal([{ attempt: 1, kind: "ack-lost" }]);
    const result = await demo.submit(role, brief);
    await demo.idle();
    const invitation = demo.state().jobs[result.jobId!].invitation;
    assert.equal(invitation?.status, "pending");
    assert.equal(counts(demo.state()).groupThreads, 0);
    assert.equal(Object.values(demo.state().tasks).length, 2);
    assert.ok(demo.state().messages.some(m => m.kind === "group-invite" && m.threadId === invitation.threadId && m.text.includes("สูตรลดสิว")));
    demo.decideGroup(result.jobId!, true);
    demo.decideGroup(result.jobId!, true);
    await demo.idle();
    const state = demo.state();
    const tasks = Object.values(state.tasks);
    assert.equal(tasks.length, 5);
    assert.deepEqual(tasks.map(task => task.owner), roles);
    assert.ok(tasks.every(task => task.jobId === result.jobId && task.status === "completed"));
    assert.match(tasks[4].summary!, /ยังเลือกสูตรที่ดีที่สุดไม่ได้/);
    const job = state.jobs[result.jobId!];
    assert.equal(new Set(job.assignees).size, 5);
    assert.equal(counts(state).pointers, 1);
    assert.equal(counts(state).handoffs, role === "director" ? 4 : 5);
    for (const delivery of Object.values(state.handoffs)) {
      assert.notEqual(delivery.from, delivery.to);
      assert.equal(delivery.status, "accepted");
      assert.equal(delivery.attempts, 2);
      assert.ok(state.messages.some(message => message.messageId === delivery.sourceMessageId));
    }
  });
}

test("a small command completes in its owner's private chat; asking a question starts no task", async () => {
  const demo = rehearsal();
  await demo.submit("analyst", "V1 มีอะไรบ้าง");
  assert.equal(counts(demo.state()).tasks, 0);
  const result = await demo.submit("analyst", "ช่วยตรวจสี่ด้านของ V1");
  await demo.idle();
  const state = demo.state();
  const task = state.tasks[result.taskId!];
  assert.equal(task.status, "completed");
  assert.deepEqual(task.steps.map(step => step.stepId), ["skin", "eye", "sensitization", "acute"]);
  assert.equal(counts(state).handoffs, 0);
  assert.equal(counts(state).groupThreads, 0);
  assert.equal(state.jobs[result.jobId!].assignees.length, 1);
});

test("assessment replies only graph results delivered for the requested thread and version", async () => {
  const demo = rehearsal();
  const question = "ขอดูกราฟผลประเมิน V1";
  await demo.submit("analyst", question);
  const lastReply = () => demo.state().messages.filter(m => m.kind === "agent").at(-1);
  assert.equal(lastReply()?.assessment, undefined);
  await demo.submit("analyst", "ช่วยตรวจสี่ด้านของ V1");
  await demo.idle();
  const result = lastReply()?.assessment;
  assert.equal(result?.source, "demo");
  assert.equal(result?.rows.length, 4);
  assert.equal(result?.rows.filter(row => row.score === null).length, 2);
  await demo.submit("analyst", question);
  assert.equal(lastReply()?.assessment?.view, "chart");
  assert.deepEqual(lastReply()?.assessment?.rows, result?.rows);
  await demo.submit("analyst", "ขอตารางผลประเมิน V2");
  assert.equal(lastReply()?.assessment, undefined);
  await demo.submit("researcher", question);
  assert.equal(lastReply()?.assessment, undefined);
});

test("a failed intermediate delivery resumes from the same handoff to the final review", async () => {
  const handoffId = "qa:D01:job:qa:D01:msg-1:handoff:researcher->formulator";
  const demo = rehearsal([1, 2].map(attempt => ({ attempt, kind: "unreachable", handoffId })));
  const { jobId } = await demo.submit("director", brief);
  await demo.idle();
  demo.decideGroup(jobId!, true);
  await demo.idle();
  assert.equal(demo.state().handoffs[handoffId].status, "failed");
  assert.equal(counts(demo.state()).tasks, 2);
  await demo.retry(handoffId);
  await demo.idle();
  assert.equal(demo.state().handoffs[handoffId].attempts, 3);
  assert.deepEqual(Object.values(demo.state().tasks).map(task => task.status), roles.map(() => "completed"));
});

test("declining keeps the entire job private and delivers the summary to each owner", async () => {
  const demo = rehearsal();
  const { jobId } = await demo.submit("director", brief);
  await demo.idle();
  demo.decideGroup(jobId!, false);
  demo.decideGroup(jobId!, true);
  await demo.idle();
  const state = demo.state();
  assert.equal(counts(state).groupThreads, 0);
  for (const task of Object.values(state.tasks)) {
    assert.equal(task.status, "completed");
    assert.ok(task.workThreadId?.includes(":private:" + task.owner));
    assert.equal(state.messages.filter(m => m.kind === "agent" && m.text === task.summary && m.threadId === task.workThreadId).length, 1);
  }
  assert.equal(Object.keys(state.tasks).length, 5);
});
