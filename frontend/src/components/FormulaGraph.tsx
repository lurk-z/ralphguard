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
} from "reactflow";

import { FormulaItem, Region, api } from "../lib/api";

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

// ─────────────────────────── Substance node ───────────────────────────
type SubstanceData = { name?: string; smiles: string; concentration: number };

function SubstanceNode({ id, data }: NodeProps<SubstanceData>) {
  const { setNodes } = useReactFlow();
  const patch = (p: Partial<SubstanceData>) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    );

  const [valid, setValid] = useState<null | boolean>(null);
  const [mw, setMw] = useState<number | null>(null);
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
    <div className="w-56 rounded-lg border border-border bg-card shadow-md">
      <div className="flex items-center justify-between rounded-t-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground">
        <span>🧪 สาร</span>
        <span className="font-mono text-[10px] text-muted-foreground">#{id}</span>
      </div>
      <div className="space-y-1.5 p-3">
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
          placeholder="ชื่อสาร"
          value={data.name ?? ""}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground"
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
            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs tabular-nums text-foreground"
            value={data.concentration}
            onChange={(e) => patch({ concentration: parseFloat(e.target.value) || 0 })}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        {valid === true && (
          <div className="text-[10px] text-emerald-600">✓ ถูกต้อง{mw != null ? ` · MW ${mw}` : ""}</div>
        )}
        {valid === false && <div className="text-[10px] text-rose-500">✗ SMILES ไม่ถูกต้อง</div>}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

// ─────────────────────────── Result node ───────────────────────────
type ResultData = {
  region: Region;
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
    // Collect substance nodes wired into this result node
    const wired = new Set(getEdges().filter((e) => e.target === id).map((e) => e.source));
    const formula: FormulaItem[] = getNodes()
      .filter((n) => n.type === "substance" && wired.has(n.id))
      .map((n) => n.data as SubstanceData)
      .filter((d) => d.smiles?.trim() && d.concentration > 0)
      .map((d) => ({ name: d.name, smiles: d.smiles, concentration: d.concentration }));

    if (formula.length === 0) {
      patch({ status: "failed", error: "ยังไม่มีสารที่เชื่อมเข้ามา (ลากเส้นจาก node สาร → node ผล)" });
      return;
    }
    patch({ status: "queued", error: undefined, endpoints: undefined });
    try {
      const { job_id } = await api.createAssessment(formula, data.region, null);
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
    <div className="w-64 rounded-lg border-2 border-primary/40 bg-card shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
      <div className="rounded-t-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
        🎯 ผลการประเมิน
      </div>
      <div className="space-y-2 p-3">
        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          บริเวณ:
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
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
          className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "กำลังประเมิน…" : "▶ ประเมิน"}
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
                  <span className="w-20 shrink-0 text-[10px] text-muted-foreground">
                    {ENDPOINT_LABEL_TH[ep]}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
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

const nodeTypes = { substance: SubstanceNode, result: ResultNode };

let idCounter = 100;
const nextId = () => String(++idCounter);

const DEFAULT_SEED: FormulaItem[] = [
  { name: "Ethanol", smiles: "CCO", concentration: 40 },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O", concentration: 5 },
];

function buildGraph(seed: FormulaItem[], region: Region): { nodes: Node[]; edges: Edge[] } {
  const items = seed.length ? seed : DEFAULT_SEED;
  const nodes: Node[] = items.map((it, i) => ({
    id: `s${i + 1}`,
    type: "substance",
    position: { x: 40, y: 40 + i * 200 },
    data: { name: it.name, smiles: it.smiles, concentration: it.concentration },
  }));
  const cy = 40 + Math.max(0, items.length - 1) * 100;
  nodes.push({ id: "r1", type: "result", position: { x: 460, y: cy }, data: { region, status: "idle" } });
  const edges: Edge[] = items.map((_, i) => ({
    id: `e-s${i + 1}`,
    source: `s${i + 1}`,
    target: "r1",
    animated: true,
  }));
  return { nodes, edges };
}

function GraphInner({ seed, region }: { seed: FormulaItem[]; region: Region }) {
  const initial = useMemo(() => buildGraph(seed, region), []); // seed once on mount
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)),
    [setEdges],
  );

  const addSubstance = () =>
    setNodes((nds) => [
      ...nds,
      {
        id: nextId(),
        type: "substance",
        position: { x: 40, y: 40 + Math.min(nds.length, 6) * 60 },
        data: { name: "", smiles: "", concentration: 10 },
      },
    ]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <button
          onClick={addSubstance}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary shadow-sm hover:border-primary hover:bg-accent/40"
        >
          + เพิ่ม node สาร
        </button>
        <span className="rounded-lg border border-border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
          ลากจากจุดขวาของ node สาร → จุดซ้ายของ node ผล เพื่อเชื่อม
        </span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#D9DEE3" gap={18} />
        <Controls showInteractive={false} className="[&_button]:!border-border [&_button]:!bg-card [&_button]:!text-foreground [&_button:hover]:!bg-secondary" />
        <MiniMap pannable zoomable className="!bg-card !border !border-border" />
      </ReactFlow>
    </div>
  );
}

export default function FormulaGraph({
  seed = [],
  region = "face",
}: {
  seed?: FormulaItem[];
  region?: Region;
}) {
  return (
    <ReactFlowProvider>
      <GraphInner seed={seed} region={region} />
    </ReactFlowProvider>
  );
}
