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

// ── 3D head (client-only). Auto-fills irritation by the result intensity. ──
const FaceView = dynamic(
  () => import("@/components/FaceIrritationModel").then((m) => m.FaceIrritationCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-xs text-ink2/50">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

// ── Node graph (client-only) ──
const FormulaGraph = dynamic(() => import("@/components/FormulaGraph"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-xs text-ink2/50">
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

const SAMPLE: FormulaItem[] = [
  { name: "Ethanol", smiles: "CCO", concentration: 40 },
  { name: "Cinnamaldehyde", smiles: "O=C/C=C/c1ccccc1", concentration: 3 },
];

export default function StudioPage() {
  const [mode, setMode] = useState<Mode>("assess");
  const [formula, setFormula] = useState<FormulaItem[]>(SAMPLE);
  const [region, setRegion] = useState<Region>("forearm");
  const [dayIdx, setDayIdx] = useState(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AssessmentRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoints = assessment?.result?.endpoints ?? null;
  const completed = assessment?.status === "completed";

  const headIntensity = useMemo(() => {
    if (!endpoints) return 0;
    const at = (ep: string) => endpoints[ep]?.timecourse?.[dayIdx] ?? endpoints[ep]?.peak_score ?? 0;
    return Math.max(at("skin"), at("eye")) / 100;
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-ink2">
      {/* ── Top bar ── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded bg-brand text-xs font-bold text-white">R</span>
          <span className="font-display text-sm font-bold">Ralph<span className="text-brand">Guard</span></span>
          <span className="text-xs text-ink2/40">/ {mode === "assess" ? "ประเมิน" : mode === "nodes" ? "Nodes" : "ความน่าเชื่อถือ"}</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-elevated p-0.5 text-xs">
          {([["assess", "ประเมิน"], ["nodes", "Nodes Mode"], ["trust", "ความน่าเชื่อถือ"]] as [Mode, string][]).map(
            ([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 transition ${
                  mode === m ? "bg-panel font-semibold text-ink2 shadow-card" : "text-ink2/60 hover:text-ink2"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={run} className="grid size-7 place-items-center rounded-lg border border-border text-ink2/70 hover:border-brand hover:text-brand" title="Run">▶</button>
          <button onClick={() => window.print()} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
            แชร์ / PDF
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Icon rail */}
        <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-3">
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
                mode === it.m ? "bg-brand-soft text-brand" : "text-ink2/45 hover:bg-elevated"
              }`}
            >
              {it.icon}
            </button>
          ))}
          <a href="/" title="หน้าแรก" className="mt-auto grid size-9 place-items-center rounded-lg text-ink2/40 hover:bg-elevated">🏠</a>
        </nav>

        {/* Left panel — Pages + Layers */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-panel">
          <div className="border-b border-border px-4 py-3">
            <div className="font-display text-sm font-semibold">การประเมินสารเคมี</div>
          </div>

          <Section title="Pages">
            {([["assess", "ประเมินความเสี่ยง"], ["nodes", "Nodes Mode"], ["trust", "ความน่าเชื่อถือ"]] as [Mode, string][]).map(
              ([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`block w-full rounded px-2 py-1 text-left text-sm transition ${
                    mode === m ? "bg-brand-soft font-medium text-brand-dark" : "text-ink2/70 hover:bg-elevated"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
            <a href="/" className="block rounded px-2 py-1 text-left text-sm text-ink2/70 hover:bg-elevated">หน้าแรก</a>
          </Section>

          <Section title={`Layers · ${formula.length} สาร · 4 บริเวณ`}>
            <div className="mb-1 text-[11px] font-semibold text-ink2/50">🧪 สูตร (Formulation)</div>
            <div className="space-y-1.5">
              {formula.map((it, i) => (
                <div key={i} className="rounded-lg border border-border bg-elevated/50 p-1.5">
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
                    <span className="text-[10px] text-ink2/40">%</span>
                    <button onClick={() => removeItem(i)} className="text-ink2/30 hover:text-rose-500">×</button>
                  </div>
                  <input
                    className="mt-1 w-full bg-transparent font-mono text-[10px] text-ink2/45 outline-none"
                    placeholder="SMILES"
                    value={it.smiles}
                    onChange={(e) => patchItem(i, { smiles: e.target.value })}
                  />
                </div>
              ))}
              <button onClick={addItem} className="text-xs font-medium text-brand hover:underline">+ เพิ่มสาร</button>
            </div>

            <div className="mb-1 mt-4 text-[11px] font-semibold text-ink2/50">🧍 บริเวณทดสอบ</div>
            <div className="space-y-0.5">
              {REGIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRegion(r.value)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
                    region === r.value ? "bg-brand-soft text-brand-dark" : "text-ink2/70 hover:bg-elevated"
                  }`}
                >
                  <span>{r.icon}</span>
                  <span className="flex-1">{r.label}</span>
                  <span className="font-mono text-[10px] text-ink2/40">{r.value}</span>
                </button>
              ))}
            </div>
          </Section>
        </aside>

        {/* Center canvas */}
        <main className="relative min-w-0 flex-1 bg-elevated/30">
          {mode === "assess" && (
            <Viewport dayIdx={dayIdx} region={region} intensity={headIntensity} ready={completed} />
          )}
          {mode === "nodes" && (
            <div className="absolute inset-0">
              <div className="absolute left-4 top-3 z-10 text-xs font-semibold text-ink2/60">
                Assessment Node Graph <span className="font-normal text-ink2/40">· in-silico pipeline</span>
              </div>
              <FormulaGraph seed={formula} region={region} />
            </div>
          )}
          {mode === "trust" && <TrustReport />}

          {/* Bottom floating toolbar (assess & nodes) */}
          {mode !== "trust" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center print:hidden">
              <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-panel/95 p-1.5 shadow-soft backdrop-blur">
                {["🧭", "➕", mode === "nodes" ? "▦" : "🧍", "📐", "💬"].map((ic, i) => (
                  <button key={i} className="grid size-8 place-items-center rounded-lg text-sm text-ink2/50 hover:bg-elevated">{ic}</button>
                ))}
                <button
                  onClick={run}
                  disabled={running}
                  className="ml-1 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-brand-dark disabled:opacity-50"
                >
                  {running ? "…" : mode === "nodes" ? "▶ Evaluate graph" : "▶ Run ประเมิน"}
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right inspector */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-panel">
          {mode === "trust" ? (
            <div className="p-4 text-xs leading-relaxed text-ink2/55">
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
                        i === dayIdx ? "border-brand bg-brand text-white font-semibold" : "border-border bg-elevated text-ink2/65 hover:border-brand/50"
                      }`}
                    >
                      Day {d}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="บริเวณที่เลือก">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink2/60">{REGIONS.find((r) => r.value === region)?.label}</span>
                  <span className="font-mono text-xs text-brand">{region}</span>
                </div>
              </Section>

              <Section title="ผลการประเมิน">
                {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600">{error}</div>}
                {!completed && !error && (
                  <div className="grid place-items-center gap-2 py-6 text-center">
                    <span className="text-2xl text-ink2/20">◇</span>
                    <p className="text-xs text-ink2/50">
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
                            <span className="text-ink2/70">{ENDPOINT_LABEL_TH[ep]}</span>
                            <span className="font-mono tabular-nums" style={{ color: BAND_HEX[band] }}>
                              {Math.round(sc)} · {BAND_LABEL[band]}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
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
    <div className="border-b border-border px-4 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink2/40">{title}</div>
      {children}
    </div>
  );
}

function Viewport({
  dayIdx,
  region,
  intensity,
  ready,
}: {
  dayIdx: number;
  region: Region;
  intensity: number;
  ready: boolean;
}) {
  return (
    <div className="absolute inset-0 p-6">
      <div className="relative h-full w-full rounded-xl border border-brand/40 bg-[repeating-conic-gradient(#F4F1EE_0%_25%,#FFFDFB_0%_50%)] bg-[length:24px_24px]">
        <div className="absolute left-3 top-2 text-xs font-semibold text-brand">
          ▢ Model Viewport · Day {DAY_LABELS[dayIdx]}
        </div>
        <div className="absolute inset-0 pt-6">
          <FaceView intensity={intensity} zone="all" background="#F4F1EE" />
        </div>
        {!ready && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center text-xs text-ink2/40">
              เลือกสูตร + บริเวณ แล้วกด ▶ Run<br />
              บริเวณ: <span className="text-brand">{REGIONS.find((r) => r.value === region)?.label}</span>
            </div>
          </div>
        )}
        {/* Risk legend */}
        <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg border border-border bg-panel/90 px-3 py-1.5 text-[11px] backdrop-blur">
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
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-panel p-8 shadow-card">
        <h1 className="font-display text-2xl font-bold">ความน่าเชื่อถือของโมเดล</h1>
        <p className="mt-2 text-sm text-ink2/60">
          ทุกการทำนายมาพร้อมตัวชี้วัดประสิทธิภาพ ความไม่แน่นอน และขอบเขตการใช้งาน (Applicability Domain) ตามหลัก OECD สำหรับ QSAR
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel2 text-xs text-ink2/55">
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
                <tr key={m.endpoint} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.label_th}</span>{" "}
                    <span className="font-mono text-xs text-ink2/40">{m.endpoint}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-semibold text-brand">{pct(m.metrics?.auc)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.balanced_accuracy)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.sensitivity)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.specificity)}</td>
                </tr>
              ))}
              {!metrics?.endpoints?.length && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-ink2/40">ยังไม่มีข้อมูล (รัน data_prep.py)</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-2 font-semibold">ความไม่แน่นอน 3 ชั้น</h3>
            <ul className="space-y-1.5 text-xs text-ink2/70">
              <li><b>1 · Aleatoric</b> — noise ในข้อมูลการทดลอง</li>
              <li><b>2 · Epistemic</b> — ความไม่แน่นอนของตัวโมเดล (ensemble)</li>
              <li><b>3 · Domain</b> — ระยะห่างจากชุดฝึก (in/out-of-domain)</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-2 font-semibold">มาตรฐาน OECD</h3>
            <p className="text-xs leading-relaxed text-ink2/70">
              Endpoint ชัดเจน · อัลกอริทึมโปร่งใส · Applicability Domain · Goodness-of-fit &amp; robustness · การตีความเชิงกลไก
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-brand/20 bg-brand-soft/40 px-4 py-3 text-xs text-ink2/70">
          โมเดลนี้เป็นเครื่องมือ <b>คัดกรอง</b> เพื่อจัดลำดับความเสี่ยงในระยะต้น ไม่ใช่การทดแทนการทดสอบตามข้อกำหนดหรือการประเมินโดยผู้เชี่ยวชาญ
          {info?.disclaimer_th ? "" : ""}
        </div>
      </div>
    </div>
  );
}
