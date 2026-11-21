/**
 * Ralph Lab agent demo · event model and pure reducer.
 *
 * Every screen (chat, 3D room, vial, Nodes) reads the same `LabDemoState`, built only from
 * these events. The reducer is idempotent: the same event delivered twice, a retried handoff,
 * or a late failure after acceptance never creates a second handoff, task, acceptance,
 * vial or formula node.
 *
 * Demo data only. This state never touches live assessment records (see lib/lab-station).
 */

import { demoJobTitle } from "./intent.ts";

import type { ChatAssessment } from "./chat-assessment.ts";

export type AgentRole = "director" | "researcher" | "formulator" | "analyst" | "evaluator";

/** Who the state belongs to. Stored and keyed above the lifetime of any view. */
export type DemoScope = { userId: string; projectId: string; mode: "demo" };

export const scopeKey = (scope: DemoScope) => `${scope.mode}|${scope.userId}|${scope.projectId}`;

type Base = {
  eventId: string;
  sequence: number;
  projectId: string;
  experimentId: string;
  threadId: string;
  source: "demo";
  occurredAt?: number;
};

export type LabEvent =
  | (Base & { type: "task.started"; jobId: string; taskId: string; owner: AgentRole; title: string; sourceMessageId: string; messageId: string })
  | (Base & { type: "message.user"; messageId: string; to: AgentRole; text: string; jobId?: string })
  | (Base & { type: "message.agent"; messageId: string; from: AgentRole; inReplyTo: string; text: string; jobId?: string; activity?: string; assessment?: ChatAssessment })
  | (Base & { type: "job.group_requested"; jobId: string; taskId: string; messageId: string })
  | (Base & { type: "job.group_declined"; jobId: string })
  | (Base & {
      type: "handoff.sent";
      /** The user's job this handoff belongs to (one job can span several handoffs). */
      jobId: string;
      handoffId: string;
      taskId: string;
      from: AgentRole;
      to: AgentRole;
      title: string;
      sourceMessageId: string;
      jobTitle?: string;
      attempt: number;
    })
  | (Base & { type: "handoff.attempt_failed"; handoffId: string; attempt: number; reason: "ack-lost" | "unreachable" })
  | (Base & { type: "handoff.gave_up"; handoffId: string; attempt: number })
  | (Base & {
      type: "handoff.accepted";
      handoffId: string;
      taskId: string;
      by: AgentRole;
      receiptId: string;
      attempt: number;
      messageId: string;
      text: string;
    })
  /**
   * The user accepted the Researcher's invitation. The origin thread keeps a pointer to the group.
   */
  | (Base & {
      type: "job.promoted";
      jobId: string;
      originThreadId: string;
      groupThreadId: string;
      assignees: AgentRole[];
      pointerMessageId: string;
      introMessageId: string;
      targetMessageId: string;
    })
  /** The owner lays out the observable steps of an accepted task (once). */
  | (Base & { type: "task.planned"; taskId: string; steps: { stepId: string; label: string }[] })
  /** One step changes state. `done` is final; `waiting` carries what the step waits for. */
  | (Base & { type: "task.step"; taskId: string; stepId: string; status: "active" | "waiting" | "done"; note?: string })
  | (Base & { type: "task.completed"; taskId: string; summary: string; assessment?: ChatAssessment });

export type HandoffStatus = "sending" | "retrying" | "failed" | "accepted";

export type Handoff = {
  jobId: string;
  handoffId: string;
  taskId: string;
  experimentId: string;
  threadId: string;
  from: AgentRole;
  to: AgentRole;
  title: string;
  sourceMessageId: string;
  status: HandoffStatus;
  /** Highest attempt seen so far (1 = first try). */
  attempts: number;
  receiptId?: string;
  recipientThreadId?: string;
};

export type StepStatus = "pending" | "active" | "waiting" | "done";
export type TaskStep = { stepId: string; label: string; status: StepStatus; note?: string };

export type Task = {
  taskId: string;
  jobId: string;
  acceptedMessageId: string;
  handoffId?: string;
  experimentId: string;
  owner: AgentRole;
  title: string;
  status: "accepted" | "working" | "completed";
  /** Observable progress, shown as the checklist under the owner's acceptance message. */
  steps: TaskStep[];
  summary?: string;
  workThreadId?: string;
};

/** Who is responsible for a user's job, and where the job is being discussed now. */
export type Job = {
  jobId: string;
  title: string;
  experimentId: string;
  originThreadId: string;
  /** The current owner's private thread, or the approved project group. */
  threadId: string;
  /** Distinct agents who took responsibility (the starting agent, then each acceptance). */
  assignees: AgentRole[];
  promoted: boolean;
  invitation?: { taskId: string; threadId: string; status: "pending" | "accepted" | "declined" };
};

