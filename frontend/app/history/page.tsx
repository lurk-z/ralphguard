"use client";

import { useEffect, useState } from "react";

import { AssessmentSummary, ProjectOut, api } from "../../lib/api";

const REGION_LABEL_TH: Record<string, string> = {
  forearm: "ท่อนแขน",
  hand: "มือ",
  face: "ใบหน้า",
  eye: "ดวงตา",
};

const STATUS_COLOR: Record<string, string> = {
  queued: "text-ink2/65",
  running: "text-amber-300",
  completed: "text-emerald-400",
  failed: "text-rose-400",
};

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
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <nav className="flex gap-4 text-sm mb-3">
        <a href="/" className="text-ink2/65 hover:text-brand">หน้าแรก</a>
        <a href="/assess" className="text-ink2/65 hover:text-brand">ประเมิน</a>
        <a href="/skin-viewer" className="text-ink2/65 hover:text-brand">โมเดลผิว 3D</a>
        <a href="/history" className="text-brand">ประวัติ</a>
        <a href="/models" className="text-ink2/65 hover:text-brand">โมเดล &amp; ความน่าเชื่อถือ</a>
      </nav>

      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">ประวัติการประเมิน</h1>
          <p className="text-xs text-ink2/55 mt-1">รายการงานประเมินทั้งหมด เรียงจากใหม่ไปเก่า</p>
        </div>
        <label className="text-xs text-ink2/65 flex items-center gap-2">
          โครงการ:
          <select
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            className="bg-elevated border border-border rounded px-2 py-1.5 text-sm text-gray-200"
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

      {loading && <p className="text-sm text-ink2/55">กำลังโหลด…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-ink2/55">
          ยังไม่มีประวัติ — ไปที่หน้า{" "}
          <a href="/assess" className="text-brand hover:underline">ประเมิน</a> เพื่อเริ่ม
        </p>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-panel text-xs text-ink2/55 text-left">
              <tr>
                <th className="py-2 px-3">รหัสงาน</th>
                <th className="py-2 px-3">บริเวณ</th>
                <th className="py-2 px-3">จำนวนสาร</th>
                <th className="py-2 px-3">โครงการ</th>
                <th className="py-2 px-3">สถานะ</th>
                <th className="py-2 px-3">วันที่</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-panel/50">
                  <td className="py-2 px-3 font-mono text-xs">{r.id.slice(0, 8)}</td>
                  <td className="py-2 px-3">{REGION_LABEL_TH[r.region] ?? r.region}</td>
                  <td className="py-2 px-3">{r.n_substances}</td>
                  <td className="py-2 px-3 text-ink2/65">{projectName(r.project_id)}</td>
                  <td className={`py-2 px-3 font-mono ${STATUS_COLOR[r.status] ?? ""}`}>
                    {r.status}
                  </td>
                  <td className="py-2 px-3 text-ink2/65 text-xs">
                    {new Date(r.created_at).toLocaleString("th-TH")}
                  </td>
                  <td className="py-2 px-3">
                    <a
                      href={`/assess?job=${r.id}`}
                      className="text-brand hover:underline text-xs"
                    >
                      ดูผล →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
