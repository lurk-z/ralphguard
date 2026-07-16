const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Region = "forearm" | "hand" | "face" | "eye";
export type ConfidenceLevel = "High" | "Medium" | "Low";

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
  timecourse: [number, number, number];
  band: "low" | "moderate" | "high" | "severe";
  confidence: Confidence | null;
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
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  validateSmiles: (smiles: string) =>
    http<ValidateResult>("/api/substances/validate", {
      method: "POST",
      body: JSON.stringify({ smiles }),
    }),

  createAssessment: (formula: FormulaItem[], region: Region, projectId?: number | null) =>
    http<{ job_id: string; status: string }>("/api/assessments/", {
      method: "POST",
      body: JSON.stringify({ formula, region, project_id: projectId ?? null }),
    }),

  getAssessment: (jobId: string) =>
    http<AssessmentRecord>(`/api/assessments/${jobId}`),

  listAssessments: (projectId?: number | null, limit = 50) =>
    http<AssessmentSummary[]>(
      `/api/assessments/?limit=${limit}` +
        (projectId != null ? `&project_id=${projectId}` : ""),
    ),

  listProjects: () => http<ProjectOut[]>("/api/projects/"),

  getProject: (projectId: number) => http<ProjectOut>(`/api/projects/${projectId}`),

  createProject: (name: string, description?: string) =>
    http<ProjectOut>("/api/projects/", {
      method: "POST",
      body: JSON.stringify({ name, description: description ?? null }),
    }),

  listProjectAssessments: (projectId: number) =>
    http<AssessmentSummary[]>(`/api/projects/${projectId}/assessments`),

  getModelMetrics: () => http<ModelMetricsPayload>("/api/models/metrics"),

  getModelInfo: () => http<ModelInfoPayload>("/api/models/info"),
};

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

export type ProjectOut = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};

export type EndpointMetric = {
  endpoint: string;
  label_en: string;
  label_th: string;
  oecd_tg: string;
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
  disclaimer_th: string;
};