export type ChatMessage =
  | { kind: "user"; messageId: string; threadId: string; to: AgentRole; text: string; sequence: number; jobId?: string }
  | { kind: "agent"; messageId: string; threadId: string; from: AgentRole; text: string; sequence: number; jobId?: string; taskId?: string; inReplyTo?: string; activity?: string; assessment?: ChatAssessment }
  | { kind: "group-invite"; messageId: string; threadId: string; from: "researcher"; jobId: string; text: string; sequence: number }
  /** The sender's "A → B · title · D01" line. Its status is read from `handoffs[handoffId]`. */
  | { kind: "handoff"; messageId: string; threadId: string; handoffId: string; sequence: number }
  | { kind: "acceptance"; messageId: string; threadId: string; handoffId: string; from: AgentRole; text: string; sequence: number }
  /** Left in the origin thread when its job moves to the group. */
  | { kind: "pointer"; messageId: string; threadId: string; jobId: string; experimentId: string; targetThreadId: string; targetMessageId: string; sequence: number }
  /** First group message of a promoted job: where it came from and who is responsible. */
  | { kind: "job-intro"; messageId: string; threadId: string; jobId: string; experimentId: string; fromThreadId: string; assignees: AgentRole[]; sequence: number };

/** `private`: one agent's thread with the user (a second assignee may join). `group`: one per project. */
export type Thread = { threadId: string; kind: "private" | "group"; experimentId: string; participants: AgentRole[] };

export type LabDemoState = {
  projectId: string;
  /** Applied event ids, for redelivery. */
  seen: string[];
  /** Events in the order they were applied (rejected duplicates are not listed). */
  log: LabEvent[];
  messages: ChatMessage[];
  threads: Record<string, Thread>;
  handoffs: Record<string, Handoff>;
  tasks: Record<string, Task>;
  jobs: Record<string, Job>;
  /** Vials and formula nodes arrive in later milestones; kept here so counts are observable now. */
  vials: Record<string, never>;
  formulaNodes: Record<string, never>;
};

export function initialState(projectId: string): LabDemoState {
  return { projectId, seen: [], log: [], messages: [], threads: {}, handoffs: {}, tasks: {}, jobs: {}, vials: {}, formulaNodes: {} };
}

export const groupThreadId = (projectId: string) => `${projectId}:group`;

function withParticipant(state: LabDemoState, threadId: string, experimentId: string, role: AgentRole) {
  const kind = threadId === groupThreadId(state.projectId) ? "group" : "private";
  const thread = state.threads[threadId] ?? { threadId, kind, experimentId, participants: [] };
  if (thread.participants.includes(role)) return state.threads;
  return { ...state.threads, [threadId]: { ...thread, participants: [...thread.participants, role] } };
}

/** Apply one event. Returns the same object when the event changes nothing. */
export function reduce(state: LabDemoState, event: LabEvent): LabDemoState {
  if (event.projectId !== state.projectId) return state; // never cross projects
  if (state.seen.includes(event.eventId)) return state; // redelivery of the same event

  const next = applyEvent(state, event);
  if (next === state) return state;
  return { ...next, seen: [...state.seen, event.eventId], log: [...state.log, event] };
}

