const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs} ms`);
    this.name = "ApiTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly detail: string | null;

  constructor(status: number, statusText: string, detail: string | null) {
    super(detail ? `${status} ${statusText}: ${detail}` : `${status} ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

export function apiErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiTimeoutError) {
    return `${fallback}: หมดเวลาการเชื่อมต่อเซิร์ฟเวอร์`;
  }
  if (cause instanceof ApiError) {
    if (cause.status === 404) return `${fallback}: ไม่พบข้อมูลที่ร้องขอ`;
    if (cause.status === 422 && cause.detail) return `${fallback}: ${cause.detail}`;
    if (cause.status >= 500) return `${fallback}: เซิร์ฟเวอร์ยังไม่พร้อมใช้งาน`;
    return `${fallback}: ${cause.detail || cause.statusText}`;
  }
  return `${fallback}: ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้`;
}

export type Region = "forearm" | "hand" | "face" | "eye";
export type ConfidenceLevel = "High" | "Medium" | "Low";
export type EndpointCode = "skin" | "eye" | "sens" | "acute" | "skin_dryness";

export type HerbalPlantSummary = {
  id: number;
  thai_name: string;
  english_name: string | null;
  scientific_name: string;
  accepted_scientific_name: string;
  family: string | null;
  synonyms: string[];
  verification_status: string;
  source: string;
};

export type HerbalPlantDetail = {
  plant: HerbalPlantSummary & { provenance: Record<string, unknown> };
  materials: Array<{
    id: number;
    plant_part: string;
    material_type: string;
    extract_type: string | null;
    solvent: string | null;
    assessment_method: "compound_qsar" | "botanical_evidence";
    whole_material_qsar_eligible: boolean;
    source: string;
  }>;
  constituents: Array<{
    name: string;
    pubchem_cid: number | null;
    inchikey: string | null;
    relationship_type: string;
    evidence_source: string;
    structure_resolved: boolean;
    qsar_eligible: boolean;
  }>;
  evidence: Array<{
    endpoint: string;
    effect: string;
    evidence_type: string;
    source: string;
    source_url: string | null;
    doi: string | null;
  }>;
  coverage: {
    known_constituents: number;
    structure_resolved: number;
    qsar_assessed: number;
    literature_only: number;
    unresolved: number;
    percentage: number;
  };
};

export type FormulaItem = {
  smiles: string;
  name?: string;
  concentration: number;
};

export type ValidateResult = {
  smiles: string;
  valid: boolean;
  canonical?: string | null;
  descriptors?: Record<string, number> | null;
  error?: string | null;
};

export type SubstanceHazardSummary = {
  endpoint: EndpointCode;
  hazard_codes: string[];
  source_count: number;
  verification: "pending" | "consensus_verified" | "verified";
};

export type SubstanceProfile = {
  found_in_registry: boolean;
  canonical_name: string;
  inci_name?: string | null;
  pubchem_cid?: number | null;
  canonical_smiles?: string | null;
  molecular_formula?: string | null;
  molecular_weight?: number | null;
  substance_type: string;
  structure_status: string;
  qsar_eligible?: boolean | null;
  assessment_method: string;
  verification_status: string;
  description?: string | null;
  description_source?: string | null;
  description_url?: string | null;
  hazards: SubstanceHazardSummary[];
};

export type IngredientRegistryItem = {
  id: number;
  inci_name?: string | null;
  canonical_name: string;
  thai_names: string[];
  synonyms: string[];
  cas_number?: string | null;
  pubchem_cid?: number | null;
  canonical_smiles?: string | null;
  inchi?: string | null;
  inchikey?: string | null;
  molecular_formula?: string | null;
  molecular_weight?: number | null;
  substance_type: string;
  structure_status: string;
  qsar_eligible: boolean;
  assessment_method: string;
  regulatory_status_th?: Record<string, unknown> | null;
  provenance?: Record<string, unknown>;
  verification_status: string;
  registry_version?: number;
  observation_count?: number;
  reason_code?: string | null;
  reason_th?: string | null;
  first_seen_at?: string;
  last_seen_at?: string;
  updated_at?: string;
};

export type Confidence = {
  level: ConfidenceLevel;
  reason_th: string;
  score: number;
  in_domain: boolean;
  domain_similarity: number;
};

export type EndpointResultPayload = {
  label_th: string;
  peak_score: number;
  timecourse: [number, number, number] | null;
  band: "low" | "moderate" | "high" | "severe";
  confidence: Confidence | null;
  model_status?: "production" | "research_candidate";
  model_versions?: string[];
  evidence_note_th?: string | null;
};

