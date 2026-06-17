"use client";

import { useEffect, useMemo, useState } from "react";
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

// 3D model uses WebGL — load client-side only (no SSR).
const AnatomyModel = dynamic(() => import("../../components/AnatomyModel"), {
  ssr: false,
  loading: () => (
    <div className="grid h-72 w-full place-items-center rounded-lg border border-border bg-elevated text-xs text-gray-500">
      กำลังโหลดโมเดล 3 มิติ…
    </div>
  ),
});

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

const ENDPOINT_ICON: Record<string, string> = {
  skin: "🩹",
  eye: "👁️",
  sens: "🌡️",
  acute: "☠️",
};

const BAND_COLOR: Record<string, string> = {
  low: "bg-risk-low/15 text-risk-low border-risk-low/40",
  moderate: "bg-risk-mod/15 text-risk-mod border-risk-mod/40",
  high: "bg-risk-high/15 text-risk-high border-risk-high/40",
  severe: "bg-risk-severe/15 text-risk-severe border-risk-severe/40",
};

const BAND_HEX: Record<string, string> = {
  low: "#34D399",
  moderate: "#FBBF24",
  high: "#FB6F70",
  severe: "#F43F5E",
};

const BAND_LABEL_TH: Record<string, string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  severe: "สูงมาก",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  High: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  Low: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

const SAMPLE_FORMULA: FormulaItem[] = [
  { smiles: "CCO", name: "Ethanol", concentration: 40 },
  { smiles: "CC(=O)Oc1ccccc1C(=O)O", name: "Aspirin", concentration: 5 },
];

// Curated real ingredients (in / near the training set -> in-domain predictions).
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

