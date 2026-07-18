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
const KEY = "ralphguard.projects";

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

function write(projects: LocalProject[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
  } catch {
    // Storage full or blocked — the session keeps working, it just won't persist.
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
