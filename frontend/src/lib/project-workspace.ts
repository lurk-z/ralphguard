import type { AssessmentRecord, FormulaItem, Region } from "@/lib/api";

const WORKSPACE_VERSION = 1 as const;
const WORKSPACE_KEY_PREFIX = `ralphguard:workspace:v${WORKSPACE_VERSION}:`;
const MAX_FORMULAS = 100;
const MAX_ITEMS_PER_FORMULA = 500;
const MAX_PAINT_MASK_LENGTH = 1_500_000;
const MAX_GRAPH_NODES = 200;
const MAX_GRAPH_EDGES = 500;

/** Project-level Graph draft used when no Formula Panel card is selected. */
export const FORMULA_GRAPH_DRAFT_ID = "__node_graph_draft__";

export type WorkspaceMode = "assess" | "nodes" | "trust";

export type WorkspaceFormula = {
  id: string;
  name: string;
  type?: string;
  region: Region;
  items: FormulaItem[];
};

export type FormulaAssessmentSnapshot = {
  inputSignature: string;
  jobId: string | null;
  assessment: AssessmentRecord | null;
  startedAt: string;
};

export type PaintMaskKey = "exposure" | "redness" | "papule" | "peeling" | "edema";

export type PaintMaskSnapshot = Partial<Record<PaintMaskKey, string>> & {
  hasPaint?: boolean;
};

export type FormulaGraphNodeType = "substance" | "modifier" | "result";

export type FormulaGraphNodeSnapshot = {
  id: string;
  type: FormulaGraphNodeType;
  position: { x: number; y: number };
  data: {
    name?: string;
    smiles?: string;
    concentration?: number;
    region?: Region;
    status?: "idle" | "completed" | "failed";
    endpoints?: Record<string, { peak_score: number }>;
    error?: string;
  };
};

export type FormulaGraphEdgeSnapshot = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
};

export type FormulaGraphSnapshot = {
  nodes: FormulaGraphNodeSnapshot[];
  edges: FormulaGraphEdgeSnapshot[];
  viewport: { x: number; y: number; zoom: number };
};

export type ProjectWorkspace = {
  version: typeof WORKSPACE_VERSION;
  formulas: WorkspaceFormula[];
  activeFormulaId: string;
  region: Region;
  dayIdx: 0 | 1 | 2;
  mode: WorkspaceMode;
  formulaPanelOpen: boolean;
  assessmentByFormulaId: Record<string, FormulaAssessmentSnapshot>;
  paintByFormulaId: Record<string, PaintMaskSnapshot>;
  graphByFormulaId: Record<string, FormulaGraphSnapshot>;
  updatedAt: string;
};

export type ProjectWorkspaceDraft = Omit<ProjectWorkspace, "version" | "updatedAt">;

export type WorkspaceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProjectId(projectId: number): boolean {
  return Number.isSafeInteger(projectId) && projectId > 0;
}

function workspaceKey(projectId: number): string | null {
  return isProjectId(projectId) ? `${WORKSPACE_KEY_PREFIX}${projectId}` : null;
}

function browserStorage(): WorkspaceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeRegion(value: unknown): Region {
  return value === "forearm" || value === "hand" || value === "eye" ? value : "face";
}

function normalizeItem(value: unknown): FormulaItem | null {
  if (!isRecord(value)) return null;
  const smiles = typeof value.smiles === "string" ? value.smiles : "";
  const concentration = Number(value.concentration);
  if (!Number.isFinite(concentration)) return null;

  return {
    smiles,
    concentration: Math.min(100, Math.max(0, concentration)),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
  };
}

const finiteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const boundedCoordinate = (value: unknown) =>
  Math.min(100_000, Math.max(-100_000, finiteNumber(value)));

function normalizeGraphEndpoints(value: unknown): Record<string, { peak_score: number }> | undefined {
  if (!isRecord(value)) return undefined;
  const endpoints: Record<string, { peak_score: number }> = {};
  for (const [key, rawMetric] of Object.entries(value).slice(0, 20)) {
    if (!isRecord(rawMetric)) continue;
    const peakScore = Number(rawMetric.peak_score);
    if (!Number.isFinite(peakScore)) continue;
    endpoints[key.slice(0, 40)] = {
      peak_score: Math.min(100, Math.max(0, peakScore)),
    };
  }
  return Object.keys(endpoints).length ? endpoints : undefined;
}