export default function AssessPage() {
  const [formula, setFormula] = useState<FormulaItem[]>(SAMPLE_FORMULA);
  const [region, setRegion] = useState<Region>("forearm");
  const [jobId, setJobId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AssessmentRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);

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
  const pending =
    jobId != null &&
    assessment != null &&
    (assessment.status === "queued" || assessment.status === "running");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 print:hidden">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">การประเมินความเสี่ยง</h1>
        <p className="mt-1 text-xs text-gray-500">
          ⚠️ ผลจากแบบจำลองคอมพิวเตอร์ — ไม่ใช่การทดสอบทางคลินิก
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <FormulaBuilder
          formula={formula}
          totalConc={totalConc}
          onAdd={addRow}
          onAddRandom={addRandomRow}
          onRemove={removeRow}
          onUpdate={updateItem}
          onRandomize={randomizeRow}
        />
        <RegionPicker value={region} onChange={setRegion} />
      </section>

      {/* Action bar */}
      <div className="card mt-6 flex flex-wrap items-center gap-4 p-4 print:hidden">
        <button onClick={submit} disabled={submitting} className="btn-primary">
          {submitting ? "กำลังส่ง..." : "▶ ประเมิน"}
        </button>

        <label className="flex items-center gap-2 text-xs text-gray-400">
          โครงการ:
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            className="input py-1.5"
          >
            <option value="">— ไม่ผูกโครงการ —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {jobId && (
          <span className="ml-auto flex items-center gap-2 font-mono text-xs text-gray-500">
            job {jobId.slice(0, 8)} · <Status status={assessment?.status ?? "queued"} />
          </span>
        )}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>

      {/* Loading skeleton while worker runs */}
      {pending && (
        <div className="card mt-8 flex items-center gap-3 p-6 text-sm text-gray-400">
          <span className="h-2 w-2 animate-pulse-soft rounded-full bg-brand" />
          กำลังรันแบบจำลอง QSAR ในคิว… (worker กำลังประมวลผล)
        </div>
      )}

      {endpoints && assessment?.status === "completed" && (
        <section className="mt-8 animate-fade-up space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">ผลการประเมิน</h2>
            <button
              onClick={() => window.print()}
              className="btn-ghost text-sm print:hidden"
            >
              🖨 พิมพ์ / บันทึก PDF
            </button>
          </div>
          <ReportHeader region={assessment.region} jobId={assessment.id} createdAt={assessment.created_at} />
          <div className="grid gap-4 md:grid-cols-2">
            {ENDPOINTS.map((ep) =>
              endpoints[ep] ? (
                <EndpointCard key={ep} endpoint={ep} data={endpoints[ep]} />
              ) : null,
            )}
          </div>

          {assessment.result?.substances?.[0]?.per_endpoint && (
            <AlertsPanel substances={assessment.result.substances} />
          )}

          <p className="border-t border-border pt-4 text-xs text-gray-500">
            {assessment.result?.disclaimer_th}
          </p>
        </section>
      )}

      {assessment?.status === "failed" && (
        <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          <div className="mb-1 font-semibold">ประเมินล้มเหลว</div>
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
}: {
  formula: FormulaItem[];
  totalConc: number;
  onAdd: () => void;
  onAddRandom: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, patch: Partial<FormulaItem>) => void;
  onRandomize: (i: number) => void;
}) {
  const balanced = Math.abs(totalConc - 100) < 1;
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <span>🧪</span> สูตรผสม
        </h3>
        <span
          className={`badge ${
            balanced
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-border bg-elevated/50 text-gray-500"
          }`}
        >
          รวม {totalConc.toFixed(1)}%
        </span>
      </div>
      <div className="space-y-3">
        {formula.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="grid grid-cols-12 items-center gap-2">
              <input
                className="input col-span-3"
                placeholder="ชื่อ"
                value={item.name ?? ""}
                onChange={(e) => onUpdate(idx, { name: e.target.value })}
              />
              <input
                className="input col-span-4 font-mono"
                placeholder="SMILES (เช่น CCO)"
                value={item.smiles}
                onChange={(e) => onUpdate(idx, { smiles: e.target.value })}
              />
              <div className="col-span-3 relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="input w-full pr-6 font-mono"
                  value={item.concentration}
                  onChange={(e) =>
                    onUpdate(idx, { concentration: parseFloat(e.target.value) || 0 })
                  }
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  %
                </span>
              </div>
              <button
                onClick={() => onRandomize(idx)}
                className="col-span-1 text-lg text-gray-500 transition hover:scale-110 hover:text-brand"
                title="สุ่มสารในช่องนี้"
                aria-label="สุ่มสาร"
              >
                🎲
              </button>
              <button
                onClick={() => onRemove(idx)}
                className="col-span-1 text-lg text-gray-500 transition hover:text-rose-400"
                aria-label="ลบ"
              >
                ×
              </button>
            </div>
            <SmilesValidity smiles={item.smiles} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button onClick={onAdd} className="text-sm font-medium text-brand hover:underline">
          + เพิ่มสาร
        </button>
        <button
          onClick={onAddRandom}
          className="text-sm text-gray-400 transition hover:text-brand"
          title="เพิ่มสารสุ่มจากคลัง"
        >
          🎲 สุ่มเพิ่มสาร
        </button>
      </div>
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
    return <div className="pl-1 text-[11px] text-gray-500">⏳ กำลังตรวจ SMILES…</div>;
  if (state.kind === "invalid")
    return (
      <div className="pl-1 text-[11px] text-rose-400">
        ✗ SMILES ไม่ถูกต้อง{state.error ? ` (${state.error})` : ""}
      </div>
    );
  return (
    <div className="pl-1 font-mono text-[11px] text-emerald-400">
      ✓ {state.canonical}
      {state.mw != null ? ` · MW ${state.mw}` : ""}
    </div>
  );
}

function RegionPicker({ value, onChange }: { value: Region; onChange: (r: Region) => void }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <span>🎯</span> บริเวณทดสอบ
      </h3>

      {/* Interactive 3D body — click a highlighted region */}
      <AnatomyModel value={value} onChange={onChange} />
      <p className="mb-3 mt-1 text-[11px] text-gray-500">
        คลิกบริเวณบนโมเดล หรือเลือกจากปุ่มด้านล่าง · ลากเพื่อหมุน
      </p>

      <div className="grid grid-cols-2 gap-2">
        {REGIONS.map((r) => (
          <button
            key={r.value}
            onClick={() => onChange(r.value)}
            className={`rounded-lg border p-3 text-left transition ${
              value === r.value
                ? "border-brand bg-brand/15 text-brand shadow-glow"
                : "border-border bg-elevated/60 hover:border-brand/50"
            }`}
          >
            <div className="text-2xl">{r.icon}</div>
            <div className="mt-1 font-semibold">{r.label}</div>
            <div className="font-mono text-xs text-gray-500">{r.value}</div>
          </button>
        ))}
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
    <div className="mb-4 hidden print:block">
      <div className="text-xl font-semibold">RalphGuard — รายงานผลการประเมินความเสี่ยง (In-silico)</div>
      <div className="mt-1 text-xs text-gray-600">
        บริเวณ: {REGION_LABEL_TH[region] ?? region} · รหัสงาน: {jobId.slice(0, 8)} ·
        วันที่: {new Date(createdAt).toLocaleString("th-TH")}
      </div>
    </div>
  );
}

