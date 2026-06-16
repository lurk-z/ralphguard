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

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  validateSmiles: (smiles: string) =>
    http<ValidateResult>("/api/substances/validate", {
      method: "POST",
      body: JSON.stringify({ smiles }),
    }),

  createAssessment: (formula: FormulaItem[], region: Region) =>
    http<{ job_id: string; status: string }>("/api/assessments/", {
      method: "POST",
      body: JSON.stringify({ formula, region }),
    }),

  getAssessment: (jobId: string) =>
    http<AssessmentRecord>(`/api/assessments/${jobId}`),
};
