/**
 * Ralph Lab agent demo · store, replaceable handoff transport, and the engine that turns
 * a user's message into events.
 *
 * - The store keeps one `LabDemoState` per scope (user + project + demo mode), above the
 *   lifetime of any view, so switching tabs never strands a task.
 * - `HandoffTransport` is the seam for the backend. The mock below behaves like a recipient
 *   that stores receipts by handoff id: delivering the same handoff again returns the
 *   original receipt instead of creating new work.
 * - A failed handoff is retried automatically once with the same handoff id. If that also
 *   fails the handoff is marked `failed` and `retry()` offers a manual attempt.
 */
import {
  groupThreadId,
  initialState,
  reduce,
  scopeKey,
  type AgentRole,
  type DemoScope,
  type Handoff,
  type LabDemoState,
  type LabEvent,
} from "./events.ts";
import { classifyIntent, ownerFor, type Intent } from "./intent.ts";
import { assessmentViewRequested, demoAssessment, requestedView, type ChatAssessment } from "./chat-assessment.ts";

// ---------------------------------------------------------------- store

type Listener = () => void;
type EventInput = LabEvent extends infer E ? (E extends LabEvent ? Omit<E, "eventId" | "sequence" | "projectId" | "source"> : never) : never;

export function createDemoStore(onMessages?: (scope: DemoScope, state: LabDemoState, start: number) => void) {
  const states = new Map<string, LabDemoState>();
  const sequences = new Map<string, number>();
  const messageNumbers = new Map<string, number>();
  const listeners = new Set<Listener>();

  function get(scope: DemoScope) {
    const key = scopeKey(scope);
    let state = states.get(key);
    if (!state) {
      state = initialState(scope.projectId);
      states.set(key, state);
    }
    return state;
  }

  /** Stamp a new event with the next sequence for its scope and apply it. */
  function emit(scope: DemoScope, input: EventInput): LabEvent {
    const key = scopeKey(scope);
    const sequence = (sequences.get(key) ?? 0) + 1;
    sequences.set(key, sequence);
    const event = { occurredAt: Date.now(), ...input, eventId: `${scope.projectId}:evt-${sequence}`, sequence, projectId: scope.projectId, source: "demo" } as LabEvent;
    return apply(scope, event);
  }

  /** Apply an event as delivered (used for redelivery tests and, later, the backend feed). */
  function apply(scope: DemoScope, event: LabEvent): LabEvent {
    const key = scopeKey(scope);
    const before = get(scope);
    const after = reduce(before, event);
    if (after !== before) {
      states.set(key, after);
      if (after.messages.length > before.messages.length) onMessages?.(scope, after, before.messages.length);
      listeners.forEach((listener) => listener());
    }
    return event;
  }

  /** Message numbers live with the state, so a remounted view never reuses an id. */
  function nextMessageNumber(scope: DemoScope) {
    const key = scopeKey(scope);
    const n = (messageNumbers.get(key) ?? 0) + 1;
    messageNumbers.set(key, n);
    return n;
  }

  function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, emit, apply, subscribe, nextMessageNumber };
}

export type DemoStore = ReturnType<typeof createDemoStore>;

// ---------------------------------------------------------------- transport

export type HandoffRequest = {
  scope: DemoScope;
  handoffId: string;
  taskId: string;
  experimentId: string;
  from: AgentRole;
  to: AgentRole;
  title: string;
  attempt: number;
};

export type Receipt = { receiptId: string; handoffId: string; taskId: string; by: AgentRole; messageId: string; text: string };

export class DeliveryError extends Error {
  readonly reason: "ack-lost" | "unreachable";
  constructor(reason: "ack-lost" | "unreachable") {
    super(`handoff delivery failed: ${reason}`);
    this.reason = reason;
  }
}

export interface HandoffTransport {
  deliver(request: HandoffRequest): Promise<Receipt>;
}

export type Fault = { attempt: number; kind: "ack-lost" | "unreachable"; handoffId?: string };

/**
 * Deterministic stand-in for the recipient agents.
 * `unreachable` fails before the recipient sees the request; `ack-lost` fails after the
 * recipient has already stored the receipt (the case that must not duplicate work).
 */
