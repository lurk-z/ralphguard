"use client";

/**
 * FormulaGraph — node-based formula/pipeline editor (Blender-style).
 * Substance nodes → wired into a Result node → runs the real QSAR pipeline.
 * Makes the "unambiguous algorithm" (OECD principle 2) visible and lets users
 * build a mixture as a graph and compare what-if edits live.
 */
import "reactflow/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { FormulaItem, Region, api } from "../lib/api";
import { SUBSTANCE_LIBRARY, withWaterBase, substanceInfo, type CatalogItem } from "../lib/catalog";
import {
  formulaGraphItemsSignature,
  formulaItemsFromGraph,
  synchronizeGraphWithFormula,
} from "../lib/formula-graph";
import {
  normalizeFormulaGraphSnapshot,
  type FormulaGraphNodeSnapshot,
  type FormulaGraphSnapshot,
} from "../lib/project-workspace";
import { SemanticIcon } from "@/components/SemanticIcon";

const ENDPOINTS = ["skin", "eye", "sens", "acute"] as const;
const ENDPOINT_LABEL_TH: Record<string, string> = {
  skin: "ระคายเคืองผิว",
  eye: "ระคายเคืองตา",
  sens: "แพ้ผิวหนัง",
  acute: "พิษเฉียบพลัน",
};
const REGIONS: { value: Region; label: string }[] = [
  { value: "forearm", label: "ท่อนแขน" },
  { value: "hand", label: "มือ" },
  { value: "face", label: "ใบหน้า" },
  { value: "eye", label: "ดวงตา" },
];
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

function SubstanceNode({
  id,
  data,
  onRemove,
}: NodeProps<SubstanceData> & { onRemove?: (id: string) => void }) {
  const { setNodes } = useReactFlow();
  const patch = (p: Partial<SubstanceData>) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    );
  const remove = () => {
    onRemove?.(id);
  };

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

  return (
    <div
      className="relative w-56 rounded-lg border border-slate-200 bg-white shadow-card"
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
      <button
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
          remove();
        }}
        onClick={(event) => event.stopPropagation()}
        title="ลบ node"
        aria-label="ลบ node"
        className="nodrag nopan absolute -right-2 -top-2 z-10 grid size-5 place-items-center rounded-full border border-slate-200 bg-white text-sm leading-none text-slate-400 shadow-card transition hover:border-rose-300 hover:bg-rose-500 hover:text-white"
      >
        <SemanticIcon name="x" className="size-3" />
      </button>
      <div className="flex items-center justify-between rounded-t-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800">
        <span className="flex items-center gap-1"><SemanticIcon name="flask" className="size-3.5" /> สาร</span>
        <span className="font-mono text-[10px] text-slate-800/45">#{id}</span>
      </div>
      <div className="nodrag nowheel space-y-1.5 p-3">
        <input
          className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
          placeholder="ชื่อสาร"
          value={data.name ?? ""}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <input
          className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-800"
          placeholder="SMILES เช่น CCO"
          value={data.smiles}
          onChange={(e) => patch({ smiles: e.target.value })}
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs tabular-nums text-slate-800"
            value={data.concentration}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const normalized = e.currentTarget.value.replace(/^0+(?=\d)/, "");
              if (normalized !== e.currentTarget.value) e.currentTarget.value = normalized;
              patch({ concentration: Number.parseFloat(normalized) || 0 });
            }}
            onBlur={(e) => {
              const normalized = Math.min(100, Math.max(0, Number(e.currentTarget.value) || 0));
              e.currentTarget.value = String(normalized);
              patch({ concentration: normalized });
            }}
          />
          <span className="text-xs text-slate-800/55">%</span>
        </div>
        {valid === true && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600"><SemanticIcon name="check" className="size-3" /> ถูกต้อง{mw != null ? ` · MW ${mw}` : ""}</div>
        )}
        {valid === false && <div className="flex items-center gap-1 text-[10px] text-rose-500"><SemanticIcon name="x-circle" className="size-3" /> SMILES ไม่ถูกต้อง</div>}
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
  status?: "idle" | "queued" | "running" | "completed" | "failed";
  endpoints?: Record<string, { peak_score: number }>;
  error?: string;
};

