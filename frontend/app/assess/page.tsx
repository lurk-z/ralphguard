"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AssessmentRecord,
  EndpointResultPayload,
  FormulaItem,
  ProjectOut,
  Region,
  SubstancePayload,
  api,
} from "../../lib/api";

// Realistic head — the result arms a brush; the user paints it onto the skin.
// This is the ONLY 3D model now (the procedural mannequin was removed).
const FacePaint = dynamic(
  () => import("../../components/FaceIrritationModel").then((m) => m.FacePaintCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full grid place-items-center text-xs text-gray-400">
        กำลังโหลดโมเดลผิว 3 มิติ…
      </div>
    ),
  },
);

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

const BAND_COLOR: Record<string, string> = {
  low: "bg-risk-low/20 text-risk-low border-risk-low/40",
  moderate: "bg-risk-mod/20 text-risk-mod border-risk-mod/40",
  high: "bg-risk-high/20 text-risk-high border-risk-high/40",
  severe: "bg-red-500/20 text-red-300 border-red-500/40",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  High: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Medium: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Low: "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

const SAMPLE_FORMULA: FormulaItem[] = [
  { smiles: "CCO", name: "Ethanol", concentration: 40 },
  { smiles: "CC(=O)Oc1ccccc1C(=O)O", name: "Aspirin", concentration: 5 },
];

// Curated real ingredients (in / near the training set -> in-domain predictions).
// `use` = a short note on what the substance is / does, shown as a tooltip + hint.
type LibrarySubstance = { name: string; smiles: string; use: string };

const SUBSTANCE_LIBRARY: LibrarySubstance[] = [
  { name: "Ethanol", smiles: "CCO", use: "ตัวทำละลาย / ฆ่าเชื้อ" },
  { name: "Glycerol", smiles: "OCC(O)CO", use: "สารให้ความชุ่มชื้น (humectant)" },
  { name: "Propylene glycol", smiles: "CC(O)CO", use: "ตัวทำละลาย / humectant" },
  { name: "Citric acid", smiles: "OC(=O)CC(O)(CC(=O)O)C(=O)O", use: "ปรับ pH / สารกันเสีย" },
  { name: "Salicylic acid", smiles: "O=C(O)c1ccccc1O", use: "ผลัดเซลล์ผิว (BHA)" },
  { name: "Benzyl alcohol", smiles: "OCc1ccccc1", use: "สารกันเสีย / น้ำหอม" },
  { name: "Benzoic acid", smiles: "O=C(O)c1ccccc1", use: "สารกันเสีย" },
  { name: "Lactic acid", smiles: "CC(O)C(=O)O", use: "ผลัดเซลล์ผิว (AHA)" },
  { name: "Glycolic acid", smiles: "OCC(=O)O", use: "ผลัดเซลล์ผิว (AHA)" },
  { name: "Limonene", smiles: "CC1=CCC(CC1)C(=C)C", use: "น้ำหอมส้ม (อาจก่อแพ้)" },
  { name: "Linalool", smiles: "CC(C)=CCCC(C)(O)C=C", use: "น้ำหอมดอกไม้ (อาจก่อแพ้)" },
  { name: "Geraniol", smiles: "CC(C)=CCCC(C)=CCO", use: "น้ำหอมกุหลาบ (อาจก่อแพ้)" },
  { name: "Eugenol", smiles: "C=CCc1ccc(O)c(OC)c1", use: "น้ำหอมกานพลู (อาจก่อแพ้)" },
  { name: "Cinnamaldehyde", smiles: "O=C/C=C/c1ccccc1", use: "กลิ่นอบเชย (สารก่อแพ้ที่รู้จัก)" },
  { name: "Menthol", smiles: "CC(C)C1CCC(C)CC1O", use: "ให้ความเย็น" },
  { name: "Vanillin", smiles: "O=Cc1ccc(O)c(OC)c1", use: "กลิ่นวานิลลา" },
  { name: "Niacinamide", smiles: "NC(=O)c1cccnc1", use: "วิตามิน B3 / บำรุงผิว" },
  { name: "Urea", smiles: "NC(N)=O", use: "ให้ความชุ่มชื้น / ผลัดผิว" },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C)C(=O)N2C", use: "กระตุ้น / ลดบวม" },
  { name: "Phenoxyethanol", smiles: "OCCOc1ccccc1", use: "สารกันเสีย" },
  { name: "Sodium lauryl sulfate", smiles: "CCCCCCCCCCCCOS(=O)(=O)[O-].[Na+]", use: "สารชำระล้าง (ระคายเคือง)" },
  { name: "Phenol", smiles: "Oc1ccccc1", use: "ฆ่าเชื้อ (กัดกร่อน)" },
  { name: "Hydrogen peroxide", smiles: "OO", use: "ฟอกสี / ฆ่าเชื้อ" },
  { name: "Acetic acid", smiles: "CC(=O)O", use: "ปรับ pH (กรด)" },
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** A random library substance + a sensible demo concentration (5–40%). */
function randomFormulaItem(): FormulaItem {
  const s = randomFrom(SUBSTANCE_LIBRARY);
  const concentration = Math.round((5 + Math.random() * 35) * 10) / 10;
  return { name: s.name, smiles: s.smiles, concentration };
}

/**
 * Parse an uploaded CSV into formula items (proposal scope §1.2 — CSV upload).
 * Accepts columns name/smiles/concentration in any order when a header row is
 * present (detected by the word "smiles"); otherwise assumes name, smiles, concentration.
 */
function parseFormulaCsv(text: string): FormulaItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const hasHeader = lines[0].toLowerCase().includes("smiles");
  const header = hasHeader ? lines[0].split(",").map((c) => c.trim().toLowerCase()) : [];
  const find = (...keys: string[]) => header.findIndex((c) => keys.some((k) => c.includes(k)));
  const iSmiles = hasHeader ? find("smiles") : 1;
  const iName = hasHeader ? find("name", "ชื่อ") : 0;
  const iConc = hasHeader ? find("conc", "percent", "%", "ความเข้มข้น") : 2;
  const rows = hasHeader ? lines.slice(1) : lines;
  const items: FormulaItem[] = [];
  for (const line of rows) {
    const cols = line.split(",").map((c) => c.trim());
    const smiles = (iSmiles >= 0 ? cols[iSmiles] : cols[1]) ?? "";
    if (!smiles) continue;
    const name = (iName >= 0 ? cols[iName] : cols[0]) ?? "";
    const concentration = parseFloat((iConc >= 0 ? cols[iConc] : cols[2]) ?? "") || 0;
    items.push({ name: name || undefined, smiles, concentration });
  }
  return items;
}

