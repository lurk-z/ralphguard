"use client";

// Report — printable A4-style document for a project's assessment. The toolbar
// is print:hidden so window.print() (Save as PDF) outputs just the paper.
// Renders real data when a run exists; otherwise shows sample data so the whole
// layout is visible (UI preview).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getProject } from "@/lib/projects";
import { chemById } from "@/lib/chemicals";

const BAND_HEX: Record<string, string> = {
  low: "#16A34A",
  moderate: "#E08A00",
  high: "#DC2626",
  severe: "#B91C1C",
};
const BAND_LABEL: Record<string, string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  severe: "รุนแรง",
};
const DAY_LABELS = [1, 3, 7] as const;
function bandOf(score: number): keyof typeof BAND_LABEL {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "severe";
}

type EndpointRow = {
  key: string;
  label: string;
  score: number;
  band: string;
  confidence?: string;
  /** Score at Day 1/3/7 — same tuple api.ts's EndpointResultPayload carries. */
  timecourse: [number, number, number];
};
type FormulaRow = { name: string; cas: string; concentration: number; role: string };
type ReportData = {
  projectName: string;
  dateTH: string;
  reportId: string;
  formula: FormulaRow[];
  endpoints: EndpointRow[];
  disclaimer: string;
  sample: boolean;
};

const DISCLAIMER =
  "ผลจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เท่านั้น ไม่ใช่การทดสอบทางคลินิกหรือทดแทนการประเมินโดยผู้เชี่ยวชาญ";

const SAMPLE: Omit<ReportData, "reportId" | "dateTH"> = {
  projectName: "Hand Cream Formula Test",
  sample: true,
  formula: [
    { name: "Water (Aqua)", cas: "7732-18-5", concentration: 65, role: "ตัวทำละลายหลัก" },
    { name: "Glycerin", cas: "56-81-5", concentration: 12, role: "สารให้ความชุ่มชื้น" },
    { name: "Cetearyl Alcohol", cas: "67762-27-0", concentration: 8, role: "สารเพิ่มความข้น" },
    { name: "Niacinamide", cas: "98-92-0", concentration: 4, role: "สารออกฤทธิ์" },
    { name: "Phenoxyethanol", cas: "122-99-6", concentration: 1, role: "สารกันเสีย" },
  ],
  endpoints: [
    { key: "skin", label: "การระคายเคืองผิวหนัง", score: 28, band: "moderate", confidence: "Medium — อยู่ในขอบเขตการใช้งาน (in-domain)", timecourse: [11, 20, 28] },
    { key: "eye", label: "การระคายเคืองดวงตา", score: 41, band: "moderate", confidence: "Medium — Tanimoto = 0.42", timecourse: [16, 30, 41] },
    { key: "sens", label: "การแพ้ผิวหนัง", score: 14, band: "low", confidence: "High — โครงสร้างสอดคล้องกับผลโมเดล", timecourse: [5, 9, 14] },
    { key: "acute", label: "ความเป็นพิษเฉียบพลัน", score: 9, band: "low", confidence: "High — in-domain", timecourse: [3, 6, 9] },
  ],
  disclaimer: DISCLAIMER,
};

