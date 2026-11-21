import { ROLE_EN } from "./engine.ts";
import type { AgentRole, ChatMessage, LabDemoState } from "./events.ts";
import type { Transcript } from "./chat-history.ts";

export type DemoScreen =
  | { kind: "inbox" }
  | { kind: "private"; threadId?: string }
  | { kind: "group"; jobId: string; highlightId?: string };

type Conversation = {
  title: string;
  preview: string;
  sequence: number;
  time?: number;
} & ({ kind: "private"; agent: AgentRole } | { kind: "group"; jobId: string; agents: AgentRole[] });

export const privateThreadId = (projectId: string, experimentId: string, agent: AgentRole) =>
  `${projectId}:${experimentId}:private:${agent}`;

export function messageJobId(state: LabDemoState, message: ChatMessage) {
  if (message.kind === "handoff" || message.kind === "acceptance") return state.handoffs[message.handoffId]?.jobId;
  return message.jobId;
}

function preview(state: LabDemoState, message: ChatMessage) {
  switch (message.kind) {
    case "pointer": return `ไปคุยต่อในกลุ่ม · ${state.jobs[message.jobId].title}`;
    case "job-intro": return `เริ่มงาน · ${state.jobs[message.jobId].title}`;
    case "handoff": return state.handoffs[message.handoffId].title;
    default: return message.text;
  }
}

export function transcriptPreview(message: Transcript["messages"][number] | undefined) {
  if (!message) return "";
  // Archived handoff cards store “sender → recipient · title” as their transcript text.
  if (message.role === "assistant" && /^[^:]+:handoff:/.test(message.id)) {
    return message.text.replace(/^[^\n]+? → [^\n]+? · /u, "");
  }
  return message.text;
}

/** The transport has one project channel. Each promoted job in it has its own visible conversation. */
export function listConversations(state: LabDemoState, experimentId: string): Conversation[] {
  const rows = new Map<string, Conversation>();
  for (const agent of Object.keys(ROLE_EN) as AgentRole[]) {
    rows.set(privateThreadId(state.projectId, experimentId, agent), {
      kind: "private", agent, title: ROLE_EN[agent], preview: "", sequence: 0,
    });
  }
  for (const job of Object.values(state.jobs)) {
    if (job.promoted) rows.set(job.jobId, {
      kind: "group", jobId: job.jobId, agents: job.assignees, title: job.title, preview: "", sequence: 0,
    });
  }
  const timeBySequence = new Map(state.log.map((event) => [event.sequence, event.occurredAt]));
  for (const message of state.messages) {
    const thread = state.threads[message.threadId];
    if (!thread || thread.experimentId !== experimentId) continue;
    const key = thread.kind === "group" ? messageJobId(state, message) : privateThreadId(state.projectId, experimentId, thread.participants[0]);
    const row = key && rows.get(key);
    if (!row || message.sequence < row.sequence) continue;
    row.preview = preview(state, message).replace(/\s+/g, " ").trim();
    row.sequence = message.sequence;
    row.time = timeBySequence.get(message.sequence);
  }
  return [...rows.values()].sort((a, b) => b.sequence - a.sequence);
}
