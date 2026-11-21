import assert from "node:assert/strict";
import test from "node:test";
import { listConversations, messageJobId, privateThreadId, transcriptPreview } from "../src/lib/lab-demo/conversations.ts";
import { createDemoStore, createLabDemo, createMockTransport, DEMO_PLAYBOOK } from "../src/lib/lab-demo/engine.ts";
import { initialState, type DemoScope } from "../src/lib/lab-demo/events.ts";
import { demoJobTitle } from "../src/lib/lab-demo/intent.ts";
import { createChatArchive } from "../src/lib/lab-demo/chat-history.ts";

const scope: DemoScope = { userId: "guest", projectId: "p1", mode: "demo" };
const exp = "D01";

test("new chats with the same agent can be reopened, continued and deleted independently across reloads", async () => {
  const records = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } });
  const archive = createChatArchive(storage, "first-page");
  const store = createDemoStore(archive.append);
  const engine = createLabDemo({ scope, store, experimentId: exp, transport: createMockTransport() });
  const base = privateThreadId(scope.projectId, exp, "analyst");
  const a = base + ":a", b = base + ":b";
  await engine.submit("analyst", "V1 มีอะไรบ้าง", a);
  await engine.submit("analyst", "V2 มีอะไรบ้าง", b);
  await engine.submit("analyst", "ดู V1 อีกครั้ง", a);
  assert.deepEqual(archive.load(scope).saved.map((row) => [row.id, row.messages.length]), [[a, 4], [b, 2]]);
  assert.equal(archive.load(scope).saved[0].messages[0].text, "V1 มีอะไรบ้าง");
  assert.ok(listConversations(engine.state(), exp).find((row) => row.kind === "private" && row.agent === "analyst")?.preview);
  archive.remove(scope, b);
  store.emit(scope, { type: "message.agent", from: "analyst", text: "late reply", messageId: "late", inReplyTo: "b", threadId: b, experimentId: exp });
  const reloaded = createChatArchive(storage, "second-page");
  assert.deepEqual(reloaded.load(scope).previousSession.map((row) => row.id), [a]);
  assert.equal(reloaded.load({ ...scope, userId: "other" }).saved.length, 0);
  assert.equal(reloaded.load({ ...scope, projectId: "other" }).saved.length, 0);
  const next = createLabDemo({ scope, store: createDemoStore(reloaded.append), experimentId: exp, transport: createMockTransport() });
  await next.submit("analyst", "หลังรีเฟรช", a);
  assert.equal(reloaded.load(scope).previousSession[0].messages.length, 4);
  const messages = reloaded.load(scope).saved[0].messages;
  assert.equal(messages.length, 6);
  assert.equal(new Set(messages.map((m) => m.id)).size, 6);
  await assert.rejects(next.submit("director", "wrong agent", a));
});

test("the inbox exposes every private agent before the user writes", () => {
  const inbox = listConversations(initialState(scope.projectId), exp);
  assert.equal(inbox.length, 5);
  assert.ok(inbox.every((c) => c.kind === "private" && !c.time && !c.preview));
});

test("inbox previews show message content and preserve names written by the user", () => {
  const store = createDemoStore();
  const threadId = privateThreadId(scope.projectId, exp, "analyst");
  const context = { threadId, experimentId: exp };
  const latest = () => listConversations(store.get(scope), exp)[0].preview;
  const text = "Analyst · ช่วยอ่านผลนี้ให้หน่อย";
  store.emit(scope, { ...context, type: "message.user", messageId: "m1", to: "analyst", text });
  assert.equal(latest(), text);
  assert.equal(transcriptPreview({ id: "m1", role: "user", time: 1, text }), text);
  store.emit(scope, { ...context, type: "message.agent", messageId: "m2", from: "analyst", inReplyTo: "m1", text: "ได้รับแล้ว" });
  assert.equal(latest(), "ได้รับแล้ว");
  assert.equal(transcriptPreview({ id: "m2", role: "assistant", time: 2, text: "ได้รับแล้ว" }), "ได้รับแล้ว");
  store.emit(scope, { ...context, type: "handoff.sent", handoffId: "h", jobId: "j", taskId: "t", from: "analyst", to: "director",
    title: "ทบทวนผล · V1", sourceMessageId: "m1", attempt: 1 });
  assert.equal(latest(), "ทบทวนผล · V1");
  assert.equal(transcriptPreview({ id: "session:handoff:h", role: "assistant", time: 3, text: "Analyst → Lab Director · ทบทวนผล · V1" }), latest());
});