export default function ReportPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    const nowId = `RG-${params.id}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const dateTH = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
    let alive = true;
    (async () => {
      try {
        // Same as the results page: the project's runs are tracked locally, and
        // the backend is asked for one by job id.
        const project = getProject(params.id);
        const jobId = project?.jobs[0];
        if (!jobId) throw new Error("no runs");
        const record = await api.getAssessment(jobId);
        const eps = record.result?.endpoints;
        if (!eps) throw new Error("no result");
        const endpoints: EndpointRow[] = Object.entries(eps).map(([key, e]) => ({
          key,
          label: e.label_th,
          score: Math.round(e.peak_score),
          band: e.band,
          confidence: e.confidence ? `${e.confidence.level} — ${e.confidence.reason_th}` : undefined,
          timecourse: e.timecourse ?? [0, 0, Math.round(e.peak_score)],
        }));
        const formula: FormulaRow[] = (record.formula ?? []).map((f) => ({
          name: f.name ?? f.smiles,
          cas: "-",
          concentration: f.concentration,
          // catalog.ts carries no CAS numbers, but does have a Thai role blurb
          // per substance (keyed by SMILES) — same source the workspace's
          // substance-info tooltip reads from.
          role: chemById(f.smiles)?.role ?? "-",
        }));
        if (alive)
          setData({
            projectName: project?.name ?? `โปรเจกต์ #${params.id}`,
            dateTH,
            reportId: nowId,
            formula: formula.length ? formula : SAMPLE.formula,
            endpoints,
            disclaimer: record.result?.disclaimer_th ?? DISCLAIMER,
            sample: false,
          });
      } catch {
        if (alive) setData({ ...SAMPLE, reportId: nowId, dateTH });
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.id]);

  return (
    <div className="app-light min-h-screen bg-muted/40 text-foreground">
      {/* Toolbar (not printed) */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-3 print:hidden">
        <button
          onClick={() => router.push(`/projects/${params.id}/results`)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          กลับไปหน้าผลลัพธ์
        </button>
        <div className="flex items-center gap-2">
          {data?.sample && (
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              ข้อมูลตัวอย่าง
            </span>
          )}
          <Button className="h-10 gap-2 px-5" onClick={() => window.print()} disabled={!data}>
            <Download className="size-4" />
            ดาวน์โหลด PDF
          </Button>
        </div>
      </div>

      {/* Paper */}
      <div className="mx-auto max-w-[820px] px-4 py-8 print:max-w-none print:p-0">
        {!data ? (
          <div className="h-[900px] animate-pulse rounded-lg bg-card" />
        ) : (
          <article className="rounded-lg border border-border bg-white p-10 shadow-sm print:rounded-none print:border-0 print:shadow-none">
            {/* Header */}
            <header className="flex items-start justify-between border-b-2 border-primary/70 pb-5">
              <div className="flex items-center gap-3">
                <span aria-hidden className="grid size-11 place-items-center rounded-xl border border-dashed border-border bg-muted/60" />
                <div>
                  <div className="font-display text-xl font-bold text-foreground">RalphGuard</div>
                  <div className="text-[11px] text-muted-foreground">In-silico Chemical Risk Screening</div>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div className="font-mono">{data.reportId}</div>
                <div>{data.dateTH}</div>
              </div>
            </header>

            <h1 className="mt-6 text-2xl font-bold text-foreground">รายงานการประเมินความเสี่ยงเบื้องต้น</h1>
            <p className="mt-1 text-sm text-muted-foreground">โปรเจกต์: {data.projectName}</p>

            {/* Formula */}
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary">1. ส่วนผสม (Formulation)</h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">สารเคมี</th>
                      <th className="px-4 py-2.5 text-left font-medium">CAS</th>
                      <th className="px-4 py-2.5 text-left font-medium">หน้าที่</th>
                      <th className="px-4 py-2.5 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.formula.map((f, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-2.5 font-medium text-foreground">{f.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{f.cas}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{f.role}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-foreground">
                          {f.concentration}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Results */}
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary">2. ผลการประเมิน 4 ด้าน</h2>
              <div className="mt-3 space-y-3">
                {data.endpoints.map((e) => (
                  <div key={e.key} className="rounded-lg border border-border p-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{e.label}</span>
                      <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: BAND_HEX[e.band] }}>
                        {e.score} · {BAND_LABEL[e.band]}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, e.score)}%`, background: BAND_HEX[e.band] }} />
                    </div>
                    {e.confidence && <p className="mt-1.5 text-xs text-muted-foreground">ความเชื่อมั่น: {e.confidence}</p>}
                  </div>
                ))}
              </div>
            </section>

            {/* Time-course */}
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary">3. แนวโน้มความเสี่ยงตามเวลา (Day 1 / 3 / 7)</h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">ปลายทางความเสี่ยง</th>
                      {DAY_LABELS.map((d) => (
                        <th key={d} className="px-4 py-2.5 text-center font-medium">Day {d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.endpoints.map((e) => (
                      <tr key={e.key} className="border-t border-border">
                        <td className="px-4 py-2.5 font-medium text-foreground">{e.label}</td>
                        {e.timecourse.map((sc, i) => {
                          const b = bandOf(sc);
                          return (
                            <td key={i} className="px-4 py-2.5 text-center">
                              <span
                                className="inline-block rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-white"
                                style={{ background: BAND_HEX[b] }}
                              >
                                {Math.round(sc)} · {BAND_LABEL[b]}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                // Same note /assess's PDF export makes: name the endpoint whose
                // peak score is highest, and which day it peaks at.
                const top = data.endpoints.reduce((a, b) => (b.score > a.score ? b : a));
                const peakDayIdx = top.timecourse.indexOf(Math.max(...top.timecourse));
                const peakDay = DAY_LABELS[peakDayIdx] ?? DAY_LABELS[DAY_LABELS.length - 1];
                return (
                  <p className="mt-3 rounded-lg bg-accent/50 p-3 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">ข้อสังเกต: </span>
                    ความเสี่ยงเด่นที่สุดคือ “{top.label}” สูงสุดที่ Day {peakDay} ({Math.round(top.score)}/100 ·{" "}
                    {BAND_LABEL[bandOf(top.score)]})
                    {top.score >= 50
                      ? " — ควรทบทวน/ลดความเข้มข้นของสารหลักก่อนพัฒนาต่อ"
                      : " — อยู่ในเกณฑ์ที่จัดการได้"}
                  </p>
                );
              })()}
            </section>

            {/* Methodology */}
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary">4. หลักการและความน่าเชื่อถือ</h2>
              <ul className="mt-3 grid gap-1.5 text-sm text-muted-foreground">
                <li>• Endpoint ชัดเจน 4 ด้าน ตามแนวทาง OECD (TG 404/405/429/420)</li>
                <li>• อัลกอริทึม: Random Forest บน Morgan fingerprint (ECFP, radius 2)</li>
                <li>• ขอบเขตการใช้งาน (Applicability Domain): k-NN Tanimoto</li>
                <li>• ตรวจสอบด้วย cross-validation + held-out test set</li>
                <li>• ตีความเชิงกลไกด้วย structural alerts (SMARTS)</li>
              </ul>
            </section>

            {/* Disclaimer */}
            <section className="mt-8 rounded-lg bg-accent/50 p-4 text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">ข้อจำกัด: </span>
              {data.disclaimer}
            </section>

            <footer className="mt-8 flex justify-between border-t border-border pt-4 text-[11px] text-muted-foreground">
              <span>สร้างโดย RalphGuard · In-silico Screening Platform</span>
              <span className="font-mono">{data.reportId}</span>
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}
