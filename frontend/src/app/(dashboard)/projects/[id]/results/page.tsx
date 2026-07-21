"use client";

// Results — read-only view of a project's latest assessment. Loads the most
// recent completed run from the API and colours the head.glb by the skin score.
// Falls back to an empty state when there's no run yet (or backend is down).
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FileText, FlaskConical, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DashboardShell from "@/components/layout/DashboardShell";
import { api, type AssessmentResultPayload } from "@/lib/api";
import { latestCompletedAssessment } from "@/lib/report-selection";

const FaceView = dynamic(
  () => import("@/components/FaceIrritationModel").then((m) => m.FaceIrritationCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

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
const ENDPOINT_ORDER = ["skin", "eye", "sens", "acute"] as const;

export default function ResultsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = Number(params.id);
  const [result, setResult] = useState<AssessmentResultPayload | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!Number.isSafeInteger(projectId) || projectId <= 0) {
          throw new Error("no backend project");
        }
        const runs = await api.listProjectAssessments(projectId);
        const latest = latestCompletedAssessment(runs);
        if (!latest) throw new Error("no runs");
        const record = await api.getProjectAssessment(projectId, latest.id);
        if (alive) {
          setResult(record.result);
          setAssessmentId(record.id);
        }
      } catch {
        if (alive) {
          setResult(null);
          setAssessmentId(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const endpoints = result?.endpoints ?? null;
  const headIntensity = useMemo(() => {
    if (!endpoints) return 0;
    const at = (ep: string) => endpoints[ep]?.peak_score ?? 0;
    return Math.max(at("skin"), at("eye")) / 100;
  }, [endpoints]);

  return (
    <DashboardShell
      breadcrumbs={[
        { label: "โปรเจกต์", href: "/projects" },
        { label: "ผลการวิเคราะห์" },
      ]}
      actions={
        <>
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
            disabled={!endpoints || !assessmentId}
            onClick={() =>
              router.push(
                `/projects/${params.id}/report?assessmentId=${encodeURIComponent(assessmentId!)}`,
              )
            }
          >
            <FileText className="size-4" />
            สร้าง PDF
          </Button>
        </>
      }
    >
      <div className="grid min-h-full gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        {/* Head viewport */}
        <Card className="overflow-hidden border-border shadow-sm">
          <div className="relative h-[clamp(360px,60vh,640px)] w-full bg-[#F7F5F4]">
            <FaceView intensity={headIntensity} zone="all" background="#F7F5F4" />
            <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-[11px] backdrop-blur">
              {(["low", "moderate", "high", "severe"] as const).map((b) => (
                <span key={b} className="flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: BAND_HEX[b] }} />
                  {BAND_LABEL[b]}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* Endpoint scores */}
        <div className="flex flex-col gap-4">
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/50" />
              ))}
            </div>
          )}

          {!loading && !endpoints && (
            <Card className="border-border shadow-sm">
              <CardContent className="grid place-items-center py-14 text-center">
                <span className="grid size-14 place-items-center rounded-2xl border border-dashed border-border bg-muted/60">
                  <FlaskConical className="size-6 text-muted-foreground" />
                </span>
                <h2 className="mt-4 text-base font-semibold text-foreground">ยังไม่มีผลการวิเคราะห์</h2>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  กลับไปที่หน้าการทดลอง เพิ่มสูตร แล้วกด “เริ่มการทดลอง” เพื่อประเมินความเสี่ยง
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

          {!loading &&
            endpoints &&
            ENDPOINT_ORDER.map((ep) => {
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
                      <p className="mt-2 text-xs text-muted-foreground">
                        ความเชื่อมั่น: {e.confidence.level} — {e.confidence.reason_th}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}

          {!loading && endpoints && result?.disclaimer_th && (
            <div className="flex gap-2.5 rounded-xl border border-border bg-accent/50 p-3.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
              <p>{result.disclaimer_th}</p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