export function createMockTransport({ faults = [], latencyMs = 0 }: { faults?: Fault[]; latencyMs?: number } = {}) {
  const wait = () => (latencyMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, latencyMs)) : Promise.resolve());
  const receipts = new Map<string, Receipt>();
  const calls: { handoffId: string; attempt: number; outcome: "accepted" | "replayed" | Fault["kind"] }[] = [];

  const transport: HandoffTransport & { receiptsCreated: () => number; calls: typeof calls } = {
    async deliver(request) {
      await wait();
      const fault = faults.find((f) => f.attempt === request.attempt && (!f.handoffId || f.handoffId === request.handoffId));
      if (fault?.kind === "unreachable") {
        calls.push({ handoffId: request.handoffId, attempt: request.attempt, outcome: "unreachable" });
        throw new DeliveryError("unreachable");
      }
      const key = `${scopeKey(request.scope)}|${request.handoffId}`;
      const existing = receipts.get(key);
      const receipt = existing ?? {
        receiptId: `rcpt:${request.handoffId}`,
        handoffId: request.handoffId,
        taskId: request.taskId,
        by: request.to,
        messageId: `${request.handoffId}:accept`,
        text: request.title,
      };
      if (!existing) receipts.set(key, receipt);
      if (fault?.kind === "ack-lost") {
        calls.push({ handoffId: request.handoffId, attempt: request.attempt, outcome: "ack-lost" });
        throw new DeliveryError("ack-lost");
      }
      calls.push({ handoffId: request.handoffId, attempt: request.attempt, outcome: existing ? "replayed" : "accepted" });
      return receipt;
    },
    receiptsCreated: () => receipts.size,
    calls,
  };
  return transport;
}

// ---------------------------------------------------------------- engine

export const ROLE_EN: Record<AgentRole, string> = {
  director: "Lab Director",
  researcher: "Researcher",
  formulator: "Formulation Scientist",
  analyst: "Analyst",
  evaluator: "Evaluator",
};

export type SubmitResult = { intent: Intent; handoffId?: string; taskId?: string; jobId?: string };

/** One observable step of an agent's task. `handoff` steps finish when the recipient accepts. */
export type WorkStep = { id: string; label: string; waitFor?: string; handoff?: { to: AgentRole; title: string } };
export type WorkPlan = { steps: WorkStep[]; summary: string; assessment?: ChatAssessment };
/** What an agent does once it has accepted a handoff (scripted for the demo, live agents later). */
export type Playbook = (handoff: { from: AgentRole; to: AgentRole; title: string }) => WorkPlan | null;

/** Example outputs for the offline command-delivery rehearsal. No assay or QSAR is run here. */
const ROLE_WORK: Record<AgentRole, WorkPlan> = {
  director: {
    steps: [{ id: "brief", label: "บันทึกโจทย์ที่ได้รับ" }, { id: "criteria", label: "ระบุเกณฑ์คัดกรองสี่ด้าน" }],
    summary: "บันทึกโจทย์และเกณฑ์ของงานนี้แล้ว · เดโม",
  },
  researcher: {
    steps: [{ id: "source", label: "เปิดบันทึกตัวอย่าง E01" }, { id: "gaps", label: "ทบทวนช่องว่างของหลักฐาน" }],
    summary: "บันทึกจำลอง E01 มีข้อมูลคัดกรองเบื้องต้น ยังขาดหลักฐานประสิทธิผลของสูตร",
  },
  formulator: {
    steps: [{ id: "recipe", label: "อ่านสูตรตัวอย่าง V1" }, { id: "total", label: "ตรวจสัดส่วนรวมของตัวอย่าง" }],
    summary: "ตัวอย่าง V1 สำหรับซ้อมส่งงาน · ส่วน A 90% และส่วน B 10% รวม 100%",
  },
  analyst: {
    steps: [
      { id: "skin", label: "อ่านผลตัวอย่างด้านการระคายเคืองผิว" },
      { id: "eye", label: "อ่านผลตัวอย่างด้านการระคายเคืองตา" },
      { id: "sensitization", label: "ตรวจช่องข้อมูลการแพ้สัมผัส" },
      { id: "acute", label: "ตรวจขอบเขตข้อมูลพิษเฉียบพลัน" },
    ],
    summary: "ตัวอย่าง V1 มีผลให้เทียบสองด้าน ควรทบทวนผลด้านตาก่อน ส่วนการแพ้สัมผัสและพิษเฉียบพลันยังสรุปไม่ได้",
    assessment: demoAssessment,
  },
  evaluator: {
    steps: [{ id: "coverage", label: "เทียบข้อมูลสี่ด้านกับโจทย์" }, { id: "decision", label: "บันทึกข้อดีและข้อจำกัด" }],
    summary: "สรุปเดโม V1 · ข้อดี: มีผลคัดกรองผิวให้เทียบ · ข้อจำกัด: ข้อมูลการแพ้สัมผัสและพิษเฉียบพลันยังสรุปไม่ได้ จึงยังเลือกสูตรที่ดีที่สุดไม่ได้",
  },
};

