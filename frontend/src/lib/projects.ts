// Local project store.
//
// RalphGuard has no accounts and isn't deployed — it runs on the machine of the
// person doing the formulating, and a formula under development is exactly the
// thing you don't want leaving it. So projects live in this browser, not in a
// server-side table: nothing to sign into, nothing to leak, no rows about you
// on someone else's disk.
//
// Assessments still go to the backend, because scoring needs RDKit and the QSAR
// models. A project therefore doesn't own its runs — it just remembers the job
// ids the backend handed back, newest first, and reads each run by id. That
// keeps the backend a stateless calculator as far as this app is concerned.
import type { AssessmentResultPayload, Region } from "@/lib/api";

const KEY = "ralphguard.projects";

export type ProjectWorkspaceFormulaItem = {
  chemicalId: string;
  concentration: number;
  name?: string;
};

export type ProjectWorkspaceFormulaBox = {
  id: string;
  name: string;
  items: ProjectWorkspaceFormulaItem[];
  color?: string;
  icon?: string;
  region?: Region;
};

export type ProjectWorkspace = {
  version: 1;
  boxes: ProjectWorkspaceFormulaBox[];
  activeBoxId: string | null;
  resultByBox: Record<string, AssessmentResultPayload>;
  /** Resume polling if the page reloads before the backend finishes. */
  pendingAssessment?: {
    jobId: string;
    boxId: string;
  } | null;
  dayIdx: 0 | 1 | 2;
  activeTab: "experiment" | "nodemods" | "trust";
  collapsedBoxIds?: string[];
  updatedAt: string;
};

export type ProjectWorkspaceDraft = Omit<ProjectWorkspace, "version" | "updatedAt">;

export type LocalProject = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  /** Backend assessment job ids for this project, newest first. */
  jobs: string[];
  /** Lucide icon key chosen by the user when creating the project. */
  icon?: string;
  /** Accent colour chosen by the user — stored as a CSS hex value. */
  color?: string;
  /** Auto-saved state of the experiment workspace for this project. */
  workspace?: ProjectWorkspace;
};

/** [] on the server and in a browser that refuses storage (private mode). */
function read(): LocalProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as LocalProject[]) : [];
  } catch {
    return [];
  }
}

function write(projects: LocalProject[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
    return true;
  } catch {
    // Storage full or blocked — the session keeps working, it just won't persist.
    return false;
  }
}

/** Newest first. */
export function listProjects(): LocalProject[] {
  return read().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getProject(id: string): LocalProject | undefined {
  return read().find((p) => p.id === id);
}

export function isProjectNameExists(name: string, excludeId?: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  return read().some((p) => p.name.trim().toLowerCase() === normalized && p.id !== excludeId);
}

export function createProject(
  name: string,
  description?: string,
  icon?: string,
  color?: string,
): LocalProject {
  const project: LocalProject = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    created_at: new Date().toISOString(),
    jobs: [],
    icon,
    color,
  };
  write([...read(), project]);
  return project;
}

export function renameProject(id: string, name: string) {
  write(read().map((p) => (p.id === id ? { ...p, name } : p)));
}

