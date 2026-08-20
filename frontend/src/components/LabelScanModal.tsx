"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { SemanticIcon } from "@/components/SemanticIcon";
import SubstanceHoverCard from "@/components/SubstanceHoverCard";
import { substanceDepictionUrl } from "@/lib/api";
import { SUBSTANCE_FLAT } from "@/lib/catalog";
import {
  concentrationBasisLabelTh,
  concentrationConfidenceLabelTh,
  detectDeclaredConcentrationsFromOcrText,
  estimateOcrConcentrations,
  type OcrConcentrationBasis,
  type OcrConcentrationConfidence,
} from "@/lib/ocr-concentration-estimation";

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

type EditableItem = OcrItem & {
  selected: boolean;
  estimated: boolean;
  declaredOnLabel: boolean;
  estimateBasis: OcrConcentrationBasis;
  estimateMin: number;
  estimateMax: number;
  estimateConfidence: OcrConcentrationConfidence;
  inOnePercentTail: boolean;
  orderConstraintApplied: boolean;
};

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
const OCR_MIN_ZOOM = 1;
const OCR_MAX_ZOOM = 3;
const OCR_ZOOM_STEP = 0.5;
const OCR_REQUEST_TIMEOUT_MS = 65_000;
const OCR_REFERENCE_BY_SMILES = new Map(
  SUBSTANCE_FLAT.map((item) => [item.smiles.trim(), item.conc]),
);

const displayPercent = (value: number) =>
  value >= 10
    ? value.toFixed(value % 1 === 0 ? 0 : 1)
    : value.toFixed(value < 1 ? 2 : 1).replace(/0+$/, "").replace(/\.$/, "");

function OcrSubstanceThumbnail({ name, smiles }: { name: string; smiles: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [smiles]);

  return (
    <span
      aria-hidden="true"
      title={name}
      className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200/80 bg-white"
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
        <SemanticIcon name="flask" className="size-3.5 text-slate-400" />
      )}
    </span>
  );
}

