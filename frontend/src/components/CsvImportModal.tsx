"use client";

/**
 * CsvImportModal — แสดงขึ้นมาเมื่อกดปุ่ม CSV ในกล่องสูตร
 * อัปโหลด CSV → parse + validate → แสดงรายการพร้อมลบทีละรายการ → ยืนยันเพิ่มเข้าสูตร
 */
import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export type CsvImportItem = {
  name: string;
  chemicalId: string;
  concentration: number;
};

type Phase = "idle" | "loading" | "preview" | "error";

export default function CsvImportModal({
  open,
  onClose,
  onConfirm,
  onParseFile,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: CsvImportItem[]) => void;
  onParseFile: (file: File) => Promise<CsvImportItem[]>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<CsvImportItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setPhase("idle");
    setItems([]);
    setErrorMsg(null);
    setDragActive(false);
  };

  const close = () => { reset(); onClose(); };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMsg("รองรับเฉพาะไฟล์นามสกุล .csv");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setErrorMsg(null);
    try {
      const parsed = await onParseFile(file);
      setItems(parsed);
      setPhase("preview");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "นำเข้า CSV ไม่สำเร็จ");
      setPhase("error");
    }
  };

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleConfirm = () => { onConfirm(items); close(); };

  return (
    <div
      className="csv-backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <style>{`
        @keyframes csv-backdrop-in { from{opacity:0} to{opacity:1} }
        @keyframes csv-card-in { from{opacity:0;transform:translateY(12px) scale(.975)} to{opacity:1;transform:translateY(0) scale(1)} }
        .csv-backdrop-in{animation:csv-backdrop-in 180ms ease-out both}
        .csv-card-in{animation:csv-card-in 240ms cubic-bezier(.22,1,.36,1) both}
        @media(prefers-reduced-motion:reduce){.csv-backdrop-in,.csv-card-in{animation:none!important}}
      `}</style>

      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-dialog-title"
        className="csv-card-in max-h-[92vh] w-[min(94vw,600px)] gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white py-0 shadow-[0_24px_80px_rgba(15,23,42,0.32)] ring-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <CardHeader className="flex shrink-0 flex-row items-start justify-between gap-3 rounded-none border-b border-slate-200 px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <FileSpreadsheet className="size-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle id="csv-dialog-title" className="text-base font-bold leading-normal text-slate-900">
                อ่านฉลากส่วนผสมจากไฟล์ CSV
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs text-slate-500">
                นำเข้าชื่อสาร, SMILES และความเข้มข้นจากไฟล์ .csv
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิดหน้าต่างนำเข้า CSV"
            onClick={close}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </CardHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file) void handleFile(file);
          }}
        />

        {/* Body */}
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-6">

          {/* Idle / Error: drop zone */}
          {(phase === "idle" || phase === "error") && (
            <>
              <div
                role="button"
                tabIndex={0}
                aria-label="เลือกหรือลากไฟล์ CSV มาวาง"
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFile(file);
                }}
                className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600/40 ${
                  dragActive
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-300 bg-slate-50/70 hover:border-emerald-400 hover:bg-emerald-50/50"
                }`}
              >
                <span className="grid size-14 place-items-center rounded-2xl border border-emerald-100 bg-white text-emerald-700 shadow-sm">
                  <UploadCloud className="size-7" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-bold text-slate-900">เลือกไฟล์ CSV</p>
                <p className="mt-1 text-xs text-slate-500">คลิกเพื่อเลือกไฟล์ หรือลากมาวางที่นี่</p>
              </div>

              {/* Info + example link */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700">รูปแบบ CSV ที่รองรับ</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">name, smiles, concentration</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      แต่ละแถวคือสารหนึ่งชนิด · ความเข้มข้นเป็น % (0–100)
                    </p>
                  </div>
                  <a
                    href="/formula-example.csv"
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    <Download className="size-3" aria-hidden="true" />
                    ไฟล์ตัวอย่าง
                  </a>
                </div>
              </div>

              {phase === "error" && errorMsg && (
                <div role="alert" className="mt-4 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>{errorMsg}</p>
                </div>
              )}
            </>
          )}

          {/* Loading */}
          {phase === "loading" && (
            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-14">
              <LoaderCircle className="size-8 animate-spin text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700">กำลังตรวจสอบไฟล์…</p>
            </div>
          )}

          {/* Preview list */}
          {phase === "preview" && (
            <>
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-emerald-900">อ่านไฟล์สำเร็จ</p>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    พบ {items.length} รายการ · กดไอคอนถังขยะเพื่อลบรายการที่ไม่ต้องการ
                  </p>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">ไม่มีรายการเหลืออยู่</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {items.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800">{item.name}</span>
                          <span className="block truncate font-mono text-[10px] text-slate-400">{item.chemicalId}</span>
                        </span>
                        <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          {item.concentration}%
                        </span>
                        <button
                          type="button"
                          aria-label={`ลบ ${item.name} ออกจากรายการ`}
                          onClick={() => removeItem(idx)}
                          className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>

        {/* Footer */}
        {phase === "preview" && (
          <CardFooter className="flex shrink-0 items-center justify-between gap-3 rounded-none border-t border-slate-200 bg-slate-50/70 px-6 py-4">
            <button
              type="button"
              onClick={() => { reset(); setTimeout(() => fileRef.current?.click(), 50); }}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
            >
              เลือกไฟล์ใหม่
            </button>
            <button
              type="button"
              disabled={items.length === 0}
              onClick={handleConfirm}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              ยืนยันเพิ่ม {items.length} รายการเข้าสูตร
            </button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
