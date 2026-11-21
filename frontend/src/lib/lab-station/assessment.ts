import {
  api,
  apiErrorMessage,
  type AssessmentRecord,
  type AssessmentSummary,
  type ConfidenceLevel,
  type EndpointResultPayload,
  type FormulaItem,
  type Region,
} from "@/lib/api";
import { formulaAssessmentSignature, loadProjectWorkspace } from "@/lib/project-workspace";
import { STATION_ENDPOINTS, stationEndpoint, type StationEndpointId } from "./endpoints";
import type { ChatAssessment } from "../lab-demo/chat-assessment";

/**
 * Assessment data for the testing station.
 *
 * A "tested revision" is the exact formula snapshot an assessment job ran on: the backend stores the
 * formula with every job, so the snapshot (not the editable draft) is what the four trays show.
 * Nothing here invents a value: every outcome is either the API's own number or an explicit state.
 */

export type TestedRevision = {
  projectId: number;
  assessmentId: string;
  status: AssessmentRecord["status"];
  /** Workspace formula that currently holds exactly this snapshot, if any. */
  formulaId: string | null;
  name: string;
  region: Region;
  items: FormulaItem[];
  signature: string;
  createdAt: string;
};

export type UntestedFormula = { formulaId: string; name: string; region: Region };

export type RevisionListing = { revisions: TestedRevision[]; untested: UntestedFormula[]; failedToLoad: number };

const MAX_LISTED = 12;

function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function revisionFromRecord(projectId: number, record: AssessmentRecord, names: Map<string, { id: string; name: string }>): TestedRevision {
  const region = (record.region as Region) ?? "face";
  const signature = formulaAssessmentSignature(record.formula, region);
  const match = names.get(record.id) ?? null;
  return {
    projectId,
    assessmentId: record.id,
    status: record.status,
    formulaId: match?.id ?? null,
    name: match?.name ?? `สูตรที่ทดสอบ ${shortDate(record.created_at)}`,
    region,
    items: record.formula.map((i) => ({ ...i })),
    signature,
    createdAt: record.created_at,
  };
}

/** Tested revisions of a project (newest first) plus workspace formulas that were never assessed. */
export async function listTestedRevisions(projectId: number, signal?: AbortSignal): Promise<RevisionListing> {
  const summaries: AssessmentSummary[] = await api.listProjectAssessments(projectId, signal);
  const workspace = loadProjectWorkspace(projectId);
  // Name a snapshot after the workspace formula whose own assessment job it is (not merely an equal
  // formula: a fresh revision draft starts as an exact copy of the tested snapshot).
  const names = new Map<string, { id: string; name: string }>();
  for (const f of workspace?.formulas ?? []) {
    const jobId = workspace?.assessmentByFormulaId[f.id]?.jobId;
    if (jobId) names.set(jobId, { id: f.id, name: f.name });
  }

  const records = await Promise.all(
    summaries.slice(0, MAX_LISTED).map((s) => api.getProjectAssessment(projectId, s.id, signal).catch(() => null)),
  );
  const revisions = records
    .filter((r): r is AssessmentRecord => r !== null)
    .map((r) => revisionFromRecord(projectId, r, names));
  const tested = new Set(revisions.map((r) => r.formulaId).filter(Boolean));
  const untested = (workspace?.formulas ?? [])
    .filter((f) => f.items.some((i) => i.smiles.trim()) && !tested.has(f.id))
    .map((f) => ({ formulaId: f.id, name: f.name, region: f.region }));
  return { revisions, untested, failedToLoad: records.filter((r) => r === null).length };
}

export type RevisionAssessmentState =
  | { kind: "loading" }
  | { kind: "pending"; status: "queued" | "running" }
  | { kind: "failed"; messageTh: string }
  | { kind: "mismatch"; messageTh: string }
  | { kind: "ready"; record: AssessmentRecord };

/** Load the one assessment job for this revision and prove it belongs to this exact snapshot. */
export async function loadRevisionAssessment(rev: TestedRevision, signal?: AbortSignal): Promise<RevisionAssessmentState> {
  let record: AssessmentRecord;
  try {
    record = await api.getProjectAssessment(rev.projectId, rev.assessmentId, signal);
  } catch (cause) {
    if (signal?.aborted) throw cause;
    return { kind: "failed", messageTh: apiErrorMessage(cause, "โหลดผลประเมินไม่สำเร็จ") };
  }
  if (record.id !== rev.assessmentId) {
    return { kind: "mismatch", messageTh: "ผลที่ได้รับไม่ใช่งานประเมินที่เลือก" };
  }
  const sig = formulaAssessmentSignature(record.formula, (record.region as Region) ?? "face");
  if (sig !== rev.signature) {
    return { kind: "mismatch", messageTh: "สูตรในผลประเมินไม่ตรงกับสูตรที่เลือก จึงไม่แสดงผลนี้" };
  }
  if (record.status === "queued" || record.status === "running") return { kind: "pending", status: record.status };
  if (record.status === "failed" || !record.result) {
    return { kind: "failed", messageTh: record.error ? `การประเมินล้มเหลว: ${record.error}` : "การประเมินล้มเหลว ไม่มีผลให้แสดง" };
  }
  return { kind: "ready", record };
}

export type FlaggedSubstance = { name: string; score: number; concentration: number | null };