const OcrIngredientRow = memo(function OcrIngredientRow({
  item,
  index,
  onPatch,
}: {
  item: EditableItem;
  index: number;
  onPatch: (index: number, patch: Partial<EditableItem>) => void;
}) {
  const sourceLabel = item.estimated
    ? "ระบบประมาณ"
    : item.declaredOnLabel
      ? "ฉลากระบุ"
      : "ผู้ใช้กำหนด";
  const sourceClass = item.estimated
    ? "bg-cyan-50 text-cyan-700"
    : item.declaredOnLabel
      ? "bg-emerald-50 text-emerald-700"
      : "bg-slate-100 text-slate-500";

  return (
    <SubstanceHoverCard
      name={item.name}
      smiles={item.smiles}
      className="grid grid-cols-[24px_minmax(0,1fr)_108px] items-center gap-x-2 border-t border-slate-100 px-2 py-2.5 sm:grid-cols-[32px_minmax(0,1fr)_142px] sm:px-3"
    >
      <input
        type="checkbox"
        checked={item.selected}
        onChange={(event) => onPatch(index, { selected: event.target.checked })}
        className="size-4 justify-self-center accent-teal-600"
        aria-label={`เลือก ${item.name}`}
      />
      <div className="flex min-w-0 items-center gap-2">
        <OcrSubstanceThumbnail name={item.name} smiles={item.smiles} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[9px] font-medium tabular-nums text-slate-400">{index + 1}.</span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700" title={item.name}>{item.name}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1">
            <span className={`rounded px-1 py-0.5 text-[8px] ${item.source === "registry" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"}`}>
              {item.source === "registry" ? "Registry" : "Curated"}
            </span>
            <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] ${sourceClass}`}>
              {sourceLabel}
            </span>
            {item.inOnePercentTail && item.estimated && (
              <span className="shrink-0 rounded bg-amber-50 px-1 py-0.5 text-[8px] text-amber-700">≤1% tail</span>
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-slate-400 sm:text-[9px]" title={item.smiles}>
              {item.smiles}
            </span>
          </div>
        </div>
      </div>
      <div className="min-w-0">
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
              onPatch(index, {
                concentration: raw === "" ? null : Number(raw),
                estimated: false,
                declaredOnLabel: false,
              });
            }}
            placeholder="0"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-5 text-right font-mono text-xs outline-none focus:border-brand disabled:bg-slate-50 disabled:text-slate-300"
          />
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
        </div>
        {item.estimated ? (
          <div
            className="mt-1 truncate text-right text-[8px] leading-3 text-slate-400 sm:text-[9px]"
            title={`${concentrationBasisLabelTh(item.estimateBasis)} · ความมั่นใจ ${concentrationConfidenceLabelTh(item.estimateConfidence)}`}
          >
            ช่วง {displayPercent(item.estimateMin)}–{displayPercent(item.estimateMax)}% · {concentrationConfidenceLabelTh(item.estimateConfidence)}
          </div>
        ) : item.declaredOnLabel ? (
          <div className="mt-1 text-right text-[8px] leading-3 text-emerald-600 sm:text-[9px]">
            พบ % บนฉลาก · สูง
          </div>
        ) : (
          <div className="mt-1 text-right text-[8px] leading-3 text-slate-400 sm:text-[9px]">
            ผู้ใช้ยืนยันเอง
          </div>
        )}
      </div>
    </SubstanceHoverCard>
  );
});

function OcrImageViewer({
  preview,
  phase,
  scanProgress,
}: {
  preview: string;
  phase: Phase;
  scanProgress: number;
}) {
  const [imageZoom, setImageZoom] = useState(OCR_MIN_ZOOM);
  const [imageDragging, setImageDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(OCR_MIN_ZOOM);
  const panRef = useRef({ x: 0, y: 0 });
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const applyTransform = (pan = panRef.current, zoom = zoomRef.current) => {
    if (!canvasRef.current) return;
    canvasRef.current.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`;
  };

  const clampPan = (x: number, y: number, zoom: number) => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas || zoom <= OCR_MIN_ZOOM) return { x: 0, y: 0 };
    const maxX = Math.max(0, (canvas.offsetWidth * zoom - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (canvas.offsetHeight * zoom - viewport.clientHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const flushPendingPan = () => {
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (!pendingPanRef.current) return;
    panRef.current = pendingPanRef.current;
    pendingPanRef.current = null;
    applyTransform();
  };

  const schedulePan = (pan: { x: number; y: number }) => {
    pendingPanRef.current = pan;
    if (animationFrameRef.current != null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      if (!pendingPanRef.current) return;
      panRef.current = pendingPanRef.current;
      pendingPanRef.current = null;
      applyTransform();
    });
  };

  const changeZoom = (nextZoom: number) => {
    const zoom = Math.min(OCR_MAX_ZOOM, Math.max(OCR_MIN_ZOOM, nextZoom));
    const pan = clampPan(panRef.current.x, panRef.current.y, zoom);
    zoomRef.current = zoom;
    panRef.current = pan;
    pendingPanRef.current = null;
    setImageZoom(zoom);
    applyTransform(pan, zoom);
  };

  useEffect(() => {
    zoomRef.current = OCR_MIN_ZOOM;
    panRef.current = { x: 0, y: 0 };
    pendingPanRef.current = null;
    dragRef.current = null;
    setImageZoom(OCR_MIN_ZOOM);
    setImageDragging(false);
    applyTransform({ x: 0, y: 0 }, OCR_MIN_ZOOM);
    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [preview]);

  return (
    <section aria-label="ภาพฉลากที่เลือก" className="space-y-2 lg:col-start-1 lg:row-start-1">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-slate-700">ภาพฉลากที่เลือก</h3>
      </div>
      <div
        ref={viewportRef}
        className={`relative flex max-h-64 min-h-48 items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-slate-200/80 p-3 select-none ${phase === "done" && imageZoom > OCR_MIN_ZOOM ? (imageDragging ? "cursor-grabbing touch-none" : "cursor-grab touch-none") : ""}`}
        style={phase === "scanning" ? {
          backgroundImage:
            "linear-gradient(rgba(13,148,136,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(13,148,136,.16) 1px,transparent 1px)",
          backgroundSize: "28px 28px",
        } : undefined}
        onPointerDown={(event) => {
          if (phase !== "done" || zoomRef.current <= OCR_MIN_ZOOM) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y,
          };
          setImageDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          schedulePan(clampPan(
            drag.panX + event.clientX - drag.clientX,
            drag.panY + event.clientY - drag.clientY,
            zoomRef.current,
          ));
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          flushPendingPan();
          dragRef.current = null;
          setImageDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          flushPendingPan();
          dragRef.current = null;
          setImageDragging(false);
        }}
      >
        <div
          ref={canvasRef}
          className="relative w-fit max-w-full overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-slate-300 will-change-transform"
          style={{
            transform: "translate3d(0, 0, 0) scale(1)",
            transformOrigin: "center",
            transition: imageDragging ? "none" : "transform 160ms ease-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="ฉลากที่สแกน" className="mx-auto max-h-56 max-w-full object-contain" />
          {phase === "scanning" && (
            <div
              className="pointer-events-none absolute inset-x-0 h-0.5 bg-brand shadow-[0_0_12px_3px_rgba(13,148,136,.45)]"
              style={{ animation: "ocr-laser 1.2s ease-in-out infinite alternate" }}
            />
          )}
        </div>
        {phase === "done" && (
          <div className="absolute right-3 top-3 z-20 flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              aria-label="ซูมออก"
              title="ซูมออก"
              disabled={imageZoom <= OCR_MIN_ZOOM}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => changeZoom(imageZoom - OCR_ZOOM_STEP)}
              className="grid size-8 place-items-center text-slate-600 transition-colors hover:bg-slate-50 disabled:text-slate-300"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-12 border-x border-slate-200 px-1 text-center text-[10px] font-medium tabular-nums text-slate-500">
              {Math.round(imageZoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="ซูมเข้า"
              title="ซูมเข้า"
              disabled={imageZoom >= OCR_MAX_ZOOM}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => changeZoom(imageZoom + OCR_ZOOM_STEP)}
              className="grid size-8 place-items-center text-slate-600 transition-colors hover:bg-slate-50 disabled:text-slate-300"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      {phase === "scanning" && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
            <span className="font-medium text-slate-600">
              {scanProgress < 25
                ? "กำลังเตรียมภาพฉลาก"
                : scanProgress < 70
                  ? "กำลังอ่านข้อความและชื่อสาร"
                  : scanProgress < 95
                    ? "กำลังจับคู่สารกับฐานข้อมูล"
                    : "ตรวจสอบผลเรียบร้อยแล้ว"}
            </span>
            <span className="font-semibold tabular-nums text-brand">{scanProgress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="ความคืบหน้าการอ่านฉลาก"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={scanProgress}
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out motion-reduce:transition-none"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

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
  const [scanProgress, setScanProgress] = useState(0);
  const [showEstimateNotice, setShowEstimateNotice] = useState(true);
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

  useEffect(() => {
    if (phase !== "scanning") return;
    const interval = window.setInterval(() => {
      setScanProgress((progress) => {
        if (progress >= 88) return progress;
        return Math.min(88, progress + Math.max(1, Math.ceil((88 - progress) * 0.08)));
      });
    }, 180);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(
    () => () => {
      scanRequestIdRef.current += 1;
      scanControllerRef.current?.abort();
      scanControllerRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const patchDraft = useCallback((index: number, patch: Partial<EditableItem>) => {
    setDrafts((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }, []);

  if (!open) return null;

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setDrafts([]);
    setError(null);
    setScanProgress(0);
    setShowEstimateNotice(true);
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
    setShowEstimateNotice(true);
    const requestId = ++scanRequestIdRef.current;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, OCR_REQUEST_TIMEOUT_MS);
    scanControllerRef.current = controller;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setPreview(previewUrlRef.current);
    setScanProgress(4);
    setPhase("scanning");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const form = new FormData();
      form.append("file", file);
      const [response] = await Promise.all([
        fetch(`${API}/api/ocr/?online=false`, { method: "POST", body: form, signal: controller.signal }),
        wait(250),
      ]);
      if (requestId !== scanRequestIdRef.current || controller.signal.aborted) return;
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        if (response.status === 422) {
          const backendDetail = String(detail?.detail || "").toLowerCase();
          if (backendDetail.includes("timed out") || backendDetail.includes("timeout")) {
            throw new Error("เซิร์ฟเวอร์อ่านฉลากไม่ทันเวลา กรุณาลองอีกครั้งหลัง Render ประมวลผลเสร็จ");
          }
          throw new Error("ไม่พบข้อความส่วนผสมที่อ่านได้ กรุณาถ่ายภาพให้คมชัด ตรง และไม่มีแสงสะท้อน");
        }
        if (response.status >= 500) {
          throw new Error("บริการอ่านฉลากยังไม่พร้อม กรุณาลองใหม่อีกครั้ง");
        }
        throw new Error(detail?.detail || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as Result;
      if (requestId !== scanRequestIdRef.current || controller.signal.aborted) return;
      setScanProgress(100);
      await wait(80);
      if (requestId !== scanRequestIdRef.current || controller.signal.aborted) return;
      setResult(data);

      // Percentages are detected from the raw OCR pass because consensus_text
      // is intentionally normalized to an ingredient-name list and may drop
      // numeric annotations printed next to ingredients.
      const detectedDeclared = detectDeclaredConcentrationsFromOcrText(
        data.raw_text,
        data.items,
      );
      const concentrationCandidates = data.items.map((item) => ({
        name: item.name,
        smiles: item.smiles,
        declaredConcentration:
          item.concentration ?? detectedDeclared.get(item.smiles.trim()) ?? null,
      }));
      const estimates = estimateOcrConcentrations(
        concentrationCandidates,
        OCR_REFERENCE_BY_SMILES,
      );
      setDrafts(data.items.map((item, index) => {
        const estimate = estimates[index];
        const declaredOnLabel = estimate.estimateBasis === "label-declared";
        return {
          ...item,
          concentration: estimate.concentration,
          selected: true,
          estimated: !declaredOnLabel,
          declaredOnLabel,
          estimateBasis: estimate.estimateBasis,
          estimateMin: estimate.minConcentration,
          estimateMax: estimate.maxConcentration,
          estimateConfidence: estimate.confidence,
          inOnePercentTail: estimate.inOnePercentTail,
          orderConstraintApplied: estimate.orderConstraintApplied,
        };
      }));
    } catch (cause: any) {
      if (requestId !== scanRequestIdRef.current) return;
      if (cause?.name === "AbortError") {
        if (timedOut) {
          setError("ใช้เวลาอ่านฉลากเกิน 65 วินาที กรุณาลองภาพที่ครอบเฉพาะรายการ Ingredients");
        }
        return;
      }
      setError(
        cause instanceof TypeError
          ? "เชื่อมต่อบริการอ่านฉลากไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่"
          : cause?.message || String(cause),
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === scanRequestIdRef.current) {
        scanControllerRef.current = null;
        setPhase("done");
      }
    }
  };

  const selected = drafts.filter((item) => item.selected);
  const recognizedIngredientCount =
    drafts.length + (result?.recognized_no_structure?.length ?? 0);
  const readIngredientCount =
    recognizedIngredientCount + (result?.unmatched?.length ?? 0);
  const missingConcentration = selected.some(
    (item) => item.concentration == null || !Number.isFinite(item.concentration) || item.concentration <= 0,
  );
  const total = selected.reduce((sum, item) => sum + (Number(item.concentration) || 0), 0);
  const canImport = selected.length > 0 && !missingConcentration && total <= 100;
  const noText = !error && (result?.raw_text?.trim().length ?? 0) < 8;
  const usable = !error && drafts.length > 0;
  const estimatedCount = selected.filter((item) => item.estimated).length;
  const declaredCount = selected.filter((item) => item.declaredOnLabel).length;
  const onePercentTailStart = drafts.findIndex((item) => item.inOnePercentTail);
  const midpointRemainder = Math.max(0, Math.round((100 - total) * 100) / 100);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-900/30 p-3 backdrop-blur-sm animate-in fade-in-0 duration-150 motion-reduce:animate-none sm:p-4"
      onClick={close}
    >
      <style>{`
        @keyframes ocr-laser { 0%{top:0} 100%{top:100%} }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-scan-title"
        className={`my-auto flex max-h-[calc(100dvh-1.5rem)] w-full animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none sm:max-h-[calc(100dvh-2rem)] ${phase === "done" && usable ? "max-w-[1040px]" : "max-w-[640px]"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-brand">
            <SemanticIcon name="camera" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="label-scan-title" className="text-sm font-semibold text-slate-800">
              อ่านส่วนผสมจากฉลาก
            </h2>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              อ่านรายชื่อสารและประเมินช่วงความเข้มข้น จากนั้นให้ผู้ใช้ตรวจสอบก่อนเพิ่มเข้าสูตร
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
          {phase === "idle" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">
                ใช้ภาพที่เห็นรายการ Ingredients ชัดเจน ตัวอักษรไม่เบลอ และไม่มีแสงสะท้อนทับข้อความ หากฉลากพิมพ์ % ไว้ข้างชื่อสาร ระบบจะใช้ค่านั้นโดยตรง
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-white px-4 text-slate-500 transition-colors hover:border-brand hover:bg-teal-50/40 focus:outline-none focus:ring-2 focus:ring-brand/20 sm:min-h-52 sm:px-6"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-teal-50 text-brand">
                  <SemanticIcon name="image" className="size-6" />
                </span>
                <span className="mt-1 text-sm font-semibold text-slate-700">เลือกภาพฉลากส่วนผสม</span>
                <span className="text-[11px] text-slate-400">JPG, PNG, WebP หรือ TIFF · ขนาดไม่เกิน 10 MB</span>
              </button>
            </div>
          )}

          {phase !== "idle" && (
            <div className={phase === "done" && usable ? "grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : ""}>
              {preview && (
                <OcrImageViewer preview={preview} phase={phase} scanProgress={scanProgress} />
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
                <div className="contents">
                  <section className="space-y-2 lg:col-start-1 lg:row-start-2">
                    <h3 className="text-xs font-semibold text-slate-700">สรุปผลการอ่านฉลาก</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-teal-50 px-3 py-2.5">
                        <div className="text-base font-semibold tabular-nums text-teal-700">{readIngredientCount}</div>
                        <div className="mt-0.5 text-[10px] text-teal-700/70">สารที่อ่านได้ทั้งหมด</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
                        <div className="text-base font-semibold tabular-nums text-emerald-700">{drafts.length}</div>
                        <div className="mt-0.5 text-[10px] text-emerald-700/70">สารที่ประเมินได้</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-base font-semibold tabular-nums text-slate-700">
                          {declaredCount}/{estimatedCount}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">ฉลากระบุ % / ระบบประมาณ</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-base font-semibold tabular-nums text-slate-700">
                          {result?.ocr_confidence != null ? `${Math.round(result.ocr_confidence)}%` : "—"}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">ความชัดของภาพ</div>
                      </div>
                    </div>
                    <p className="text-[10px] leading-4 text-slate-400">
                      ระบบตรวจภาพเดียวกัน {result?.ocr_passes ?? 1} รอบ
                      {(result?.preprocessing_variants?.length ?? 0) > 0
                        ? ` จาก ${result!.preprocessing_variants!.length} รูปแบบภาพ`
                        : ""}
                      {" "}เพื่อเปรียบเทียบและรวมผลการอ่านข้อความที่สอดคล้องกัน
                    </p>
                    {(result?.recognized_no_structure?.length ?? 0) > 0 && (
                      <p className="text-[10px] leading-4 text-violet-600">
                        มี {result!.recognized_no_structure.length} สารที่ระบบรู้จัก แต่ต้องใช้วิธีประเมินอื่นแทน QSAR
                      </p>
                    )}
                  </section>

                  <section className="min-w-0 space-y-2 lg:col-start-2 lg:row-span-3 lg:row-start-1">
                    {showEstimateNotice && (
                      <div className="flex gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-[11px] leading-4 text-teal-800">
                        <SemanticIcon name="sparkles" className="mt-0.5 size-3.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">ประเมินเป็นช่วง ไม่สร้างสูตรจริงขึ้นมาเอง</div>
                          <p className="mt-0.5 text-teal-700">
                            ถ้าฉลากพิมพ์ % ไว้ ระบบใช้ค่าที่อ่านได้โดยตรง; รายการที่ไม่มี % จะใช้ลำดับบนฉลากร่วมกับค่าอ้างอิงในคลังเพื่อสร้างช่วงที่เป็นไปได้
                          </p>
                          <p className="mt-0.5 text-teal-700">
                            ตัวเลขในช่อง % คือ <b>ค่ากลางสำหรับการคัดกรองเบื้องต้น</b> และแก้ไขได้ก่อนนำเข้า ไม่ใช่ความเข้มข้นจริงจากผู้ผลิต
                          </p>
                          {onePercentTailStart >= 0 && (
                            <p className="mt-0.5 font-medium text-amber-700">
                              ตั้งแต่ลำดับ {onePercentTailStart + 1} ระบบพบช่วงปลายที่มีแนวโน้ม ≤1% จึงไม่บังคับว่ารายการถัดไปต้องลดลงตามลำดับ
                            </p>
                          )}
                          <p className="mt-0.5 font-medium text-teal-700">
                            เหลือประมาณ {midpointRemainder}% สำหรับ Water/Base หรือรายการที่ไม่ได้เข้าสู่ QSAR
                          </p>
                          <p className="mt-0.5 text-[10px] text-teal-600">
                            {result?.concentration_notice_th || "การประมาณนี้เป็น heuristic สำหรับ screening และต้องให้ผู้ใช้ยืนยันก่อนใช้งาน"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowEstimateNotice(false)}
                          aria-label="ปิดคำอธิบายค่าประมาณ"
                          title="ปิด"
                          className="grid size-6 shrink-0 place-items-center rounded-md text-teal-600 transition-colors hover:bg-white/70 hover:text-teal-900"
                        >
                          <SemanticIcon name="x" className="size-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-700">สารที่ตรวจพบ</h3>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          ก่อนช่วง ≤1% ใช้ลำดับเป็นข้อจำกัด; ช่วงปลายไม่บังคับลำดับและแสดง uncertainty แยก
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">เลือก {selected.length}/{drafts.length}</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 lg:max-h-[430px] lg:overflow-y-auto">
                      <div className="sticky top-0 z-10 grid grid-cols-[24px_minmax(0,1fr)_108px] gap-2 bg-slate-50 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid-cols-[32px_minmax(0,1fr)_142px] sm:px-3">
                        <span />
                        <span>สารที่ตรวจพบ</span>
                        <span className="text-right">
                          <span className="sm:hidden">ค่ากลาง %</span>
                          <span className="hidden sm:inline">ค่ากลาง / ช่วงที่ประมาณ</span>
                        </span>
                      </div>
                      {drafts.map((item, index) => (
                        <OcrIngredientRow
                          key={`${item.smiles}-${index}`}
                          item={item}
                          index={index}
                          onPatch={patchDraft}
                        />
                      ))}
                    </div>

                    <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs ${total > 100 ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600"}`}>
                      <span>{total > 100 ? "ผลรวมเกิน 100%" : estimatedCount > 0 ? "รวมค่ากลางที่เลือก" : "รวมความเข้มข้นที่เลือก"}</span>
                      <span className="font-mono font-semibold tabular-nums">{Math.round(total * 100) / 100}%</span>
                    </div>
                  </section>

                  {(result?.recognized_no_structure?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 lg:col-span-2">
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
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 lg:col-span-2">
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
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800 lg:col-span-2">
                      OCR สำเร็จ แต่บันทึก Ingredient Registry ไม่สำเร็จ: {result.registry_warning}
                    </div>
                  )}
                  {(result?.unmatched?.length ?? 0) > 0 && (
                    <details className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500 lg:col-span-2">
                      <summary className="cursor-pointer font-medium">คำที่ยังจับคู่ไม่ได้ ({result!.unmatched.length})</summary>
                      <div className="mt-1 leading-relaxed">{result!.unmatched.join(", ")}</div>
                    </details>
                  )}
                  <details className="rounded-lg border border-slate-100 px-3 py-2 text-[10px] text-slate-500 lg:col-span-2">
                    <summary className="cursor-pointer font-medium">ดูข้อความ OCR ต้นฉบับ</summary>
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">{result?.raw_text}</pre>
                  </details>
                  {result?.consensus_text && result.consensus_text !== result.raw_text && (
                    <details className="rounded-lg border border-cyan-100 bg-cyan-50/40 px-3 py-2 text-[10px] text-slate-600 lg:col-span-2">
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
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
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
          <button
            type="button"
            onClick={close}
            className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          {phase === "done" && (
            <button type="button" onClick={() => fileRef.current?.click()} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50">
              เลือกรูปใหม่
            </button>
          )}
          {phase === "idle" && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              เลือกภาพฉลาก
            </button>
          )}
          {phase === "scanning" && (
            <button type="button" disabled className="h-9 cursor-wait rounded-lg bg-brand px-4 text-sm font-semibold text-white opacity-60">
              กำลังอ่านฉลาก…
            </button>
          )}
          {phase === "done" && usable && (
            <button
              type="button"
              disabled={!canImport}
              title={
                missingConcentration
                  ? "กรอกความเข้มข้นของสารที่เลือกให้ครบ"
                  : total > 100
                    ? "ผลรวมต้องไม่เกิน 100%"
                    : estimatedCount > 0
                      ? "ใช้ค่ากลางของช่วงประมาณสำหรับการคัดกรองเบื้องต้น คุณยังแก้ไขแต่ละค่าได้ก่อนนำเข้า"
                      : "นำเข้ารายการที่ยืนยันแล้ว"
              }
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
              className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {estimatedCount > 0 ? "ใช้ค่ากลางและนำเข้าสูตร" : "ยืนยันและนำเข้าสูตร"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