const NEXT_ASSIGNMENT: Partial<Record<AgentRole, { to: AgentRole; title: string }>> = {
  director: { to: "researcher", title: "ทบทวนหลักฐานเกี่ยวกับโจทย์นี้" },
  researcher: { to: "formulator", title: "เตรียมสูตรตัวอย่าง V1 จากบันทึก E01" },
  formulator: { to: "analyst", title: "อ่านผลคัดกรองจำลองสี่ด้านของ V1" },
  analyst: { to: "evaluator", title: "ทบทวนข้อดีและข้อจำกัดของ V1" },
};

export const DEMO_PLAYBOOK: Playbook = ({ to }) => {
  const plan = ROLE_WORK[to];
  const assignment = NEXT_ASSIGNMENT[to];
  if (!assignment) return plan;
  return { ...plan, steps: [...plan.steps, { id: "assign", label: `ส่งงานให้ ${ROLE_EN[assignment.to]}`, handoff: assignment }] };
};

export function createLabDemo({
  store,
  scope,
  experimentId,
  transport,
  playbook,
  stepMs = 0,
}: {
  store: DemoStore;
  scope: DemoScope;
  experimentId: string;
  transport: HandoffTransport;
  /** Optional work script; without it each task stops at its acceptance. */
  playbook?: Playbook;
  /** Pause between visible step changes (0 in tests). */
  stepMs?: number;
}) {
  const inFlight = new Set<string>();
  /** Background work (tasks run concurrently); `idle()` waits for all of it. */
  const running = new Set<Promise<void>>();
  /** Child handoff → the parent task step that started it. */
  const parentStep = new Map<string, { taskId: string; stepId: string }>();
  const plans = new Map<string, WorkPlan>();
  const pace = () => (stepMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, stepMs)) : Promise.resolve());

  function track(work: Promise<void>) {
    running.add(work);
    void work.finally(() => running.delete(work));
  }

  async function idle() {
    while (running.size) await Promise.all([...running]);
  }
  const nextMessageId = () => `${scope.projectId}:${experimentId}:msg-${store.nextMessageNumber(scope)}`;
  const privateThread = (agent: AgentRole) => `${scope.projectId}:${experimentId}:private:${agent}`;
  const session = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function readReply(subject: string | undefined) {
    const state = store.get(scope);
    const label = subject ?? "สูตรในการทดลองนี้";
    if (Object.keys(state.formulaNodes).length === 0) return `${experimentId} ยังไม่มี ${label} ที่ปิดผลครบสี่ด้าน · ข้อมูลจำลอง`;
    return `${label} · ${experimentId}`;
  }

  /** Only display results already delivered in this conversation and job. */
  function resultInThread(threadId: string, question: string, jobId?: string): ChatAssessment | undefined {
    const version = question.match(/\bV\d+(?:-[A-Z]+)?\b/i)?.[0].toUpperCase();
    const messages = store.get(scope).messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.kind === "agent" && m.threadId === threadId && (!jobId || m.jobId === jobId) && m.assessment &&
        (!version || m.assessment.formulaName.toUpperCase() === version)) return { ...m.assessment, view: requestedView(question) };
    }
  }

  /** One attempt through the transport. Emits sent → accepted | attempt_failed. */
  async function attempt(handoffId: string, number: number) {
    const handoff = store.get(scope).handoffs[handoffId];
    // The first attempt was announced by submit(); retries announce themselves.
    if (number > handoff.attempts) store.emit(scope, {
      type: "handoff.sent",
      jobId: handoff.jobId,
      handoffId,
      taskId: handoff.taskId,
      from: handoff.from,
      to: handoff.to,
      title: handoff.title,
      sourceMessageId: handoff.sourceMessageId,
      attempt: number,
      experimentId: handoff.experimentId,
      threadId: handoff.threadId,
    });
    try {
      const receipt = await transport.deliver({
        scope,
        handoffId,
        taskId: handoff.taskId,
        experimentId: handoff.experimentId,
        from: handoff.from,
        to: handoff.to,
        title: handoff.title,
        attempt: number,
      });
      const job = store.get(scope).jobs[handoff.jobId];
      const base = privateThread(receipt.by);
      const recipientThread = job.promoted ? job.threadId :
        job.originThreadId === base || job.originThreadId.startsWith(base + ":") ? job.originThreadId : `${base}:delivery:${session}:${job.jobId}`;
      store.emit(scope, {
        type: "handoff.accepted",
        handoffId,
        taskId: receipt.taskId,
        by: receipt.by,
        receiptId: receipt.receiptId,
        attempt: number,
        messageId: receipt.messageId,
        text: receipt.text,
        experimentId: handoff.experimentId,
        threadId: recipientThread,
      });
      const parent = parentStep.get(handoffId);
      if (parent) {
        step(parent.taskId, parent.stepId, "done");
        completeIfDone(parent.taskId);
      }
      // The recipient starts its own work; the sender does not wait for it.
      if (handoff.from === "director" && receipt.by === "researcher" && !job.invitation && !job.promoted) {
        store.emit(scope, { type: "job.group_requested", jobId: job.jobId, taskId: receipt.taskId,
          messageId: nextMessageId(), experimentId, threadId: recipientThread });
      } else startRecipientWork(handoff);
      return true;
    } catch (error) {
      const reason = error instanceof DeliveryError ? error.reason : "unreachable";
      store.emit(scope, { type: "handoff.attempt_failed", handoffId, attempt: number, reason, experimentId: handoff.experimentId, threadId: handoff.threadId });
      return false;
    }
  }

  function startRecipientWork(handoff: Handoff) {
    const plan = playbook?.(handoff);
    if (plan) track(runWork(handoff.taskId, plan));
  }

  function decideGroup(jobId: string, create: boolean) {
    const job = store.get(scope).jobs[jobId];
    if (job?.invitation?.status !== "pending") return;
    const context = { jobId, experimentId: job.experimentId, threadId: job.invitation.threadId };
    if (create) {
      const introMessageId = nextMessageId();
      store.emit(scope, { ...context, type: "job.promoted", originThreadId: job.originThreadId,
        groupThreadId: groupThreadId(scope.projectId), assignees: job.assignees, pointerMessageId: nextMessageId(),
        introMessageId, targetMessageId: introMessageId });
    } else store.emit(scope, { ...context, type: "job.group_declined" });
    const task = store.get(scope).tasks[job.invitation.taskId];
    if (task.handoffId) startRecipientWork(store.get(scope).handoffs[task.handoffId]);
  }

  const threadOf = (jobId: string) => store.get(scope).jobs[jobId].threadId;

  function step(taskId: string, stepId: string, status: "active" | "waiting" | "done", note?: string) {
    const task = store.get(scope).tasks[taskId];
    const current = task?.steps.find((item) => item.stepId === stepId);
    if (!current || current.status === "done" || (current.status === status && current.note === note)) return;
    store.emit(scope, { type: "task.step", taskId, stepId, status, note, experimentId: task.experimentId, threadId: task.workThreadId ?? threadOf(task.jobId) });
  }

  function completeIfDone(taskId: string) {
    const task = store.get(scope).tasks[taskId];
    const plan = plans.get(taskId);
    if (!task || !plan || task.status === "completed" || task.steps.some((item) => item.status !== "done")) return;
    const assessment = plan.assessment && { ...plan.assessment, recordId: task.experimentId };
    store.emit(scope, { type: "task.completed", taskId, summary: plan.summary, assessment, experimentId: task.experimentId, threadId: task.workThreadId ?? threadOf(task.jobId) });
  }

  /** The recipient of an accepted handoff works through its plan, one observable step at a time. */
  async function runWork(taskId: string, plan: WorkPlan) {
    const task = store.get(scope).tasks[taskId];
    if (!task || plans.has(taskId)) return;
    plans.set(taskId, plan);
    store.emit(scope, { type: "task.planned", taskId, steps: plan.steps.map(({ id, label }) => ({ stepId: id, label })), experimentId: task.experimentId, threadId: threadOf(task.jobId) });

    for (const item of plan.steps) {
      step(taskId, item.id, "active");
      await pace();
      if (item.waitFor) {
        step(taskId, item.id, "waiting", item.waitFor);
        await pace();
      }
      if (item.handoff) {
        const childId = startChildHandoff(taskId, item.handoff);
        parentStep.set(childId, { taskId, stepId: item.id });
        await deliver(childId, 2);
        // Not accepted: the step waits for a manual retry, which finishes it (see attempt()).
        if (store.get(scope).handoffs[childId].status !== "accepted") {
          step(taskId, item.id, "waiting", "ส่งงานไม่สำเร็จ · รอลองอีกครั้ง");
          return;
        }
        continue;
      }
      step(taskId, item.id, "done");
      await pace();
    }
    completeIfDone(taskId);
  }

  function startChildHandoff(parentTaskId: string, next: { to: AgentRole; title: string }) {
    const state = store.get(scope);
    const parent = state.tasks[parentTaskId];
    const job = state.jobs[parent.jobId];
    const handoffId = `${parent.jobId}:handoff:${parent.owner}->${next.to}`;
    if (state.handoffs[handoffId]) return handoffId;
    store.emit(scope, {
      type: "handoff.sent",
      jobId: parent.jobId,
      handoffId,
      taskId: `${parent.jobId}:task:${next.to}`,
      from: parent.owner,
      to: next.to,
      title: next.title,
      sourceMessageId: parent.acceptedMessageId,
      attempt: 1,
      experimentId: parent.experimentId,
      threadId: job.threadId,
    });
    return handoffId;
  }

  /** `tries` attempts with the same handoff id; marks the handoff failed when all of them fail. */
  async function deliver(handoffId: string, tries: number) {
    if (inFlight.has(handoffId)) return;
    inFlight.add(handoffId);
    try {
      for (let i = 0; i < tries; i++) {
        const current = store.get(scope).handoffs[handoffId];
        if (!current || current.status === "accepted") return;
        const number = current.status === "sending" ? current.attempts : current.attempts + 1;
        if (await attempt(handoffId, number)) return;
      }
      const last = store.get(scope).handoffs[handoffId];
      store.emit(scope, { type: "handoff.gave_up", handoffId, attempt: last.attempts, experimentId: last.experimentId, threadId: last.threadId });
    } finally {
      inFlight.delete(handoffId);
    }
  }

  async function submit(agent: AgentRole, text: string, threadId = privateThread(agent)): Promise<SubmitResult> {
    const base = privateThread(agent);
    if (threadId !== base && !threadId.startsWith(base + ":")) throw new Error("Invalid private conversation");
    const userMessageId = nextMessageId();
    store.emit(scope, { type: "message.user", messageId: userMessageId, to: agent, text, experimentId, threadId });

    const intent = classifyIntent(text);
    if (agent === "researcher") {
      const invitations = Object.values(store.get(scope).jobs).filter(job =>
        job.invitation?.status === "pending" && job.invitation.threadId === threadId);
      const answer = text.trim().replace(/\s*(?:ครับ|ค่ะ|คะ)[.!]?$/u, "").trim();
      const accept = /^(?:สร้างกลุ่ม|ตกลง|ยืนยัน|ได้เลย|yes)$/i.test(answer);
      if (invitations.length === 1 && (accept || /^(?:คุยแยกต่อ|ไม่สร้างกลุ่ม|ไม่สร้าง|ไม่ต้อง|no)$/i.test(answer))) {
        const job = invitations[0];
        decideGroup(job.jobId, accept);
        store.emit(scope, { type: "message.agent", messageId: nextMessageId(), from: agent, inReplyTo: userMessageId,
          text: accept ? `สร้างกลุ่ม «${job.title}» แล้ว` : "รับทราบ จะส่งงานต่อในแชตส่วนตัว", experimentId, threadId });
        return { intent, jobId: job.jobId };
      }
    }
    if (intent.kind === "read" || intent.kind === "clarify") {
      await pace();
      const assessment = intent.kind === "read" && assessmentViewRequested(text) ? resultInThread(threadId, text) : undefined;
      const reply = assessment ? `ผลคัดกรองจำลองของ ${assessment.formulaName} จากการทดลองในแชตนี้`
        : intent.kind === "read" ? readReply(intent.subject) : intent.question;
      const activity = intent.kind === "read" ? "ตรวจข้อมูลสูตรของการทดลอง" : "ตรวจประเภทคำขอ";
      store.emit(scope, { type: "message.agent", messageId: nextMessageId(), from: agent, inReplyTo: userMessageId, activity, text: reply, assessment, experimentId, threadId });
      return { intent };
    }

    const owner = ownerFor(intent, agent);
    const jobId = `${scope.projectId}:${experimentId}:job:${userMessageId}`;
    const taskId = `${scope.projectId}:${experimentId}:task:${userMessageId}`;
    if (owner === agent) {
      store.emit(scope, { type: "task.started", jobId, taskId, owner, title: intent.title, sourceMessageId: userMessageId, messageId: nextMessageId(), experimentId, threadId });
      const plan = intent.multiRole
        ? playbook?.({ from: agent, to: owner, title: intent.title })
        : ROLE_WORK[owner];
      if (plan) track(runWork(taskId, plan));
      return { intent, taskId, jobId };
    }

    const handoffId = `${scope.projectId}:${experimentId}:handoff:${userMessageId}:${agent}->${owner}`;
    store.emit(scope, {
      type: "message.agent",
      messageId: nextMessageId(),
      from: agent,
      inReplyTo: userMessageId,
      text: `งานนี้ต้องใช้หลายบทบาท จะส่งให้ ${ROLE_EN[owner]} เปิดโจทย์`,
      experimentId,
      threadId,
    });
    // "Sent" is visible now; delivery continues in the background.
    store.emit(scope, {
      type: "handoff.sent",
      jobId,
      handoffId,
      taskId,
      from: agent,
      to: owner,
      title: `ขอเปิดโจทย์ · ${intent.title}`,
      sourceMessageId: userMessageId,
      attempt: 1,
      experimentId,
      threadId,
    });
    await deliver(handoffId, 2);
    return { intent, handoffId, taskId, jobId };
  }

  /** Manual retry from the original handoff message (only offered once it has failed). */
  async function retry(handoffId: string) {
    if (store.get(scope).handoffs[handoffId]?.status !== "failed") return;
    await deliver(handoffId, 1);
  }

  /** Follow up on an existing job in its group without creating a second commission. */
  async function submitGroup(jobId: string, text: string) {
    const state = store.get(scope);
    const job = state.jobs[jobId];
    if (!job?.promoted || !text.trim()) return;
    const ownedTasks = Object.values(state.tasks).filter((task) => task.jobId === jobId);
    const latest = ownedTasks.at(-1);
    const from = latest?.owner ?? job.assignees[job.assignees.length - 1];
    const context = { threadId: job.threadId, experimentId: job.experimentId, jobId };
    const messageId = nextMessageId();
    store.emit(scope, { ...context, type: "message.user", messageId, to: from, text: text.trim() });
    await pace();
    const step = latest?.steps.find((item) => item.status === "waiting" || item.status === "active");
    const status = latest?.summary || step?.note || step?.label || latest?.title || job.title;
    const requestsUpdate = /สรุป|คืบหน้า|สถานะ|ถึงไหน|อัปเดต|update|status|summary/i.test(text);
    const wantsResult = assessmentViewRequested(text);
    const assessment = wantsResult ? resultInThread(job.threadId, text, jobId) : undefined;
    const reply = wantsResult
      ? assessment ? `ผลคัดกรองจำลองของ ${assessment.formulaName} ในงาน «${job.title}»` : "ยังไม่มีผลของสูตรที่ขอในกลุ่มนี้"
      : !requestsUpdate && classifyIntent(text).kind === "commission"
      ? "หากต้องการเปิดงานใหม่ เลือก Agent ในแชตส่วนตัวได้เลย งานนี้ยังติดตามต่อในกลุ่มนี้ได้"
      : `อัปเดตงาน «${job.title}» · ${status}`;
    store.emit(scope, { ...context, type: "message.agent", messageId: nextMessageId(), from, inReplyTo: messageId, activity: "ตรวจสถานะงานในกลุ่ม", text: reply, assessment });
  }

  return { submit, submitGroup, decideGroup, retry, idle, state: () => store.get(scope) };
}