export type SubstancePayload = {
  name?: string;
  concentration?: number;
  smiles: string;
  canonical_smiles: string;
  descriptors: Record<string, number>;
  per_endpoint: Record<
    string,
    {
      probability: number;
      score: number;
      alerts?: string[];
      rule_agrees?: boolean;
      uncertainty?: number;
      in_domain?: boolean;
      domain_similarity?: number;
      threshold?: number;
      flagged?: boolean;
      training_exposure?: {
        seen: boolean;
        role: "training" | "validation" | "external_holdout" | "unlabeled" | "none";
        model_version: string;
      };
      confidence: { level: ConfidenceLevel; reason_th: string };
    }
  >;
};

export type IngredientAssessmentPayload = {
  name: string;
  smiles: string;
  concentration: number;
  recognized: boolean;
  resolved: boolean;
  qsar_eligible: boolean;
  assessment_method: string;
  unresolved_reason?: string | null;
};

export type FormulaCoveragePayload = {
  total_ingredients: number;
  qsar_assessed_ingredients: number;
  known_carrier_ingredients: number;
  unresolved_ingredients: number;
  coverage_percentage: number;
};

export type AssessmentResultPayload = {
  region: string;
  endpoints: Record<string, EndpointResultPayload>;
  substances: SubstancePayload[];
  ingredient_assessments?: IngredientAssessmentPayload[];
  formula_coverage?: FormulaCoveragePayload;
  errors: string[];
  disclaimer_th: string;
};

export type AssessmentRecord = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  region: string;
  formula: FormulaItem[];
  result: AssessmentResultPayload | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

async function http<T>(path: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController();
  const externalSignal = init?.signal;
  let timedOut = false;
  const abortFromCaller = () => ctrl.abort();
  if (externalSignal?.aborted) ctrl.abort();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const t = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text();
      let detail: string | null = body || null;
      if (body) {
        try {
          const parsed = JSON.parse(body) as { detail?: unknown };
          if (typeof parsed.detail === "string") detail = parsed.detail;
        } catch {
          // Keep the plain response body when the server does not return JSON.
        }
      }
      throw new ApiError(res.status, res.statusText, detail);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (cause) {
    if (timedOut && !externalSignal?.aborted) throw new ApiTimeoutError(timeoutMs);
    throw cause;
  } finally {
    clearTimeout(t);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export const api = {
  validateSmiles: (smiles: string, signal?: AbortSignal) =>
    http<ValidateResult>("/api/substances/validate", {
      method: "POST",
      body: JSON.stringify({ smiles }),
      signal,
    }),

  getSubstanceProfile: (name?: string, smiles?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (name?.trim()) params.set("name", name.trim());
    if (smiles?.trim()) params.set("smiles", smiles.trim());
    return http<SubstanceProfile>(`/api/substances/profile?${params.toString()}`, { signal }, 15000);
  },

  listIngredientRegistry: (
    verificationStatus = "verified",
    limit = 500,
    offset = 0,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({
      verification_status: verificationStatus,
      limit: String(limit),
      offset: String(offset),
    });
    return http<IngredientRegistryItem[]>(`/api/substances/registry?${params.toString()}`, { signal }, 20000);
  },

  searchReadyIngredientRegistry: (
    query = "",
    limit = 250,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({
      verification_status: "verified",
      qsar_eligible: "true",
      limit: String(limit),
      offset: "0",
    });
    if (query.trim()) params.set("q", query.trim());
    return http<IngredientRegistryItem[]>(`/api/substances/registry?${params.toString()}`, { signal }, 20000);
  },

  countReadyIngredientRegistry: (signal?: AbortSignal) =>
    http<{ count: number }>("/api/substances/registry/ready-count", { signal }, 20000),

  searchHerbs: (query: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ q: query.trim(), limit: "50" });
    return http<HerbalPlantSummary[]>(`/api/herbs?${params.toString()}`, { signal }, 20000);
  },

  getHerb: (herbId: number, signal?: AbortSignal) =>
    http<HerbalPlantDetail>(`/api/herbs/${herbId}`, { signal }, 20000),

  lookupIngredientInPubChem: (
    name: string,
    refresh = false,
    signal?: AbortSignal,
  ) =>
    http<IngredientRegistryItem>("/api/substances/registry/lookup", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), refresh }),
      signal,
    }, 20000),

  createAssessment: (
    formula: FormulaItem[],
    region: Region,
    projectId?: number | null,
    signal?: AbortSignal,
  ) =>
    http<{ job_id: string; status: string }>("/api/assessments/", {
      method: "POST",
      body: JSON.stringify({ formula, region, project_id: projectId ?? null }),
      signal,
    }),

  getAssessment: (jobId: string, signal?: AbortSignal) =>
    http<AssessmentRecord>(`/api/assessments/${jobId}`, { signal }),

  listAssessments: (projectId?: number | null, limit = 50, signal?: AbortSignal) =>
    http<AssessmentSummary[]>(
      `/api/assessments/?limit=${limit}` +
        (projectId != null ? `&project_id=${projectId}` : ""),
      { signal },
    ),

  listProjects: (signal?: AbortSignal) => http<ProjectOut[]>("/api/projects/", { signal }),

  getProject: (projectId: number, signal?: AbortSignal) =>
    http<ProjectOut>(`/api/projects/${projectId}`, { signal }),

  createProject: (
    name: string,
    description?: string,
    colorKey: ProjectColorKey = "teal",
    iconKey: ProjectIconKey = "flask",
    signal?: AbortSignal,
  ) =>
    http<ProjectOut>("/api/projects/", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: description ?? null,
        color_key: colorKey,
        icon_key: iconKey,
      }),
      signal,
    }),

  updateProject: (
    projectId: number,
    name: string,
    description?: string,
    colorKey?: ProjectColorKey,
    iconKey?: ProjectIconKey,
    signal?: AbortSignal,
  ) =>
    http<ProjectOut>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        description: description?.trim() || null,
        color_key: colorKey,
        icon_key: iconKey,
      }),
      signal,
    }),

  deleteProject: (projectId: number, signal?: AbortSignal) =>
    http<void>(`/api/projects/${projectId}`, { method: "DELETE", signal }),

  restoreProject: (projectId: number, signal?: AbortSignal) =>
    http<ProjectOut>(`/api/projects/${projectId}/restore`, {
      method: "POST",
      signal,
    }),

  listProjectAssessments: (projectId: number, signal?: AbortSignal) =>
    http<AssessmentSummary[]>(`/api/projects/${projectId}/assessments`, { signal }),

  getProjectAssessment: (
    projectId: number,
    assessmentId: string,
    signal?: AbortSignal,
  ) =>
    http<AssessmentRecord>(
      `/api/projects/${projectId}/assessments/${encodeURIComponent(assessmentId)}`,
      { signal },
    ),

  getModelMetrics: (signal?: AbortSignal) =>
    http<ModelMetricsPayload>("/api/models/metrics", { signal }),

  getModelInfo: (signal?: AbortSignal) =>
    http<ModelInfoPayload>("/api/models/info", { signal }),
};

