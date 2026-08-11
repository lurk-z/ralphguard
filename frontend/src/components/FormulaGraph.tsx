"use client";

/**
 * FormulaGraph — node-based formula/pipeline editor (Blender-style).
 * Substance nodes → wired into a Result node → runs the real QSAR pipeline.
 * Makes the "unambiguous algorithm" (OECD principle 2) visible and lets users
 * build a mixture as a graph and compare what-if edits live.
 */
import "reactflow/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "reactflow";

import {
  FormulaItem,
  Region,
  api,
  substanceDepictionUrl,
  type IngredientRegistryItem,
} from "../lib/api";
import {
  catalogWithVerifiedRegistry,
  withWaterBase,
  substanceInfo,
  type CatalogItem,
} from "../lib/catalog";
import {
  formulaGraphItemIdentity,
  formulaGraphItemsSignature,
  formulaItemsFromGraph,
  formulaResultScope,
  initializeFormulaGraphSnapshot,
  synchronizeGraphWithFormula,
} from "../lib/formula-graph";
import {
  normalizeFormulaGraphSnapshot,
  type FormulaGraphNodeSnapshot,
  type FormulaGraphSnapshot,
} from "../lib/project-workspace";
import { SemanticIcon } from "@/components/SemanticIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ENDPOINTS = ["skin", "eye", "sens", "acute"] as const;
const ENDPOINT_LABEL_TH: Record<string, string> = {
  skin: "ระคายเคืองผิว",
  eye: "ระคายเคืองตา",
  sens: "แพ้ผิวหนัง",
  acute: "พิษเฉียบพลัน",
};
const REGIONS = [
  { value: "face", label: "ใบหน้า", icon: "scan" },
  { value: "eye", label: "ดวงตา", icon: "eye" },
] as const;
const bandOf = (s: number) =>
  s < 25 ? "low" : s < 50 ? "moderate" : s < 75 ? "high" : "severe";
const BAND_HEX: Record<string, string> = {
  low: "#16A34A",
  moderate: "#E08A00",
  high: "#DC2626",
  severe: "#B91C1C",
};

type LibItem = CatalogItem;

// ─────────────────────────── Substance node ───────────────────────────
type SubstanceData = { name?: string; smiles: string; concentration: number };