export type EndpointOutcome =
  | { kind: "loading" }
  | { kind: "failed"; messageTh: string }
  | { kind: "unavailable"; reasonTh: string }
  | { kind: "insufficient"; reasonTh: string; methodTh: string }
  | {
      kind: "result";
      endpoint: StationEndpointId;
      assessmentId: string;
      score: number;
      band: EndpointResultPayload["band"];
      confidence: { level: ConfidenceLevel; reasonTh: string; inDomain: boolean; similarity: number } | null;
      /** Largest per-substance uncertainty the model reported for this endpoint (0..1), if any. */
      uncertainty: number | null;
      modelStatus: "production" | "research_candidate" | null;
      modelVersions: string[];
      evidenceNoteTh: string | null;
      methodTh: string;
      coverageTh: string | null;
      flagged: FlaggedSubstance[];
      /** Exposure route as supplied by the source; null when the result does not state one. */
      exposureRoute: string | null;
      disclaimerTh: string;
    };

export const BAND_TH: Record<EndpointResultPayload["band"], string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  severe: "สูงมาก",
};

/** Build the chat snapshot from the same four readings used by the Lab trays. */
export function chatAssessment(record: AssessmentRecord | null, formulaName: string): ChatAssessment | undefined {
  if (record?.status !== "completed" || !record.result) return;
  const rows = STATION_ENDPOINTS.map(({ id, labelTh }) => {
    const outcome = endpointOutcome({ kind: "ready", record }, id);
    if (outcome.kind !== "result" || outcome.score < 0 || outcome.score > 100) {
      return { label: labelTh, score: null, finding: outcome.kind === "unavailable" ? "ไม่มีผลด้านนี้" : "ข้อมูลไม่เพียงพอ" };
    }
    const confidence = outcome.confidence;
    const level = confidence && ({ High: "สูง", Medium: "ปานกลาง", Low: "ต่ำ" })[confidence.level];
    const finding = [BAND_TH[outcome.band], level && `ความเชื่อมั่น${level}`,
      confidence?.inDomain === false && "นอกขอบเขตแบบจำลอง"].filter(Boolean).join(" · ");
    return { label: labelTh, score: Math.round(outcome.score * 10) / 10, finding };
  });
  return { source: "assessment", recordId: record.id, formulaName, rows };
}

function methodText(record: AssessmentRecord) {
  const cov = record.result?.formula_coverage;
  if (!cov) return { methodTh: "แบบจำลอง QSAR (in-silico screening)", coverageTh: null };
  const parts = [`ประเมินด้วย QSAR ${cov.qsar_assessed_ingredients} จาก ${cov.total_ingredients} ส่วนผสม`];
  if (cov.known_carrier_ingredients) parts.push(`ตัวพา ${cov.known_carrier_ingredients} รายการไม่ผ่านแบบจำลอง`);
  if (cov.unresolved_ingredients) parts.push(`ระบุไม่ได้ ${cov.unresolved_ingredients} รายการ`);
  return { methodTh: "แบบจำลอง QSAR (in-silico screening)", coverageTh: parts.join(" · ") };
}

/** One tray's outcome, read only from the verified assessment record. */
export function endpointOutcome(state: RevisionAssessmentState, endpoint: StationEndpointId): EndpointOutcome {
  if (state.kind === "loading" || state.kind === "pending") return { kind: "loading" };
  if (state.kind === "failed" || state.kind === "mismatch") return { kind: "failed", messageTh: state.messageTh };
  const record = state.record;
  const result = record.result!;
  const { methodTh, coverageTh } = methodText(record);
  const ep = result.endpoints?.[endpoint];
  if (!ep) {
    return { kind: "unavailable", reasonTh: `งานประเมินนี้ไม่มีผล${stationEndpoint(endpoint).labelTh}` };
  }
  const contributing = result.substances.filter((s) => s.per_endpoint?.[endpoint]);
  if (contributing.length === 0 || !Number.isFinite(ep.peak_score)) {
    return {
      kind: "insufficient",
      reasonTh: "ไม่มีส่วนผสมที่แบบจำลองประเมินได้สำหรับ endpoint นี้ หลักฐานไม่เพียงพอที่จะแสดงคะแนน",
      methodTh,
    };
  }
  if (!ep.confidence) {
    return { kind: "insufficient", reasonTh: "แบบจำลองไม่ได้ให้ระดับความเชื่อมั่นสำหรับผลนี้ จึงไม่แสดงคะแนน", methodTh };
  }
  const uncertainties = contributing
    .map((s) => s.per_endpoint[endpoint].uncertainty)
    .filter((u): u is number => typeof u === "number" && Number.isFinite(u));
  const flagged = contributing
    .filter((s) => s.per_endpoint[endpoint].flagged)
    .map((s) => ({ name: s.name || s.smiles, score: s.per_endpoint[endpoint].score, concentration: s.concentration ?? null }))
    .sort((a, b) => b.score - a.score);
  return {
    kind: "result",
    endpoint,
    assessmentId: record.id,
    score: ep.peak_score,
    band: ep.band,
    confidence: {
      level: ep.confidence.level,
      reasonTh: ep.confidence.reason_th,
      inDomain: ep.confidence.in_domain,
      similarity: ep.confidence.domain_similarity,
    },
    uncertainty: uncertainties.length ? Math.max(...uncertainties) : null,
    modelStatus: ep.model_status ?? null,
    modelVersions: ep.model_versions ?? [],
    evidenceNoteTh: ep.evidence_note_th ?? null,
    methodTh,
    coverageTh,
    flagged,
    exposureRoute: null, // the assessment result does not state a route; never assume one
    disclaimerTh: result.disclaimer_th,
  };
}
