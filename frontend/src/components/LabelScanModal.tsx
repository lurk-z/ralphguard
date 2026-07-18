"use client";

/**
 * LabelScanModal — a popup "scanner" for reading an ingredient-label photo.
 * Upload → laser/grid scan animation over the image → verdict (usable / not) →
 * list of recognized substances → import into the formula. Uses the same
 * /api/ocr backend (offline dict + PubChem) as /assess's scanner.
 */
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileImage,
  LoaderCircle,
  Plus,
  RefreshCw,
  ScanLine,
  UploadCloud,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, type OcrItem, type OcrResult } from "@/lib/api";

type Phase = "idle" | "scanning" | "done";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function LabelScanModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (items: OcrItem[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setError(null);
    setDragActive(false);
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
      // Keep the scan animation on screen for at least ~1.4s — OCR usually
      // resolves faster than that, and a flash-then-verdict reads as broken.
      const [r] = await Promise.all([api.ocr(file), wait(1400)]);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("done");
    }
  };

  const onPick = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("ไฟล์มีขนาดเกิน 10 MB กรุณาลดขนาดรูปแล้วลองอีกครั้ง");
      return;
    }
    scan(f);
  };

  // verdict
  const items = result?.items ?? [];
  const known = result?.recognized_no_structure ?? [];
  const usable = !error && (items.length > 0 || known.length >= 2);
  const noText = !error && (result?.raw_text?.trim().length ?? 0) < 8;
  const reason = error
    ? /failed to fetch|networkerror|network request failed/i.test(error)
      ? "เชื่อมต่อระบบอ่านฉลากไม่ได้ กรุณาตรวจสอบว่า Backend กำลังทำงาน แล้วลองอีกครั้ง"
      : `ระบบอ่านฉลากไม่สำเร็จ: ${error}`
    : noText
      ? "อ่านตัวอักษรจากรูปไม่ได้ — รูปอาจเบลอ มืด หรือไม่มีข้อความ"
      : "ไม่พบรายการส่วนผสมที่รู้จักในรูป — ลองถ่ายด้านที่มีหัวข้อ Ingredients / Ingredienti";

  return (
    <div
      className="ocr-backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <style>{`
        @keyframes ocr-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ocr-card-in {
          from { opacity: 0; transform: translateY(12px) scale(.975); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes oc-laser { 0%{top:0} 100%{top:100%} }
        @keyframes oc-progress { 0%{transform:translateX(-120%)} 100%{transform:translateX(260%)} }
        .ocr-backdrop-in {
          animation: ocr-backdrop-in 180ms ease-out both;
        }
        .ocr-card-in {
          animation: ocr-card-in 240ms cubic-bezier(.22, 1, .36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .ocr-backdrop-in,
          .ocr-card-in,
          .ocr-motion { animation: none !important; }
        }
      `}</style>

      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-dialog-title"
        className="ocr-card-in max-h-[92vh] w-[min(94vw,640px)] gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white py-0 shadow-[0_24px_80px_rgba(15,23,42,0.32)] ring-0"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-3 rounded-none border-b border-slate-200 px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
              <ScanLine className="size-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle id="ocr-dialog-title" className="text-base font-bold leading-normal text-slate-900">
                อ่านฉลากส่วนผสมจากรูป
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs text-slate-500">
                ระบบจะค้นหาชื่อสารและจับคู่กับโครงสร้างทางเคมี
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิดหน้าต่างอ่านฉลาก"
            onClick={close}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </CardHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.currentTarget.value = "";
          }}
        />

        <CardContent className="min-h-0 flex-1 overflow-y-auto p-6">
          {phase === "idle" && (
            <>
              <div
                role="button"
                tabIndex={0}
                aria-label="เลือกหรือลากรูปฉลากส่วนผสมมาวาง"
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  onPick(e.dataTransfer.files?.[0]);
                }}
                className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-600/40 ${
                  dragActive
                    ? "border-cyan-500 bg-cyan-50"
                    : "border-slate-300 bg-slate-50/70 hover:border-cyan-400 hover:bg-cyan-50/50"
                }`}
              >
                <span className="grid size-14 place-items-center rounded-2xl border border-cyan-100 bg-white text-cyan-700 shadow-sm">
                  <UploadCloud className="size-7" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-bold text-slate-900">เลือกภาพฉลากส่วนผสม</p>
                <p className="mt-1 text-xs text-slate-500">คลิกเพื่อเลือกไฟล์ หรือลากรูปมาวางที่นี่</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                  <FileImage className="size-3.5" aria-hidden="true" />
                  JPG, PNG หรือ WEBP · ไม่เกิน 10 MB
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-start gap-3">
                  <Camera className="mt-0.5 size-4 shrink-0 text-cyan-700" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">เพื่อผลการอ่านที่แม่นยำ</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      ถ่ายภาพให้ตรง มีแสงเพียงพอ และเห็นหัวข้อ Ingredients พร้อมรายชื่อส่วนผสมชัดเจน
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div role="alert" className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>{error}</p>
                </div>
              )}
            </>
          )}

          {phase !== "idle" && preview && (
            <div className="relative mx-auto flex max-h-[38vh] min-h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="ภาพฉลากที่เลือก" className="max-h-[38vh] w-auto object-contain" />

              {phase === "scanning" && (
                <>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(8,145,178,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(8,145,178,0.18) 1px, transparent 1px)",
                      backgroundSize: "28px 28px",
                    }}
                  />
                  {["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "left-3 bottom-3 border-l-2 border-b-2", "right-3 bottom-3 border-r-2 border-b-2"].map((c) => (
                    <span key={c} className={`pointer-events-none absolute size-7 border-cyan-600 ${c}`} />
                  ))}
                  <div
                    className="ocr-motion pointer-events-none absolute inset-x-0 h-0.5 bg-cyan-500 shadow-[0_0_16px_5px_rgba(6,182,212,0.65)]"
                    style={{ animation: "oc-laser 1.3s ease-in-out infinite alternate" }}
                  />
                </>
              )}
            </div>
          )}

          {phase === "scanning" && (
            <div role="status" aria-live="polite" className="mt-4 overflow-hidden rounded-xl border border-cyan-200 bg-cyan-50/70">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-100">
                  <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-cyan-950">กำลังวิเคราะห์ภาพฉลาก</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-cyan-800/80">
                    ตรวจจับตัวอักษรและจับคู่รายชื่อกับคลังโครงสร้างทางเคมี
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-cyan-700 ring-1 ring-cyan-100">
                  ขั้นตอน 2/3
                </span>
              </div>
              <div className="h-1 overflow-hidden bg-cyan-100">
                <div
                  className="ocr-motion h-full w-2/5 rounded-full bg-cyan-600"
                  style={{ animation: "oc-progress 1.25s ease-in-out infinite" }}
                />
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="mt-4">
              {usable ? (
                <>
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-emerald-900">อ่านฉลากสำเร็จ</p>
                      <p className="mt-0.5 text-xs text-emerald-700">
                        พบสารที่นำไปประเมินได้ {items.length} รายการ
                        {(() => {
                          const p = items.filter((i) => i.source === "pubchem").length;
                          return p ? ` · คลังในระบบ ${items.length - p} · PubChem ${p}` : "";
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex flex-wrap gap-2">
                      {items.map((it) => (
                        <span
                          key={it.smiles}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm"
                          title={it.smiles}
                        >
                          <span className="size-1.5 rounded-full bg-cyan-600" aria-hidden="true" />
                          {it.name}
                          <span className="font-semibold text-cyan-700">{it.concentration}%</span>
                          {it.source === "pubchem" && (
                            <span className="rounded bg-amber-50 px-1 text-[9px] text-amber-700">PubChem</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {known.length > 0 && (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
                      ไม่ได้นำเข้ารายการที่ไม่มีโครงสร้างโมเลกุลเดี่ยว: {known.join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-rose-900">ยังอ่านฉลากจากรูปนี้ไม่ได้</p>
                    <p className="mt-1 text-xs leading-relaxed text-rose-700">{reason}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {phase === "done" && (
          <CardFooter className="flex shrink-0 items-center justify-between gap-3 rounded-none border-t border-slate-200 bg-slate-50/70 px-6 py-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              เลือกรูปใหม่
            </button>
            {usable && (
              <button
                type="button"
                onClick={() => {
                  onImport(items);
                  close();
                }}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-cyan-700 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                เพิ่ม {items.length} รายการเข้าสูตร
              </button>
            )}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
