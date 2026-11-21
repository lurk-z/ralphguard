"use client";

import { useEffect, useState } from "react";
import { loadRevisionBrief, type RevisionBrief } from "@/lib/lab-station/revision";

/**
 * Findings the user carried from the Ralph Lab testing station into this formula draft.
 * Read-only reminder; the tested formula and its results are untouched elsewhere.
 */
export default function RevisionBriefNote({ projectId, formulaId }: { projectId: number | null; formulaId: string }) {
  const [brief, setBrief] = useState<RevisionBrief | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setBrief(projectId && formulaId ? loadRevisionBrief(projectId, formulaId) : null);
    setOpen(true);
  }, [projectId, formulaId]);
  if (!brief) return null;
  return (
    <div className="fixed bottom-4 left-4 z-40 w-[min(340px,calc(100vw-2rem))] rounded-xl bg-white/95 text-slate-700 shadow-lg ring-1 ring-slate-200">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>ข้อค้นพบจากห้องแล็บ ({brief.findings.length})</span>
        <span className="ml-auto text-slate-400">{open ? "ย่อ" : "ดู"}</span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-slate-100 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            ฉบับแก้ไขจาก {brief.sourceFormulaName} · งานประเมิน{" "}
            <span className="font-mono">{brief.sourceAssessmentId.slice(0, 8)}</span> (สูตรเดิมและผลเดิมไม่ถูกเปลี่ยน)
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] leading-snug">
            {brief.findings.map((f) => (
              <li key={f.id}>• {f.textTh}</li>
            ))}
            {brief.findings.length === 0 && <li className="text-slate-400">ไม่ได้เลือกข้อค้นพบ</li>}
          </ul>
          <p className="text-[10px] text-slate-400">แก้ไขสูตรแล้วกดประเมินเพื่อสร้างผลใหม่ของฉบับนี้</p>
        </div>
      )}
    </div>
  );
}
