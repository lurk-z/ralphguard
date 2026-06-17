"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AssessmentSummary, ProjectOut, api } from "../../lib/api";

const REGION_LABEL_TH: Record<string, string> = {
  forearm: "ท่อนแขน",
  hand: "มือ",
  face: "ใบหน้า",
  eye: "ดวงตา",
};

const STATUS_META: Record<string, { color: string; label: string }> = {
  queued: { color: "border-gray-500/40 bg-gray-500/10 text-gray-300", label: "อยู่ในคิว" },
  running: { color: "border-amber-500/40 bg-amber-500/10 text-amber-300", label: "กำลังรัน" },
  completed: { color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", label: "เสร็จสิ้น" },
  failed: { color: "border-rose-500/40 bg-rose-500/10 text-rose-300", label: "ล้มเหลว" },
};

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { color: "border-border bg-elevated text-gray-400", label: status };
  return <span className={`badge border ${m.color}`}>{m.label}</span>;
}

export default function HistoryPage() {
  const [rows, setRows] = useState<AssessmentSummary[]>([]);
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listAssessments(projectId, 100)
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  const projectName = (id: number | null) =>
    id == null ? "—" : projects.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">ประวัติการประเมิน</h1>
          <p className="mt-1 text-xs text-gray-500">รายการงานประเมินทั้งหมด เรียงจากใหม่ไปเก่า</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          โครงการ:
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            className="input py-1.5"
          >
            <option value="">ทั้งหมด</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {loading && (
        <div className="card flex items-center gap-3 p-6 text-sm text-gray-400">
          <span className="h-2 w-2 animate-pulse-soft rounded-full bg-brand" />
          กำลังโหลด…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className="card grid place-items-center gap-2 p-12 text-center">
          <div className="text-4xl">🗂️</div>
          <p className="text-sm text-gray-400">ยังไม่มีประวัติการประเมิน</p>
          <Link href="/assess" className="btn-primary mt-2 text-sm">
            เริ่มประเมินครั้งแรก →
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card animate-fade-up overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-elevated/40 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">รหัสงาน</th>
                  <th className="px-4 py-3 font-medium">บริเวณ</th>
                  <th className="px-4 py-3 font-medium">จำนวนสาร</th>
                  <th className="px-4 py-3 font-medium">โครงการ</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3 font-medium">วันที่</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-border/50 transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{r.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{REGION_LABEL_TH[r.region] ?? r.region}</td>
                    <td className="px-4 py-3 font-mono">{r.n_substances}</td>
                    <td className="px-4 py-3 text-gray-400">{projectName(r.project_id)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/assess?job=${r.id}`}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        ดูผล →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
