// Temporary mock for the assessment pipeline. Builds a plausible-looking
// AssessmentResultPayload straight from the formula box the user built in
// the assess workspace, so /results has something to render before the
// real QSAR backend (POST /api/assessments/) is wired up. Swap this out
// once handleRun in assess/page.tsx calls api.createAssessment for real —
// the storage helpers below are the only thing results/page.tsx should
// need to stop calling.
import { chemById, type Chemical } from "@/lib/chemicals";
import type {
  AssessmentResultPayload,
  Confidence,
  ConfidenceLevel,
  EndpointResultPayload,
  SubstancePayload,
} from "@/lib/api";

export type MockFormulaItem = {
  chemicalId: string; // SMILES
  concentration: number;
  name?: string; // set only when the catalog doesn't carry the substance
};

// Rough baseline irritation/sensitisation weight per ingredient role
// (0 = inert, 1 = high-risk). Not derived from any real toxicology data —
// just enough spread that different formulas produce different-looking
// mock results.
// Invented per-category risk weights — still mock, but keyed to the real
// catalog's categories now that the substance list comes from catalog.ts.
// Replaced wholesale once this page calls the QSAR endpoint.
const CATEGORY_BASE_RISK: Record<string, number> = {
  "ตัวทำละลาย / แอลกอฮอล์": 0.25,
  "กรด (Acids)": 0.55,
  "สารกันเสีย (Preservatives)": 0.4,
  "น้ำหอม / สารก่อภูมิแพ้": 0.6,
  "สารออกฤทธิ์ (Actives)": 0.35,
  "สารลดแรงตึงผิว (Surfactants)": 0.45,
  "สารกันแดด (UV Filters)": 0.15,
  "อีมอลเลียนต์ / เพิ่มความชุ่มชื้น": 0.08,
};

const ENDPOINT_META = {
  skin: { label_th: "ระคายเคืองผิว", multiplier: 1.0, delayed: false },
  eye: { label_th: "ระคายเคืองตา", multiplier: 1.15, delayed: false },
  sens: { label_th: "แพ้ผิวหนัง", multiplier: 0.85, delayed: true },
  acute: { label_th: "พิษเฉียบพลัน", multiplier: 0.5, delayed: false },
} as const;

type EndpointKey = keyof typeof ENDPOINT_META;

const MOCK_DISCLAIMER_TH =
  "นี่คือผลจำลอง (Mock) สำหรับสาธิตการทำงานของระบบเท่านั้น ยังไม่ใช่ผลจากโมเดล QSAR จริง ห้ามใช้ประกอบการตัดสินใจด้านความปลอดภัย";
const MOCK_REASON_TH = "ผลจำลอง (Mock) — ยังไม่ผ่านการประเมินจากโมเดลจริง";

function riskOf(chem: Chemical | undefined) {
  if (!chem) return 0.15;
  return CATEGORY_BASE_RISK[chem.category] ?? 0.15;
}

function bandOf(score: number): EndpointResultPayload["band"] {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "severe";
}

function levelOf(score: number): ConfidenceLevel {
  if (score < 50) return "Medium";
  return "Low";
}

function endpointConfidence(score: number): Confidence {
  return {
    level: levelOf(score),
    reason_th: MOCK_REASON_TH,
    score: 0.65,
    in_domain: true,
    domain_similarity: 0.7,
  };
}

export function buildMockAssessmentResult(
  items: MockFormulaItem[],
  region = "face",
): AssessmentResultPayload {
  // Dose-less rows contribute nothing. Substances the catalog doesn't carry
  // (a SMILES typed into the node graph) still count — they just fall back to
  // the default risk weight.
  const validItems = items.filter((it) => it.concentration > 0 && it.chemicalId.trim());
  const totalConc = validItems.reduce((s, it) => s + it.concentration, 0);
  const intensity = Math.max(0, Math.min(1, totalConc / 100));
  const avgRisk =
    totalConc > 0
      ? validItems.reduce((s, it) => s + riskOf(chemById(it.chemicalId)) * it.concentration, 0) / totalConc
      : 0;
  const doseFactor = 0.55 + 0.45 * intensity;

  const endpoints = {} as Record<EndpointKey, EndpointResultPayload>;
  (Object.keys(ENDPOINT_META) as EndpointKey[]).forEach((key) => {
    const meta = ENDPOINT_META[key];
    const peak = Math.max(0, Math.min(100, avgRisk * meta.multiplier * doseFactor * 100));
    const timecourse: [number, number, number] = meta.delayed
      ? [peak * 0.4, peak * 0.75, peak]
      : [peak * 0.9, peak, peak * 0.85];
    endpoints[key] = {
      label_th: meta.label_th,
      peak_score: peak,
      timecourse,
      band: bandOf(peak),
      confidence: endpointConfidence(peak),
    };
  });

  const substances: SubstancePayload[] = validItems.map((it) => {
    const chem = chemById(it.chemicalId); // undefined for off-catalog substances
    const risk = riskOf(chem);
    const perEndpoint: SubstancePayload["per_endpoint"] = {};
    (Object.keys(ENDPOINT_META) as EndpointKey[]).forEach((key) => {
      const meta = ENDPOINT_META[key];
      const score = Math.max(0, Math.min(100, risk * meta.multiplier * (it.concentration / 100) * 200));
      perEndpoint[key] = {
        probability: Math.min(1, score / 100),
        score,
        in_domain: true,
        domain_similarity: 0.7,
        confidence: { level: levelOf(score), reason_th: MOCK_REASON_TH },
      };
    });
    return {
      smiles: chem?.smiles ?? it.chemicalId,
      // The real endpoint returns an RDKit-canonical SMILES here; the mock keeps
      // the display name so the results table stays readable until it's wired up.
      canonical_smiles: chem?.name ?? it.name ?? it.chemicalId,
      descriptors: {},
      per_endpoint: perEndpoint,
    };
  });

  return {
    region,
    endpoints,
    substances,
    errors: [],
    disclaimer_th: MOCK_DISCLAIMER_TH,
  };
}

const STORAGE_PREFIX = "ralphguard:mock-assessment:";

export function saveMockAssessmentResult(projectId: string, result: AssessmentResultPayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(result));
  } catch {
    // Storage full/unavailable — the mock is best-effort, nothing to recover.
  }
}

export function loadMockAssessmentResult(projectId: string): AssessmentResultPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    return raw ? (JSON.parse(raw) as AssessmentResultPayload) : null;
  } catch {
    return null;
  }
}