function ResultNode({ id, data }: NodeProps<ResultData>) {
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const patch = (p: Partial<ResultData>) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    );

  const run = async () => {
    // Walk upstream from the result → collect every substance AND modifier in the
    // chain (supports substance → modifier → result and longer chains).
    const allEdges = getEdges();
    const allNodes = getNodes();
    const incoming = (nid: string) => allEdges.filter((e) => e.target === nid).map((e) => e.source);
    const seen = new Set<string>();
    const stack = [id];
    const subs: SubstanceData[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const src of incoming(cur)) {
        if (seen.has(src)) continue;
        seen.add(src);
        stack.push(src);
        const n = allNodes.find((nn) => nn.id === src);
        if (n?.type === "substance") subs.push(n.data as SubstanceData);
        else if (n?.type === "modifier") {
          const md = n.data as ModifierData;
          if (md.smiles?.trim() && md.concentration > 0)
            subs.push({ name: md.name, smiles: md.smiles, concentration: md.concentration });
        }
      }
    }
    const formula: FormulaItem[] = withWaterBase(
      subs
        .filter((d) => d.smiles?.trim() && d.concentration > 0)
        .map((d) => ({ name: d.name || "", smiles: d.smiles, concentration: d.concentration })),
    );

    if (formula.length === 0) {
      patch({ status: "failed", error: "ยังไม่มีสารที่เชื่อมเข้ามา (ลากเส้นจาก node สาร → node ผล)" });
      return;
    }
    patch({ status: "queued", error: undefined, endpoints: undefined });
    try {
      const { job_id } = await api.createAssessment(formula, data.region, data.projectId ?? null);
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

  return (
    <div className="w-64 rounded-lg border-2 border-brand/50 bg-white shadow-soft">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-brand"
      />
      <div className="flex items-center gap-1 rounded-t-lg bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark">
        <SemanticIcon name="target" className="size-3.5" /> ผลการประเมิน
      </div>
      <div className="nodrag nowheel space-y-2 p-3">
        <label className="flex items-center justify-between gap-2 text-[11px] text-slate-800/65">
          บริเวณ:
          <select
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
            value={data.region}
            onChange={(e) => patch({ region: e.target.value as Region })}
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>

        <button
          onClick={run}
          disabled={busy}
          className="w-full rounded-lg bg-brand py-2 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
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
  onRemove,
}: NodeProps<ModifierData> & { onRemove?: (id: string) => void }) {
  const { setNodes } = useReactFlow();
  const patch = (p: Partial<ModifierData>) =>
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
  const remove = () => {
    onRemove?.(id);
  };
  return (
    <div className="relative w-52 rounded-lg border-2 border-amber-300 bg-amber-50 shadow-card">
      <button
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
          remove();
        }}
        onClick={(event) => event.stopPropagation()}
        title="ลบ node"
        aria-label="ลบ node"
        className="nodrag nopan absolute -right-2 -top-2 z-10 grid size-5 place-items-center rounded-full border border-slate-200 bg-white text-sm leading-none text-slate-400 shadow-card hover:border-rose-300 hover:bg-rose-500 hover:text-white"
      >
        <SemanticIcon name="x" className="size-3" />
      </button>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-amber-400" />
      <div className="flex items-center gap-1 rounded-t-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800"><SemanticIcon name="puzzle" className="size-3.5" /> สารเสริมสูตร</div>
      <div className="nodrag nowheel space-y-1.5 p-3 text-xs">
        <div className="flex items-center gap-1">
          <SemanticIcon name="circle" className="size-2.5 text-amber-600" />
          <input
            className="min-w-0 flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-slate-800"
            value={data.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="ชื่อสาร"
          />
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="w-11 rounded border border-amber-200 bg-white px-1 py-1 text-right font-mono tabular-nums text-slate-800"
            value={data.concentration}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const normalized = e.currentTarget.value.replace(/^0+(?=\d)/, "");
              if (normalized !== e.currentTarget.value) e.currentTarget.value = normalized;
              patch({ concentration: Number.parseFloat(normalized) || 0 });
            }}
            onBlur={(e) => {
              const normalized = Math.min(100, Math.max(0, Number(e.currentTarget.value) || 0));
              e.currentTarget.value = String(normalized);
              patch({ concentration: normalized });
            }}
          />
          <span className="text-[10px] text-slate-500">%</span>
        </div>
        <div className="truncate pl-4 font-mono text-[10px] text-slate-400">{data.smiles || "—"}</div>
        <div className="rounded border border-amber-200 bg-white/70 px-2 py-1.5 text-[10px] leading-snug text-amber-800">
          สารนี้จะถูกส่งเข้า scientific pipeline จริง ระบบไม่ลดคะแนนด้วยค่าที่กำหนดเอง
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
): Node => ({
  ...node,
  data: node.type === "result"
    ? { ...node.data, region: node.data.region ?? "face", projectId }
    : node.data,
});

