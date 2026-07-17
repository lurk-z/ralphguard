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

/** ChatOut from backend/app/api/chat.py. */
export type ChatReply = { answer: string };

/** One ingredient the OCR endpoint matched to a SMILES, offline dict or PubChem. */
export type OcrItem = {
  name: string;
  smiles: string;
  concentration: number;
  score: number;
  source: "local" | "pubchem";
};

/** OcrOut from backend/app/api/ocr.py. */
export type OcrResult = {
  raw_text: string;
  items: OcrItem[];
  /** Recognized but no single-molecule structure (e.g. "Aqua", "Mica") — skipped. */
  recognized_no_structure: string[];
  /** Looked like an ingredient token but matched nothing, offline or on PubChem. */
  unmatched: string[];
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

export type AssessmentResultPayload = {
  region: string;
  endpoints: Record<string, EndpointResultPayload>;
  substances: SubstancePayload[];
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

  /**
   * Ask the assistant. `context` grounds the reply on the current formula and
   * results — the backend refuses to invent numbers that aren't in it.
   *
   * The answer may carry <action>/<formula> blocks for the caller to act on;
   * see parseAssistantReply. Given a longer leash than the default timeout: the
   * endpoint waits on an LLM round trip of its own.
   */
  chat: (question: string, context?: string) =>
    http<ChatReply>(
      "/api/chat/",
      { method: "POST", body: JSON.stringify({ question, context }) },
      35000,
    ),

  /**
   * Neural text-to-speech — MP3 audio for Thai text, far more human than the
   * browser's built-in voice. Bypasses http(): the response is audio, not JSON.
   * Callers are expected to fall back to speechSynthesis when this throws.
   */
  tts: async (text: string, voice?: string): Promise<Blob> => {
    const res = await fetch(`${API}/api/tts/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    return res.blob();
  },

  /**
   * Read an ingredient-label photo: Tesseract → text → matched against the
   * offline INCI dict, then PubChem for anything it doesn't recognize. Bypasses
   * http(): a File upload is multipart, not JSON, and the browser has to set
   * its own boundary header — passing one manually breaks the upload.
   */
  ocr: async (file: File): Promise<OcrResult> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/api/ocr/`, { method: "POST", body: fd });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.detail || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },

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
    n_train: number;
    n_test: number;
  } | null;
};

export type ModelMetricsPayload = {
  available: boolean;
  endpoints: EndpointMetric[];
  note_th: string;
};

export type ModelInfoPayload = {
  methodology: Record<string, unknown>;
  oecd_principles: string[];
  endpoints: Record<string, { label_en: string; label_th: string; oecd_tg: string }>;
  disclaimer_th: string;
};