export function normalizeFormulaGraphSnapshot(value: unknown): FormulaGraphSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return null;
  }

  const nodes: FormulaGraphNodeSnapshot[] = [];
  const nodeIds = new Set<string>();
  for (const rawNode of value.nodes.slice(0, MAX_GRAPH_NODES)) {
    if (!isRecord(rawNode) || !isRecord(rawNode.position) || !isRecord(rawNode.data)) continue;
    const id = typeof rawNode.id === "string" ? rawNode.id.trim().slice(0, 100) : "";
    const type = rawNode.type;
    if (
      !id ||
      nodeIds.has(id) ||
      (type !== "substance" && type !== "modifier" && type !== "result")
    ) {
      continue;
    }

    const data: FormulaGraphNodeSnapshot["data"] = {};
    if (type === "substance" || type === "modifier") {
      data.name = typeof rawNode.data.name === "string"
        ? rawNode.data.name.slice(0, 200)
        : "";
      data.smiles = typeof rawNode.data.smiles === "string"
        ? rawNode.data.smiles.slice(0, 2_000)
        : "";
      data.concentration = Math.min(
        100,
        Math.max(0, finiteNumber(rawNode.data.concentration)),
      );
    } else {
      data.region = normalizeRegion(rawNode.data.region);
      data.status = rawNode.data.status === "completed" || rawNode.data.status === "failed"
        ? rawNode.data.status
        : "idle";
      const endpoints = normalizeGraphEndpoints(rawNode.data.endpoints);
      if (endpoints) data.endpoints = endpoints;
      if (typeof rawNode.data.error === "string") {
        data.error = rawNode.data.error.slice(0, 2_000);
      }
    }

    nodeIds.add(id);
    nodes.push({
      id,
      type,
      position: {
        x: boundedCoordinate(rawNode.position.x),
        y: boundedCoordinate(rawNode.position.y),
      },
      data,
    });
  }

  const edges: FormulaGraphEdgeSnapshot[] = [];
  const edgeIds = new Set<string>();
  for (const rawEdge of value.edges.slice(0, MAX_GRAPH_EDGES)) {
    if (!isRecord(rawEdge)) continue;
    const id = typeof rawEdge.id === "string" ? rawEdge.id.trim().slice(0, 100) : "";
    const source = typeof rawEdge.source === "string" ? rawEdge.source.trim().slice(0, 100) : "";
    const target = typeof rawEdge.target === "string" ? rawEdge.target.trim().slice(0, 100) : "";
    if (!id || edgeIds.has(id) || !nodeIds.has(source) || !nodeIds.has(target)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      source,
      target,
      ...(typeof rawEdge.sourceHandle === "string" || rawEdge.sourceHandle === null
        ? { sourceHandle: rawEdge.sourceHandle }
        : {}),
      ...(typeof rawEdge.targetHandle === "string" || rawEdge.targetHandle === null
        ? { targetHandle: rawEdge.targetHandle }
        : {}),
      animated: rawEdge.animated === true,
    });
  }

  const rawViewport = isRecord(value.viewport) ? value.viewport : {};
  return {
    nodes,
    edges,
    viewport: {
      x: boundedCoordinate(rawViewport.x),
      y: boundedCoordinate(rawViewport.y),
      zoom: Math.min(4, Math.max(0.1, finiteNumber(rawViewport.zoom, 1))),
    },
  };
}

function normalizeAssessment(value: unknown): AssessmentRecord | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (
    value.status !== "queued" &&
    value.status !== "running" &&
    value.status !== "completed" &&
    value.status !== "failed"
  ) {
    return null;
  }
  if (typeof value.region !== "string" || !Array.isArray(value.formula)) return null;

  const formula = value.formula
    .map(normalizeItem)
    .filter((item): item is FormulaItem => item !== null);
  const result = value.result;
  if (
    result !== null &&
    (!isRecord(result) ||
      typeof result.region !== "string" ||
      !isRecord(result.endpoints) ||
      !Array.isArray(result.substances) ||
      !Array.isArray(result.errors) ||
      typeof result.disclaimer_th !== "string")
  ) {
    return null;
  }

  return {
    id: value.id,
    status: value.status,
    region: value.region,
    formula,
    result: result as AssessmentRecord["result"],
    error: typeof value.error === "string" ? value.error : null,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    completed_at: typeof value.completed_at === "string" ? value.completed_at : null,
  };
}

export function formulaAssessmentSignature(formula: FormulaItem[], region: Region): string {
  const normalized = formula
    .filter((item) => item.smiles.trim() && Number(item.concentration) > 0)
    .map((item) => ({
      smiles: item.smiles.trim(),
      concentration: Number(Number(item.concentration).toFixed(6)),
    }))
    .sort((left, right) =>
      left.smiles === right.smiles
        ? left.concentration - right.concentration
        : left.smiles.localeCompare(right.smiles),
    );
  return JSON.stringify({ region, formula: normalized });
}