function GraphSubstanceThumbnail({ name, smiles }: { name?: string; smiles: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [smiles]);

  return (
    <span
      aria-hidden="true"
      title={name || smiles}
      className="grid size-8 shrink-0 place-items-center overflow-hidden"
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

function SubstanceNode({
  id,
  data,
  selected,
  onRemove,
}: NodeProps<SubstanceData> & { onRemove?: (id: string) => void }) {
  const { setNodes } = useReactFlow();
  const patch = useCallback((p: Partial<SubstanceData>) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    ), [id, setNodes]);
  const remove = () => {
    onRemove?.(id);
  };

  const [editing, setEditing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [valid, setValid] = useState<null | boolean>(null);
  const [mw, setMw] = useState<number | null>(null);

  // Hover >2s → show an info card on the side describing the substance.
  const [showInfo, setShowInfo] = useState(false);
  const hoverT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { category, info } = substanceInfo(data.smiles);
  const startHover = () => {
    if (hoverT.current) clearTimeout(hoverT.current);
    hoverT.current = setTimeout(() => setShowInfo(true), 2000);
  };
  const endHover = () => {
    if (hoverT.current) clearTimeout(hoverT.current);
    setShowInfo(false);
  };
  useEffect(() => () => { if (hoverT.current) clearTimeout(hoverT.current); }, []);

  useEffect(() => {
    if (!editing) return;

    const finishEditingOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !cardRef.current?.contains(target)) {
        const normalized = Math.min(100, Math.max(0, Number(data.concentration) || 0));
        if (normalized !== data.concentration) patch({ concentration: normalized });
        setEditing(false);
      }
    };

    document.addEventListener("pointerdown", finishEditingOutside, true);
    return () => document.removeEventListener("pointerdown", finishEditingOutside, true);
  }, [data.concentration, editing, patch]);

  useEffect(() => {
    const s = data.smiles?.trim();
    if (!s) {
      setValid(null);
      setMw(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await api.validateSmiles(s);
        if (cancelled) return;
        setValid(r.valid);
        setMw((r.descriptors?.mw as number) ?? null);
      } catch {
        if (!cancelled) setValid(null);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [data.smiles]);

  const needsIdentity = !data.name?.trim() || !data.smiles.trim();

  return (
    <div
      ref={cardRef}
      className={`relative w-60 rounded-xl border bg-white shadow-card transition-[border-color,box-shadow] ${
        selected
          ? "border-brand ring-2 ring-brand/15"
          : "border-slate-200 hover:border-slate-300"
      }`}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
    >
      {showInfo && (data.smiles?.trim() || data.name) && (
        <div className="nodrag nowheel absolute left-full top-0 z-30 ml-3 w-60 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-soft">
          <div className="flex items-center gap-1.5">
            <SemanticIcon name="circle" className="size-2.5 text-brand" />
            <span className="flex-1 truncate text-xs font-semibold text-slate-800">{data.name || "สารไม่ระบุชื่อ"}</span>
            {mw != null && <span className="font-mono text-[9px] text-slate-400">MW {mw}</span>}
          </div>
          {category && (
            <div className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
              {category}
            </div>
          )}
          {info ? (
            <>
              <div className="mt-1.5 text-[11px] leading-snug text-slate-700">{info.role}</div>
              <div className="mt-1 flex gap-1 text-[10px] leading-snug text-amber-700">
                <SemanticIcon name="alert" className="size-3 shrink-0" />
                <span>{info.note}</span>
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-[11px] leading-snug text-slate-500">
              สารกำหนดเอง (SMILES: <span className="font-mono">{data.smiles || "-"}</span>) — ยังไม่มีข้อมูลรายละเอียดในคลัง
            </div>
          )}
          <div className="mt-1.5 font-mono text-[9px] text-slate-400">SMILES: {data.smiles || "-"}</div>
        </div>
      )}
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-t-xl border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <SemanticIcon name="flask" className="size-3.5 shrink-0 text-brand" />
          <span className="shrink-0">สารในสูตร</span>
          {valid === true && (
            <span
              title={`ถูกต้อง${mw != null ? ` · MW ${mw}` : ""}`}
              className="inline-flex min-w-0 items-center gap-0.5 text-[9px] font-medium text-emerald-600"
            >
              <SemanticIcon name="check" className="size-3 shrink-0" />
              <span className="truncate">ถูกต้อง{mw != null ? ` · MW ${mw}` : ""}</span>
            </span>
          )}
          {valid === false && (
            <span
              title="SMILES ไม่ถูกต้อง"
              className="inline-flex min-w-0 items-center gap-0.5 text-[9px] font-medium text-rose-500"
            >
              <SemanticIcon name="x-circle" className="size-3 shrink-0" />
              <span className="truncate">SMILES ไม่ถูกต้อง</span>
            </span>
          )}
        </span>
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            remove();
          }}
          onClick={(event) => event.stopPropagation()}
          title="ลบ Node สาร"
          aria-label="ลบ Node สาร"
          className="nodrag nopan grid size-6 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <SemanticIcon name="x" className="size-3.5" />
        </button>
      </div>
      <div className="nodrag nowheel space-y-1.5 p-3">
        {needsIdentity ? (
          <div className="space-y-1.5">
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              placeholder="ชื่อสาร"
              value={data.name ?? ""}
              onChange={(event) => patch({ name: event.target.value })}
            />
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              placeholder="SMILES เช่น CCO"
              value={data.smiles}
              onChange={(event) => patch({ smiles: event.target.value })}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <GraphSubstanceThumbnail name={data.name} smiles={data.smiles} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-slate-800">{data.name}</span>
              <span className="block truncate font-mono text-[10px] text-slate-400">{data.smiles}</span>
            </span>
            {editing ? (
              <label className="flex shrink-0 items-center gap-1">
                <input
                  autoFocus
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  aria-label="แก้ไขความเข้มข้นของสารในสูตร"
                  className="w-16 rounded-md border border-brand/50 bg-white px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums text-slate-800 outline-none ring-2 ring-brand/10"
                  value={data.concentration}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const normalized = event.currentTarget.value.replace(/^0+(?=\d)/, "");
                    if (normalized !== event.currentTarget.value) event.currentTarget.value = normalized;
                    patch({ concentration: Number.parseFloat(normalized) || 0 });
                  }}
                  onBlur={(event) => {
                    const normalized = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0));
                    patch({ concentration: normalized });
                    setEditing(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
                  }}
                />
                <span className="text-xs text-slate-500">%</span>
              </label>
            ) : (
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditing(true);
                }}
                title="ดับเบิลคลิกเพื่อแก้ไขความเข้มข้น"
                aria-label={`ความเข้มข้น ${data.concentration}% ดับเบิลคลิกเพื่อแก้ไข`}
                className="nodrag nopan shrink-0 cursor-text rounded-md border border-transparent px-1.5 py-1 text-xs font-semibold tabular-nums text-slate-700 transition-colors hover:border-slate-300 focus-visible:border-slate-400 focus-visible:outline-none"
              >
                {data.concentration}%
              </button>
            )}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white !bg-brand"
      />
    </div>
  );
}

// ─────────────────────────── Result node ───────────────────────────
type ResultData = {
  region: Region;
  projectId?: number | null;
  onRegionChange?: (region: Region) => void;
  status?: "idle" | "queued" | "running" | "completed" | "failed";
  endpoints?: Record<string, { peak_score: number }>;
  error?: string;
};

const resultScopeFromFlow = (nodes: Node[], edges: Edge[], resultNodeId: string) =>
  formulaResultScope(
    {
      nodes: nodes.flatMap<FormulaGraphNodeSnapshot>((node) => {
        if (node.type !== "substance" && node.type !== "modifier" && node.type !== "result") {
          return [];
        }
        return [{ id: node.id, type: node.type, position: node.position, data: node.data }];
      }),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: edge.animated,
      })),
    },
    resultNodeId,
  );

