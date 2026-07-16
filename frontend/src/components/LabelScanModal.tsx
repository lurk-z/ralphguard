"use client";

/**
 * LabelScanModal — a popup "scanner" for reading an ingredient-label photo.
 * Upload → laser/grid scan animation over the image → verdict (usable / not) →
 * list of recognized substances → import into the formula. Uses the same
 * /api/ocr backend (offline dict + PubChem).
 */
import { useRef, useState } from "react";

type Item = { name: string; smiles: string; concentration: number; score: number; source: string };
type Result = {
  raw_text: string;
  items: Item[];
  recognized_no_structure: string[];
  unmatched: string[];
};
type Phase = "idle" | "scanning" | "done";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function LabelScanModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (items: Item[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const scan = async (file: File) => {
    setError(null);
    setResult(null);
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(file);
    });
    setPhase("scanning");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const fd = new FormData();
      fd.append("file", file);
      // keep the scan animation on screen for at least ~1.4s
      const [r] = await Promise.all([
        fetch(`${API}/api/ocr/`, { method: "POST", body: fd }),
        wait(1400),
      ]);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.detail || `HTTP ${r.status}`);
      }
      setResult(await r.json());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPhase("done");
    }
  };

  const onPick = (f?: File) => {
    if (f) scan(f);
  };

  // verdict
  const items = result?.items ?? [];
  const known = result?.recognized_no_structure ?? [];
  const usable = !error && (items.length > 0 || known.length >= 2);
  const noText = !error && (result?.raw_text?.trim().length ?? 0) < 8;
  const reason = error
    ? "เกิดข้อผิดพลาด: " + error
    : noText
      ? "อ่านตัวอักษรจากรูปไม่ได้ — รูปอาจเบลอ มืด หรือไม่มีข้อความ"
      : "ไม่พบรายการส่วนผสมที่รู้จักในรูป — ลองถ่ายด้านที่มีหัวข้อ Ingredients / Ingredienti";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <style>{`
        @keyframes oc-laser { 0%{top:0} 100%{top:100%} }
        @keyframes oc-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
      `}</style>

      <div
        className="w-[min(94vw,560px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            📷 อ่านฉลากส่วนผสมจากรูป
          </div>
          <button onClick={close} className="grid size-6 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="p-5">
          {/* IDLE — upload zone */}
          {phase === "idle" && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-12 text-slate-500 transition hover:border-brand hover:bg-teal-50/50"
            >
              <span className="text-3xl">🖼️</span>
              <span className="text-sm font-medium text-slate-700">คลิกเพื่อเลือกรูปฉลาก</span>
              <span className="text-xs text-slate-400">รองรับ JPG / PNG · ถ่ายด้านที่มีรายการส่วนผสม</span>
            </button>
          )}

          {/* SCANNING / DONE — image with scanner overlay */}
          {phase !== "idle" && preview && (
            <div className="relative mx-auto max-h-[46vh] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="label" className="mx-auto max-h-[46vh] w-auto object-contain" />

              {phase === "scanning" && (
                <>
                  {/* grid */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(45,212,191,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.28) 1px, transparent 1px)",
                      backgroundSize: "26px 26px",
                    }}
                  />
                  {/* corner brackets */}
                  {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "left-2 bottom-2 border-l-2 border-b-2", "right-2 bottom-2 border-r-2 border-b-2"].map((c) => (
                    <span key={c} className={`pointer-events-none absolute size-6 border-brand ${c}`} />
                  ))}
                  {/* laser line */}
                  <div
                    className="pointer-events-none absolute inset-x-0 h-[3px] bg-brand shadow-[0_0_14px_4px_rgba(45,212,191,0.8)]"
                    style={{ animation: "oc-laser 1.3s ease-in-out infinite alternate" }}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-900/70 py-1.5 text-center text-xs font-medium text-brand"
                    style={{ animation: "oc-pulse 1s ease-in-out infinite" }}
                  >
                    ⏳ กำลังสแกนและอ่านส่วนผสม…
                  </div>
                </>
              )}

              {phase === "done" && (
                <div
                  className={`absolute inset-x-0 bottom-0 px-3 py-2 text-center text-sm font-semibold text-white ${
                    usable ? "bg-emerald-600/90" : "bg-rose-600/90"
                  }`}
                >
                  {usable ? "✓ รูปนี้ใช้งานได้" : "✗ รูปนี้ใช้ไม่ได้"}
                </div>
              )}
            </div>
          )}

          {/* DONE — details */}
          {phase === "done" && (
            <div className="mt-4">
              {usable ? (
                <>
                  <div className="mb-1.5 text-xs font-medium text-slate-600">
                    พบสารที่ประเมินได้ {items.length} รายการ
                    {(() => {
                      const p = items.filter((i) => i.source === "pubchem").length;
                      return p ? ` (คลังในระบบ ${items.length - p} · PubChem ${p})` : "";
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((it) => (
                      <span
                        key={it.smiles}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                        title={it.smiles}
                      >
                        <span className="text-brand">◇</span>
                        {it.name} · {it.concentration}%
                        {it.source === "pubchem" && <span className="text-[9px] text-amber-600">PubChem</span>}
                      </span>
                    ))}
                  </div>
                  {known.length > 0 && (
                    <div className="mt-2 text-[10px] leading-snug text-slate-400">
                      ข้าม (ไม่มีโครงสร้างเดี่ยว): {known.join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">
                  {reason}
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          {phase === "done" && (
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              เลือกรูปใหม่
            </button>
          )}
          {phase === "done" && usable && (
            <button
              onClick={() => {
                onImport(items);
                close();
              }}
              className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
            >
              ＋ เพิ่มเข้าสูตร
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
