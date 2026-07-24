"use client";

import { useEffect, useRef, useState } from "react";
import { SemanticIcon } from "@/components/SemanticIcon";
import SubstanceHoverCard from "@/components/SubstanceHoverCard";

export type ScannedItem = {
  name: string;
  smiles: string;
  concentration: number;
  score: number;
  source: string;
};

type OcrItem = Omit<ScannedItem, "concentration"> & {
  concentration: number | null;
  ocr_confidence?: number | null;
  requires_concentration?: boolean;
};

type EditableItem = OcrItem & { selected: boolean };

type NonQsarItem = {
  name: string;
  recognized: boolean;
  resolved: boolean;
  structure_available: boolean;
  canonical_smiles?: string | null;
  pubchem_cid?: number | null;
  substance_type: string;
  structure_status: string;
  qsar_eligible: false;
  assessment_method: string;
  reason_code: string;
  reason_th: string;
  verification_status: string;
};

type RegistryCandidate = {
  id: number;
  inci_name?: string | null;
  canonical_name: string;
  cas_number?: string | null;
  pubchem_cid?: number | null;
  canonical_smiles?: string | null;
  inchikey?: string | null;
  molecular_formula?: string | null;
  molecular_weight?: number | null;
  substance_type: string;
  structure_status: string;
  qsar_eligible: false;
  assessment_method: string;
  verification_status: string;
  observation_count: number;
  reason_code?: string | null;
  reason_th?: string | null;
};

type Result = {
  raw_text: string;
  consensus_text?: string | null;
  items: OcrItem[];
  recognized_no_structure: string[];
  non_qsar_items?: NonQsarItem[];
  registry_candidates?: RegistryCandidate[];
  registry_warning?: string | null;
  unmatched: string[];
  ocr_confidence?: number | null;
  ocr_passes?: number;
  preprocessing_variants?: string[];
  selected_variant?: string | null;
  selected_psm?: number | null;
  concentration_notice_th?: string;
};

export type ScanImportContext = {
  recognizedNoStructure: string[];
  unmatched: string[];
  unselected: string[];
};

