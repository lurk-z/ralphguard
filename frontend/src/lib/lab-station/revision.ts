import type { FormulaItem, Region } from "@/lib/api";
import {
  loadProjectWorkspace,
  saveProjectWorkspace,
  type ProjectWorkspaceDraft,
  type WorkspaceStorage,
} from "@/lib/project-workspace";
import type { StationEndpointId } from "./endpoints";

/**
 * Revision handoff: open (or create) an editable draft in the project workspace from the exact
 * tested snapshot, and keep the findings the user chose next to it. The tested formula, its
 * workspace card and its assessment are never modified; the existing /assess editor opens the draft.
 */

const BRIEF_PREFIX = "ralphguard:lab-revision:v1:";

export type RevisionFinding = {
  id: string;
  endpoint: StationEndpointId;
  textTh: string;
};

export type RevisionBrief = {
  projectId: number;
  draftFormulaId: string;
  sourceAssessmentId: string;
  sourceFormulaName: string;
  findings: RevisionFinding[];
  createdAt: string;
};

function browser(): WorkspaceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const briefKey = (projectId: number, draftId: string) => `${BRIEF_PREFIX}${projectId}:${draftId}`;
const sourceKey = (projectId: number, assessmentId: string) => `${BRIEF_PREFIX}${projectId}:from:${assessmentId}`;

export function loadRevisionBrief(projectId: number, draftFormulaId: string, store = browser()): RevisionBrief | null {
  try {
    const raw = store?.getItem(briefKey(projectId, draftFormulaId));
    return raw ? (JSON.parse(raw) as RevisionBrief) : null;
  } catch {
    return null;
  }
}

export type RevisionResult =
  | { ok: true; draftFormulaId: string; created: boolean; href: string }
  | { ok: false; messageTh: string };

export function createRevisionDraft(
  input: {
    projectId: number;
    sourceAssessmentId: string;
    sourceFormulaName: string;
    region: Region;
    items: FormulaItem[];
    findings: RevisionFinding[];
  },
  store = browser(),
  now = new Date(),
): RevisionResult {
  if (!store) return { ok: false, messageTh: "เปิดสูตรฉบับแก้ไขไม่ได้: เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล" };
  const href = `/assess?projectId=${input.projectId}`;
  const workspace = loadProjectWorkspace(input.projectId, store);
  const base: ProjectWorkspaceDraft = workspace ?? {
    formulas: [],
    activeFormulaId: "",
    region: input.region,
    dayIdx: 1,
    mode: "assess",
    formulaPanelOpen: false,
    assessmentByFormulaId: {},
    paintByFormulaId: {},
    graphByFormulaId: {},
  };

  // One draft per tested revision: reopen it if it still exists instead of stacking copies.
  const known = store.getItem(sourceKey(input.projectId, input.sourceAssessmentId));
  let draftId = known && base.formulas.some((f) => f.id === known) ? known : null;
  const created = draftId === null;
  const formulas = [...base.formulas];
  if (!draftId) {
    draftId = `f${now.getTime()}`;
    formulas.push({
      id: draftId,
      name: `${input.sourceFormulaName} (แก้ไขจากผลทดสอบ)`,
      type: "แก้ไขจากห้องแล็บ",
      region: input.region,
      items: input.items.map((i) => ({ ...i })),
    });
  }
  const saved = saveProjectWorkspace(
    input.projectId,
    { ...base, formulas, activeFormulaId: draftId, region: input.region, mode: "assess" },
    store,
  );
  if (!saved) return { ok: false, messageTh: "บันทึกสูตรฉบับแก้ไขไม่สำเร็จ" };
  const brief: RevisionBrief = {
    projectId: input.projectId,
    draftFormulaId: draftId,
    sourceAssessmentId: input.sourceAssessmentId,
    sourceFormulaName: input.sourceFormulaName,
    findings: input.findings,
    createdAt: now.toISOString(),
  };
  try {
    store.setItem(briefKey(input.projectId, draftId), JSON.stringify(brief));
    store.setItem(sourceKey(input.projectId, input.sourceAssessmentId), draftId);
  } catch {
    // the draft itself is saved; the brief is a convenience
  }
  return { ok: true, draftFormulaId: draftId, created, href };
}