function applyEvent(state: LabDemoState, event: LabEvent): LabDemoState {
  switch (event.type) {
    case "task.started": {
      if (state.tasks[event.taskId] || state.jobs[event.jobId]) return state;
      const job: Job = { jobId: event.jobId, title: demoJobTitle(event.title), experimentId: event.experimentId,
        originThreadId: event.threadId, threadId: event.threadId, assignees: [event.owner], promoted: false };
      const task: Task = { taskId: event.taskId, jobId: job.jobId, acceptedMessageId: event.messageId,
        owner: event.owner, title: event.title, experimentId: event.experimentId, status: "accepted", steps: [] };
      return {
        ...state,
        jobs: { ...state.jobs, [job.jobId]: job },
        tasks: { ...state.tasks, [task.taskId]: task },
        messages: [...state.messages, { kind: "agent", messageId: event.messageId, from: event.owner,
          taskId: task.taskId, jobId: job.jobId, inReplyTo: event.sourceMessageId, text: event.title, sequence: event.sequence, threadId: event.threadId }],
      };
    }
    case "message.user":
      return {
        ...state,
        messages: [...state.messages, { kind: "user", messageId: event.messageId, threadId: event.threadId, to: event.to, text: event.text, sequence: event.sequence, jobId: event.jobId }],
        threads: withParticipant(state, event.threadId, event.experimentId, event.to),
      };

    case "message.agent":
      return {
        ...state,
        messages: [...state.messages, { kind: "agent", messageId: event.messageId, threadId: event.threadId, from: event.from, text: event.text, sequence: event.sequence, jobId: event.jobId, inReplyTo: event.inReplyTo, activity: event.activity, assessment: event.assessment }],
      };

    case "handoff.sent": {
      const existing = state.handoffs[event.handoffId];
      if (existing) {
        // A retry of the same handoff: bump the attempt, never a second handoff line.
        if (existing.status === "accepted" || event.attempt <= existing.attempts) return state;
        return { ...state, handoffs: { ...state.handoffs, [event.handoffId]: { ...existing, attempts: event.attempt, status: "sending" } } };
      }
      const job: Job = state.jobs[event.jobId] ?? {
        jobId: event.jobId,
        title: event.jobTitle?.trim() || demoJobTitle(event.title),
        experimentId: event.experimentId,
        originThreadId: event.threadId,
        threadId: event.threadId,
        assignees: [event.from],
        promoted: false,
      };
      const handoff: Handoff = {
        jobId: event.jobId,
        handoffId: event.handoffId,
        taskId: event.taskId,
        experimentId: event.experimentId,
        threadId: event.threadId,
        from: event.from,
        to: event.to,
        title: event.title,
        sourceMessageId: event.sourceMessageId,
        status: "sending",
        attempts: event.attempt,
      };
      return {
        ...state,
        handoffs: { ...state.handoffs, [event.handoffId]: handoff },
        jobs: { ...state.jobs, [event.jobId]: job },
        messages: [...state.messages, { kind: "handoff", messageId: `handoff:${event.handoffId}`, threadId: event.threadId, handoffId: event.handoffId, sequence: event.sequence }],
      };
    }

    case "handoff.attempt_failed":
    case "handoff.gave_up": {
      const existing = state.handoffs[event.handoffId];
      // A late error must not downgrade a delivered job, nor an older attempt overwrite a newer one.
      if (!existing || existing.status === "accepted" || event.attempt < existing.attempts) return state;
      const status: HandoffStatus = event.type === "handoff.gave_up" ? "failed" : "retrying";
      if (existing.status === status) return state;
      return { ...state, handoffs: { ...state.handoffs, [event.handoffId]: { ...existing, status } } };
    }

    case "handoff.accepted": {
      const existing = state.handoffs[event.handoffId];
      if (!existing || existing.status === "accepted" || existing.to !== event.by || existing.taskId !== event.taskId) return state;
      const task: Task = state.tasks[event.taskId] ?? {
        taskId: event.taskId,
        jobId: existing.jobId,
        acceptedMessageId: event.messageId,
        handoffId: event.handoffId,
        experimentId: existing.experimentId,
        owner: event.by,
        title: existing.title,
        status: "accepted",
        steps: [],
      };
      const job = state.jobs[existing.jobId];
      const threadId = event.threadId;
      const jobs = job
        ? { ...state.jobs, [job.jobId]: { ...job, threadId, assignees: job.assignees.includes(event.by) ? job.assignees : [...job.assignees, event.by] } }
        : state.jobs;
      const incoming: ChatMessage[] = threadId === existing.threadId ? [] : [{
        kind: "agent", messageId: existing.handoffId + ":delivery", jobId: existing.jobId, threadId, from: existing.from,
        text: `${existing.title}\nงาน «${job.title}»`, sequence: event.sequence,
      }];
      return {
        ...state,
        handoffs: { ...state.handoffs, [event.handoffId]: { ...existing, status: "accepted", receiptId: event.receiptId, recipientThreadId: threadId } },
        tasks: { ...state.tasks, [event.taskId]: task },
        jobs,
        messages: [
          ...state.messages,
          ...incoming,
          { kind: "acceptance", messageId: event.messageId, threadId, handoffId: event.handoffId, from: event.by, text: event.text, sequence: event.sequence },
        ],
        threads: withParticipant(state, threadId, existing.experimentId, event.by),
      };
    }

    case "task.planned": {
      const task = state.tasks[event.taskId];
      if (!task || task.steps.length > 0) return state;
      const steps = event.steps.map(({ stepId, label }) => ({ stepId, label, status: "pending" as const }));
      const receipt = state.messages.find((m) => m.messageId === task.acceptedMessageId);
      const messages: ChatMessage[] = receipt?.threadId === event.threadId ? state.messages : [...state.messages, {
        kind: "agent", messageId: task.taskId + ":work", threadId: event.threadId, jobId: task.jobId, taskId: task.taskId,
        from: task.owner, text: "เริ่มทบทวนโจทย์ที่ได้รับ", sequence: event.sequence,
      }];
      return { ...state, messages, tasks: { ...state.tasks, [task.taskId]: { ...task, steps, workThreadId: event.threadId } } };
    }

    case "task.step": {
      const task = state.tasks[event.taskId];
      const step = task?.steps.find((item) => item.stepId === event.stepId);
      // A finished step never reopens; a repeated update changes nothing.
      if (!task || !step || step.status === "done" || task.status === "completed") return state;
      if (step.status === event.status && step.note === event.note) return state;
      const steps = task.steps.map((item) => item.stepId === step.stepId
        ? { ...item, status: event.status, note: event.status === "done" ? undefined : event.note }
        : item);
      return { ...state, tasks: { ...state.tasks, [task.taskId]: { ...task, steps, status: "working" } } };
    }

    case "task.completed": {
      const task = state.tasks[event.taskId];
      if (!task || task.status === "completed" || task.steps.some((item) => item.status !== "done")) return state;
      return { ...state, tasks: { ...state.tasks, [task.taskId]: { ...task, status: "completed", summary: event.summary } },
        messages: [...state.messages, { kind: "agent", from: task.owner, jobId: task.jobId, threadId: task.workThreadId ?? event.threadId,
          messageId: task.taskId + ":summary", text: event.summary, assessment: event.assessment, sequence: event.sequence }] };
    }

    case "job.group_requested": {
      const job = state.jobs[event.jobId];
      const task = state.tasks[event.taskId];
      if (!job || job.invitation || job.promoted || task?.jobId !== job.jobId || task.owner !== "researcher") return state;
      return { ...state, jobs: { ...state.jobs, [job.jobId]: { ...job, invitation: { threadId: event.threadId, taskId: task.taskId, status: "pending" } } },
        messages: [...state.messages, { kind: "group-invite", from: "researcher", jobId: job.jobId, threadId: event.threadId,
          messageId: event.messageId, sequence: event.sequence, text: `ต้องการสร้างกลุ่ม «${job.title}» เพื่อคุยงานนี้ด้วยกันไหม?` }] };
    }
    case "job.group_declined": {
      const job = state.jobs[event.jobId];
      if (job?.invitation?.status !== "pending") return state;
      return { ...state, jobs: { ...state.jobs, [job.jobId]: { ...job, invitation: { ...job.invitation, status: "declined" } } } };
    }
    case "job.promoted": {
      const job = state.jobs[event.jobId];
      if (!job || job.promoted || job.invitation?.status !== "pending") return state;
      const group = state.threads[event.groupThreadId] ?? { threadId: event.groupThreadId, kind: "group" as const, experimentId: job.experimentId, participants: [] };
      const participants = [...group.participants, ...event.assignees.filter((role) => !group.participants.includes(role))];
      return {
        ...state,
        jobs: { ...state.jobs, [job.jobId]: { ...job, threadId: event.groupThreadId, promoted: true, invitation: { ...job.invitation, status: "accepted" } } },
        threads: { ...state.threads, [event.groupThreadId]: { ...group, participants } },
        messages: [
          ...state.messages,
          { kind: "pointer", messageId: event.pointerMessageId, threadId: job.originThreadId, jobId: job.jobId, experimentId: job.experimentId, targetThreadId: event.groupThreadId, targetMessageId: event.targetMessageId, sequence: event.sequence },
          { kind: "job-intro", messageId: event.introMessageId, threadId: event.groupThreadId, jobId: job.jobId, experimentId: job.experimentId, fromThreadId: job.originThreadId, assignees: event.assignees, sequence: event.sequence },
        ],
      };
    }
  }
}

/** Observable totals used by tests and the debug readout. */
export function counts(state: LabDemoState) {
  return {
    handoffs: Object.keys(state.handoffs).length,
    tasks: Object.keys(state.tasks).length,
    acceptances: state.messages.filter((m) => m.kind === "acceptance").length,
    handoffLines: state.messages.filter((m) => m.kind === "handoff").length,
    groupThreads: Object.values(state.threads).filter((t) => t.kind === "group").length,
    pointers: state.messages.filter((m) => m.kind === "pointer").length,
    vials: Object.keys(state.vials).length,
    formulaNodes: Object.keys(state.formulaNodes).length,
  };
}