/** Circular risk gauge — peak score 0..100 colored by band. */
function RiskGauge({ score, band }: { score: number; band: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = circ * pct;
  const color = BAND_HEX[band] ?? "#2DD4BF";
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#1F3A3C" strokeWidth="6" />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-lg font-bold" style={{ color }}>
          {Math.round(score)}
        </span>
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
  const color = BAND_HEX[data.band] ?? "#2DD4BF";

  return (
    <div className="card card-hover p-5">
      <div className="flex items-start gap-4">
        <RiskGauge score={data.peak_score} band={data.band} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>{ENDPOINT_ICON[endpoint]}</span>
            {ENDPOINT_LABEL_TH[endpoint]}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className={`badge border ${BAND_COLOR[data.band]}`}>
              {BAND_LABEL_TH[data.band] ?? data.band.toUpperCase()}
            </span>
            {data.confidence && (
              <span className={`badge border ${CONFIDENCE_COLOR[data.confidence.level]}`}>
                ความเชื่อมั่น {data.confidence.level}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F3A3C" vertical={false} />
            <XAxis dataKey="day" stroke="#6B7C7E" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#6B7C7E" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: "#0F1C1E",
                border: "1px solid #1F3A3C",
                borderRadius: 8,
                fontSize: 12,
              }}
              cursor={{ fill: "#14282A" }}
            />
            <Bar dataKey="score" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.confidence && (
        <p className="mt-2 text-xs leading-snug text-gray-400">{data.confidence.reason_th}</p>
      )}
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
    <div className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <span>⚠️</span> Structural Alerts
        <span className="text-xs font-normal text-gray-500">(Confidence Layer 3)</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-gray-500">
              <th className="py-2 pr-3">สาร</th>
              <th className="py-2 pr-3">Endpoint</th>
              <th className="py-2 pr-3">Alerts</th>
              <th className="py-2">สอดคล้องโมเดล</th>
            </tr>
          </thead>
          <tbody>
            {alertRows.map((row, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                <td className="py-2 pr-3 font-mono text-xs">{row.sub}</td>
                <td className="py-2 pr-3">{ENDPOINT_LABEL_TH[row.ep] ?? row.ep}</td>
                <td className="py-2 pr-3">
                  {row.alerts.map((a) => (
                    <span
                      key={a}
                      className="mr-1 inline-block rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs text-amber-300"
                    >
                      {a}
                    </span>
                  ))}
                </td>
                <td className="py-2">
                  {row.agrees ? (
                    <span className="text-emerald-400">✓ สอดคล้อง</span>
                  ) : (
                    <span className="text-rose-400">✗ ขัดแย้ง</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const meta: Record<string, { color: string; label: string }> = {
    queued: { color: "text-gray-400", label: "อยู่ในคิว" },
    running: { color: "text-amber-300", label: "กำลังรัน" },
    completed: { color: "text-emerald-400", label: "เสร็จสิ้น" },
    failed: { color: "text-rose-400", label: "ล้มเหลว" },
  };
  const m = meta[status] ?? { color: "", label: status };
  return <span className={m.color}>{m.label}</span>;
}