export function updateProject(
  id: string,
  updates: Partial<Pick<LocalProject, "name" | "description" | "icon" | "color">>,
) {
  write(read().map((p) => (p.id === id ? { ...p, ...updates } : p)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAssessmentResult(value: unknown): value is AssessmentResultPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.region === "string" &&
    isRecord(value.endpoints) &&
    Array.isArray(value.substances) &&
    Array.isArray(value.errors) &&
    typeof value.disclaimer_th === "string"
  );
}

/** Sanitize browser data before it becomes live React state. */
function normalizeWorkspace(value: unknown): ProjectWorkspace | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.boxes)) return undefined;

  const seenIds = new Set<string>();
  const boxes: ProjectWorkspaceFormulaBox[] = [];
  for (const rawBox of value.boxes) {
    if (!isRecord(rawBox)) continue;
    const id = typeof rawBox.id === "string" ? rawBox.id.trim() : "";
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const items: ProjectWorkspaceFormulaItem[] = [];
    if (Array.isArray(rawBox.items)) {
      for (const rawItem of rawBox.items) {
        if (!isRecord(rawItem)) continue;
        const chemicalId =
          typeof rawItem.chemicalId === "string" ? rawItem.chemicalId.trim() : "";
        const concentration = Number(rawItem.concentration);
        if (!chemicalId || !Number.isFinite(concentration)) continue;
        items.push({
          chemicalId,
          concentration: Math.min(100, Math.max(0, concentration)),
          ...(typeof rawItem.name === "string" && rawItem.name.trim()
            ? { name: rawItem.name.trim() }
            : {}),
        });
      }
    }

    const region: Region =
      rawBox.region === "eye" || rawBox.region === "hand" || rawBox.region === "forearm"
        ? rawBox.region
        : "face";
    boxes.push({
      id,
      name: typeof rawBox.name === "string" ? rawBox.name : "",
      items,
      ...(typeof rawBox.color === "string" ? { color: rawBox.color } : {}),
      ...(typeof rawBox.icon === "string" ? { icon: rawBox.icon } : {}),
      region,
    });
  }

  const resultByBox: Record<string, AssessmentResultPayload> = {};
  if (isRecord(value.resultByBox)) {
    for (const [boxId, result] of Object.entries(value.resultByBox)) {
      if (seenIds.has(boxId) && isAssessmentResult(result)) resultByBox[boxId] = result;
    }
  }

  let pendingAssessment: ProjectWorkspace["pendingAssessment"] = null;
  if (isRecord(value.pendingAssessment)) {
    const jobId =
      typeof value.pendingAssessment.jobId === "string"
        ? value.pendingAssessment.jobId.trim()
        : "";
    const boxId =
      typeof value.pendingAssessment.boxId === "string"
        ? value.pendingAssessment.boxId.trim()
        : "";
    if (jobId && seenIds.has(boxId)) pendingAssessment = { jobId, boxId };
  }

  const activeBoxId =
    typeof value.activeBoxId === "string" && seenIds.has(value.activeBoxId)
      ? value.activeBoxId
      : boxes[0]?.id ?? null;
  const dayIdx: 0 | 1 | 2 = value.dayIdx === 0 || value.dayIdx === 2 ? value.dayIdx : 1;
  const activeTab: ProjectWorkspace["activeTab"] =
    value.activeTab === "nodemods" || value.activeTab === "trust"
      ? value.activeTab
      : "experiment";
  const collapsedBoxIds = Array.isArray(value.collapsedBoxIds)
    ? value.collapsedBoxIds.filter(
        (boxId): boxId is string => typeof boxId === "string" && seenIds.has(boxId),
      )
    : [];

  return {
    version: 1,
    boxes,
    activeBoxId,
    resultByBox,
    pendingAssessment,
    dayIdx,
    activeTab,
    collapsedBoxIds,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

/** Return a supported, sanitized workspace snapshot. */
export function getProjectWorkspace(id: string): ProjectWorkspace | undefined {
  return normalizeWorkspace(getProject(id)?.workspace);
}

/**
 * Persist meaningful experiment state inside its owning local project.
 * Unknown project ids are ignored so a stale browser tab cannot recreate one.
 */
export function saveProjectWorkspace(id: string, draft: ProjectWorkspaceDraft): boolean {
  const projects = read();
  if (!projects.some((project) => project.id === id)) return false;

  const workspace = normalizeWorkspace({
    ...draft,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
  if (!workspace) return false;

  return write(
    projects.map((project) =>
      project.id === id
        ? {
            ...project,
            workspace,
          }
        : project,
    ),
  );
}

export function deleteProject(id: string) {
  write(read().filter((p) => p.id !== id));
}

/** Remember a run. Ignores an unknown project so a stale tab can't resurrect it. */
export function addJob(projectId: string, jobId: string) {
  write(
    read().map((p) =>
      p.id === projectId ? { ...p, jobs: [jobId, ...p.jobs.filter((j) => j !== jobId)] } : p,
    ),
  );
}

/** The most recent run's job id, or undefined if the project has never run. */
export function latestJob(projectId: string): string | undefined {
  return getProject(projectId)?.jobs[0];
}