export function substanceDepictionUrl(smiles: string): string {
  return `${API}/api/substances/depiction.svg?smiles=${encodeURIComponent(smiles.trim())}`;
}

export type AssessmentSummary = {
  // FastAPI serializes the `job_id` field by its alias -> "id" (by_alias=True)
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  region: string;
  project_id: number | null;
  n_substances: number;
  created_at: string;
  completed_at: string | null;
};

export type ProjectColorKey =
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "slate"
  | "rose"
  | "orange";

export type ProjectIconKey =
  | "flask"
  | "beaker"
  | "test-tube"
  | "microscope"
  | "shield"
  | "droplets"
  | "atom"
  | "leaf"
  | "heart-pulse"
  | "clipboard-check";

export type ProjectOut = {
  id: number;
  name: string;
  description: string | null;
  color_key: ProjectColorKey;
  icon_key: ProjectIconKey;
  created_at: string;
  updated_at: string;
};

export type EndpointMetric = {
  endpoint: string;
  label_en: string;
  label_th: string;
  oecd_tg: string | null;
  status?: "production" | "candidate" | "not_trained" | "not_available";
  metrics: {
    accuracy: number;
    balanced_accuracy: number;
    sensitivity: number;
    specificity: number;
    auc: number | null;
    mcc?: number;
    threshold?: number;
    n_pos?: number;
    n_neg?: number;
    n_train?: number;
    n_test?: number;
  } | null;
};

export type ModelMetricsPayload = {
  available: boolean;
  endpoints: EndpointMetric[];
  note_th: string;
};

export type ModelInfoPayload = {
  methodology: Record<string, unknown> & { limitations?: string[] };
  oecd_principles: string[];
  endpoints: Record<string, { label_en: string; label_th: string; oecd_tg: string }>;
  data_integrity_policy?: Record<string, string>;
  evidence_sources?: Record<string, unknown>;
  validation_status?: Record<string, unknown>;
  training_integrity?: Record<string, unknown> | null;
  disclaimer_th: string;
};