function ResultNode({
  id,
  data,
  selected,
  onRemove,
}: NodeProps<ResultData> & { onRemove?: (id: string) => void }) {
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const patch = (p: Partial<ResultData>) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    );
  const selectedRegion = data.region === "eye" ? REGIONS[1] : REGIONS[0];

  const run = async () => {
    const allEdges = getEdges();
    const allNodes = getNodes();
    const scope = resultScopeFromFlow(allNodes, allEdges, id);

    // A connection to this Result is the user's explicit assessment selection.
    // Chemicals elsewhere on the canvas remain in the draft but are excluded.
    const selectedItems = scope.items
      .filter((item) => item.smiles.trim() && item.concentration > 0)
      .map((item) => ({
        name: item.name || "",
        smiles: item.smiles,
        concentration: item.concentration,
      }));

    if (selectedItems.length === 0) {
      patch({
        status: "failed",
        endpoints: undefined,
        error: "ยังไม่ได้เลือกสารสำหรับประเมิน กรุณาเชื่อมสารเข้ากับผลการประเมิน",
      });
      return;
    }
    const formula: FormulaItem[] = withWaterBase(selectedItems);
    patch({ status: "queued", error: undefined, endpoints: undefined });
    try {
      const { job_id } = await api.createAssessment(formula, selectedRegion.value, data.projectId ?? null);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const rec = await api.getAssessment(job_id);
          if (rec.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            patch({ status: "completed", endpoints: rec.result?.endpoints as any });
          } else if (rec.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            patch({ status: "failed", error: rec.error ?? "ประเมินล้มเหลว" });
          } else {
            patch({ status: rec.status });
          }
        } catch {
          /* keep polling */
        }
      }, 1500);
    } catch (e: any) {
      patch({ status: "failed", error: e.message ?? String(e) });
    }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const busy = data.status === "queued" || data.status === "running";
  const statusLabel = data.status === "completed"
    ? "มีผลแล้ว"
    : data.status === "failed"
      ? "ประเมินไม่สำเร็จ"
      : busy
        ? "กำลังประเมิน"
        : "รอเชื่อมสาร";
  const statusTone = data.status === "completed"
    ? "bg-emerald-500"
    : data.status === "failed"
      ? "bg-rose-500"
      : busy
        ? "bg-amber-500"
        : "bg-slate-300";

  return (
    <div className={`relative w-60 rounded-xl border bg-white shadow-card transition-[border-color,box-shadow] ${
      selected
        ? "border-brand ring-2 ring-brand/15"
        : "border-slate-200 hover:border-slate-300"
    }`}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-brand"
      />
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-t-xl border-b border-brand/10 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-slate-800">
        <span className="flex min-w-0 items-center gap-1.5">
          <SemanticIcon name="target" className="size-3.5 shrink-0 text-brand" />
          <span className="truncate">ผลการประเมิน</span>
        </span>
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            onRemove?.(id);
          }}
          onClick={(event) => event.stopPropagation()}
          title="ลบ Node ผลการประเมิน"
          aria-label="ลบ Node ผลการประเมิน"
          className="nodrag nopan grid size-6 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <SemanticIcon name="x" className="size-3.5" />
        </button>
      </div>
      <div className="nodrag nowheel space-y-2.5 p-3">
        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${statusTone}`} />
            {statusLabel}
          </span>
          <span>#{id}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
          <span>บริเวณทดสอบ</span>
          <Select
            value={selectedRegion.value}
            onValueChange={(value) => {
              const nextRegion = value as Region;
              patch({ region: nextRegion });
              data.onRegionChange?.(nextRegion);
            }}
          >
            <SelectTrigger
              aria-label="เลือกบริเวณทดสอบ"
              className="h-8 w-28 rounded-lg border-slate-200 bg-white px-2 text-xs shadow-none focus:ring-brand/15"
            >
              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                <SemanticIcon name={selectedRegion.icon} className="size-3.5 shrink-0 text-brand" />
                <span className="truncate">{selectedRegion.label}</span>
              </div>
            </SelectTrigger>
            <SelectContent position="popper" className="min-w-28">
              {REGIONS.map((region) => (
                <SelectItem key={region.value} value={region.value} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <SemanticIcon name={region.icon} className="size-3.5 shrink-0 text-slate-500" />
                    <span>{region.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          onClick={run}
          disabled={busy}
          className="flex h-8 w-full items-center justify-center rounded-lg bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "กำลังประเมิน…" : <span className="inline-flex items-center gap-1"><SemanticIcon name="play" className="size-3" /> ประเมิน</span>}
        </button>

        {data.status === "failed" && (
          <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-600">
            {data.error}
          </div>
        )}

        {data.status === "completed" && data.endpoints && (
          <div className="space-y-1 pt-1">
            {ENDPOINTS.map((ep) => {
              const sc = data.endpoints?.[ep]?.peak_score ?? 0;
              const band = bandOf(sc);
              return (
                <div key={ep} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[10px] text-slate-800/70">
                    {ENDPOINT_LABEL_TH[ep]}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, sc)}%`, background: BAND_HEX[band] }}
                    />
                  </div>
                  <span className="w-7 text-right font-mono text-[10px] tabular-nums" style={{ color: BAND_HEX[band] }}>
                    {Math.round(sc)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Modifier node ───────────────────────────
// A formula-support node is still a real chemical input. It is included in the
// assessment formula and never subtracts risk through an arbitrary UI slider.
type ModifierData = {
  name: string;
  smiles: string;
  concentration: number;
};

function ModifierNode({
  id,
  data,
  selected,
  onRemove,
}: NodeProps<ModifierData> & { onRemove?: (id: string) => void }) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const patch = useCallback((p: Partial<ModifierData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
  }, [id, setNodes]);
  const remove = () => {
    onRemove?.(id);
  };

  useEffect(() => {
    if (!editing) return;

    const finishEditingOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !cardRef.current?.contains(target)) {
        const normalized = Math.min(100, Math.max(0, Number(data.concentration) || 0));
        if (normalized !== data.concentration) patch({ concentration: normalized });
        setEditing(false);
      }
    };

    document.addEventListener("pointerdown", finishEditingOutside, true);
    return () => document.removeEventListener("pointerdown", finishEditingOutside, true);
  }, [data.concentration, editing, patch]);

  return (
    <div ref={cardRef} className={`group relative w-60 rounded-xl border bg-white shadow-card transition-[border-color,box-shadow] ${
      selected
        ? "border-amber-500 ring-2 ring-amber-400/20"
        : "border-slate-200 hover:border-amber-300"
    }`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-amber-400" />
      <div className="flex min-h-9 items-center justify-between gap-2 rounded-t-xl border-b border-amber-100 bg-amber-50/70 px-3 py-1.5 text-xs font-semibold text-slate-800">
        <span className="flex min-w-0 items-center gap-1.5">
          <SemanticIcon name="puzzle" className="size-3.5 shrink-0 text-amber-600" />
          <span className="truncate">สารเสริมสูตร</span>
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="ข้อมูลเกี่ยวกับสารเสริมสูตร"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  className="nodrag nopan pointer-events-none grid size-5 shrink-0 place-items-center rounded text-slate-400 opacity-0 transition-[color,opacity] group-hover:pointer-events-auto group-hover:opacity-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
                >
                  <SemanticIcon name="circle-alert" className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                sideOffset={7}
                className="max-w-56 border border-slate-200 bg-white px-3 py-2 font-normal leading-4 text-slate-800 shadow-lg"
              >
                สารนี้จะถูกนำเข้า Pipeline และประเมินร่วมกับสารในสูตร
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            remove();
          }}
          onClick={(event) => event.stopPropagation()}
          title="ลบ Node สารเสริมสูตร"
          aria-label="ลบ Node สารเสริมสูตร"
          className="nodrag nopan grid size-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <SemanticIcon name="x" className="size-3.5" />
        </button>
      </div>
      <div className="nodrag nowheel space-y-2 p-3 text-xs">
        <div className="flex items-center gap-2">
          <GraphSubstanceThumbnail name={data.name} smiles={data.smiles} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-800">{data.name || "สารไม่ระบุชื่อ"}</span>
            <span className="block truncate font-mono text-[10px] text-slate-400">{data.smiles || "—"}</span>
          </span>
          {editing ? (
            <label className="flex shrink-0 items-center gap-1">
              <input
                autoFocus
                type="number"
                min={0}
                max={100}
                step={0.1}
                aria-label="แก้ไขความเข้มข้นของสารเสริมสูตร"
                className="w-16 rounded-md border border-amber-300 bg-white px-2 py-1 text-right font-mono font-semibold tabular-nums text-slate-800 outline-none ring-2 ring-amber-200/50"
                value={data.concentration}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const normalized = event.currentTarget.value.replace(/^0+(?=\d)/, "");
                  if (normalized !== event.currentTarget.value) event.currentTarget.value = normalized;
                  patch({ concentration: Number.parseFloat(normalized) || 0 });
                }}
                onBlur={(event) => {
                  const normalized = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0));
                  patch({ concentration: normalized });
                  setEditing(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
                }}
              />
              <span className="text-slate-500">%</span>
            </label>
          ) : (
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditing(true);
              }}
              title="ดับเบิลคลิกเพื่อแก้ไขความเข้มข้น"
              aria-label={`ความเข้มข้น ${data.concentration}% ดับเบิลคลิกเพื่อแก้ไข`}
              className="nodrag nopan shrink-0 cursor-text rounded-md border border-transparent px-1.5 py-1 font-semibold tabular-nums text-slate-700 transition-colors hover:border-slate-300 focus-visible:border-slate-400 focus-visible:outline-none"
            >
              {data.concentration}%
            </button>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-amber-400" />
    </div>
  );
}

