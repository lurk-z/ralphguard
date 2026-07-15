"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import {
  AssessmentRecord,
  EndpointMetric,
  FormulaItem,
  ModelInfoPayload,
  ModelMetricsPayload,
  Region,
  api,
} from "@/lib/api";
import { PRODUCT_TEMPLATES, SUBSTANCE_LIBRARY } from "@/lib/catalog";
import VoiceAssistant from "@/components/VoiceAssistant";

// ── 3D head (client-only). Auto-fills irritation by the result intensity. ──
const FaceView = dynamic(
  () => import("@/components/FaceIrritationModel").then((m) => m.FacePaintCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-xs text-slate-800/50">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

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

export default function StudioPage() {
  const [mode, setMode] = useState<Mode>("assess");
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateRisk, setTemplateRisk] = useState<"all" | "low" | "mid" | "high">("all");
  const [eraseMode, setEraseMode] = useState(false);
  const [formula, setFormula] = useState<FormulaItem[]>(SAMPLE);
  const [region, setRegion] = useState<Region>("face");
  const [dayIdx, setDayIdx] = useState(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AssessmentRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoints = assessment?.result?.endpoints ?? null;
  const completed = assessment?.status === "completed";

  // Product name for the paint-mode hover tooltip.
  const productName = useMemo(() => {
    const names = formula.map((f) => f.name?.trim()).filter(Boolean);
    return names.length ? names.join(" + ") : "สูตรที่ประเมิน";
  }, [formula]);

  // Per-endpoint paint layers — each endpoint paints in its own neon color.
  const paintLayers = useMemo(() => {
    if (!endpoints) return [];
    return ENDPOINTS.map((ep) => {
      const sc = endpoints[ep]?.timecourse?.[dayIdx] ?? endpoints[ep]?.peak_score ?? 0;
      return { key: ep, label: ENDPOINT_LABEL_TH[ep], score: sc, color: EP_COLOR[ep], band: bandOf(sc) };
    });
  }, [endpoints, dayIdx]);

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

  const run = async () => {
    setError(null);
    setAssessment(null);
    setJobId(null);
    setRunning(true);
    try {
      const cleaned = formula.filter((it) => it.smiles.trim() && it.concentration > 0);
      if (!cleaned.length) throw new Error("เพิ่มอย่างน้อย 1 สาร + ความเข้มข้น");
      const { job_id } = await api.createAssessment(cleaned, region, null);
      setJobId(job_id);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };

  const patchItem = (i: number, p: Partial<FormulaItem>) =>
    setFormula((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const removeItem = (i: number) => setFormula((prev) => prev.filter((_, idx) => idx !== i));
  const addItem = () => setFormula((prev) => [...prev, { name: "", smiles: "", concentration: 10 }]);

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
    const flat = SUBSTANCE_LIBRARY.flatMap((g) => g.items);
    const mapped = items
      .map((it) => {
        const hit = flat.find((s) => s.name.toLowerCase() === (it.name || "").toLowerCase());
        return {
          name: it.name || hit?.name || "",
          smiles: hit?.smiles || it.smiles, // prefer catalog SMILES when the name matches
          concentration: it.concentration,
        };
      })
      .filter((it) => it.smiles);
    if (!mapped.length) return;
    setFormula(mapped);
    setAssessment(null);
    setJobId(null);
  };

  // Add one ingredient (picked from the catalog dropdown) as a new formula row.
  const addFromCatalog = (smiles: string) => {
    const it = SUBSTANCE_LIBRARY.flatMap((g) => g.items).find((s) => s.smiles === smiles);
    if (!it) return;
    setFormula((prev) => [...prev, { name: it.name, smiles: it.smiles, concentration: it.conc }]);
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
          <button onClick={run} className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-800/70 hover:border-brand hover:text-brand" title="Run">▶</button>
          <button onClick={() => window.print()} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
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
          </div>

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
              <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-800/50">
                Layers · {formula.length} สาร · 4 บริเวณ
              </div>
              <div className="p-3">
                <div className="mb-1 text-[11px] font-semibold text-slate-800/50">🧪 สูตร (Formulation)</div>
                <div className="space-y-1.5">
                  {formula.map((it, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 bg-slate-100/50 p-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-brand">◇</span>
                        <input
                          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                          placeholder="ชื่อสาร"
                          value={it.name ?? ""}
                          onChange={(e) => patchItem(i, { name: e.target.value })}
                        />
                        <input
                          type="number"
                          className="w-10 bg-transparent text-right font-mono text-xs tabular-nums outline-none"
                          value={it.concentration}
                          onChange={(e) => patchItem(i, { concentration: parseFloat(e.target.value) || 0 })}
                        />
                        <span className="text-[10px] text-slate-800/40">%</span>
                        <button onClick={() => removeItem(i)} className="text-slate-800/30 hover:text-rose-500">×</button>
                      </div>
                      <input
                        className="mt-1 w-full bg-transparent font-mono text-[10px] text-slate-800/45 outline-none"
                        placeholder="SMILES"
                        value={it.smiles}
                        onChange={(e) => patchItem(i, { smiles: e.target.value })}
                      />
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
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-800/50">🧍 บริเวณ</span>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value as Region)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
                  >
                    {REGIONS.filter((r) => r.value === "face" || r.value === "eye").map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.icon} {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          {mode === "nodes" && (
            <div className="absolute inset-0">
              <div className="absolute left-4 top-3 z-10 text-xs font-semibold text-slate-800/60">
                Assessment Node Graph <span className="font-normal text-slate-800/40">· in-silico pipeline</span>
              </div>
              <FormulaGraph seed={formula} region={region} />
            </div>
          )}
          {mode === "trust" && <TrustReport />}

          {/* Bottom floating toolbar (assess & nodes) */}
          {mode !== "trust" && (
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
                  {running ? "…" : mode === "nodes" ? "▶ Evaluate graph" : "▶ Run ประเมิน"}
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
                  onImportFormula={importFormula}
                />
              </Section>

              <Section title="บริเวณที่เลือก">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-800/60">{REGIONS.find((r) => r.value === region)?.label}</span>
                  <span className="font-mono text-xs text-brand">{region}</span>
                </div>
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </aside>
      </div>
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
    <div className="absolute inset-0 p-6">
      <div className="relative h-full w-full rounded-xl border border-brand/40 bg-[repeating-conic-gradient(#F4F1EE_0%_25%,#FFFDFB_0%_50%)] bg-[length:24px_24px]">
        <div className="absolute right-3 top-2 z-10 text-xs font-semibold text-brand">
          ▢ Model Viewport · Day {DAY_LABELS[dayIdx]}
        </div>
        <div className="absolute inset-0 pt-6">
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

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-2 font-semibold">ความไม่แน่นอน 3 ชั้น</h3>
            <ul className="space-y-1.5 text-xs text-slate-800/70">
              <li><b>1 · Aleatoric</b> — noise ในข้อมูลการทดลอง</li>
              <li><b>2 · Epistemic</b> — ความไม่แน่นอนของตัวโมเดล (ensemble)</li>
              <li><b>3 · Domain</b> — ระยะห่างจากชุดฝึก (in/out-of-domain)</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-2 font-semibold">มาตรฐาน OECD</h3>
            <p className="text-xs leading-relaxed text-slate-800/70">
              Endpoint ชัดเจน · อัลกอริทึมโปร่งใส · Applicability Domain · Goodness-of-fit &amp; robustness · การตีความเชิงกลไก
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-brand/20 bg-teal-50/40 px-4 py-3 text-xs text-slate-800/70">
          โมเดลนี้เป็นเครื่องมือ <b>คัดกรอง</b> เพื่อจัดลำดับความเสี่ยงในระยะต้น ไม่ใช่การทดแทนการทดสอบตามข้อกำหนดหรือการประเมินโดยผู้เชี่ยวชาญ
          {info?.disclaimer_th ? "" : ""}
        </div>
      </div>
    </div>
  );
}