type Phase = "idle" | "scanning" | "done";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function LabelScanModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (items: ScannedItem[], context: ScanImportContext) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [drafts, setDrafts] = useState<EditableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanControllerRef = useRef<AbortController | null>(null);
  const scanRequestIdRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const abortActiveScan = () => {
    scanRequestIdRef.current += 1;
    scanControllerRef.current?.abort();
    scanControllerRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      scanRequestIdRef.current += 1;
      scanControllerRef.current?.abort();
      scanControllerRef.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      scanRequestIdRef.current += 1;
      scanControllerRef.current?.abort();
      scanControllerRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  if (!open) return null;

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setDrafts([]);
    setError(null);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
  };

  const close = () => {
    abortActiveScan();
    reset();
    onClose();
  };

  const scan = async (file: File) => {
    abortActiveScan();
    if (file.size > 10 * 1024 * 1024) {
      setResult(null);
      setDrafts([]);
      setError("ไฟล์ภาพต้องมีขนาดไม่เกิน 10 MB");
      setPhase("done");
      return;
    }
    setError(null);
    setResult(null);
    setDrafts([]);
    const requestId = ++scanRequestIdRef.current;
    const controller = new AbortController();
    scanControllerRef.current = controller;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setPreview(previewUrlRef.current);
    setPhase("scanning");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const form = new FormData();
      form.append("file", file);
      const [response] = await Promise.all([
        fetch(`${API}/api/ocr/`, { method: "POST", body: form, signal: controller.signal }),
        wait(900),
      ]);
      if (requestId !== scanRequestIdRef.current || controller.signal.aborted) return;
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.detail || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as Result;
      if (requestId !== scanRequestIdRef.current || controller.signal.aborted) return;
      setResult(data);
      setDrafts(data.items.map((item) => ({ ...item, concentration: null, selected: true })));
    } catch (cause: any) {
      if (cause?.name === "AbortError" || requestId !== scanRequestIdRef.current) return;
      setError(cause?.message || String(cause));
    } finally {
      if (requestId === scanRequestIdRef.current && !controller.signal.aborted) {
        scanControllerRef.current = null;
        setPhase("done");
      }
    }
  };

  const selected = drafts.filter((item) => item.selected);
  const missingConcentration = selected.some(
    (item) => item.concentration == null || !Number.isFinite(item.concentration) || item.concentration <= 0,
  );
  const total = selected.reduce((sum, item) => sum + (Number(item.concentration) || 0), 0);
  const canImport = selected.length > 0 && !missingConcentration && total <= 100;
  const noText = !error && (result?.raw_text?.trim().length ?? 0) < 8;
  const usable = !error && drafts.length > 0;

  const patchDraft = (index: number, patch: Partial<EditableItem>) =>
    setDrafts((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <style>{`
        @keyframes ocr-laser { 0%{top:0} 100%{top:100%} }
        @keyframes ocr-pulse { 0%,100%{opacity:.55} 50%{opacity:1} }
      `}</style>
      <div
        className="flex max-h-[92vh] w-[min(96vw,760px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><SemanticIcon name="camera" className="size-4" /> อ่านรายการส่วนผสมจากฉลาก</div>
            <div className="mt-0.5 text-[10px] text-slate-400">OCR → ตรวจชื่อสาร → ยืนยันความเข้มข้นก่อนประเมิน</div>
          </div>
          <button onClick={close} aria-label="ปิด" className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><SemanticIcon name="x" className="size-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {phase === "idle" && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-14 text-slate-500 transition hover:border-brand hover:bg-teal-50/50"
            >
              <SemanticIcon name="image" className="size-10" />
              <span className="text-sm font-semibold text-slate-700">เลือกรูปฉลาก Ingredients</span>
              <span className="text-xs text-slate-400">JPG, PNG, WebP หรือ TIFF · ไม่เกิน 10 MB</span>
            </button>
          )}

          {phase !== "idle" && preview && (
            <div className="relative mx-auto max-h-64 overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="ฉลากที่สแกน" className="mx-auto max-h-64 w-auto object-contain" />
              {phase === "scanning" && (
                <>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(45,212,191,.25) 1px,transparent 1px),linear-gradient(90deg,rgba(45,212,191,.25) 1px,transparent 1px)",
                      backgroundSize: "24px 24px",
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 h-[3px] bg-brand shadow-[0_0_14px_4px_rgba(45,212,191,.8)]"
                    style={{ animation: "ocr-laser 1.2s ease-in-out infinite alternate" }}
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 bg-slate-950/75 py-2 text-center text-xs font-medium text-teal-300"
                    style={{ animation: "ocr-pulse 1s ease-in-out infinite" }}
                  >
                    กำลังสร้างภาพหลายแบบ อ่านหลายรอบ และรวมผลแบบ consensus…
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "done" && error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              อ่านฉลากไม่สำเร็จ: {error}
            </div>
          )}

          {phase === "done" && !error && !usable && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {noText
                ? "ไม่พบข้อความที่อ่านได้ ลองถ่ายใหม่ให้ตัวอักษรคมชัดและไม่สะท้อนแสง"
                : "อ่านข้อความได้ แต่ยังจับคู่กับสารที่มีโครงสร้างเดี่ยวไม่ได้"}
            </div>
          )}

          {phase === "done" && usable && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  พบ {drafts.length} สารที่ประเมินได้
                </span>
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                  รู้จักรวม {drafts.length + (result?.recognized_no_structure?.length ?? 0)} สาร
                </span>
                {result?.ocr_confidence != null && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                    ความชัด OCR ดิบ {Math.round(result.ocr_confidence)}%
                  </span>
                )}
                {(result?.ocr_passes ?? 0) > 1 && (
                  <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] text-cyan-700">
                    อ่าน {result!.ocr_passes} รอบ · {result?.preprocessing_variants?.length ?? 1} แบบภาพ
                  </span>
                )}
                {(result?.recognized_no_structure?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] text-violet-700">
                    รู้จักแล้ว · ใช้วิธีอื่น {result!.recognized_no_structure.length} สาร
                  </span>
                )}
                {(result?.registry_candidates?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
                    PubChem candidate รอตรวจ {result!.registry_candidates!.length} สาร
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                <b>ต้องยืนยันความเข้มข้น:</b> ฉลากบอกลำดับส่วนผสม แต่ไม่สามารถบอกเปอร์เซ็นต์ที่แน่นอนได้
                ระบบจึงไม่เดาค่าให้ กรุณากรอกเฉพาะค่าที่ทราบ หรือเอาเครื่องหมายเลือกออกจากสารที่ยังไม่ต้องการประเมิน
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[32px_minmax(0,1fr)_90px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span />
                  <span>สารที่ตรวจพบ</span>
                  <span className="text-right">ความเข้มข้น</span>
                </div>
                {drafts.map((item, index) => (
                  <SubstanceHoverCard
                    key={`${item.smiles}-${index}`}
                    name={item.name}
                    smiles={item.smiles}
                    className="grid grid-cols-[32px_minmax(0,1fr)_90px] items-center gap-2 border-t border-slate-100 px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(event) => patchDraft(index, { selected: event.target.checked })}
                      className="size-4 accent-teal-600"
                      aria-label={`เลือก ${item.name}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-slate-700">{item.name}</span>
                        <span className={`rounded px-1 py-0.5 text-[8px] ${item.source === "registry" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"}`}>
                          {item.source === "registry" ? "Registry" : "Curated"}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400" title={item.smiles}>{item.smiles}</div>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.1"
                        disabled={!item.selected}
                        value={item.concentration ?? ""}
                        onChange={(event) => {
                          const raw = event.target.value;
                          patchDraft(index, { concentration: raw === "" ? null : Number(raw) });
                        }}
                        placeholder="ระบุ"
                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-5 text-right font-mono text-xs outline-none focus:border-brand disabled:bg-slate-50 disabled:text-slate-300"
                      />
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
                    </div>
                  </SubstanceHoverCard>
                ))}
              </div>

              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${total > 100 ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600"}`}>
                <span>รวมสารที่เลือก</span>
                <span className="font-mono font-semibold">{Math.round(total * 100) / 100}%</span>
              </div>

              {(result?.recognized_no_structure?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                  <div className="flex items-start gap-2">
                    <SemanticIcon name="circle-alert" className="mt-0.5 size-4 shrink-0 text-violet-600" />
                    <div>
                      <div className="text-xs font-semibold text-violet-900">
                        รู้จักสารแล้ว แต่ใช้วิธีอื่นแทน QSAR ({result!.recognized_no_structure.length})
                      </div>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-violet-700">
                        แต่ละรายการอาจเป็นตัวพาสูตร สารอนินทรีย์ เกลือ พอลิเมอร์ หรือสารผสม ระบบจึงแสดงสถานะและเหตุผลแยกกันโดยไม่ฝืนส่งเข้าโมเดล
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {(result?.non_qsar_items?.length
                      ? result.non_qsar_items
                      : result!.recognized_no_structure.map((name) => ({ name } as NonQsarItem))
                    ).map((item) => (
                      <SubstanceHoverCard
                        key={item.name}
                        name={item.name}
                        smiles={item.canonical_smiles}
                        className="rounded-lg border border-violet-100 bg-white px-2.5 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold capitalize text-violet-900">{item.name}</span>
                          {item.substance_type && (
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] text-violet-700">
                              {item.substance_type}
                            </span>
                          )}
                          {item.structure_available && (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700">
                              มีโครงสร้างแล้ว
                            </span>
                          )}
                          {item.pubchem_cid && (
                            <span className="text-[9px] text-slate-400">CID {item.pubchem_cid}</span>
                          )}
                        </div>
                        {item.reason_th && (
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{item.reason_th}</p>
                        )}
                        {item.canonical_smiles && (
                          <div className="mt-1 truncate font-mono text-[9px] text-slate-400" title={item.canonical_smiles}>
                            {item.canonical_smiles}
                          </div>
                        )}
                      </SubstanceHoverCard>
                    ))}
                  </div>
                </div>
              )}
              {(result?.registry_candidates?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <div className="text-xs font-semibold text-amber-900">
                    พบข้อมูลใหม่จาก PubChem · รอการยืนยัน
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-amber-700">
                    ระบบบันทึก candidate ไว้ใน Ingredient Registry แล้ว แต่ยังไม่อนุญาตให้เข้า QSAR อัตโนมัติ
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {result!.registry_candidates!.map((candidate) => (
                      <SubstanceHoverCard
                        key={candidate.id}
                        name={candidate.inci_name || candidate.canonical_name}
                        smiles={candidate.canonical_smiles}
                        className="rounded-lg border border-amber-100 bg-white px-2.5 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="font-semibold text-slate-800">{candidate.canonical_name}</span>
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">pending</span>
                          {candidate.pubchem_cid && <span className="text-slate-400">CID {candidate.pubchem_cid}</span>}
                          {candidate.molecular_formula && <span className="font-mono text-slate-400">{candidate.molecular_formula}</span>}
                        </div>
                        {candidate.canonical_smiles && (
                          <div className="mt-1 truncate font-mono text-[9px] text-slate-400" title={candidate.canonical_smiles}>
                            {candidate.canonical_smiles}
                          </div>
                        )}
                        {candidate.reason_th && <p className="mt-1 text-[10px] text-slate-500">{candidate.reason_th}</p>}
                      </SubstanceHoverCard>
                    ))}
                  </div>
                </div>
              )}
              {result?.registry_warning && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                  OCR สำเร็จ แต่บันทึก Ingredient Registry ไม่สำเร็จ: {result.registry_warning}
                </div>
              )}
              {(result?.unmatched?.length ?? 0) > 0 && (
                <details className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                  <summary className="cursor-pointer font-medium">คำที่ยังจับคู่ไม่ได้ ({result!.unmatched.length})</summary>
                  <div className="mt-1 leading-relaxed">{result!.unmatched.join(", ")}</div>
                </details>
              )}
              <details className="rounded-lg border border-slate-100 px-3 py-2 text-[10px] text-slate-500">
                <summary className="cursor-pointer font-medium">ดูข้อความ OCR ต้นฉบับ</summary>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">{result?.raw_text}</pre>
              </details>
              {result?.consensus_text && result.consensus_text !== result.raw_text && (
                <details className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-[10px] text-slate-600">
                  <summary className="cursor-pointer font-medium text-cyan-800">ดูข้อความที่รวมจากหลายรอบ</summary>
                  <div className="mt-1 text-[9px] text-slate-400">
                    เลือกจาก {result.ocr_passes ?? 1} รอบ
                    {result.selected_variant ? ` · ภาพ ${result.selected_variant}` : ""}
                    {result.selected_psm != null ? ` · PSM ${result.selected_psm}` : ""}
                  </div>
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">{result.consensus_text}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/tiff"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) scan(file);
              event.currentTarget.value = "";
            }}
          />
          {phase === "done" && (
            <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              เลือกรูปใหม่
            </button>
          )}
          {phase === "done" && usable && (
            <button
              disabled={!canImport}
              title={missingConcentration ? "กรอกความเข้มข้นของสารที่เลือกให้ครบ" : total > 100 ? "ผลรวมต้องไม่เกิน 100%" : "นำเข้ารายการที่ยืนยันแล้ว"}
              onClick={() => {
                if (!canImport) return;
                onImport(
                  selected.map((item) => ({
                    name: item.name,
                    smiles: item.smiles,
                    concentration: Number(item.concentration),
                    score: item.score,
                    source: item.source,
                  })),
                  {
                    recognizedNoStructure: result?.recognized_no_structure ?? [],
                    unmatched: result?.unmatched ?? [],
                    unselected: drafts.filter((item) => !item.selected).map((item) => item.name),
                  },
                );
                close();
              }}
              className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              ยืนยันและนำเข้าสูตร
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
