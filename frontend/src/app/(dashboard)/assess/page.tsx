"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import {
  AssessmentRecord,
  EndpointMetric,
  FormulaItem,
  ModelInfoPayload,
  ModelMetricsPayload,
  ProjectOut,
  Region,
  api,
} from "@/lib/api";
import {
  PRODUCT_TEMPLATES,
  SUBSTANCE_LIBRARY,
  withWaterBase,
  isWaterItem,
  normalizeSubstanceName,
  resolveCatalogSubstance,
} from "@/lib/catalog";
import VoiceAssistant from "@/components/VoiceAssistant";
import LabelScanModal from "@/components/LabelScanModal";

// ── 3D head (client-only). Auto-fills irritation by the result intensity. ──
const FaceView = dynamic(
  () => import("@/components/SymptomFaceCanvas").then((m) => m.SymptomFaceCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-xs text-slate-800/50">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

// ── Inflammation trend chart (client-only, recharts) ──
const TrendChart = dynamic(() => import("@/components/TrendChart"), { ssr: false });

// ── Node graph (client-only) ──
const FormulaGraph = dynamic(() => import("@/components/FormulaGraph"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-xs text-slate-800/50">
      กำลังโหลด Node Graph…
    </div>
  ),
});

type Mode = "assess" | "nodes" | "trust";

const REGIONS: { value: Region; label: string; icon: string }[] = [
  { value: "forearm", label: "ท่อนแขน", icon: "💪" },
  { value: "hand", label: "มือ", icon: "🤚" },
  { value: "face", label: "ใบหน้า", icon: "🙂" },
  { value: "eye", label: "ดวงตา", icon: "👁️" },
];
const ENDPOINTS = ["skin", "eye", "sens", "acute"] as const;
const ENDPOINT_LABEL_TH: Record<string, string> = {
  skin: "ระคายเคืองผิว",
  eye: "ระคายเคืองตา",
  sens: "แพ้ผิวหนัง",
  acute: "พิษเฉียบพลัน",
};
const DAY_LABELS = [1, 3, 7];
const bandOf = (s: number) => (s < 25 ? "low" : s < 50 ? "moderate" : s < 75 ? "high" : "severe");
const BAND_HEX: Record<string, string> = { low: "#16A34A", moderate: "#E08A00", high: "#DC2626", severe: "#B91C1C" };
const BAND_LABEL: Record<string, string> = { low: "ต่ำ", moderate: "กลาง", high: "สูง", severe: "รุนแรง" };
// Applicability-domain / model confidence display
const CONF_TH: Record<string, string> = { High: "สูง", Medium: "กลาง", Low: "ต่ำ" };
const CONF_HEX: Record<string, string> = { High: "#16A34A", Medium: "#E08A00", Low: "#DC2626" };
const CONF_ORDER: Record<string, number> = { High: 2, Medium: 1, Low: 0 };
// Distinct neon color per endpoint so painted layers are visually different.
const EP_COLOR: Record<string, string> = {
  skin: "#FF3B5C",  // แดง
  eye: "#22D3EE",   // ฟ้า
  sens: "#A855F7",  // ม่วง
  acute: "#F59E0B", // ส้ม
};

const SAMPLE: FormulaItem[] = [
  { name: "Ethanol", smiles: "CCO", concentration: 40 },
  { name: "Cinnamaldehyde", smiles: "O=C/C=C/c1ccccc1", concentration: 3 },
];

const PRODUCT_TYPES = [
  "โทนเนอร์",
  "เซรั่ม / เอสเซนส์",
  "ครีม / โลชั่น",
  "เจล / โฟมล้าง",
  "สเปรย์ / มิสต์",
  "ครีมกันแดด",
  "เมคอัพ",
  "อื่นๆ",
];

// ประเภทที่ปกติต้องมีน้ำเป็นเบส — ใช้เตือนเมื่อสัดส่วนสารเต็ม 100% จนไม่เหลือที่ให้น้ำ
const WATER_BASED_TYPES = new Set([
  "โทนเนอร์",
  "เซรั่ม / เอสเซนส์",
  "ครีม / โลชั่น",
  "เจล / โฟมล้าง",
  "สเปรย์ / มิสต์",
  "ครีมกันแดด",
]);

export default function StudioPage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [project, setProject] = useState<ProjectOut | null>(null);
  const [mode, setMode] = useState<Mode>("assess");
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateRisk, setTemplateRisk] = useState<"all" | "low" | "mid" | "high">("all");
  const [eraseMode, setEraseMode] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [formulas, setFormulas] = useState<{ id: string; name: string; type?: string; items: FormulaItem[] }[]>([
    { id: "f1", name: "สูตร A", type: "ครีม / โลชั่น", items: SAMPLE },
  ]);
  const [activeId, setActiveId] = useState("f1");
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<{ name: string; type: string; region: Region; from: string }>({
    name: "",
    type: "ครีม / โลชั่น",
    region: "face",
    from: "blank",
  });
  const activeFormula = formulas.find((f) => f.id === activeId) ?? formulas[0];
  const formula = activeFormula?.items ?? [];
  const setFormula = (u: FormulaItem[] | ((prev: FormulaItem[]) => FormulaItem[])) =>
    setFormulas((prev) =>
      prev.map((f) =>
        f.id === activeId
          ? { ...f, items: typeof u === "function" ? (u as (p: FormulaItem[]) => FormulaItem[])(f.items) : u }
          : f,
      ),
    );
  const [region, setRegion] = useState<Region>("face");
  const [dayIdx, setDayIdx] = useState(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AssessmentRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `/projects/:id/assess` redirects here with projectId so there is only one
  // real assessment workspace. Every run remains attached to that project.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("projectId");
    const id = raw ? Number(raw) : NaN;
    if (!Number.isInteger(id) || id <= 0) return;
    setProjectId(id);
    api.getProject(id).then(setProject).catch((cause) => setError(`โหลดโปรเจกต์ไม่สำเร็จ: ${String(cause)}`));
  }, []);

  const endpoints = assessment?.result?.endpoints ?? null;
  const completed = assessment?.status === "completed";
  const formulaCoverage = assessment?.result?.formula_coverage;

  // Product name for the paint-mode hover tooltip.
  const productName = useMemo(() => {
    const names = formula.map((f) => f.name?.trim()).filter(Boolean);
    return names.length ? names.join(" + ") : "สูตรที่ประเมิน";
  }, [formula]);

  // Water base = balance to 100% (formula stores actives only).
  const waterPct = Math.max(
    0,
    Math.round((100 - formula.reduce((s, it) => s + (Number(it.concentration) || 0), 0)) * 10) / 10,
  );
  // ประเภทต้องมีน้ำ แต่สารเต็ม 100% จนไม่เหลือที่ให้น้ำ → เตือน
  const waterMissing = WATER_BASED_TYPES.has(activeFormula?.type || "") && waterPct <= 0;

  // Time-course trend data (Day 1/3/7) for the line chart.
  const trendData = useMemo(() => {
    if (!endpoints) return [];
    return [0, 1, 2].map((i) => {
      const row: Record<string, number | string> = { day: `วันที่ ${DAY_LABELS[i]}` };
      ENDPOINTS.forEach((ep) => {
        row[ep] = Math.round(endpoints[ep]?.timecourse?.[i] ?? 0);
      });
      return row as { day: string } & Record<string, number | string>;
    });
  }, [endpoints]);
  const trendLines = ENDPOINTS.map((ep) => ({
    key: ep,
    label: ENDPOINT_LABEL_TH[ep],
    color: EP_COLOR[ep],
  }));

  // Per-endpoint paint layers — each endpoint paints in its own neon color.
  const paintLayers = useMemo(() => {
    if (!endpoints) return [];
    return ENDPOINTS.map((ep) => {
      const endpoint = endpoints[ep];
      const sc = endpoint?.timecourse?.[dayIdx] ?? endpoint?.peak_score ?? 0;
      return {
        key: ep,
        label: ENDPOINT_LABEL_TH[ep],
        score: sc,
        color: EP_COLOR[ep],
        band: bandOf(sc),
        confidenceLevel: endpoint?.confidence?.level,
        inDomain: endpoint?.confidence?.in_domain,
      };
    });
  }, [endpoints, dayIdx]);

  // Per-substance confidence / applicability-domain (worst endpoint), keyed by SMILES.
  const subConf = useMemo(() => {
    const map = new Map<string, { level: string; inDomain: boolean; reason: string }>();
    const subs = assessment?.result?.substances;
    if (!subs) return map;
    for (const s of subs) {
      let level = "High";
      let inDomain = true;
      let reason = "";
      for (const ep of Object.keys(s.per_endpoint || {})) {
        const pe = (s.per_endpoint as any)[ep];
        if (!pe?.confidence) continue;
        if (CONF_ORDER[pe.confidence.level] < CONF_ORDER[level]) {
          level = pe.confidence.level;
          reason = pe.confidence.reason_th;
        }
        if (pe.in_domain === false) inDomain = false;
      }
      const rec = { level, inDomain, reason };
      map.set(s.smiles, rec);
      map.set(s.canonical_smiles, rec);
    }
    return map;
  }, [assessment]);

  // Formula-level reliability: true when most endpoints are Low-confidence / out-of-domain.
  const lowConfidence = useMemo(() => {
    const eps = assessment?.result?.endpoints;
    if (!eps) return false;
    const list = Object.values(eps);
    const bad = list.filter(
      (e) => e.confidence && (e.confidence.level === "Low" || e.confidence.in_domain === false),
    ).length;
    return list.length > 0 && bad >= Math.ceil(list.length / 2);
  }, [assessment]);

  // Poll
  useEffect(() => {
    if (!jobId) return;
    if (assessment && (completed || assessment.status === "failed")) return;
    const tick = async () => {
      try {
        setAssessment(await api.getAssessment(jobId));
      } catch (e) {
        setError(String(e));
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, [jobId, assessment?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const runFormula = async (candidate: FormulaItem[]) => {
    setError(null);
    setAssessment(null);
    setJobId(null);
    setRunning(true);
    try {
      const actives = candidate.filter((it) => it.smiles.trim() && it.concentration > 0 && !isWaterItem(it));
      if (!actives.length) throw new Error("เพิ่มอย่างน้อย 1 สาร + ความเข้มข้น");
      const activeTotal = actives.reduce((sum, item) => sum + item.concentration, 0);
      if (activeTotal > 100.0001) throw new Error(`ผลรวมความเข้มข้นเกิน 100% (${activeTotal.toFixed(2)}%)`);
      const validation = await Promise.all(actives.map((item) => api.validateSmiles(item.smiles)));
      const invalidAt = validation.findIndex((item) => !item.valid);
      if (invalidAt >= 0) throw new Error(`SMILES ของ ${actives[invalidAt].name || `สารลำดับ ${invalidAt + 1}`} ไม่ถูกต้อง`);
      const cleaned = withWaterBase(actives); // น้ำเป็นเบส เติมให้รวม 100%
      const { job_id } = await api.createAssessment(cleaned, region, projectId);
      setJobId(job_id);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };
  const run = () => runFormula(formula);

  const patchItem = (i: number, p: Partial<FormulaItem>) =>
    setFormula((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const removeItem = (i: number) => setFormula((prev) => prev.filter((_, idx) => idx !== i));
  const addItem = () => setFormula((prev) => [...prev, { name: "", smiles: "", concentration: 10 }]);

  // Create / select saved formulas
  const openCreate = () => {
    setDraft({
      name: "สูตร " + String.fromCharCode(64 + Math.min(26, formulas.length + 1)),
      type: "ครีม / โลชั่น",
      region: "face",
      from: "blank",
    });
    setShowCreate(true);
  };
  const createFormula = () => {
    const id = "f" + Date.now();
    let items: FormulaItem[] = [{ name: "", smiles: "", concentration: 10 }];
    let reg = draft.region;
    if (draft.from !== "blank") {
      const t = PRODUCT_TEMPLATES.find((x) => x.id === draft.from);
      if (t) {
        items = t.formula.map((f) => ({ ...f }));
        reg = t.region === "eye" ? "eye" : "face";
      }
    }
    setFormulas((prev) => [...prev, { id, name: draft.name.trim() || "สูตรใหม่", type: draft.type, items }]);
    setActiveId(id);
    setRegion(reg);
    setAssessment(null);
    setJobId(null);
    setShowCreate(false);
  };
  // Save the current node graph as a brand-new formula (from node mode).
  const saveGraphAsFormula = (items: FormulaItem[]) => {
    const actives = items.filter((it) => it.smiles.trim() && !isWaterItem(it));
    if (!actives.length) return;
    const id = "f" + Date.now();
    const n = formulas.filter((f) => (f.type || "").includes("Node")).length + 1;
    setFormulas((prev) => [...prev, { id, name: `สูตรจาก Node ${n}`, type: "จาก Node graph", items: actives }]);
    setActiveId(id);
    setAssessment(null);
    setJobId(null);
  };
  const selectFormula = (id: string) => {
    setActiveId(id);
    setAssessment(null);
    setJobId(null);
  };
  const renameFormula = (id: string, name: string) =>
    setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  const deleteFormula = (id: string) => {
    if (formulas.length <= 1) return; // keep at least one
    const next = formulas.filter((f) => f.id !== id);
    setFormulas(next);
    if (id === activeId) {
      setActiveId(next[0].id);
      setAssessment(null);
      setJobId(null);
    }
  };

  // Load a full product template (replaces the current formula + region).
  const loadTemplate = (id: string) => {
    const t = PRODUCT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setFormula(t.formula.map((f) => ({ ...f })));
    setRegion(t.region === "eye" ? "eye" : "face"); // model is head-only
    setAssessment(null);
    setJobId(null);
  };

  // Import an AI-suggested formula straight into the Formulation input.
  const importFormula = (items: FormulaItem[]) => {
    const mapped = items
      .map((it) => {
        const hit = resolveCatalogSubstance(it.name || "");
        return {
          name: hit?.name || it.name || "",
          smiles: hit?.smiles || it.smiles, // prefer catalog SMILES when the name matches
          concentration: it.concentration,
        };
      })
      .filter((it) => it.smiles && !isWaterItem(it));
    if (!mapped.length) return;
    setFormula(mapped);
    setAssessment(null);
    setJobId(null);
  };

  // Agent actions are previewed in VoiceAssistant, then validated and applied
  // atomically here. A multi-step edit followed by `run` therefore evaluates
  // the new formula rather than stale React state.
  const runAssistantAction = async (actions: any[]) => {
    if (!Array.isArray(actions) || !actions.length) return;
    let nextFormula = formula.map((item) => ({ ...item }));
    let createdId: string | null = null;
    let createdName = "สูตรใหม่";
    let renamedTo: string | null = null;
    let nextMode: Mode | null = null;
    let shouldRun = false;

    const checkedConcentration = (raw: unknown, label: string) => {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`${label}: ความเข้มข้นต้องอยู่ระหว่าง 0–100%`);
      }
      return value;
    };
    const checkedItem = async (raw: any): Promise<FormulaItem | null> => {
      const name = String(raw?.name || "").trim();
      const catalogHit = resolveCatalogSubstance(name);
      const suppliedSmiles = String(raw?.smiles || "").trim();
      const unsupportedMixture = /\b(witch\s*hazel|aloe\s*vera|extract|leaf\s+juice|fragrance|parfum|essential\s+oil)\b/i;
      if (!catalogHit && unsupportedMixture.test(name)) {
        throw new Error(`${name} เป็นสารสกัดหรือสารผสม จึงห้าม AI แทนด้วย SMILES ของโมเลกุลเดียว`);
      }
      const smiles = catalogHit?.smiles || suppliedSmiles;
      const resolvedName = catalogHit?.name || name;
      if ((!smiles && !name) || isWaterItem({ smiles, name })) return null;
      if (!smiles) throw new Error(`AI ไม่ได้ระบุโครงสร้างของ ${name}`);
      const validation = await api.validateSmiles(smiles);
      if (!validation.valid) throw new Error(`AI ส่ง SMILES ไม่ถูกต้องสำหรับ ${resolvedName || smiles}`);
      return {
        name: resolvedName,
        smiles: validation.canonical || smiles,
        concentration: checkedConcentration(raw?.concentration ?? 0, resolvedName || smiles),
      };
    };
    const checkedItems = async (raw: any): Promise<FormulaItem[]> => {
      if (!Array.isArray(raw)) throw new Error("รูปแบบรายการสารจาก AI ไม่ถูกต้อง");
      const resolved = await Promise.all(raw.map(checkedItem));
      return resolved.filter((item): item is FormulaItem => item !== null);
    };

    for (const action of actions) {
      const a = action || {};
      switch (a.type) {
        case "add_substance":
          {
            const item = await checkedItem(a);
            if (!item) throw new Error("AI ไม่ได้ระบุสารที่เพิ่มให้ครบ");
            nextFormula.push(item);
          }
          break;
        case "set_concentration": {
          const rawKey = String(a.name || a.smiles || "").trim();
          const key = normalizeSubstanceName(rawKey);
          const concentration = checkedConcentration(a.concentration, String(a.name || "สาร"));
          let found = false;
          nextFormula = nextFormula.map((item) => {
            const matches = normalizeSubstanceName(item.name || "") === key || item.smiles.trim().toLowerCase() === rawKey.toLowerCase();
            if (matches) found = true;
            return matches ? { ...item, concentration } : item;
          });
          if (!found) throw new Error(`ไม่พบ ${a.name || a.smiles} ในสูตรปัจจุบัน`);
          break;
        }
        case "remove_substance": {
          const rawKey = String(a.name || a.smiles || "").trim();
          const key = normalizeSubstanceName(rawKey);
          nextFormula = nextFormula.filter(
            (item) => normalizeSubstanceName(item.name || "") !== key && item.smiles.trim().toLowerCase() !== rawKey.toLowerCase(),
          );
          break;
        }
        case "set_formula": {
          nextFormula = await checkedItems(a.items);
          if (!nextFormula.length) throw new Error("สูตรที่ AI ส่งกลับมาว่างเปล่า");
          break;
        }
        case "create_formula": {
          createdId = "f" + Date.now();
          createdName = String(a.name || "สูตรใหม่").trim() || "สูตรใหม่";
          nextFormula = await checkedItems(a.items);
          if (!nextFormula.length) throw new Error("สูตรที่ AI สร้างไม่มีสารที่ประเมินได้");
          break;
        }
        case "rename_formula": {
          const name = String(a.name || "").trim();
          if (name) renamedTo = name;
          break;
        }
        case "replace_substance": {
          const rawKey = String(a.from || a.name || "").trim();
          const key = normalizeSubstanceName(rawKey);
          const replacement = await checkedItem({
            name: a.to || a.to_name,
            smiles: a.smiles || a.to_smiles,
            concentration: a.concentration ?? 0,
          });
          if (!replacement) throw new Error("ข้อมูลสารทดแทนไม่ครบ");
          let found = false;
          nextFormula = nextFormula.map((item) => {
            const matches = normalizeSubstanceName(item.name || "") === key || item.smiles.trim().toLowerCase() === rawKey.toLowerCase();
            if (!matches) return item;
            found = true;
            return { ...replacement, concentration: a.concentration != null ? replacement.concentration : item.concentration };
          });
          if (!found) throw new Error(`ไม่พบ ${a.from || a.name} ที่ต้องการแทนที่`);
          break;
        }
        case "goto":
          if (a.tab === "assess" || a.tab === "nodes" || a.tab === "trust") nextMode = a.tab;
          break;
        case "run":
          shouldRun = true;
          break;
        case "clear":
          nextFormula = [];
          break;
        default:
          throw new Error(`ไม่อนุญาตคำสั่ง AI ชนิด ${String(a.type || "unknown")}`);
      }
    }

    const total = nextFormula.reduce((sum, item) => sum + item.concentration, 0);
    if (total > 100.0001) throw new Error(`สูตรหลังปรับรวม ${total.toFixed(2)}% ซึ่งเกิน 100%`);

    if (createdId) {
      const id = createdId;
      setFormulas((previous) => [...previous, { id, name: renamedTo || createdName, type: "สร้างโดย AI (ยืนยันแล้ว)", items: nextFormula }]);
      setActiveId(id);
    } else {
      setFormula(nextFormula);
      if (renamedTo && activeId) renameFormula(activeId, renamedTo);
    }
    if (nextMode) setMode(nextMode);
    setAssessment(null);
    setJobId(null);
    if (shouldRun) await runFormula(nextFormula);
  };

  // Add one ingredient (picked from the catalog dropdown) as a new formula row.
  const addFromCatalog = (smiles: string) => {
    const it = SUBSTANCE_LIBRARY.flatMap((g) => g.items).find((s) => s.smiles === smiles);
    if (!it) return;
    setFormula((prev) => [...prev, { name: it.name, smiles: it.smiles, concentration: it.conc }]);
  };

  // OCR: read an ingredient-label photo (via the LabelScanModal popup).
  const [scanOpen, setScanOpen] = useState(false);
  const importScannedItems = (scanned: { name: string; smiles: string; concentration: number }[]) => {
    const items = scanned
      .filter((it) => it.smiles && !isWaterItem(it))
      .map((it) => ({ name: it.name, smiles: String(it.smiles), concentration: Number(it.concentration) }));
    if (!items.length) return;
    setFormula(items);
    setAssessment(null);
    setJobId(null);
  };

  // AI: auto-adjust the % of each substance to realistic/safest cosmetic levels.
  const [optBusy, setOptBusy] = useState(false);
  const [optMsg, setOptMsg] = useState<string | null>(null);
  const [pendingOptimization, setPendingOptimization] = useState<FormulaItem[] | null>(null);
  const optimizeFormula = async () => {
    const actives = formula.filter((it) => it.smiles.trim() && !isWaterItem(it));
    if (!actives.length) return;
    setOptBusy(true);
    setOptMsg(null);
    setPendingOptimization(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const list = actives
        .map((it) => `- ${it.name || it.smiles} (SMILES ${it.smiles}) ปัจจุบัน ${it.concentration}%`)
        .join("\n");
      const question =
        "ช่วยปรับอัตราส่วน % ของสารในสูตรนี้ให้สมจริงตามมาตรฐานเครื่องสำอางและปลอดภัยที่สุด " +
        "(ลดสารก่อระคายเคือง/สารกันเสียลงสู่ระดับที่ใช้จริง เช่น สารกันเสีย <1%, กรด 2-10%, humectant 3-15%). " +
        "ห้ามเพิ่มหรือลบสาร คงสารเดิมและ SMILES เดิมไว้ทุกตัว ไม่ต้องใส่ Water. " +
        'ตอบกลับเป็น <formula>[{"name","smiles","concentration"}]</formula> เท่านั้น:\n' +
        list;
      const r = await fetch(`${API}/api/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context: null }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.detail || `HTTP ${r.status}`);
      }
      const { answer } = await r.json();
      const block =
        answer.match(/<formula>([\s\S]*?)<\/formula>/i) || answer.match(/<action>([\s\S]*?)<\/action>/i);
      if (!block) throw new Error("AI ไม่ได้ส่งสูตรกลับมา");
      let raw = JSON.parse(block[1].trim());
      // <action> form → pull the items array out of a set_formula/create_formula command
      if (!Array.isArray(raw)) raw = [raw];
      if (raw[0] && raw[0].items) raw = raw[0].items;
      const items = raw
        .filter((x: any) => x && x.smiles && !isWaterItem(x))
        .map((x: any) => ({ name: String(x.name || ""), smiles: String(x.smiles), concentration: Number(x.concentration) || 0 }));
      if (!items.length) throw new Error("สูตรที่ได้ว่างเปล่า");
      const before = actives.map((item) => item.smiles).sort();
      const after = items.map((item: FormulaItem) => item.smiles).sort();
      if (before.length !== after.length || before.some((smiles, index) => smiles !== after[index])) {
        throw new Error("AI เปลี่ยนชนิดสารหรือ SMILES จึงไม่อนุญาตให้นำเข้า");
      }
      const total = items.reduce((sum: number, item: FormulaItem) => sum + item.concentration, 0);
      if (items.some((item: FormulaItem) => item.concentration <= 0 || item.concentration > 100) || total > 100.0001) {
        throw new Error(`อัตราส่วนที่ AI เสนอไม่ถูกต้อง (รวม ${total.toFixed(2)}%)`);
      }
      setPendingOptimization(items);
      setOptMsg("AI เสนออัตราส่วนใหม่แล้ว กรุณาตรวจ Before → After ก่อนยืนยัน");
    } catch (e: any) {
      setOptMsg("✗ ปรับไม่สำเร็จ: " + (e?.message || String(e)));
    } finally {
      setOptBusy(false);
    }
  };

  // Build a real, data-filled PDF report from a template (not a screenshot) and
  // print it via a hidden iframe → the user picks "Save as PDF".
  const exportPdf = () => {
    const esc = (s: unknown) =>
      String(s ?? "").replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
    const regionLabel = REGIONS.find((r) => r.value === region)?.label ?? region;
    const items = withWaterBase(
      formula.filter((it) => it.smiles.trim() && it.concentration > 0 && !isWaterItem(it)),
    );
    const eps = endpoints as Record<string, { peak_score?: number; timecourse?: number[] }> | null;
    const scoreAt = (ep: string, d: number) =>
      Math.round((eps?.[ep]?.timecourse?.[d] ?? eps?.[ep]?.peak_score ?? 0) as number);
    const now = new Date();
    const dateStr = now.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });

    const ingredientRows = items
      .map(
        (it) =>
          `<tr><td>${esc(it.name || "-")}</td><td class="mono">${esc(it.smiles)}</td><td class="num">${it.concentration}%</td></tr>`,
      )
      .join("");

    let resultBlock: string;
    let noteBlock = "";
    if (completed && eps) {
      resultBlock = `<table class="tbl">
        <thead><tr><th style="text-align:left">ปลายทางความเสี่ยง</th><th>Day 1</th><th>Day 3</th><th>Day 7</th></tr></thead>
        <tbody>${ENDPOINTS.map((ep) => {
          const cells = [0, 1, 2]
            .map((d) => {
              const sc = scoreAt(ep, d);
              const b = bandOf(sc);
              return `<td class="num"><span class="pill" style="background:${BAND_HEX[b]}">${sc} · ${BAND_LABEL[b]}</span></td>`;
            })
            .join("");
          return `<tr><td>${ENDPOINT_LABEL_TH[ep]}</td>${cells}</tr>`;
        }).join("")}</tbody></table>`;
      const top = ENDPOINTS.map((ep) => ({ label: ENDPOINT_LABEL_TH[ep], sc: scoreAt(ep, dayIdx) })).sort(
        (a, b) => b.sc - a.sc,
      )[0];
      const b = bandOf(top.sc);
      noteBlock = `<div class="note"><b>ข้อสังเกต:</b> ความเสี่ยงเด่นที่สุด (Day ${DAY_LABELS[dayIdx]}) คือ “${esc(top.label)}” ที่ ${top.sc}/100 (ระดับ${BAND_LABEL[b]})${
        top.sc >= 50 ? " — ควรทบทวน/ลดความเข้มข้นของสารหลักก่อนพัฒนาต่อ" : " — อยู่ในเกณฑ์ที่จัดการได้"
      }</div>`;
    } else {
      resultBlock = `<p class="muted">ยังไม่ได้กด ▶ Run ประเมิน — รายงานนี้แสดงเฉพาะข้อมูลสูตร</p>`;
    }

    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>RalphGuard — รายงานการประเมิน</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:'LINE Seed Sans TH','Sarabun','Segoe UI',system-ui,sans-serif; color:#0F1C1E; font-size:12px; line-height:1.5; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #0D9488; padding-bottom:10px; }
  .brand { display:flex; align-items:center; gap:8px; }
  .logo { width:30px; height:30px; border-radius:7px; background:#0D9488; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:16px; }
  .brand b { font-size:18px; }
  .brand span { display:block; font-size:10px; color:#5b7075; }
  .date { font-size:10px; color:#5b7075; text-align:right; }
  h2 { font-size:13px; color:#0D9488; margin:20px 0 8px; border-left:4px solid #2DD4BF; padding-left:8px; }
  .meta { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:14px; }
  .meta div { background:#F0FaF9; border:1px solid #d7ebe8; border-radius:8px; padding:8px 10px; }
  .meta .k { font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#6b8085; }
  .meta .v { font-size:13px; font-weight:600; margin-top:2px; }
  table.tbl { width:100%; border-collapse:collapse; }
  table.tbl th, table.tbl td { border:1px solid #e2e8ea; padding:6px 8px; font-size:11.5px; }
  table.tbl th { background:#0D9488; color:#fff; font-weight:600; }
  table.tbl td.num { text-align:center; }
  table.tbl .mono { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:10px; color:#556; }
  .pill { display:inline-block; color:#fff; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:600; }
  .muted { color:#8a9a9e; font-style:italic; }
  .note { margin-top:10px; background:#FFF7ED; border:1px solid #fed7aa; border-radius:8px; padding:8px 10px; font-size:11.5px; }
  .foot { margin-top:26px; border-top:1px solid #e2e8ea; padding-top:8px; font-size:9.5px; color:#8a9a9e; line-height:1.5; }
</style></head><body>
  <div class="head">
    <div class="brand"><div class="logo">R</div><div><b>RalphGuard</b><span>รายงานการประเมินความเสี่ยงสารเคมี (In-silico QSAR)</span></div></div>
    <div class="date">ออกรายงาน<br>${esc(dateStr)}</div>
  </div>

  <div class="meta">
    <div><div class="k">ชื่อสูตร</div><div class="v">${esc(activeFormula?.name ?? "-")}</div></div>
    <div><div class="k">ประเภท</div><div class="v">${esc(activeFormula?.type ?? "-")}</div></div>
    <div><div class="k">บริเวณทดสอบ</div><div class="v">${esc(regionLabel)}</div></div>
    <div><div class="k">จำนวนสาร</div><div class="v">${items.length} รายการ</div></div>
  </div>

  <h2>ส่วนผสม (Formula)</h2>
  <table class="tbl">
    <thead><tr><th style="text-align:left">สาร</th><th style="text-align:left">SMILES</th><th style="text-align:center">สัดส่วน</th></tr></thead>
    <tbody>${ingredientRows}</tbody>
  </table>

  <h2>ผลการประเมินความเสี่ยง</h2>
  ${resultBlock}
  ${noteBlock}

  <div class="foot">
    เอกสารนี้สร้างจากการคัดกรองด้วยแบบจำลอง QSAR (in-silico) เพื่อประเมินความเสี่ยงเบื้องต้นเท่านั้น
    ไม่สามารถทดแทนการทดสอบจริงตามมาตรฐาน และไม่ใช่คำวินิจฉัยทางการแพทย์ · RalphGuard · NSC 2026 (28P14E01438)
  </div>
</body></html>`;

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const go = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => iframe.remove(), 1500);
      }
    };
    setTimeout(go, 350);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-800">
      {/* ── Top bar: browser-style tabs ── */}
      <header className="flex h-11 shrink-0 items-end gap-1 border-b border-slate-200 bg-slate-100 px-2 pt-1.5">
        {/* logo */}
        <div className="mb-1.5 mr-1 flex items-center gap-1.5 pl-1 pr-2">
          <span className="grid size-6 place-items-center rounded bg-brand text-xs font-bold text-white">R</span>
          <span className="font-display text-sm font-bold">Ralph<span className="text-brand">Guard</span></span>
        </div>

        {/* tabs */}
        {(
          [
            ["assess", "ประเมิน", "🧪"],
            ["nodes", "Nodes Mode", "🧩"],
            ["trust", "ความน่าเชื่อถือ", "🛡️"],
          ] as [Mode, string, string][]
        ).map(([m, label, icon]) => {
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`relative flex h-8 max-w-[180px] items-center gap-1.5 rounded-t-lg px-4 text-xs transition ${
                active
                  ? "-mb-px border border-b-0 border-slate-200 bg-white font-semibold text-slate-800"
                  : "mb-1 text-slate-500 hover:bg-slate-200/70"
              }`}
            >
              <span className="text-sm leading-none">{icon}</span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}

        {/* new-tab affordance (decorative) */}
        <span className="mb-1.5 ml-0.5 grid size-6 place-items-center rounded text-slate-300">+</span>

        {/* right actions */}
        <div className="mb-1 ml-auto flex items-center gap-2 pr-1">
          {project && (
            <a
              href={`/projects/${project.id}`}
              className="hidden max-w-56 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600 hover:border-brand hover:text-brand md:flex"
              title={`กลับไปยังโปรเจกต์ ${project.name}`}
            >
              <span>🗂️</span>
              <span className="truncate">{project.name}</span>
            </a>
          )}
          <button onClick={run} className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800/70 hover:border-brand hover:text-brand" title="Run">▶</button>
          <button onClick={exportPdf} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark" title="ส่งออกรายงาน PDF จากข้อมูลการประเมิน">
            แชร์ / PDF
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Icon rail */}
        <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3">
          {[
            { m: "assess" as Mode, icon: "🗂️", title: "ไฟล์" },
            { m: "nodes" as Mode, icon: "🧩", title: "Nodes" },
            { m: "trust" as Mode, icon: "🛡️", title: "ความน่าเชื่อถือ" },
          ].map((it) => (
            <button
              key={it.m}
              onClick={() => setMode(it.m)}
              title={it.title}
              className={`grid size-9 place-items-center rounded-lg text-base transition ${
                mode === it.m ? "bg-teal-50 text-brand" : "text-slate-800/45 hover:bg-slate-100"
              }`}
            >
              {it.icon}
            </button>
          ))}
          <button
            onClick={() => setShowTemplates((s) => !s)}
            title="เทมเพลตผลิตภัณฑ์"
            className={`grid size-9 place-items-center rounded-lg text-base transition ${
              showTemplates ? "bg-teal-50 text-brand" : "text-slate-800/45 hover:bg-slate-100"
            }`}
          >
            🧴
          </button>
          <a href="/" title="หน้าแรก" className="mt-auto grid size-9 place-items-center rounded-lg text-slate-800/40 hover:bg-slate-100">🏠</a>
        </nav>

        {/* Left panel — Pages + Layers */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="font-display text-sm font-semibold">การประเมินสารเคมี</div>
            {project && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="truncate">บันทึกผลใน {project.name}</span>
              </div>
            )}
          </div>

          <Section title="สูตรที่สร้าง">
            <div className="space-y-1">
              {formulas.map((f) => (
                <div
                  key={f.id}
                  onClick={() => selectFormula(f.id)}
                  className={`group flex w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition ${
                    f.id === activeId
                      ? "border-brand bg-teal-50 text-brand-dark"
                      : "border-slate-200 bg-white text-slate-800 hover:border-brand/50"
                  }`}
                >
                  <span>🧪</span>
                  {editingFormulaId === f.id ? (
                    <input
                      autoFocus
                      value={f.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => renameFormula(f.id, e.target.value)}
                      onBlur={() => setEditingFormulaId(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditingFormulaId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-brand bg-white px-1 text-sm text-slate-800 outline-none"
                    />
                  ) : (
                    <div
                      className="flex min-w-0 flex-1 flex-col"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingFormulaId(f.id);
                      }}
                      title="ดับเบิลคลิกเพื่อแก้ชื่อ"
                    >
                      <span className="truncate font-medium">{f.name}</span>
                      {f.type && <span className="truncate text-[9px] font-normal text-slate-400">{f.type}</span>}
                    </div>
                  )}
                  <span className="font-mono text-[10px] text-slate-400">{f.items.length} สาร</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFormulaId(f.id);
                    }}
                    title="แก้ชื่อสูตร"
                    className="grid size-4 shrink-0 place-items-center rounded text-slate-300 opacity-0 transition hover:text-brand group-hover:opacity-100"
                  >
                    ✎
                  </button>
                  {formulas.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFormula(f.id);
                      }}
                      title="ลบสูตร"
                      className="grid size-4 shrink-0 place-items-center rounded text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={openCreate}
                className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-medium text-brand transition hover:border-brand hover:bg-teal-50"
              >
                + สร้างสูตร
              </button>
            </div>
          </Section>

          {showTemplates && (
            <Section title="เทมเพลตผลิตภัณฑ์">
              <div className="mb-2 flex items-center gap-2">
                <p className="flex-1 text-[11px] text-slate-800/50">เลือกสูตรตัวอย่าง แล้วกด ▶ Run</p>
                <select
                  value={templateRisk}
                  onChange={(e) => setTemplateRisk(e.target.value as "all" | "low" | "mid" | "high")}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-800"
                  title="กรองตามระดับความเสี่ยง (สำหรับทดสอบ)"
                >
                  <option value="all">ทุกระดับ</option>
                  <option value="low">🟢 ต่ำ</option>
                  <option value="mid">🟡 กลาง</option>
                  <option value="high">🔴 สูง</option>
                </select>
              </div>
              <div className="space-y-1">
                {PRODUCT_TEMPLATES.filter((t) => templateRisk === "all" || t.risk === templateRisk).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => loadTemplate(t.id)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:border-brand hover:bg-teal-50"
                  >
                    <div className="flex items-center gap-1.5 text-sm">
                      <span>{t.icon}</span>
                      <span className="font-medium text-slate-800">{t.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-brand">{t.formula.length} สาร</span>
                    </div>
                    <div className="mt-0.5 text-[10px] leading-snug text-slate-800/50">{t.desc}</div>
                  </button>
                ))}
              </div>
            </Section>
          )}

        </aside>

        {/* Center canvas */}
        <main className="relative min-w-0 flex-1 bg-slate-100/30">
          {mode === "assess" && (
            <Viewport
              dayIdx={dayIdx}
              region={region}
              ready={completed}
              productName={productName}
              layers={paintLayers}
              eraseMode={eraseMode}
            />
          )}

          {/* Floating Layers panel — docked top-left inside the viewport */}
          {mode === "assess" && (
            <div className="absolute left-9 top-12 z-10 flex max-h-[calc(100%-6rem)] w-60 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white/95 shadow-soft backdrop-blur">
              <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold tracking-wide text-slate-800/60">
                🧪 {activeFormula?.name ?? "สูตร"} · {formula.length} สาร
              </div>
              <div className="p-3">
                <div className="mb-1 text-[11px] font-semibold text-slate-800/50">🧪 สูตร (Formulation)</div>
                <div className="space-y-1.5">
                  <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-1.5">
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-sky-500">💧</span>
                      <span className="flex-1 font-medium text-slate-700">Water (Aqua)</span>
                      <span className="font-mono tabular-nums text-slate-600">{waterPct}</span>
                      <span className="text-[10px] text-slate-400">%</span>
                    </div>
                    <div className="pl-4 text-[9px] text-slate-400">เบส · ปรับอัตโนมัติให้รวม 100%</div>
                  </div>
                  {waterMissing && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-[10px] leading-snug text-amber-700">
                      ⚠️ สูตรประเภท “{activeFormula?.type}” ปกติต้องมีน้ำเป็นเบส แต่สัดส่วนสารตอนนี้รวม ≥ 100% แล้ว
                      จึงไม่เหลือที่ให้น้ำ — ลองลดความเข้มข้นลง
                    </div>
                  )}
                  {formula.map((it, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 bg-slate-100/50 p-1.5">
                      <div className="flex items-center gap-1">
                        <span className="shrink-0 text-brand">◇</span>
                        <input
                          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                          placeholder="ชื่อสาร"
                          title={it.name}
                          value={it.name ?? ""}
                          onChange={(e) => patchItem(i, { name: e.target.value })}
                        />
                        <input
                          type="number"
                          className="w-12 shrink-0 bg-transparent text-right font-mono text-xs tabular-nums outline-none"
                          value={it.concentration}
                          onChange={(e) => patchItem(i, { concentration: parseFloat(e.target.value) || 0 })}
                        />
                        <span className="shrink-0 text-[10px] text-slate-800/40">%</span>
                        <button onClick={() => removeItem(i)} className="shrink-0 text-slate-800/30 hover:text-rose-500">×</button>
                      </div>
                      <input
                        className="mt-1 w-full bg-transparent font-mono text-[10px] text-slate-800/45 outline-none"
                        placeholder="SMILES"
                        value={it.smiles}
                        onChange={(e) => patchItem(i, { smiles: e.target.value })}
                      />
                      {completed && subConf.get(it.smiles) && (() => {
                        const c = subConf.get(it.smiles)!;
                        return (
                          <div className="mt-0.5 flex items-center gap-1 text-[9px]" title={c.reason}>
                            <span className="size-1.5 rounded-full" style={{ background: CONF_HEX[c.level] }} />
                            <span className="text-slate-400">ความเชื่อมั่น {CONF_TH[c.level] ?? c.level}</span>
                            {!c.inDomain && <span className="font-medium text-rose-500">· ⚠ นอกขอบเขตโมเดล</span>}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button onClick={addItem} className="text-xs font-medium text-brand hover:underline">+ เพิ่มสาร</button>
                    <span className="text-[10px] text-slate-800/30">หรือ</span>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addFromCatalog(e.target.value);
                        e.currentTarget.selectedIndex = 0;
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
                    >
                      <option value="">🔎 เลือกจากคลังสาร…</option>
                      {SUBSTANCE_LIBRARY.map((g) => (
                        <optgroup key={g.category} label={`${g.icon} ${g.category}`}>
                          {g.items.map((it) => (
                            <option key={it.smiles} value={it.smiles}>
                              {it.name} ({it.conc}%)
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* OCR — open the label-scanner popup */}
                  <div className="pt-1">
                    <button
                      onClick={() => setScanOpen(true)}
                      className="w-full rounded-lg border border-dashed border-brand/40 py-1.5 text-xs font-medium text-brand transition hover:bg-teal-50"
                    >
                      📷 อ่านฉลากส่วนผสมจากรูป (OCR)
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* Inflammation trend — slides in from the right edge (site theme) */}
          {mode === "assess" && (
            <div className="absolute right-0 top-12 z-20 flex items-start">
              <div className={`overflow-hidden transition-all duration-300 ${showTrend ? "w-72" : "w-0"}`}>
                <div className="w-72 rounded-l-xl border border-r-0 border-slate-200 bg-white p-3 text-slate-800 shadow-soft">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                    <span>📈</span>
                    <span>แนวโน้มการอักเสบ · Day 1/3/7</span>
                    <button onClick={() => setShowTrend(false)} className="ml-auto text-slate-400 hover:text-slate-700">
                      ✕
                    </button>
                  </div>
                  {completed && trendData.length ? (
                    <>
                      <TrendChart data={trendData} lines={trendLines} />
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {trendLines.map((l) => (
                          <span key={l.key} className="flex items-center gap-1 text-[10px] text-slate-500">
                            <span className="h-0.5 w-3 rounded" style={{ background: l.color }} />
                            {l.label}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-[11px] text-slate-400">
                      กด ▶ Run เพื่อดูแนวโน้ม
                    </div>
                  )}
                </div>
              </div>
              <div className="group relative">
                <button
                  onClick={() => setShowTrend((s) => !s)}
                  className={`grid size-9 place-items-center rounded-l-lg border border-r-0 border-slate-200 text-base shadow-card transition ${
                    showTrend ? "bg-brand text-white" : "bg-white text-slate-600 hover:text-brand"
                  }`}
                >
                  📈
                </button>
                <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[11px] text-white opacity-0 shadow transition group-hover:opacity-100">
                  กราฟแนวโน้ม
                </span>
              </div>
            </div>
          )}
          {mode === "nodes" && (
            <div className="absolute inset-0">
              <div className="absolute left-4 top-3 z-10 text-xs font-semibold text-slate-800/60">
                Assessment Node Graph <span className="font-normal text-slate-800/40">· in-silico pipeline</span>
              </div>
              <FormulaGraph key={`${activeId}-${projectId ?? "standalone"}`} seed={formula} region={region} projectId={projectId} onSaveFormula={saveGraphAsFormula} />
            </div>
          )}
          {mode === "trust" && <TrustReport />}

          {/* Bottom floating toolbar (assess only — nodes evaluate via each Result node) */}
          {mode === "assess" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center print:hidden">
              <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-soft backdrop-blur">
                {mode === "assess" && (
                  <button
                    onClick={() => setEraseMode((e) => !e)}
                    title={eraseMode ? "โหมดลบ — คลิกจุดที่ paint เพื่อลบ" : "ยางลบ"}
                    className={`grid size-9 place-items-center rounded-lg text-base transition ${
                      eraseMode ? "bg-brand text-white" : "text-slate-800/50 hover:bg-slate-100"
                    }`}
                  >
                    🧽
                  </button>
                )}
                <button
                  onClick={() => {
                    setEraseMode(false); // กด Run = กลับมาโหมด paint ผลลัพธ์
                    run();
                  }}
                  disabled={running}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-brand-dark disabled:opacity-50"
                >
                  {running ? "…" : "▶ Run ประเมิน"}
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right inspector */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
          {mode === "trust" ? (
            <div className="p-4 text-xs leading-relaxed text-slate-800/55">
              เลือก <b>Pages › ประเมินความเสี่ยง</b> เพื่อแก้สูตรและดูผลบนหุ่น 3D
            </div>
          ) : (
            <>
              <Section title="การจำลองตามเวลา">
                <div className="flex gap-1">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={d}
                      onClick={() => setDayIdx(i)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs transition ${
                        i === dayIdx ? "border-brand bg-brand text-white font-semibold" : "border-slate-200 bg-slate-100 text-slate-800/65 hover:border-brand/50"
                      }`}
                    >
                      Day {d}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="ผู้ช่วย AI">
                <VoiceAssistant
                  productName={productName}
                  layers={paintLayers}
                  ready={completed}
                  formula={formula}
                  coverage={formulaCoverage ? {
                    percentage: formulaCoverage.coverage_percentage,
                    unresolved: formulaCoverage.unresolved_ingredients,
                  } : undefined}
                  onImportFormula={importFormula}
                  onAction={runAssistantAction}
                />
              </Section>

              <Section title="ผลการประเมิน">
                {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600">{error}</div>}
                {!completed && !error && (
                  <div className="grid place-items-center gap-2 py-6 text-center">
                    <span className="text-2xl text-slate-800/20">◇</span>
                    <p className="text-xs text-slate-800/50">
                      {jobId ? "กำลังประเมิน…" : "ยังไม่ได้ประเมิน"}
                      <br />เลือกสูตร + บริเวณ แล้วกด <span className="text-brand">▶ Run</span>
                    </p>
                  </div>
                )}
                {completed && endpoints && (
                  <div className="space-y-2">
                    {lowConfidence && (
                      <div className="rounded-lg border border-rose-300 bg-rose-50 p-2 text-[11px] leading-snug text-rose-700">
                        ⚠ ผลนี้เชื่อถือได้ต่ำ — สารส่วนใหญ่อยู่นอกขอบเขตแบบจำลอง (out-of-domain)
                        โมเดลอาจเดาว่า “ไม่ระคาย” ทั้งที่ไม่เคยเห็นสารกลุ่มนี้ <b>อย่าตีความคะแนนต่ำว่าปลอดภัย</b>
                      </div>
                    )}
                    {ENDPOINTS.map((ep) => {
                      const sc = endpoints[ep]?.timecourse?.[dayIdx] ?? endpoints[ep]?.peak_score ?? 0;
                      const band = bandOf(sc);
                      return (
                        <div key={ep}>
                          <div className="mb-0.5 flex justify-between text-[11px]">
                            <span className="text-slate-800/70">{ENDPOINT_LABEL_TH[ep]}</span>
                            <span className="font-mono tabular-nums" style={{ color: BAND_HEX[band] }}>
                              {Math.round(sc)} · {BAND_LABEL[band]}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, sc)}%`, background: BAND_HEX[band] }} />
                          </div>
                          {endpoints[ep]?.confidence && (
                            <div
                              className="mt-0.5 flex items-center gap-1 text-[9px]"
                              title={endpoints[ep]!.confidence!.reason_th}
                            >
                              <span
                                className="size-1.5 rounded-full"
                                style={{ background: CONF_HEX[endpoints[ep]!.confidence!.level] }}
                              />
                              <span className="text-slate-400">
                                ความเชื่อมั่น {CONF_TH[endpoints[ep]!.confidence!.level] ?? endpoints[ep]!.confidence!.level}
                              </span>
                              {endpoints[ep]!.confidence!.in_domain === false && (
                                <span className="font-medium text-rose-500">· นอกขอบเขต</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* AI — auto-adjust ratios for a realistic / safest result */}
                {formula.some((it) => it.smiles.trim() && !isWaterItem(it)) && (
                  <div className="mt-3">
                    <button
                      onClick={optimizeFormula}
                      disabled={optBusy}
                      className="w-full rounded-lg border border-brand/40 bg-teal-50 py-1.5 text-xs font-medium text-brand-dark transition hover:bg-teal-100 disabled:opacity-60"
                    >
                      {optBusy ? "⏳ กำลังให้ AI วิเคราะห์…" : "🤖 ให้ AI เสนออัตราส่วนใหม่"}
                    </button>
                    {optMsg && <div className="mt-1 text-[10px] leading-snug text-slate-500">{optMsg}</div>}
                    {pendingOptimization && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                        <div className="mb-1 text-[10px] font-semibold text-amber-800">ตรวจสอบข้อเสนอ</div>
                        <div className="space-y-1">
                          {pendingOptimization.map((item, index) => {
                            const old = formula.find((current) => current.smiles === item.smiles)?.concentration ?? 0;
                            return (
                              <div key={`${item.smiles}-${index}`} className="flex items-center gap-1 text-[10px] text-amber-900">
                                <span className="min-w-0 flex-1 truncate">{item.name || item.smiles}</span>
                                <span className="font-mono text-amber-600">{old}% → {item.concentration}%</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          <button
                            onClick={() => {
                              setFormula(pendingOptimization);
                              setPendingOptimization(null);
                              setAssessment(null);
                              setJobId(null);
                              setOptMsg("✓ ยืนยันอัตราส่วนใหม่แล้ว กด Run เพื่อประเมิน");
                            }}
                            className="flex-1 rounded bg-brand px-2 py-1 text-[10px] font-semibold text-white"
                          >
                            ยืนยัน
                          </button>
                          <button
                            onClick={() => { setPendingOptimization(null); setOptMsg(null); }}
                            className="rounded border border-amber-200 bg-white px-2 py-1 text-[10px] text-amber-800"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    )}
                    {formulaCoverage && formulaCoverage.coverage_percentage < 100 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
                        ⚠ ประเมินครอบคลุม {formulaCoverage.coverage_percentage}% · ยังประเมินไม่ได้ {formulaCoverage.unresolved_ingredients} รายการ
                        <br /><b>คะแนนนี้เป็นผลเฉพาะส่วนที่ประเมินได้ ไม่ใช่ความเสี่ยงของสูตรทั้งหมด</b>
                      </div>
                    )}
                  </div>
                )}
              </Section>
            </>
          )}
        </aside>
      </div>

      {/* Create-formula modal (centered, blurred backdrop) */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-[min(92vw,420px)] rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-brand">🧪</span>
              <h2 className="text-base font-semibold text-slate-800">สร้างสูตรใหม่</h2>
              <button onClick={() => setShowCreate(false)} className="ml-auto text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">ชื่อสูตร</span>
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && createFormula()}
                  placeholder="เช่น ครีมบำรุงสูตร 1"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">ประเภทผลิตภัณฑ์</span>
                <select
                  value={draft.type}
                  onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                >
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">บริเวณทดสอบ</span>
                <select
                  value={draft.region}
                  onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value as Region }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                >
                  <option value="face">🙂 ใบหน้า</option>
                  <option value="eye">👁️ ดวงตา</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">เริ่มจาก</span>
                <select
                  value={draft.from}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                >
                  <option value="blank">สูตรเปล่า (กรอกเอง)</option>
                  {PRODUCT_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                  ))}
                </select>
              </label>

              {draft.from === "blank" && (
                <div className="rounded-lg border border-brand/20 bg-teal-50/60 p-3 text-[11px] leading-relaxed text-slate-600">
                  <div className="mb-1.5 font-semibold text-brand-dark">📝 สูตรเปล่าต้องกรอกอะไรบ้าง?</div>
                  <ul className="space-y-1">
                    <li>
                      • <b>ชื่อสาร</b> — ชื่อสารเคมี/INCI เช่น Glycerin (ใช้แสดงผล ไม่บังคับ)
                    </li>
                    <li>
                      • <b>SMILES</b> — รหัสโครงสร้างโมเลกุล เช่น{" "}
                      <span className="font-mono text-slate-800">OCC(O)CO</span> —{" "}
                      <b className="text-rose-500">จำเป็น</b> เพราะโมเดลใช้คำนวณความเสี่ยง
                    </li>
                    <li>
                      • <b>ความเข้มข้น (%)</b> — สัดส่วนของสารในสูตร (0–100)
                    </li>
                  </ul>
                  <div className="mt-1.5 text-slate-500">
                    ไม่รู้ SMILES? เลือกจาก “คลังสาร” ในกล่องสูตรได้ หรือถาม AI ให้ช่วยแนะนำ
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={createFormula}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                สร้างสูตร
              </button>
            </div>
          </div>
        </div>
      )}

      <LabelScanModal open={scanOpen} onClose={() => setScanOpen(false)} onImport={importScannedItems} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-800/40">{title}</div>
      {children}
    </div>
  );
}

function Viewport({
  dayIdx,
  region,
  ready,
  productName,
  layers,
  eraseMode,
}: {
  dayIdx: number;
  region: Region;
  ready: boolean;
  productName: string;
  layers: { key: string; label: string; score: number; color: string; band: string }[];
  eraseMode: boolean;
}) {
  return (
    <div className="absolute inset-0">
      <div className="relative h-full w-full bg-[repeating-conic-gradient(#F4F1EE_0%_25%,#FFFDFB_0%_50%)] bg-[length:24px_24px]">
        <div className="absolute right-3 top-2 z-10 text-xs font-semibold text-brand">
          ▢ Model Viewport · Day {DAY_LABELS[dayIdx]}
        </div>
        <div className="absolute inset-0">
          <FaceView
            layers={layers}
            armed={ready}
            productName={productName}
            eraseMode={eraseMode}
            background="#F4F1EE"
          />
        </div>
        {!ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center text-xs text-slate-800/40">
              เลือกสูตร + บริเวณ แล้วกด ▶ Run<br />
              บริเวณ: <span className="text-brand">{REGIONS.find((r) => r.value === region)?.label}</span>
            </div>
          </div>
        )}
        {/* Risk legend */}
        <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] backdrop-blur">
          {(["low", "moderate", "high", "severe"] as const).map((b) => (
            <span key={b} className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: BAND_HEX[b] }} />
              {BAND_LABEL[b]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrustReport() {
  const [metrics, setMetrics] = useState<ModelMetricsPayload | null>(null);
  const [info, setInfo] = useState<ModelInfoPayload | null>(null);
  useEffect(() => {
    api.getModelMetrics().then(setMetrics).catch(() => {});
    api.getModelInfo().then(setInfo).catch(() => {});
  }, []);
  const pct = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(2));

  return (
    <div className="absolute inset-0 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="font-display text-2xl font-bold">ความน่าเชื่อถือของโมเดล</h1>
        <p className="mt-2 text-sm text-slate-800/60">
          ทุกการทำนายมาพร้อมตัวชี้วัดประสิทธิภาพ ความไม่แน่นอน และขอบเขตการใช้งาน (Applicability Domain) ตามหลัก OECD สำหรับ QSAR
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs text-slate-800/55">
              <tr>
                <th className="px-4 py-2.5 text-left">Endpoint</th>
                <th className="px-4 py-2.5">AUC</th>
                <th className="px-4 py-2.5">Balanced Acc</th>
                <th className="px-4 py-2.5">Sensitivity</th>
                <th className="px-4 py-2.5">Specificity</th>
              </tr>
            </thead>
            <tbody>
              {metrics?.endpoints.map((m: EndpointMetric) => (
                <tr key={m.endpoint} className="border-t border-slate-200">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.label_th}</span>{" "}
                    <span className="font-mono text-xs text-slate-800/40">{m.endpoint}</span>
                    {m.endpoint === "eye" && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">preliminary</span>
                    )}
                    {m.metrics && (
                      <div className="mt-0.5 text-[9px] text-slate-400">
                        n={(m.metrics.n_pos ?? 0) + (m.metrics.n_neg ?? 0) || "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-semibold text-brand">{pct(m.metrics?.auc)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.balanced_accuracy)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.sensitivity)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.specificity)}</td>
                </tr>
              ))}
              {!metrics?.endpoints?.length && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-800/40">ยังไม่มีข้อมูล (รัน data_prep.py)</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {metrics?.note_th && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800">
            <b>ขอบเขตของตัวเลข:</b> {metrics.note_th}
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-2 font-semibold">สัญญาณความเชื่อมั่น</h3>
            <ul className="space-y-1.5 text-xs text-slate-800/70">
              <li><b>1 · Domain</b> — ระยะห่างจากชุดฝึก (in/out-of-domain)</li>
              <li><b>2 · Model score</b> — ความห่างจาก operating threshold</li>
              <li><b>3 · Structural alert</b> — ความสอดคล้องกับกฎ SMARTS</li>
              <li><b>4 · Ensemble</b> — ความเห็นต่างระหว่างสมาชิกโมเดล</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-2 font-semibold">มาตรฐาน OECD</h3>
            <p className="text-xs leading-relaxed text-slate-800/70">
              Endpoint ชัดเจน · อัลกอริทึมโปร่งใส · Applicability Domain · Goodness-of-fit &amp; robustness · การตีความเชิงกลไก
            </p>
          </div>
        </div>

        {info?.methodology?.limitations && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-2 text-sm font-semibold">ข้อจำกัดที่เปิดเผย</h3>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
              {info.methodology.limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-brand/20 bg-teal-50/40 px-4 py-3 text-xs text-slate-800/70">
          โมเดลนี้เป็นเครื่องมือ <b>คัดกรอง</b> เพื่อจัดลำดับความเสี่ยงในระยะต้น ไม่ใช่การทดแทนการทดสอบตามข้อกำหนดหรือการประเมินโดยผู้เชี่ยวชาญ
          {info?.disclaimer_th ? "" : ""}
        </div>
      </div>
    </div>
  );
}