test("two promoted tasks in one project retain separate titles, previews, members and replies", async () => {
  const store = createDemoStore();
  const engine = createLabDemo({ scope, store, experimentId: exp, transport: createMockTransport(), playbook: DEMO_PLAYBOOK });
  const first = await engine.submit("analyst", "ช่วยทำคลีนเซอร์สำหรับผิวเป็นสิวง่ายให้หน่อย");
  await engine.idle();
  const second = await engine.submit("evaluator", "ช่วยสร้างครีมสำหรับผิวแห้งให้หน่อย");
  await engine.idle();
  assert.notEqual(engine.state().jobs[first.jobId!].invitation?.threadId, engine.state().jobs[second.jobId!].invitation?.threadId);
  engine.decideGroup(first.jobId!, true);
  await engine.idle();
  engine.decideGroup(second.jobId!, true);
  await engine.idle();
  const inbox = () => listConversations(engine.state(), exp);
  const groups = inbox().filter((c) => c.kind === "group");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].jobId, second.jobId);
  assert.equal(groups[0].title, "ครีมสำหรับผิวแห้ง");
  assert.deepEqual(groups[0].agents, ["evaluator", "director", "researcher", "formulator", "analyst"]);
  assert.equal(groups[1].title, "คลีนเซอร์สำหรับผิวเป็นสิวง่าย");
  assert.deepEqual(groups[1].agents, ["analyst", "director", "researcher", "formulator", "evaluator"]);
  const before = engine.state();
  for (const row of groups) {
    const last = before.messages.filter((m) => m.threadId === before.jobs[row.jobId].threadId && messageJobId(before, m) === row.jobId).at(-1);
    assert.ok(row.time && last && "text" in last);
    assert.equal(row.preview, last.text.replace(/\s+/g, " ").trim());
  }
  const pointedJobs = before.messages.filter((m) => m.kind === "pointer" && m.threadId === privateThreadId(scope.projectId, exp, "analyst"));
  assert.equal(pointedJobs.length, 1);
  assert.equal(messageJobId(before, pointedJobs[0]), first.jobId);
  await engine.submitGroup(first.jobId!, "สรุปงานนี้ให้หน่อย");
  const after = engine.state();
  const followups = after.messages.slice(before.messages.length);
  assert.deepEqual(followups.map((m) => m.kind), ["user", "agent"]);
  assert.ok(followups.every((m) => messageJobId(after, m) === first.jobId && m.threadId === after.jobs[first.jobId!].threadId));
  assert.equal(Object.keys(after.handoffs).length, Object.keys(before.handoffs).length);
  const updated = inbox().filter((c) => c.kind === "group");
  assert.equal(updated[0].jobId, first.jobId);
  assert.match(updated[0].preview, /คลีนเซอร์/);
  assert.equal(updated[1].preview, groups[0].preview);
  engine.submitGroup("missing", "สอบถาม");
  engine.submitGroup(first.jobId!, " ");
  assert.equal(engine.state(), after);
});

test("the inbox keeps signed-in scopes separate and accepts an explicit task title", () => {
  const store = createDemoStore();
  const threadId = privateThreadId(scope.projectId, exp, "analyst");
  store.emit(scope, { type: "handoff.sent", jobId: "j", taskId: "t", handoffId: "h", from: "analyst",
    to: "director", title: "ขอเปิดโจทย์ · ช่วยทำโทนเนอร์หน่อย", jobTitle: "ทดลองโทนเนอร์ฤดูหนาว",
    sourceMessageId: "m", attempt: 1, experimentId: exp, threadId });
  assert.equal(store.get(scope).jobs.j.title, "ทดลองโทนเนอร์ฤดูหนาว");
  assert.equal(demoJobTitle("ช่วยทำโทนเนอร์ให้หน่อย"), "โทนเนอร์");
  assert.deepEqual(store.get({ ...scope, userId: "another-user" }).messages, []);
});