let idCounter = 100;
const nextId = () => String(++idCounter);

const graphNodeToFlowNode = (
  node: FormulaGraphNodeSnapshot,
  projectId?: number | null,
  onRegionChange?: (region: Region) => void,
): Node => ({
  ...node,
  data: node.type === "result"
    ? { ...node.data, region: node.data.region ?? "face", projectId, onRegionChange }
    : node.data,
});

const graphSnapshotFromFlow = (
  nodes: Node[],
  edges: Edge[],
  viewport: FormulaGraphSnapshot["viewport"],
): FormulaGraphSnapshot => {
  const snapshotNodes = nodes.flatMap<FormulaGraphNodeSnapshot>((node) => {
    if (node.type !== "substance" && node.type !== "modifier" && node.type !== "result") return [];
    return [{
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    }];
  });
  const rawSnapshot: FormulaGraphSnapshot = {
    nodes: snapshotNodes,
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: edge.animated,
    })),
    viewport,
  };
  return normalizeFormulaGraphSnapshot(rawSnapshot) ?? rawSnapshot;
};

const nextUniqueId = (nodes: Node[]) => {
  let id = nextId();
  const used = new Set(nodes.map((node) => node.id));
  while (used.has(id)) id = nextId();
  return id;
};

function GraphInner({
  seed,
  region,
  projectId,
  snapshot,
  onSnapshotPreview,
  onSnapshotChange,
  onSaveFormula,
  syncWithSeed,
  onRegionChange,
}: {
  seed: FormulaItem[];
  region: Region;
  projectId?: number | null;
  snapshot?: FormulaGraphSnapshot | null;
  onSnapshotPreview?: (snapshot: FormulaGraphSnapshot) => void;
  onSnapshotChange?: (snapshot: FormulaGraphSnapshot) => void;
  onSaveFormula?: (items: FormulaItem[]) => void;
  syncWithSeed?: boolean;
  onRegionChange?: (region: Region) => void;
}) {
  const { getZoom, setCenter } = useReactFlow();
  const initial = useMemo(
    () => syncWithSeed
      ? synchronizeGraphWithFormula(snapshot, seed, region)
      : initializeFormulaGraphSnapshot(snapshot, seed, region),
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initial.nodes.map((node) => graphNodeToFlowNode(node, projectId, onRegionChange)),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges as Edge[]);
  const [graphViewport, setGraphViewport] = useState(initial.viewport);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(graphViewport);
  const pendingFocusNodeRef = useRef<string | null>(null);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  viewportRef.current = graphViewport;

  useEffect(() => {
    const targetId = pendingFocusNodeRef.current;
    if (!targetId) return;
    const targetNode = nodes.find((node) => node.id === targetId);
    if (!targetNode) return;

    const frame = window.requestAnimationFrame(() => {
      const defaultHeight = targetNode.type === "result" ? 220 : 120;
      const width = targetNode.width ?? 240;
      const height = targetNode.height ?? defaultHeight;
      void setCenter(
        targetNode.position.x + width / 2,
        targetNode.position.y + height / 2,
        { zoom: getZoom(), duration: 300 },
      );
      if (pendingFocusNodeRef.current === targetId) pendingFocusNodeRef.current = null;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [getZoom, nodes, setCenter]);

  const currentSnapshot = useMemo(
    () => graphSnapshotFromFlow(nodes, edges, graphViewport),
    [edges, graphViewport, nodes],
  );
  const currentFormulaItems = useMemo(
    () => formulaItemsFromGraph(currentSnapshot),
    [currentSnapshot],
  );
  const currentFormulaSignature = formulaGraphItemsSignature(currentFormulaItems);
  const onSnapshotPreviewRef = useRef(onSnapshotPreview);
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotPreviewRef.current = onSnapshotPreview;
  onSnapshotChangeRef.current = onSnapshotChange;

  const previousResultInputRef = useRef(currentFormulaSignature);
  useEffect(() => {
    if (currentFormulaSignature === previousResultInputRef.current) return;
    previousResultInputRef.current = currentFormulaSignature;
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.type === "result"
          ? {
              ...node,
              data: {
                ...node.data,
                region: (node.data as ResultData).region ?? region,
                projectId,
                status: "idle",
                endpoints: undefined,
                error: undefined,
              },
            }
          : node,
      ),
    );
  }, [currentFormulaSignature, projectId, region, setNodes]);

  const latestSnapshotRef = useRef(currentSnapshot);
  latestSnapshotRef.current = currentSnapshot;
  const seedSignature = formulaGraphItemsSignature(seed);
  const previousSeedSyncRef = useRef(`${seedSignature}|${region}`);
  useEffect(() => {
    if (!syncWithSeed) return;
    const nextSeedSync = `${seedSignature}|${region}`;
    if (nextSeedSync === previousSeedSyncRef.current) return;
    previousSeedSyncRef.current = nextSeedSync;
    const synchronized = synchronizeGraphWithFormula(
      latestSnapshotRef.current,
      seed,
      region,
    );
    setNodes(
      synchronized.nodes.map((node) =>
        graphNodeToFlowNode(node, projectId, onRegionChange),
      ),
    );
    setEdges(synchronized.edges as Edge[]);
  }, [onRegionChange, projectId, region, seed, seedSignature, setEdges, setNodes, syncWithSeed]);
  useEffect(() => {
    onSnapshotPreviewRef.current?.(currentSnapshot);
  }, [currentSnapshot]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onSnapshotChangeRef.current?.(currentSnapshot);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [currentSnapshot]);
  useEffect(
    () => () => {
      onSnapshotChangeRef.current?.(latestSnapshotRef.current);
    },
    [],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<"substance" | "modifier" | "result">("substance");
  const [pickerSearch, setPickerSearch] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [registryItems, setRegistryItems] = useState<IngredientRegistryItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const load = async () => {
      const collected: IngredientRegistryItem[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await api.listIngredientRegistry("verified", pageSize, offset, controller.signal);
        collected.push(...page);
        if (page.length < pageSize) break;
      }
      if (alive) setRegistryItems(collected);
    };
    load().catch(() => {
      // The curated offline catalog remains usable when the API is unavailable.
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);
  const substanceLibrary = useMemo(
    () => catalogWithVerifiedRegistry(registryItems),
    [registryItems],
  );
  const filteredSubstanceLibrary = useMemo(() => {
    const query = pickerSearch.trim().toLocaleLowerCase();
    if (!query) return substanceLibrary;

    return substanceLibrary
      .map((group) => {
        const categoryMatches = group.category.toLocaleLowerCase().includes(query);
        return {
          ...group,
          items: categoryMatches
            ? group.items
            : group.items.filter((item) =>
                item.name.toLocaleLowerCase().includes(query)
                || item.smiles.toLocaleLowerCase().includes(query),
              ),
        };
      })
      .filter((group) => group.items.length > 0);
  }, [pickerSearch, substanceLibrary]);
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // Keep the 1,000+ PubChem rows collapsed until explicitly requested.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    "PubChem Registry - ผ่านการตรวจสอบ": true,
  });
  const toggleCat = (c: string) => setCollapsed((s) => ({ ...s, [c]: !s[c] }));
  const togglePicker = (kind: "substance" | "modifier" | "result") => {
    if (pickerOpen && pickerKind === kind) {
      setPickerOpen(false);
      setPickerSearch("");
      return;
    }
    setPickerKind(kind);
    setPickerSearch("");
    setPickerOpen(true);
  };

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)),
    [setEdges],
  );
  const removeNode = useCallback(
    (id: string) => {
      setNodes((currentNodes) => currentNodes.filter((node) => node.id !== id));
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.source !== id && edge.target !== id),
      );
    },
    [setEdges, setNodes],
  );
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      substance: (props) => <SubstanceNode {...props} onRemove={removeNode} />,
      result: (props) => <ResultNode {...props} onRemove={removeNode} />,
      modifier: (props) => <ModifierNode {...props} onRemove={removeNode} />,
    }),
    [removeNode],
  );

  const focusExistingChemicalNode = (item: { name?: string; smiles?: string }) => {
    const identity = formulaGraphItemIdentity(item);
    if (!identity) return false;
    const existing = nodesRef.current.find(
      (node) =>
        (node.type === "substance" || node.type === "modifier")
        && formulaGraphItemIdentity(node.data as SubstanceData & ModifierData) === identity,
    );
    if (!existing) return false;

    pendingFocusNodeRef.current = existing.id;
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, selected: node.id === existing.id })),
    );
    toast.info(`${String((existing.data as SubstanceData & ModifierData).name || "สารนี้")} มีอยู่ในสูตรแล้ว`);
    return true;
  };

  const addSubstance = (item?: LibItem) => {
    if (item && focusExistingChemicalNode(item)) return;
    setNodes((nds) => {
      const id = nextUniqueId(nds);
      pendingFocusNodeRef.current = id;
      const sameTypeCount = nds.filter((node) => node.type === "substance").length;
      return [
        ...nds,
        {
          id,
          type: "substance",
          position: { x: 40, y: 40 + sameTypeCount * 190 },
          data: item
            ? { name: item.name, smiles: item.smiles, concentration: item.conc }
            : { name: "", smiles: "", concentration: 10 },
        },
      ];
    });
  };

  const addResult = () =>
    setNodes((nds) => {
      const id = nextUniqueId(nds);
      pendingFocusNodeRef.current = id;
      const sameTypeCount = nds.filter((node) => node.type === "result").length;
      return [
        ...nds,
        {
          id,
          type: "result",
          position: { x: 620, y: 40 + sameTypeCount * 220 },
          data: { region, projectId, status: "idle" },
        },
      ];
    });

  const addModifierBySmiles = (smiles: string) => {
    const it = substanceLibrary.flatMap((g) => g.items).find((s) => s.smiles === smiles);
    if (!it) return;
    if (focusExistingChemicalNode(it)) return;
    setNodes((nds) => {
      const id = nextUniqueId(nds);
      pendingFocusNodeRef.current = id;
      const sameTypeCount = nds.filter((node) => node.type === "modifier").length;
      return [
        ...nds,
        {
          id,
          type: "modifier",
          position: { x: 330, y: 40 + sameTypeCount * 160 },
          data: { name: it.name, smiles: it.smiles, concentration: it.conc },
        },
      ];
    });
  };

  // Formula Panel and Save as formula both use the complete chemical working set.
  const saveAsFormula = () => {
    const items = formulaItemsFromGraph(currentSnapshot)
      .filter((item) => item.smiles.trim() && item.concentration > 0);
    if (!items.length) return;
    onSaveFormula?.(withWaterBase(items));
  };
  const hasFormulaInput = nodes.some((node) => {
    if (node.type !== "substance" && node.type !== "modifier") return false;
    const nodeData = node.data as SubstanceData & ModifierData;
    return Boolean(nodeData.smiles?.trim()) && (Number(nodeData.concentration) || 0) > 0;
  });

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50">
      <div className="formula-graph-toolbar relative z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3">
        <div className="formula-graph-toolbar-primary flex min-w-0 items-center gap-2">
          <div className="relative">
            <div className="formula-graph-node-actions flex items-center gap-1">
              <button
                type="button"
                onClick={() => togglePicker("substance")}
                aria-haspopup="menu"
                aria-expanded={pickerOpen && pickerKind === "substance"}
                className={`formula-graph-node-button flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                  pickerOpen && pickerKind === "substance"
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand"
                }`}
              >
                <SemanticIcon name="flask" className="size-3.5" />
                <span className="formula-graph-node-label">สารในสูตร</span>
              </button>
              <button
                type="button"
                onClick={() => togglePicker("modifier")}
                aria-haspopup="menu"
                aria-expanded={pickerOpen && pickerKind === "modifier"}
                className={`formula-graph-node-button flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                  pickerOpen && pickerKind === "modifier"
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:text-amber-700"
                }`}
              >
                <SemanticIcon name="puzzle" className="size-3.5" />
                <span className="formula-graph-node-label">สารเสริมสูตร</span>
              </button>
              <button
                type="button"
                onClick={() => togglePicker("result")}
                aria-haspopup="menu"
                aria-expanded={pickerOpen && pickerKind === "result"}
                className={`formula-graph-node-button flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                  pickerOpen && pickerKind === "result"
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand"
                }`}
              >
                <SemanticIcon name="target" className="size-3.5" />
                <span className="formula-graph-node-label">ผลการประเมิน</span>
              </button>
            </div>

          {pickerOpen && (
            <div className="formula-graph-picker assess-scrollbar absolute left-0 top-[calc(100%+8px)] z-50 max-h-[min(72vh,640px)] w-[22rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl">
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <SemanticIcon
                    name={pickerKind === "substance" ? "flask" : pickerKind === "modifier" ? "puzzle" : "target"}
                    className={`size-3.5 ${pickerKind === "modifier" ? "text-amber-600" : "text-brand"}`}
                  />
                  <span className="truncate">
                    {pickerKind === "substance"
                      ? "เพิ่มสารในสูตร"
                      : pickerKind === "modifier"
                        ? "เพิ่มสารเสริมสูตร"
                        : "เพิ่มผลการประเมิน"}
                  </span>
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="คำอธิบายประเภท Node"
                          onClick={(event) => event.stopPropagation()}
                          className="grid size-5 shrink-0 place-items-center rounded text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
                        >
                          <SemanticIcon name="info" className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        sideOffset={7}
                        className="max-w-64 border border-slate-200 bg-white px-3 py-2 font-normal leading-4 text-slate-800 shadow-lg"
                      >
                        {pickerKind === "substance" && (
                          <span>สารหลักหรือส่วนประกอบในสูตร ระบุชื่อ SMILES และความเข้มข้นเพื่อใช้คำนวณจริง</span>
                        )}
                        {pickerKind === "modifier" && (
                          <span>สารเพิ่มเติมที่วางคั่นระหว่าง Node ได้ แต่ยังถูกนับเป็นส่วนผสมจริงและไม่ได้ลดคะแนนความเสี่ยง</span>
                        )}
                        {pickerKind === "result" && (
                          <span>ปลายทางที่รวบรวมสารซึ่งเชื่อมเข้ามา แล้วส่งสูตรไปประเมินความเสี่ยงด้วย QSAR</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    setPickerSearch("");
                  }}
                  aria-label="ปิดเครื่องมือเพิ่ม Node"
                  className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <SemanticIcon name="x" className="size-3.5" />
                </button>
              </div>

              {pickerKind !== "result" && (
                <div className="mb-2 flex items-center gap-2">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">ค้นหาสาร</span>
                    <SemanticIcon
                      name="search"
                      className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="search"
                      value={pickerSearch}
                      onChange={(event) => setPickerSearch(event.target.value)}
                      placeholder="ค้นหาชื่อสารหรือ SMILES"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/10"
                    />
                  </label>
                  {pickerKind === "substance" && (
                    <TooltipProvider delayDuration={250}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => addSubstance()}
                            aria-label="สร้าง Node สารเปล่า"
                            className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-brand transition-colors hover:border-brand hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15"
                          >
                            <SemanticIcon name="plus" className="size-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          sideOffset={7}
                          className="border border-slate-200 bg-white text-slate-800 shadow-lg"
                        >
                          สร้าง Node สารเปล่า
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}

              {pickerKind === "result" ? (
                <button
                  type="button"
                  onClick={() => {
                    addResult();
                    setPickerOpen(false);
                  }}
                  className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"
                >
                  <SemanticIcon name="target" className="size-3.5" />
                  เพิ่ม Node ผลการประเมิน
                </button>
              ) : (
                <>
                  <div className="my-2 flex items-center gap-2 px-1">
                    <span className="text-[10px] font-semibold text-slate-400">
                      {pickerKind === "modifier" ? "เลือกสารเสริมสูตรจากคลัง" : "เลือกสารในสูตรจากคลัง"}
                    </span>
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>

                  {filteredSubstanceLibrary.map((group) => {
                    const open = pickerSearch.trim() ? true : !collapsed[group.category];
                    return (
                      <div key={group.category} className="mb-1">
                        <button
                          type="button"
                          onClick={() => toggleCat(group.category)}
                          className="flex w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          <SemanticIcon name={group.icon} className="size-3.5" />
                          <span className="flex-1">{group.category}</span>
                          <span className="text-[9px] text-slate-400">{group.items.length}</span>
                          <SemanticIcon name="chevron-down" className={`size-3 transition ${open ? "" : "-rotate-90"}`} />
                        </button>
                        {open && (
                          <div className="mt-0.5 space-y-0.5 pl-1">
                            {group.items.map((it) => (
                              <button
                                key={it.smiles}
                                type="button"
                                onClick={() => {
                                  if (pickerKind === "modifier") addModifierBySmiles(it.smiles);
                                  else addSubstance(it);
                                }}
                                title={it.smiles}
                                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-slate-700 ${
                                  pickerKind === "modifier" ? "hover:bg-amber-50" : "hover:bg-teal-50"
                                }`}
                              >
                                <SemanticIcon
                                  name="circle"
                                  className={`size-2.5 ${pickerKind === "modifier" ? "text-amber-500" : "text-brand"}`}
                                />
                                <span className="flex-1 truncate">{it.name}</span>
                                <span className="font-mono text-[10px] text-slate-400">{it.conc}%</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredSubstanceLibrary.length === 0 && (
                    <div className="py-8 text-center text-xs text-slate-400">
                      ไม่พบสารที่ค้นหา
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
          <span className="hidden whitespace-nowrap text-[11px] text-slate-400 min-[1600px]:inline">
            {nodes.length} Node · {edges.length} เส้นเชื่อม
          </span>
        </div>

        <div className="formula-graph-toolbar-utilities flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowMiniMap((value) => !value)}
            aria-pressed={showMiniMap}
            title={showMiniMap ? "ซ่อนแผนที่ย่อ" : "แสดงแผนที่ย่อ"}
            aria-label={showMiniMap ? "ซ่อนแผนที่ย่อ" : "แสดงแผนที่ย่อ"}
            className={`grid size-8 place-items-center rounded-lg border transition-colors ${
              showMiniMap
                ? "border-brand/30 bg-teal-50 text-brand"
                : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"
            }`}
          >
            <SemanticIcon name="map" className="size-3.5" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setHelpOpen((value) => !value)}
              aria-expanded={helpOpen}
              title="วิธีใช้ Node Graph"
              aria-label="วิธีใช้ Node Graph"
              className={`grid size-8 place-items-center rounded-lg border transition-colors ${
                helpOpen
                  ? "border-brand/30 bg-teal-50 text-brand"
                  : "border-slate-200 bg-white text-slate-500 hover:text-slate-800"
              }`}
            >
              <SemanticIcon name="lightbulb" className="size-3.5" />
            </button>
            {helpOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-600 shadow-xl">
                <div className="mb-1 font-semibold text-slate-800">วิธีใช้ Node Graph</div>
                <p>ลากจากจุดเชื่อมด้านขวาของสารไปยัง Node ผลการประเมิน</p>
                <p className="mt-1 text-slate-400">ต้องเชื่อมสารทุกตัวในสูตรก่อนส่งเข้า QSAR</p>
              </div>
            )}
          </div>

          {onSaveFormula && (
          <button
            type="button"
            onClick={saveAsFormula}
            disabled={!hasFormulaInput}
            title="บันทึก node graph ปัจจุบันเป็นสูตรใหม่ในลิสต์ (น้ำเติมให้ครบ 100% อัตโนมัติ)"
            className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <SemanticIcon name="save" className="size-3.5" />
            <span className="hidden min-[900px]:inline">บันทึกเป็นสูตร</span>
          </button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={(event, edge) => setEdgeMenu({ id: edge.id, x: event.clientX, y: event.clientY })}
          onPaneClick={() => {
            setEdgeMenu(null);
            setPickerOpen(false);
            setHelpOpen(false);
          }}
          onMoveEnd={(_, viewport) => setGraphViewport(viewport)}
          nodeTypes={nodeTypes}
          defaultViewport={initial.viewport}
          fitView={!snapshot}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#CBD5E1" gap={18} />
          <Controls showInteractive={false} className="formula-graph-controls" />
          {showMiniMap && (
            <MiniMap
              pannable
              zoomable
              className="formula-graph-minimap !border !border-slate-200 !bg-white"
            />
          )}
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
            <div className="pointer-events-auto max-w-xs text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-brand shadow-card">
                <SemanticIcon name="puzzle" className="size-5" />
              </span>
              <div className="mt-3 text-sm font-semibold text-slate-800">ยังไม่มี Node</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">เพิ่มสารหรือผลการประเมินเพื่อเริ่มสร้างลำดับการทดสอบ</p>
              <button
                type="button"
                onClick={() => {
                  setPickerKind("substance");
                  setPickerOpen(true);
                }}
                className="mt-3 h-8 rounded-lg bg-brand px-4 text-xs font-semibold text-white hover:bg-brand-dark"
              >
                เพิ่ม Node แรก
              </button>
            </div>
          </div>
        )}
      </div>

      {edgeMenu && (
        <button
          style={{ position: "fixed", left: edgeMenu.x, top: edgeMenu.y, transform: "translate(-50%, -130%)" }}
          onClick={() => {
            setEdges((eds) => eds.filter((e) => e.id !== edgeMenu.id));
            setEdgeMenu(null);
          }}
          className="z-50 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg hover:bg-rose-600"
        >
          <SemanticIcon name="link-off" className="size-3.5" /> ลบเส้นเชื่อม
        </button>
      )}
    </div>
  );
}

export default function FormulaGraph({
  seed = [],
  region = "face",
  projectId = null,
  snapshot = null,
  onSnapshotPreview,
  onSnapshotChange,
  onSaveFormula,
  syncWithSeed = false,
  onRegionChange,
}: {
  seed?: FormulaItem[];
  region?: Region;
  projectId?: number | null;
  snapshot?: FormulaGraphSnapshot | null;
  onSnapshotPreview?: (snapshot: FormulaGraphSnapshot) => void;
  onSnapshotChange?: (snapshot: FormulaGraphSnapshot) => void;
  /** @deprecated Accepted only for compatibility; Graph edits remain in the draft. */
  onFormulaChange?: (items: FormulaItem[]) => void;
  onSaveFormula?: (items: FormulaItem[]) => void;
  syncWithSeed?: boolean;
  onRegionChange?: (region: Region) => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphInner
        seed={seed}
        region={region}
        projectId={projectId}
        snapshot={snapshot}
        onSnapshotPreview={onSnapshotPreview}
        onSnapshotChange={onSnapshotChange}
        onSaveFormula={onSaveFormula}
        syncWithSeed={syncWithSeed}
        onRegionChange={onRegionChange}
      />
    </ReactFlowProvider>
  );
}