const graphSnapshotFromFlow = (
  nodes: Node[],
  edges: Edge[],
  viewport: FormulaGraphSnapshot["viewport"],
): FormulaGraphSnapshot =>
  normalizeFormulaGraphSnapshot({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: edge.animated,
    })),
    viewport,
  })!;

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
  onSnapshotChange,
  onFormulaChange,
  onSaveFormula,
}: {
  seed: FormulaItem[];
  region: Region;
  projectId?: number | null;
  snapshot?: FormulaGraphSnapshot | null;
  onSnapshotChange?: (snapshot: FormulaGraphSnapshot) => void;
  onFormulaChange?: (items: FormulaItem[]) => void;
  onSaveFormula?: (items: FormulaItem[]) => void;
}) {
  const initial = useMemo(
    () => synchronizeGraphWithFormula(snapshot, seed, region),
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initial.nodes.map((node) => graphNodeToFlowNode(node, projectId)),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges as Edge[]);
  const [graphViewport, setGraphViewport] = useState(initial.viewport);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(graphViewport);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  viewportRef.current = graphViewport;

  const seedSignature = formulaGraphItemsSignature(seed);
  // The selected formula is the source of truth when its ingredients change
  // outside node mode. Existing positions/result nodes remain attached to it.
  useEffect(() => {
    const current = graphSnapshotFromFlow(
      nodesRef.current,
      edgesRef.current,
      viewportRef.current,
    );
    if (formulaGraphItemsSignature(formulaItemsFromGraph(current)) === seedSignature) return;
    const synced = synchronizeGraphWithFormula(current, seed, region);
    setNodes(synced.nodes.map((node) => graphNodeToFlowNode(node, projectId)));
    setEdges(synced.edges as Edge[]);
    // Depend on the content signature instead of the `seed` array identity.
    // The parent rebuilds its formula-items array while graph snapshots are
    // being persisted; reacting to that identity-only change can restore a
    // chemical node immediately after the user deletes it.
  }, [projectId, region, seedSignature, setEdges, setNodes]);

  const currentSnapshot = useMemo(
    () => graphSnapshotFromFlow(nodes, edges, graphViewport),
    [edges, graphViewport, nodes],
  );
  const currentFormulaItems = useMemo(
    () => formulaItemsFromGraph(currentSnapshot),
    [currentSnapshot],
  );
  const currentFormulaSignature = formulaGraphItemsSignature(currentFormulaItems);
  const lastFormulaSignatureRef = useRef(seedSignature);
  const onFormulaChangeRef = useRef(onFormulaChange);
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onFormulaChangeRef.current = onFormulaChange;
  onSnapshotChangeRef.current = onSnapshotChange;

  // Editing, adding, or deleting a chemical node updates only the selected
  // formula. Moving nodes or changing edges never mutates formula ingredients.
  useEffect(() => {
    if (currentFormulaSignature === lastFormulaSignatureRef.current) return;
    lastFormulaSignatureRef.current = currentFormulaSignature;
    onFormulaChangeRef.current?.(currentFormulaItems);
  }, [currentFormulaItems, currentFormulaSignature]);

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
                region: (node.data as ResultData).region ?? region,
                projectId,
                status: "idle",
              },
            }
          : node,
      ),
    );
  }, [currentFormulaSignature, projectId, region, setNodes]);

  const latestSnapshotRef = useRef(currentSnapshot);
  latestSnapshotRef.current = currentSnapshot;
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
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // categories collapsed state — all open by default
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCat = (c: string) => setCollapsed((s) => ({ ...s, [c]: !s[c] }));

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
      result: ResultNode,
      modifier: (props) => <ModifierNode {...props} onRemove={removeNode} />,
    }),
    [removeNode],
  );

  const addSubstance = (item?: LibItem) =>
    setNodes((nds) => {
      const id = nextUniqueId(nds);
      return [
        ...nds,
        {
          id,
          type: "substance",
          position: { x: 40, y: 40 + Math.min(nds.length, 6) * 60 },
          data: item
            ? { name: item.name, smiles: item.smiles, concentration: item.conc }
            : { name: "", smiles: "", concentration: 10 },
        },
      ];
    });

  const addResult = () =>
    setNodes((nds) => {
      const id = nextUniqueId(nds);
      return [
        ...nds,
        {
          id,
          type: "result",
          position: { x: 500, y: 40 + Math.min(nds.length, 6) * 90 },
          data: { region, projectId, status: "idle" },
        },
      ];
    });

  const addModifierBySmiles = (smiles: string) => {
    const it = SUBSTANCE_LIBRARY.flatMap((g) => g.items).find((s) => s.smiles === smiles);
    if (!it) return;
    setNodes((nds) => {
      const id = nextUniqueId(nds);
      return [
        ...nds,
        {
          id,
          type: "modifier",
          position: { x: 250, y: 40 + Math.min(nds.length, 6) * 60 },
          data: { name: it.name, smiles: it.smiles, concentration: it.conc },
        },
      ];
    });
  };

  // Save the current graph (every substance + modifier node) as a new formula.
  const saveAsFormula = () => {
    const items: FormulaItem[] = nodes
      .filter((n) => n.type === "substance" || n.type === "modifier")
      .map((n) => n.data as SubstanceData & ModifierData)
      .filter((d) => d.smiles?.trim() && (Number(d.concentration) || 0) > 0)
      .map((d) => ({ name: d.name || "", smiles: d.smiles, concentration: Number(d.concentration) }));
    if (!items.length) return;
    onSaveFormula?.(withWaterBase(items));
  };

  return (
    <div className="relative h-[75vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="absolute left-3 top-3 z-10 flex items-start gap-2">
        {/* Add-substance button + category picker */}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-card transition ${
              pickerOpen
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-brand hover:border-brand"
            }`}
          >
            + เพิ่ม node สาร
            <SemanticIcon name="chevron-down" className={`size-3 transition ${pickerOpen ? "rotate-180" : ""}`} />
          </button>

          {pickerOpen && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-[62vh] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-soft">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-slate-500">เลือกสารจากหมวดหมู่</span>
                <button
                  onClick={() => setPickerOpen(false)}
                  aria-label="ปิดรายการสาร"
                  className="text-slate-400 hover:text-slate-700"
                >
                  <SemanticIcon name="x" className="size-3.5" />
                </button>
              </div>

              {/* blank node option */}
              <button
                onClick={() => addSubstance()}
                className="mb-1.5 w-full rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-left text-xs text-slate-500 hover:border-brand hover:text-brand"
              >
                <span className="inline-flex items-center gap-1"><SemanticIcon name="pencil" className="size-3" /> สารเปล่า (กรอกเอง)</span>
              </button>

              {SUBSTANCE_LIBRARY.map((group) => {
                const open = !collapsed[group.category];
                return (
                  <div key={group.category} className="mb-1">
                    <button
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
                            onClick={() => addSubstance(it)}
                            title={it.smiles}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-slate-700 hover:bg-teal-50"
                          >
                            <SemanticIcon name="circle" className="size-2.5 text-brand" />
                            <span className="flex-1 truncate">{it.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">{it.conc}%</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {pickerOpen && (
            <div className="absolute left-[16.5rem] top-[calc(100%+6px)] z-20 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-soft">
              <div className="mb-1 px-1 text-[11px] font-semibold text-slate-500">ทดสอบหลายชุดพร้อมกัน</div>
              <button
                onClick={addResult}
                className="flex w-full items-center gap-2 rounded-md border border-brand/40 bg-teal-50 px-2 py-2 text-xs font-medium text-brand-dark transition hover:bg-brand hover:text-white"
              >
                <SemanticIcon name="target" className="size-3.5" /> เพิ่ม node ผลการประเมิน
              </button>
              <p className="mt-1.5 px-1 text-[10px] leading-snug text-slate-400">
                ต่อสารแต่ละกลุ่มไปคนละ node ผล เพื่อเทียบหลายสูตรพร้อมกัน
              </p>
            </div>
          )}
        </div>

        {/* Add a real supporting ingredient from the catalog. */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addModifierBySmiles(e.target.value);
            e.currentTarget.selectedIndex = 0;
          }}
          title="เพิ่มสารเสริมสูตรจากคลังสารจริง"
          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800 shadow-card"
        >
          <option value="">+ สารเสริมสูตร…</option>
          {SUBSTANCE_LIBRARY.map((g) => (
            <optgroup key={g.category} label={g.category}>
              {g.items.map((it) => (
                <option key={it.smiles} value={it.smiles}>{it.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {onSaveFormula && (
          <button
            onClick={saveAsFormula}
            title="บันทึก node graph ปัจจุบันเป็นสูตรใหม่ในลิสต์ (น้ำเติมให้ครบ 100% อัตโนมัติ)"
            className="flex items-center gap-1 rounded-lg border border-brand bg-white px-3 py-1.5 text-xs font-medium text-brand shadow-card transition hover:bg-brand hover:text-white"
          >
            <SemanticIcon name="save" className="size-3.5" /> บันทึกเป็นสูตร
          </button>
        )}

        <span className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-[11px] text-slate-500 shadow-card">
          ลากเส้น node → node · ทุกสารที่เชื่อมถึงผลจะถูกส่งเข้า QSAR จริง
        </span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={(e, edge) => setEdgeMenu({ id: edge.id, x: e.clientX, y: e.clientY })}
        onPaneClick={() => setEdgeMenu(null)}
        onMoveEnd={(_, viewport) => setGraphViewport(viewport)}
        nodeTypes={nodeTypes}
        defaultViewport={initial.viewport}
        fitView={!snapshot}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#CBD5E1" gap={18} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-white !border !border-slate-200" />
      </ReactFlow>

      {edgeMenu && (
        <button
          style={{ position: "fixed", left: edgeMenu.x, top: edgeMenu.y, transform: "translate(-50%, -130%)" }}
          onClick={() => {
            setEdges((eds) => eds.filter((e) => e.id !== edgeMenu.id));
            setEdgeMenu(null);
          }}
          className="z-50 rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg hover:bg-rose-600"
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
  onSnapshotChange,
  onFormulaChange,
  onSaveFormula,
}: {
  seed?: FormulaItem[];
  region?: Region;
  projectId?: number | null;
  snapshot?: FormulaGraphSnapshot | null;
  onSnapshotChange?: (snapshot: FormulaGraphSnapshot) => void;
  onFormulaChange?: (items: FormulaItem[]) => void;
  onSaveFormula?: (items: FormulaItem[]) => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphInner
        seed={seed}
        region={region}
        projectId={projectId}
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
        onFormulaChange={onFormulaChange}
        onSaveFormula={onSaveFormula}
      />
    </ReactFlowProvider>
  );
}