export default function AssessPage() {
  const [formula, setFormula] = useState<FormulaItem[]>(SAMPLE_FORMULA);
  const [region, setRegion] = useState<Region>("forearm");
  const [jobId, setJobId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AssessmentRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(1); // 0=Day1, 1=Day3, 2=Day7 — drives the 3D over time
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Load projects for the optional "save under project" dropdown
  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  // Allow deep-linking to a past assessment via /assess?job=<id> (used by history)
  useEffect(() => {
    const job = new URLSearchParams(window.location.search).get("job");
    if (job) setJobId(job);
  }, []);

  const totalConc = useMemo(
    () => formula.reduce((sum, it) => sum + (Number(it.concentration) || 0), 0),
    [formula],
  );

  // Poll job
  useEffect(() => {
    if (!jobId) return;
    if (assessment && (assessment.status === "completed" || assessment.status === "failed")) return;

    const tick = async () => {
      try {
        const rec = await api.getAssessment(jobId);
        setAssessment(rec);
      } catch (e) {
        setError(String(e));
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, [jobId, assessment?.status]);

  const updateItem = (idx: number, patch: Partial<FormulaItem>) =>
    setFormula((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const addRow = () =>
    setFormula((prev) => [...prev, { smiles: "", name: "", concentration: 0 }]);

  const removeRow = (idx: number) =>
    setFormula((prev) => prev.filter((_, i) => i !== idx));

  // 🎲 fill one row with a random library substance
  const randomizeRow = (idx: number) =>
    setFormula((prev) => prev.map((it, i) => (i === idx ? randomFormulaItem() : it)));

  // 🎲 append a new row that's already a random substance
  const addRandomRow = () =>
    setFormula((prev) => [...prev, randomFormulaItem()]);

  // 📄 import a formula from an uploaded CSV (replaces current rows)
  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseFormulaCsv(String(reader.result ?? ""));
      if (parsed.length === 0) {
        setError("ไม่พบสารในไฟล์ CSV (ต้องมีคอลัมน์ smiles อย่างน้อย 1 แถว)");
        return;
      }
      setFormula(parsed);
      setError(null);
    };
    reader.onerror = () => setError("อ่านไฟล์ CSV ไม่สำเร็จ");
    reader.readAsText(file);
  };

  // ➕ create a project inline, then select it
  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const p = await api.createProject(name);
      setProjects((prev) => [p, ...prev]);
      setProjectId(p.id);
      setNewProjectName("");
      setCreatingProject(false);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const submit = async () => {
    setError(null);
    setAssessment(null);
    setJobId(null);
    setSubmitting(true);
    try {
      const cleaned = formula.filter((it) => it.smiles.trim() && it.concentration > 0);
      if (cleaned.length === 0) throw new Error("เพิ่มอย่างน้อย 1 สารและความเข้มข้น > 0");
      const { job_id } = await api.createAssessment(cleaned, region, projectId);
      setJobId(job_id);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const endpoints = assessment?.result?.endpoints ?? null;

  // Drives the realistic head: worst surface-irritation (skin/eye) at the
  // selected day, 0..1. Erythema on the head ~ facial skin/eye irritation.
  const headIntensity = useMemo(() => {
    if (!endpoints) return 0;
    const at = (ep: string) =>
      endpoints[ep]?.timecourse?.[dayIdx] ?? endpoints[ep]?.peak_score ?? 0;
    return Math.max(at("skin"), at("eye")) / 100;
  }, [endpoints, dayIdx]);

  const completed = assessment?.status === "completed";
  const resultReady = !!endpoints && completed;
  const bandOf = (s: number) =>
    s < 25 ? "low" : s < 50 ? "moderate" : s < 75 ? "high" : "severe";
  const headBand = bandOf(headIntensity * 100);

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <header className="mb-6 print:hidden">
        <nav className="flex gap-4 text-sm mb-3">
          <a href="/" className="text-ink2/65 hover:text-brand">หน้าแรก</a>
          <a href="/assess" className="text-brand">ประเมิน</a>
          <a href="/skin-viewer" className="text-ink2/65 hover:text-brand">โมเดลผิว 3D</a>
          <a href="/history" className="text-ink2/65 hover:text-brand">ประวัติ</a>
          <a href="/models" className="text-ink2/65 hover:text-brand">โมเดล &amp; ความน่าเชื่อถือ</a>
        </nav>
        <h1 className="text-2xl font-display font-semibold">การประเมินความเสี่ยง</h1>
        <p className="text-xs text-ink2/55 mt-1">
          ⚠️ ผลจากแบบจำลองคอมพิวเตอร์ — ไม่ใช่การทดสอบทางคลินิก
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-start">
        {/* ── Left: inputs ── */}
        <div className="space-y-4 print:hidden">
          <FormulaBuilder
            formula={formula}
            totalConc={totalConc}
            onAdd={addRow}
            onAddRandom={addRandomRow}
            onRemove={removeRow}
            onUpdate={updateItem}
            onRandomize={randomizeRow}
            onImportCsv={importCsv}
          />

          <RegionPills value={region} onChange={setRegion} />

          <div className="rounded-xl bg-panel border border-border shadow-card p-4 space-y-3">
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-brand text-white font-semibold shadow-soft transition hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? "กำลังส่ง..." : "▶ ประเมินความเสี่ยง"}
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {creatingProject ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    className="bg-elevated border border-border rounded px-2 py-1.5 text-sm"
                    placeholder="ชื่อโครงการใหม่"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createProject();
                      if (e.key === "Escape") setCreatingProject(false);
                    }}
                  />
                  <button onClick={createProject} className="text-sm text-brand font-medium hover:underline">
                    บันทึก
                  </button>
                  <button
                    onClick={() => setCreatingProject(false)}
                    className="text-sm text-ink2/55 hover:text-ink2/80"
                  >
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <label className="text-xs text-ink2/65 flex items-center gap-2">
                  โครงการ:
                  <select
                    value={projectId ?? ""}
                    onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                    className="bg-elevated border border-border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">— ไม่ผูกโครงการ —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setCreatingProject(true)}
                    className="text-brand hover:underline"
                    title="สร้างโครงการใหม่"
                  >
                    + ใหม่
                  </button>
                </label>
              )}

              {jobId && (
                <span className="text-xs text-ink2/55 font-mono">
                  {jobId.slice(0, 8)} · <Status status={assessment?.status ?? "queued"} />
                </span>
              )}
            </div>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: the head is the star (only 3D model) ── */}
        <div className="lg:sticky lg:top-4 space-y-2">
          <div className="rounded-2xl bg-panel border border-border shadow-card overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
              <div>
                <div className="font-display font-semibold text-sm">แบบจำลองผิว 3 มิติ</div>
                <div className="text-[11px] text-ink2/55">
                  {resultReady ? "🖌️ กดค้างแล้วลากบนผิวเพื่อระบายผล" : "กรอกสูตรทางซ้าย แล้วกดประเมิน"}
                </div>
              </div>
              {resultReady && (
                <div className="flex items-center gap-1.5 print:hidden">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={d}
                      onClick={() => setDayIdx(i)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition ${
                        i === dayIdx
                          ? "bg-brand/15 border-brand text-brand font-semibold"
                          : "bg-elevated border-border text-ink2/65 hover:border-brand/50"
                      }`}
                    >
                      D{d}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-[58vh] min-h-[440px]">
              <FacePaint
                key={jobId ?? "idle"}
                brushValue={headIntensity}
                armed={resultReady}
                background="#2A2320"
              />
            </div>
          </div>
          {resultReady && (
            <div className="flex items-center justify-between px-1 text-[11px]">
              <span className="text-ink2/55">
                พู่กันติดค่า {Math.round(headIntensity * 100)}% (skin/eye · Day {DAY_LABELS[dayIdx]})
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-mono border ${BAND_COLOR[headBand]}`}
              >
                {headBand.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {endpoints && assessment?.status === "completed" && (
        <section className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-semibold">ผลการประเมิน</h2>
            <button
              onClick={() => window.print()}
              className="print:hidden text-sm px-3 py-1.5 rounded border border-border text-ink2/80 hover:border-brand hover:text-brand"
            >
              🖨 พิมพ์ / บันทึก PDF
            </button>
          </div>
          <ReportHeader region={assessment.region} jobId={assessment.id} createdAt={assessment.created_at} />

          <div className="grid md:grid-cols-2 gap-4">
            {ENDPOINTS.map((ep) =>
              endpoints[ep] ? (
                <EndpointCard key={ep} endpoint={ep} data={endpoints[ep]} />
              ) : null,
            )}
          </div>

          {assessment.result?.substances?.[0]?.per_endpoint && (
            <UncertaintyPanel substances={assessment.result.substances} />
          )}

          {assessment.result?.substances?.[0]?.per_endpoint && (
            <AlertsPanel substances={assessment.result.substances} />
          )}

          <p className="text-xs text-ink2/55 pt-4 border-t border-border">
            {assessment.result?.disclaimer_th}
          </p>
        </section>
      )}

      {assessment?.status === "failed" && (
        <div className="mt-6 p-4 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 text-sm">
          <div className="font-semibold mb-1">ประเมินล้มเหลว</div>
          <pre className="whitespace-pre-wrap text-xs">{assessment.error}</pre>
        </div>
      )}
    </main>
  );
}

function FormulaBuilder({
  formula,
  totalConc,
  onAdd,
  onAddRandom,
  onRemove,
  onUpdate,
  onRandomize,
  onImportCsv,
}: {
  formula: FormulaItem[];
  totalConc: number;
  onAdd: () => void;
  onAddRandom: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, patch: Partial<FormulaItem>) => void;
  onRandomize: (i: number) => void;
  onImportCsv: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="p-4 rounded-lg bg-panel border border-border">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold">สูตร</h3>
        <span
          className={`text-xs font-mono ${
            Math.abs(totalConc - 100) < 1 ? "text-emerald-400" : "text-ink2/55"
          }`}
        >
          รวม {totalConc.toFixed(1)}%
        </span>
      </div>
      <div className="space-y-3">
        {formula.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="grid grid-cols-12 gap-2 items-center">
              <input
                className="col-span-3 px-2 py-1.5 rounded bg-elevated border border-border text-sm"
                placeholder="ชื่อ"
                value={item.name ?? ""}
                onChange={(e) => onUpdate(idx, { name: e.target.value })}
              />
              <input
                className="col-span-4 px-2 py-1.5 rounded bg-elevated border border-border text-sm font-mono"
                placeholder="SMILES (เช่น CCO)"
                value={item.smiles}
                onChange={(e) => onUpdate(idx, { smiles: e.target.value })}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                className="col-span-3 px-2 py-1.5 rounded bg-elevated border border-border text-sm font-mono"
                value={item.concentration}
                onChange={(e) =>
                  onUpdate(idx, { concentration: parseFloat(e.target.value) || 0 })
                }
              />
              <button
                onClick={() => onRandomize(idx)}
                className="col-span-1 text-ink2/55 hover:text-brand text-lg"
                title="สุ่มสารในช่องนี้"
                aria-label="สุ่มสาร"
              >
                🎲
              </button>
              <button
                onClick={() => onRemove(idx)}
                className="col-span-1 text-ink2/55 hover:text-rose-400 text-lg"
                aria-label="ลบ"
              >
                ×
              </button>
            </div>
            <SmilesValidity smiles={item.smiles} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button onClick={onAdd} className="text-sm text-brand hover:underline">
          + เพิ่มสาร
        </button>
        <button
          onClick={onAddRandom}
          className="text-sm text-ink2/65 hover:text-brand"
          title="เพิ่มสารสุ่มจากคลัง"
        >
          🎲 สุ่มเพิ่มสาร
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="text-sm text-ink2/65 hover:text-brand"
          title="อัปโหลด CSV (คอลัมน์: name, smiles, concentration)"
        >
          📄 นำเข้า CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportCsv(f);
            e.target.value = "";
          }}
        />
      </div>
      <p className="mt-2 text-[11px] text-ink2/45">
        รูปแบบ CSV: <span className="font-mono">name, smiles, concentration</span> (มี/ไม่มีหัวตารางก็ได้)
      </p>
    </div>
  );
}

