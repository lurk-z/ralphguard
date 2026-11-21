import { ROLE_EN } from "./engine.ts";
import { isChatAssessment, type ChatAssessment } from "./chat-assessment.ts";
import { scopeKey, type AgentRole, type DemoScope, type LabDemoState } from "./events.ts";

type Message = { id: string; role: "user" | "assistant"; text: string; time: number; publicSteps?: string[]; startedAt?: number; assessment?: ChatAssessment; receipt?: boolean };
export function publicSteps(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && Boolean(v.trim())).slice(0, 30).map(v => v.slice(0, 500)) : [];
}
export type Transcript = { id: string; agent: AgentRole; messages: Message[]; updatedAt: number };
const MAX_MESSAGES = 60;
const MAX_THREADS_PER_AGENT = 20;

export function restoreThreads(value: unknown): Transcript[] {
  if (!Array.isArray(value)) return [];
  const timestamp = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 8.64e15;
  return value.flatMap((item) => {
    if (typeof item?.id !== "string" || !Object.hasOwn(ROLE_EN, item.agent) || !Array.isArray(item.messages)) return [];
    const messages: Message[] = item.messages.filter((m: Partial<Message> | null) =>
      typeof m?.id === "string" && (m.role === "assistant" || m.role === "user") && typeof m.text === "string" && timestamp(m.time))
      .map((m: Message) => {
        // Old workflow transcripts stored the receipt as prose under these generated ids.
        const legacyReceipt = m.role === "assistant" && (m.id.endsWith(":accept") ||
          (/:msg-\d+$/.test(m.id) && m.text === "รับงานแล้ว กำลังตรวจโจทย์ที่ส่งมา"));
        return { ...m, publicSteps: publicSteps(m.publicSteps), startedAt: timestamp(m.startedAt) ? m.startedAt : undefined,
          receipt: m.receipt === true || legacyReceipt, assessment: isChatAssessment(m.assessment) ? m.assessment : undefined };
      });
    const last = messages.at(-1);
    return last ? [{ id: item.id, agent: item.agent as AgentRole, messages: trimMessages(messages), updatedAt: timestamp(item.updatedAt) ? item.updatedAt : last.time }] : [];
  });
}

function trimMessages(messages: Message[]) {
  // Keep the first question as the title, even for long conversations.
  return messages.length <= MAX_MESSAGES ? messages : [messages[0], ...messages.slice(1 - MAX_MESSAGES)];
}

type StorageAccess = Pick<Storage, "getItem" | "setItem">;
type Snapshot = { saved: Transcript[]; previousSession: Transcript[] };
export const emptyHistory: Snapshot = { saved: [], previousSession: [] };

/** Store private transcripts independently of the simulated jobs, which only run in this session. */
export function createChatArchive(storage: () => StorageAccess, sessionId: string) {
  const scopes = new Map<string, Snapshot>();
  const listeners = new Set<() => void>();
  const keyFor = (scope: DemoScope) => "ralphlab:workflow-chat:v1:" + scopeKey(scope);
  function load(scope: DemoScope) {
    const key = keyFor(scope);
    let snapshot = scopes.get(key);
    if (!snapshot) {
      let saved: Transcript[] = [];
      try { saved = restoreThreads(JSON.parse(storage().getItem(key) || "[]")); } catch { /* Storage is optional. */ }
      snapshot = { saved, previousSession: saved };
      scopes.set(key, snapshot);
    }
    return snapshot;
  }
  function update(scope: DemoScope, snapshot: Snapshot) {
    const key = keyFor(scope);
    scopes.set(key, snapshot);
    try { storage().setItem(key, JSON.stringify(snapshot.saved)); } catch { /* Still available until reload. */ }
    listeners.forEach((notify) => notify());
  }
  function append(scope: DemoScope, state: LabDemoState, start: number) {
    const snapshot = load(scope);
    let saved = snapshot.saved;
    for (const m of state.messages.slice(start)) {
      const thread = state.threads[m.threadId];
      if (thread?.kind !== "private") continue;
      const old = saved.find((row) => row.id === m.threadId);
      // A delivery can start a private thread. Late replies must not resurrect a deleted thread.
      const firstDelivery = !old && state.log.at(-1)?.type === "handoff.accepted" &&
        !state.messages.slice(0, start).some((entry) => entry.threadId === m.threadId);
      if (!old && m.kind !== "user" && !firstDelivery) continue;
      const agent = thread.participants[0];
      let text: string;
      if (m.kind === "handoff") {
        const h = state.handoffs[m.handoffId];
        text = ROLE_EN[h.from] + " → " + ROLE_EN[h.to] + " · " + h.title;
      } else if (m.kind === "pointer") {
        text = "ส่งงานไปยังกลุ่ม · " + state.jobs[m.jobId].title;
      } else if (m.kind === "job-intro") continue;
      else text = m.text;
      const time = state.log.at(-1)?.occurredAt ?? Date.now();
      const message: Message = { id: sessionId + ":" + m.messageId, role: m.kind === "user" ? "user" : "assistant", text, time };
      if (m.kind === "agent" && m.activity) message.publicSteps = [m.activity];
      if (m.kind === "agent" && m.assessment) message.assessment = m.assessment;
      if (m.kind === "acceptance" || (m.kind === "agent" && m.taskId && m.inReplyTo)) message.receipt = true;
      const event = state.log.at(-1);
      if (event?.type === "task.completed") message.publicSteps = state.tasks[event.taskId].steps.map(step => step.label);
      const row = { id: m.threadId, agent, updatedAt: time, messages: trimMessages([...(old?.messages ?? []), message]) };
      const others = saved.filter((item) => item.id !== row.id);
      const evicted = others.filter((item) => item.agent === agent).slice(MAX_THREADS_PER_AGENT - 1);
      saved = [row, ...others.filter((item) => !evicted.includes(item))];
    }
    if (saved !== snapshot.saved) update(scope, { ...snapshot, saved });
  }
  function remove(scope: DemoScope, id: string) {
    const { saved, previousSession } = load(scope);
    update(scope, { saved: saved.filter((t) => t.id !== id), previousSession: previousSession.filter((t) => t.id !== id) });
  }
  function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }
  return { load, append, remove, subscribe };
}