export function normalizeProjectWorkspace(value: unknown): ProjectWorkspace | null {
  if (!isRecord(value) || value.version !== WORKSPACE_VERSION || !Array.isArray(value.formulas)) {
    return null;
  }

  const formulas: WorkspaceFormula[] = [];
  const seenIds = new Set<string>();
  for (const rawFormula of value.formulas.slice(0, MAX_FORMULAS)) {
    if (!isRecord(rawFormula)) continue;
    const id = typeof rawFormula.id === "string" ? rawFormula.id.trim() : "";
    if (!id || seenIds.has(id) || !Array.isArray(rawFormula.items)) continue;

    seenIds.add(id);
    const items = rawFormula.items
      .slice(0, MAX_ITEMS_PER_FORMULA)
      .map(normalizeItem)
      .filter((item): item is FormulaItem => item !== null);

    formulas.push({
      id,
      name: typeof rawFormula.name === "string" ? rawFormula.name : "",
      ...(typeof rawFormula.type === "string" ? { type: rawFormula.type } : {}),
      region: normalizeRegion(rawFormula.region),
      items,
    });
  }

  const requestedActiveId =
    typeof value.activeFormulaId === "string" ? value.activeFormulaId : "";
  const activeFormulaId = formulas.length === 0
    ? ""
    : requestedActiveId === ""
      ? ""
      : seenIds.has(requestedActiveId)
        ? requestedActiveId
        : formulas[0].id;
  const dayIdx: 0 | 1 | 2 = value.dayIdx === 0 || value.dayIdx === 2 ? value.dayIdx : 1;
  const mode: WorkspaceMode =
    value.mode === "nodes" || value.mode === "trust" ? value.mode : "assess";
  const assessmentByFormulaId: Record<string, FormulaAssessmentSnapshot> = {};
  if (isRecord(value.assessmentByFormulaId)) {
    for (const [formulaId, rawSnapshot] of Object.entries(value.assessmentByFormulaId)) {
      if (!seenIds.has(formulaId) || !isRecord(rawSnapshot)) continue;
      const inputSignature =
        typeof rawSnapshot.inputSignature === "string" ? rawSnapshot.inputSignature : "";
      if (!inputSignature) continue;
      const jobId = typeof rawSnapshot.jobId === "string" && rawSnapshot.jobId.trim()
        ? rawSnapshot.jobId.trim()
        : null;
      const assessment = rawSnapshot.assessment === null
        ? null
        : normalizeAssessment(rawSnapshot.assessment);
      if (!jobId && !assessment) continue;
      const rawStartedAt = typeof rawSnapshot.startedAt === "string"
        ? rawSnapshot.startedAt
        : "";
      const fallbackStartedAt = assessment?.created_at || (
        typeof value.updatedAt === "string" ? value.updatedAt : ""
      );
      const startedAt = Number.isFinite(Date.parse(rawStartedAt))
        ? rawStartedAt
        : Number.isFinite(Date.parse(fallbackStartedAt))
          ? fallbackStartedAt
          : new Date(0).toISOString();
      assessmentByFormulaId[formulaId] = {
        inputSignature,
        jobId,
        assessment,
        startedAt,
      };
    }
  }
  const paintByFormulaId: Record<string, PaintMaskSnapshot> = {};
  if (isRecord(value.paintByFormulaId)) {
    for (const [formulaId, rawSnapshot] of Object.entries(value.paintByFormulaId)) {
      if (!seenIds.has(formulaId) || !isRecord(rawSnapshot)) continue;
      const snapshot: PaintMaskSnapshot = {};
      let validMaskCount = 0;
      for (const key of ["exposure", "redness", "papule", "peeling", "edema"] as const) {
        const dataUrl = rawSnapshot[key];
        if (
          typeof dataUrl === "string" &&
          dataUrl.startsWith("data:image/png;base64,") &&
          dataUrl.length <= MAX_PAINT_MASK_LENGTH
        ) {
          snapshot[key] = dataUrl;
          validMaskCount += 1;
        }
      }
      if (validMaskCount > 0) {
        if (typeof rawSnapshot.hasPaint === "boolean") {
          snapshot.hasPaint = rawSnapshot.hasPaint;
        }
        paintByFormulaId[formulaId] = snapshot;
      }
    }
  }
  const graphByFormulaId: Record<string, FormulaGraphSnapshot> = {};
  if (isRecord(value.graphByFormulaId)) {
    for (const [formulaId, rawSnapshot] of Object.entries(value.graphByFormulaId)) {
      if (formulaId !== FORMULA_GRAPH_DRAFT_ID && !seenIds.has(formulaId)) continue;
      const snapshot = normalizeFormulaGraphSnapshot(rawSnapshot);
      if (snapshot) graphByFormulaId[formulaId] = snapshot;
    }
  }

  return {
    version: WORKSPACE_VERSION,
    formulas,
    activeFormulaId,
    region: normalizeRegion(value.region),
    dayIdx,
    mode,
    formulaPanelOpen: value.formulaPanelOpen !== false,
    assessmentByFormulaId,
    paintByFormulaId,
    graphByFormulaId,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

export function loadProjectWorkspace(
  projectId: number,
  storage: WorkspaceStorage | null = browserStorage(),
): ProjectWorkspace | null {
  const key = workspaceKey(projectId);
  if (!key || !storage) return null;

  try {
    const raw = storage.getItem(key);
    return raw ? normalizeProjectWorkspace(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveProjectWorkspace(
  projectId: number,
  draft: ProjectWorkspaceDraft,
  storage: WorkspaceStorage | null = browserStorage(),
): boolean {
  const key = workspaceKey(projectId);
  if (!key || !storage) return false;

  const workspace = normalizeProjectWorkspace({
    ...draft,
    version: WORKSPACE_VERSION,
    updatedAt: new Date().toISOString(),
  });
  if (!workspace) return false;

  try {
    storage.setItem(key, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function deleteProjectWorkspace(
  projectId: number,
  storage: WorkspaceStorage | null = browserStorage(),
): boolean {
  const key = workspaceKey(projectId);
  if (!key || !storage) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