type ValidityState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "valid"; canonical: string; mw?: number }
  | { kind: "invalid"; error?: string };

/** Debounced live RDKit validation for a single SMILES string. */
function SmilesValidity({ smiles }: { smiles: string }) {
  const [state, setState] = useState<ValidityState>({ kind: "idle" });

  useEffect(() => {
    const s = smiles.trim();
    if (!s) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "checking" });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.validateSmiles(s);
        if (cancelled) return;
        if (res.valid) {
          setState({
            kind: "valid",
            canonical: res.canonical ?? s,
            mw: res.descriptors?.mw as number | undefined,
          });
        } else {
          setState({ kind: "invalid", error: res.error ?? undefined });
        }
      } catch {
        if (!cancelled) setState({ kind: "idle" }); // backend down — stay silent
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [smiles]);

  if (state.kind === "idle") return null;
  if (state.kind === "checking")
    return (
      <div role="status" aria-live="polite" className="text-[11px] text-ink2/55 pl-1">
        ⏳ กำลังตรวจ SMILES…
      </div>
    );
  if (state.kind === "invalid")
    return (
      <div role="status" aria-live="polite" className="text-[11px] text-rose-400 pl-1">
        ✗ SMILES ไม่ถูกต้อง{state.error ? ` (${state.error})` : ""}
      </div>
    );
  return (
    <div role="status" aria-live="polite" className="text-[11px] text-emerald-400 pl-1 font-mono">
      ✓ {state.canonical}
      {state.mw != null ? ` · MW ${state.mw}` : ""}
    </div>
  );
}

