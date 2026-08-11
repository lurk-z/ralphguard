"use client";

import { useEffect, useRef, useState } from "react";
import { SemanticIcon } from "@/components/SemanticIcon";
import { api, substanceDepictionUrl, type FormulaItem } from "@/lib/api";
import { isWaterItem, resolveCatalogSubstance } from "@/lib/catalog";
import {
  assertNoDuplicateFormulaRows,
  parseFormulaCsv,
  type ParsedFormulaCsvRow,
} from "@/lib/formula-csv";

const SAMPLE_CSV = [
  "name,smiles,concentration",
  "Ethanol,CCO,10",
  "Glycerin,OCC(O)CO,5",
].join("\r\n");

type CsvPreviewItem = FormulaItem & { line: number };

function CsvSubstanceThumbnail({ name, smiles }: { name?: string; smiles: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [smiles]);

  return (
    <span
      aria-hidden="true"
      title={name || smiles}
      className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      {smiles.trim() && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={substanceDepictionUrl(smiles)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-contain p-0.5"
        />
      ) : (
        <SemanticIcon name="flask" className="size-4 text-slate-400" />
      )}
    </span>
  );
}

export default function CsvImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (items: FormulaItem[], fileName: string) => boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<CsvPreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (open) return;
    requestIdRef.current += 1;
    setBusy(false);
    setFileName("");
    setItems([]);
    setError(null);
  }, [open]);

  if (!open) return null;

  const reset = () => {
    requestIdRef.current += 1;
    setBusy(false);
    setFileName("");
    setItems([]);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const downloadSample = () => {
    const blob = new Blob(["\uFEFF", SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ralphguard-formula-example.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file: File) => {
    const requestId = ++requestIdRef.current;
    setBusy(true);
    setFileName(file.name);
    setItems([]);
    setError(null);
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("กรุณาเลือกไฟล์นามสกุล .csv");
      }
      const parsed = parseFormulaCsv(await file.text());
      const resolved = parsed.map((row) => {
        const catalogHit = row.name ? resolveCatalogSubstance(row.name) : undefined;
        return {
          ...row,
          name: catalogHit?.name || row.name,
          smiles: row.smiles || catalogHit?.smiles || "",
          suppliedSmiles: row.smiles,
        };
      });
      const validated = await Promise.all(
        resolved.map(async (item) => {
          if (!item.suppliedSmiles) return item;
          const validation = await api.validateSmiles(item.suppliedSmiles);
          if (!validation.valid) {
            throw new Error(`แถว ${item.line}: SMILES ของ ${item.name || "สาร"} ไม่ถูกต้อง`);
          }
          return { ...item, smiles: validation.canonical || item.suppliedSmiles };
        }),
      );
      if (requestId !== requestIdRef.current) return;
      const normalizedRows: ParsedFormulaCsvRow[] = validated.map(
        ({ line, name, smiles, concentration }) => ({ line, name, smiles, concentration }),
      );
      assertNoDuplicateFormulaRows(normalizedRows);
      const previewItems = normalizedRows.filter((item) => !isWaterItem(item));
      if (!previewItems.length) {
        throw new Error("CSV ต้องมีสารอย่างน้อย 1 รายการที่ไม่ใช่น้ำ");
      }
      setItems(previewItems);
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      setError(cause instanceof Error ? cause.message : "อ่านไฟล์ CSV ไม่สำเร็จ");
    } finally {
      if (requestId === requestIdRef.current) setBusy(false);
    }
  };

  const total = items.reduce((sum, item) => sum + item.concentration, 0);
  const unresolved = items.filter((item) => !item.smiles.trim()).length;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-900/30 p-3 backdrop-blur-sm animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        className={`my-auto flex max-h-[calc(100dvh-1.5rem)] w-full animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none sm:max-h-[calc(100dvh-2rem)] ${items.length ? "max-w-[860px]" : "max-w-[640px]"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-brand">
            <SemanticIcon name="file-spreadsheet" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="csv-import-title" className="text-sm font-semibold text-slate-800">นำเข้าส่วนผสมจาก CSV</h2>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              เลือกไฟล์ ตรวจสอบรายการ แล้วจึงยืนยันนำเข้าสูตร
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <SemanticIcon name="x" className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="min-w-0 text-[11px] leading-4 text-slate-500">
              คอลัมน์ที่ใช้: <span className="font-medium text-slate-700">name, smiles, concentration</span>
            </div>
            <button
              type="button"
              onClick={downloadSample}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 transition-colors hover:border-brand/40 hover:text-brand"
            >
              <SemanticIcon name="download" className="size-3.5" />
              ดาวน์โหลด CSV ตัวอย่าง
            </button>
          </div>

          {!items.length && !busy && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-white px-4 text-slate-500 transition-colors hover:border-brand hover:bg-teal-50/40 focus:outline-none focus:ring-2 focus:ring-brand/20 sm:min-h-52 sm:px-6"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-teal-50 text-brand">
                <SemanticIcon name="upload" className="size-5" />
              </span>
              <span className="mt-1 text-sm font-semibold text-slate-700">เลือกไฟล์ CSV</span>
              <span className="text-[11px] text-slate-400">รองรับสูงสุด 20 รายการ · ขนาดไม่เกิน 1 MB</span>
            </button>
          )}

          {busy && (
            <div className="grid min-h-40 place-items-center rounded-xl border border-slate-200 bg-slate-50 sm:min-h-52">
              <div className="text-center">
                <span className="mx-auto grid size-10 animate-pulse place-items-center rounded-xl bg-teal-50 text-brand motion-reduce:animate-none">
                  <SemanticIcon name="file-spreadsheet" className="size-5" />
                </span>
                <div className="mt-3 text-sm font-semibold text-slate-700">กำลังตรวจสอบ CSV</div>
                <div className="mt-1 text-[11px] text-slate-400">ตรวจชื่อสาร SMILES และความเข้มข้น</div>
              </div>
            </div>
          )}

          {error && !busy && (
            <div className="mt-3 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
              <SemanticIcon name="circle-alert" className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!!items.length && !busy && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-semibold text-slate-700">{fileName}</h3>
                  <p className="mt-0.5 text-[10px] text-slate-400">ตรวจสอบรายการก่อนยืนยันนำเข้า</p>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="rounded-lg bg-teal-50 px-2 py-1 font-medium text-teal-700">{items.length} สาร</span>
                  <span className="rounded-lg bg-slate-50 px-2 py-1 font-medium tabular-nums text-slate-600">รวม {Math.round(total * 100) / 100}%</span>
                </div>
              </div>

              {unresolved > 0 && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-800">
                  <SemanticIcon name="circle-alert" className="mt-0.5 size-3.5 shrink-0" />
                  <span>{unresolved} สารยังไม่มี SMILES และจะไม่ถูกส่งเข้า QSAR</span>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[36px_minmax(0,1fr)_90px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span />
                  <span>สารที่อ่านได้</span>
                  <span className="text-right">ความเข้มข้น</span>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {items.map((item, index) => (
                    <div
                      key={`${item.line}-${item.smiles}-${item.name}`}
                      className="grid grid-cols-[36px_minmax(0,1fr)_90px] items-center gap-2 border-t border-slate-100 px-3 py-2.5"
                    >
                      <CsvSubstanceThumbnail name={item.name} smiles={item.smiles} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-medium tabular-nums text-slate-400">{index + 1}.</span>
                          <span className="truncate text-xs font-semibold text-slate-700">{item.name || "ไม่ระบุชื่อ"}</span>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400" title={item.smiles || "ไม่มี SMILES"}>
                          {item.smiles || "ไม่มี SMILES"}
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs font-semibold tabular-nums text-slate-700">
                        {item.concentration}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void readFile(file);
            }}
          />
          <button
            type="button"
            onClick={close}
            className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          {(fileName || error) && !busy && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              เลือกไฟล์ใหม่
            </button>
          )}
          {!fileName && !error && !busy && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              เลือกไฟล์ CSV
            </button>
          )}
          {busy && (
            <button type="button" disabled className="h-9 cursor-wait rounded-lg bg-brand px-4 text-sm font-semibold text-white opacity-60">
              กำลังตรวจสอบ…
            </button>
          )}
          {!!items.length && !busy && (
            <button
              type="button"
              onClick={() => {
                const imported = items.map(({ name, smiles, concentration }) => ({
                  name,
                  smiles,
                  concentration,
                }));
                if (onImport(imported, fileName)) close();
              }}
              className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              ยืนยันและนำเข้าสูตร
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
