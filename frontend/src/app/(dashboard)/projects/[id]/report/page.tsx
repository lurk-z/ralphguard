"use client";

// Report — printable A4-style document for a project's assessment. The toolbar
// is print:hidden so window.print() (Save as PDF) outputs just the paper.
// A report is rendered only from a completed backend assessment. Missing or
// unavailable data is surfaced honestly instead of being replaced by a demo.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";

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

type EndpointRow = { key: string; label: string; score: number; band: string; confidence?: string };
type FormulaRow = { name: string; cas: string; concentration: number; role: string };
type ReportData = {
  projectName: string;
  dateTH: string;
  reportId: string;
  formula: FormulaRow[];
  endpoints: EndpointRow[];
  disclaimer: string;
};

const DISCLAIMER =
  "ผลจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เท่านั้น ไม่ใช่การทดสอบทางคลินิกหรือทดแทนการประเมินโดยผู้เชี่ยวชาญ";

export default function ReportPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get("assessmentId")?.trim() ?? "";
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const projectId = Number(params.id);

    let alive = true;
    setData(null);
    setError(null);
    (async () => {
      try {
        if (!Number.isSafeInteger(projectId) || projectId <= 0) {
          if (alive) setError("รหัสโปรเจกต์ไม่ถูกต้อง");
          return;
        }
        if (!assessmentId) {
          if (alive) setError("ไม่พบรหัสผลประเมินสำหรับสร้างรายงาน");
          return;
        }
        const [project, record] = await Promise.all([
          api.getProject(projectId),
          api.getProjectAssessment(projectId, assessmentId),
        ]);
        if (record.status !== "completed") {
          if (alive) {
            setError("ผลประเมินนี้ยังไม่เสร็จสมบูรณ์ จึงยังสร้างรายงานไม่ได้");
          }
          return;
        }
        const eps = record.result?.endpoints;
        if (!eps) {
          if (alive) setError("ผลประเมินนี้ไม่มีข้อมูลสำหรับสร้างรายงาน");
          return;
        }
        const endpoints: EndpointRow[] = Object.entries(eps).map(([key, e]) => ({
          key,
          label: e.label_th,
          score: Math.round(e.peak_score),
          band: e.band,
          confidence: e.confidence ? `${e.confidence.level} — ${e.confidence.reason_th}` : undefined,
        }));
        const formula: FormulaRow[] = (record.formula ?? []).map((f) => ({
          name: f.name ?? f.smiles,
          cas: "-",
          concentration: f.concentration,
          role: "-",
        }));
        const reportDate = new Date(record.completed_at || record.created_at);
        const dateTH = reportDate.toLocaleDateString("th-TH", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        if (alive) {
          setData({
            projectName: project.name,
            dateTH,
            reportId: `RG-${params.id}-${record.id.slice(0, 8).toUpperCase()}`,
            formula,
            endpoints,
            disclaimer: record.result?.disclaimer_th ?? DISCLAIMER,
          });
        }
      } catch (cause) {
        if (alive) setError(apiErrorMessage(cause, "โหลดรายงานไม่สำเร็จ"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.id, assessmentId]);

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
          <Button className="h-10 gap-2 px-5" onClick={() => window.print()} disabled={!data}>
            <Download className="size-4" />
            ดาวน์โหลด PDF
          </Button>
        </div>
      </div>

      {/* Paper */}
      <div className="mx-auto max-w-[820px] px-4 py-8 print:max-w-none print:p-0">
        {error ? (
          <div className="grid min-h-[480px] place-items-center rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : !data ? (
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

            {/* Methodology */}
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary">3. หลักการและความน่าเชื่อถือ</h2>
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