const DAY_LABELS = [1, 3, 7];

function RegionPills({ value, onChange }: { value: Region; onChange: (r: Region) => void }) {
  return (
    <div className="rounded-xl bg-panel border border-border shadow-card p-4">
      <h3 className="font-semibold mb-1">บริเวณที่สัมผัส</h3>
      <p className="text-[11px] text-ink2/55 mb-3">
        ปรับค่าความไวของผิวตามบริเวณ (ใบหน้า/ดวงตาไวต่อการระคายเคืองมากกว่า)
      </p>
      <div className="grid grid-cols-4 gap-2">
        {REGIONS.map((r) => {
          const active = value === r.value;
          return (
            <button
              key={r.value}
              onClick={() => onChange(r.value)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 text-center transition ${
                active
                  ? "bg-brand/10 border-brand text-brand"
                  : "bg-elevated border-border text-ink2/70 hover:border-brand/50"
              }`}
            >
              <span className="text-xl" aria-hidden="true">{r.icon}</span>
              <span className="text-xs font-medium">{r.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const REGION_LABEL_TH: Record<string, string> = {
  forearm: "ท่อนแขน",
  hand: "มือ",
  face: "ใบหน้า",
  eye: "ดวงตา",
};

function ReportHeader({
  region,
  jobId,
  createdAt,
}: {
  region: string;
  jobId: string;
  createdAt: string;
}) {
  return (
    <div className="hidden print:block mb-4">
      <div className="text-xl font-semibold">RalphGuard — รายงานผลการประเมินความเสี่ยง (In-silico)</div>
      <div className="text-xs text-gray-600 mt-1">
        บริเวณ: {REGION_LABEL_TH[region] ?? region} · รหัสงาน: {jobId.slice(0, 8)} ·
        วันที่: {new Date(createdAt).toLocaleString("th-TH")}
      </div>
    </div>
  );
}

function EndpointCard({
  endpoint,
  data,
}: {
  endpoint: string;
  data: EndpointResultPayload;
}) {
  const chartData = [
    { day: "วัน 1", score: data.timecourse[0] },
    { day: "วัน 3", score: data.timecourse[1] },
    { day: "วัน 7", score: data.timecourse[2] },
  ];

  return (
    <div className="p-4 rounded-lg bg-panel border border-border">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-ink2/65">{ENDPOINT_LABEL_TH[endpoint]}</div>
          <div className="text-3xl font-display font-bold mt-1">
            {Math.round(data.peak_score)}
            <span className="text-sm text-ink2/55 font-mono ml-1">/100</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${BAND_COLOR[data.band]}`}>
            {data.band.toUpperCase()}
          </span>
          {data.confidence && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono border ${
                CONFIDENCE_COLOR[data.confidence.level]
              }`}
            >
              {data.confidence.level}
            </span>
          )}
        </div>
      </div>

      <div className="h-32 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F3A3C" />
            <XAxis dataKey="day" stroke="#6B7C7E" fontSize={11} />
            <YAxis stroke="#6B7C7E" fontSize={11} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "#0F1C1E", border: "1px solid #1F3A3C", fontSize: 12 }}
              cursor={{ fill: "#14282A" }}
            />
            <Bar dataKey="score" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.confidence && (
        <p className="text-xs text-ink2/65 mt-2 leading-snug">{data.confidence.reason_th}</p>
      )}
    </div>
  );
}

function UncertaintyPanel({ substances }: { substances: SubstancePayload[] }) {
  const rows: {
    sub: string; ep: string; prob: number; unc: number; sim: number; indom: boolean; flagged: boolean;
  }[] = [];
  for (const s of substances) {
    for (const [ep, d] of Object.entries(s.per_endpoint)) {
      const dd = d as any;
      if (dd.uncertainty === undefined && dd.domain_similarity === undefined) continue;
      rows.push({
        sub: s.canonical_smiles, ep,
        prob: dd.probability ?? 0,
        unc: dd.uncertainty ?? 0,
        sim: dd.domain_similarity ?? 0,
        indom: dd.in_domain ?? true,
        flagged: dd.flagged ?? false,
      });
    }
  }
  if (rows.length === 0) return null;
  return (
    <div className="p-4 rounded-lg bg-panel border border-border">
      <h3 className="font-semibold mb-1">📊 ความเชื่อมั่น & ความไม่แน่นอน (Uncertainty Quantification)</h3>
      <p className="text-[11px] text-ink2/55 mb-2">
        uncertainty = ความไม่เห็นพ้องของโมเดลในชุด (สูง=ไม่แน่ใจ) · AD = ความคล้ายกับสารในชุดเทรน (ต่ำ=นอกขอบเขต)
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink2/55 text-left border-b border-border">
            <th className="py-1">สาร</th><th>Endpoint</th><th>โอกาสเสี่ยง</th>
            <th>Uncertainty</th><th>AD similarity</th><th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-1 font-mono text-xs">{r.sub.slice(0, 22)}</td>
              <td className="py-1">{ENDPOINT_LABEL_TH[r.ep] ?? r.ep}</td>
              <td className="py-1 font-mono">{(r.prob * 100).toFixed(0)}%{r.flagged ? " ⚠️" : ""}</td>
              <td className="py-1">
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-16 bg-elevated rounded">
                    <div className="h-1.5 rounded bg-amber-400" style={{ width: `${Math.min(100, r.unc * 300)}%` }} />
                  </div>
                  <span className="text-xs font-mono text-ink2/65">{r.unc.toFixed(2)}</span>
                </div>
              </td>
              <td className="py-1 font-mono text-xs">{r.sim.toFixed(2)}</td>
              <td className="py-1">
                {r.indom ? (
                  <span className="text-emerald-400 text-xs">in-domain</span>
                ) : (
                  <span className="text-rose-400 text-xs">⚠ out-of-domain</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertsPanel({ substances }: { substances: SubstancePayload[] }) {
  const alertRows: { sub: string; ep: string; alerts: string[]; agrees: boolean }[] = [];
  for (const s of substances) {
    for (const [ep, data] of Object.entries(s.per_endpoint)) {
      if ((data.alerts?.length ?? 0) > 0) {
        alertRows.push({
          sub: s.canonical_smiles,
          ep,
          alerts: data.alerts!,
          agrees: data.rule_agrees ?? true,
        });
      }
    }
  }
  if (alertRows.length === 0) return null;

  return (
    <div className="p-4 rounded-lg bg-panel border border-border">
      <h3 className="font-semibold mb-2">⚠️ Structural Alerts (Layer 3)</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink2/55 text-left border-b border-border">
            <th className="py-1">สาร</th>
            <th className="py-1">Endpoint</th>
            <th className="py-1">Alerts</th>
            <th className="py-1">Agrees</th>
          </tr>
        </thead>
        <tbody>
          {alertRows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-1 font-mono text-xs">{row.sub}</td>
              <td className="py-1">{ENDPOINT_LABEL_TH[row.ep] ?? row.ep}</td>
              <td className="py-1">
                {row.alerts.map((a) => (
                  <span
                    key={a}
                    className="inline-block mr-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono"
                  >
                    {a}
                  </span>
                ))}
              </td>
              <td className="py-1">
                {row.agrees ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-rose-400">✗ conflict</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "text-ink2/65",
    running: "text-amber-300",
    completed: "text-emerald-400",
    failed: "text-rose-400",
  };
  return <span className={colors[status] ?? ""}>{status}</span>;
}
