"use client";

// Results — read-only view of a project's latest assessment. Loads the most
// recent completed run from the API. No 3D model here — the risk picture is
// told through the radar chart (endpoint shape), the time-course chart (how
// each endpoint develops over Day 1/3/7, from the real timecourse tuple the
// backend already returns), and per-substance contribution.
// Falls back to an empty state when there's no run yet (or backend is down).
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FlaskConical, ShieldCheck } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type AssessmentResultPayload, type ConfidenceLevel } from "@/lib/api";

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
const CONFIDENCE_HEX: Record<ConfidenceLevel, string> = {
  High: "#16A34A",
  Medium: "#E08A00",
  Low: "#94A3B8",
};
const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  High: "เชื่อมั่นสูง",
  Medium: "เชื่อมั่นปานกลาง",
  Low: "เชื่อมั่นต่ำ",
};
const ENDPOINT_ORDER = ["skin", "eye", "sens", "acute"] as const;
// One distinct colour per endpoint — used consistently across the radar and
// time-course charts (kept separate from BAND_HEX, which encodes severity).
const ENDPOINT_HEX: Record<(typeof ENDPOINT_ORDER)[number], string> = {
  skin: "#009FA5",
  eye: "#3B82F6",
  sens: "#F59E0B",
  acute: "#EF4444",
};
const DAY_LABELS = ["Day 1", "Day 3", "Day 7"];

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: CONFIDENCE_HEX[level], backgroundColor: `${CONFIDENCE_HEX[level]}1A` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: CONFIDENCE_HEX[level] }} />
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = Number(params.id);
  const [result, setResult] = useState<AssessmentResultPayload | null>(null);
  const [projectName, setProjectName] = useState<string>("ผลการวิเคราะห์");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!Number.isFinite(projectId)) throw new Error("no backend project");

        api
          .listProjects()
          .then((projects) => {
            const proj = projects.find((p) => p.id === projectId);
            if (proj && alive) {
              setProjectName(proj.name);
            }
          })
          .catch(() => {});

        const runs = await api.listAssessments(projectId, 1);
        const latest = runs.find((r) => r.status === "completed") ?? runs[0];
        if (!latest) throw new Error("no runs");
        const record = await api.getAssessment(latest.id);
        if (alive) setResult(record.result);
      } catch (e) {
        // Nothing to show. "no runs" is the ordinary empty state; anything else
        // is a real fault worth naming rather than dressing up as emptiness.
        const msg = e instanceof Error ? e.message : String(e);
        if (alive && msg !== "no runs" && msg !== "no backend project") setLoadError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const endpoints = result?.endpoints ?? null;

  const radarData = useMemo(() => {
    if (!endpoints) return [];
    return ENDPOINT_ORDER.map((ep) => ({
      endpoint: endpoints[ep]?.label_th ?? ep,
      score: endpoints[ep] ? Math.round(endpoints[ep].peak_score) : 0,
    }));
  }, [endpoints]);

  const timecourseData = useMemo(() => {
    if (!endpoints) return [];
    return DAY_LABELS.map((day, i) => {
      const row: Record<string, number | string> = { day };
      ENDPOINT_ORDER.forEach((ep) => {
        row[ep] = endpoints[ep]?.timecourse?.[i] ?? 0;
      });
      return row;
    });
  }, [endpoints]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">{projectName}</h1>
          <p className="text-sm text-muted-foreground">ผลการวิเคราะห์ความปลอดภัยและประเมินความเสี่ยงล่าสุด</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            className="h-11 gap-2 px-5"
            onClick={() => router.push(`/projects/${params.id}/assess`)}
          >
            <FlaskConical className="size-4" />
            กลับไปแก้สูตร
          </Button>
          <Button
            className="h-11 gap-2 px-5"
            disabled={!endpoints}
            onClick={() => router.push(`/projects/${params.id}/report`)}
          >
            <FileText className="size-4" />
            สร้าง PDF
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        {loading && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/50" />
              <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/50" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-muted/50" />
              ))}
            </div>
          </div>
        )}

        {!loading && !endpoints && (
          <Card className="border-border shadow-sm">
            <CardContent className="grid place-items-center py-14 text-center">
              <span className="grid size-14 place-items-center rounded-2xl border border-dashed border-border bg-muted/60">
                <FlaskConical className="size-6 text-muted-foreground" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-foreground">
                {loadError ? "โหลดผลการวิเคราะห์ไม่ได้" : "ยังไม่มีผลการวิเคราะห์"}
              </h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {loadError
                  ? `เชื่อมต่อเซิร์ฟเวอร์ประเมินไม่ได้ — ${loadError}`
                  : "กลับไปที่หน้าการทดลอง เพิ่มสูตร แล้วกด “เริ่มการทดลอง” เพื่อประเมินความเสี่ยง"}
              </p>
              <Button
                className="mt-5 h-11 gap-2 px-6"
                onClick={() => router.push(`/projects/${params.id}/assess`)}
              >
                <FlaskConical className="size-4" />
                ไปหน้าการทดลอง
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && endpoints && (
          <div className="space-y-6">
            {/* Radar + time-course charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">ภาพรวมความเสี่ยง 4 ด้าน</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="endpoint" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Radar
                        dataKey="score"
                        stroke="#009FA5"
                        fill="#009FA5"
                        fillOpacity={0.35}
                      />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">แนวโน้มตามเวลา (Day 1 / 3 / 7)</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timecourseData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip />
                      <Legend
                        formatter={(value: string) => endpoints[value]?.label_th ?? value}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      {ENDPOINT_ORDER.map((ep) => (
                        <Line
                          key={ep}
                          type="monotone"
                          dataKey={ep}
                          name={ep}
                          stroke={ENDPOINT_HEX[ep]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Per-endpoint score cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ENDPOINT_ORDER.map((ep) => {
                const e = endpoints[ep];
                if (!e) return null;
                const band = e.band;
                return (
                  <Card key={ep} className="border-border shadow-sm">
                    <CardContent className="p-4">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{e.label_th}</span>
                        <span
                          className="font-mono text-sm font-semibold tabular-nums"
                          style={{ color: BAND_HEX[band] }}
                        >
                          {Math.round(e.peak_score)} · {BAND_LABEL[band]}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, e.peak_score)}%`, background: BAND_HEX[band] }}
                        />
                      </div>
                      {e.confidence && (
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <ConfidenceBadge level={e.confidence.level} />
                          <span className="truncate text-[11px] text-muted-foreground" title={e.confidence.reason_th}>
                            {e.confidence.reason_th}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Per-substance contribution */}
            {result?.substances && result.substances.length > 0 && (
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">คะแนนแยกตามสาร</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">สาร (SMILES)</th>
                        {ENDPOINT_ORDER.map((ep) => (
                          <th key={ep} className="px-4 py-2 text-right font-medium">
                            {endpoints[ep]?.label_th ?? ep}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.substances.map((s, i) => (
                        <tr key={i} className="border-b border-border/60 last:border-0">
                          <td className="max-w-[220px] truncate px-4 py-2 font-mono text-xs text-foreground" title={s.smiles}>
                            {s.canonical_smiles || s.smiles}
                          </td>
                          {ENDPOINT_ORDER.map((ep) => {
                            const score = s.per_endpoint?.[ep]?.score;
                            return (
                              <td key={ep} className="px-4 py-2 text-right font-mono text-xs tabular-nums text-foreground">
                                {score != null ? Math.round(score) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {result?.disclaimer_th && (
              <div className="flex gap-2.5 rounded-xl border border-border bg-accent/50 p-3.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
                <p>{result.disclaimer_th}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
