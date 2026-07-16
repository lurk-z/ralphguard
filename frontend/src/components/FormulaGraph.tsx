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
import { SUBSTANCE_LIBRARY, withWaterBase, substanceInfo, type CatalogItem } from "../lib/catalog";

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

function SubstanceNode({ id, data }: NodeProps<SubstanceData>) {
  const { setNodes, setEdges } = useReactFlow();
  const patch = (p: Partial<SubstanceData>) =>
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    );
  const remove = () => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
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
      className="relative w-56 rounded-lg border border-border bg-card shadow-md"
      onMouseEnter={startHover}
      onMouseLeave={endHover}
    >
      {showInfo && (data.smiles?.trim() || data.name) && (
        <div className="nodrag nowheel absolute left-full top-0 z-30 ml-3 w-60 rounded-xl border border-border bg-card p-3 text-left shadow-md">
          <div className="flex items-center gap-1.5">
            <span className="text-primary">◇</span>
            <span className="flex-1 truncate text-xs font-semibold text-foreground">{data.name || "สารไม่ระบุชื่อ"}</span>
            {mw != null && <span className="font-mono text-[9px] text-muted-foreground">MW {mw}</span>}
          </div>
          {category && (
            <div className="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {category}
            </div>
          )}
          {info ? (
            <>
              <div className="mt-1.5 text-[11px] leading-snug text-foreground">{info.role}</div>
              <div className="mt-1 flex gap-1 text-[10px] leading-snug text-amber-700">
                <span>⚠️</span>
                <span>{info.note}</span>
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              สารกำหนดเอง (SMILES: <span className="font-mono">{data.smiles || "-"}</span>) — ยังไม่มีข้อมูลรายละเอียดในคลัง
            </div>
          )}
          <div className="mt-1.5 font-mono text-[9px] text-muted-foreground">SMILES: {data.smiles || "-"}</div>
        </div>
      )}
      <button
        onClick={remove}
        title="ลบ node"
        className="nodrag nopan absolute -right-2 -top-2 z-10 grid size-5 place-items-center rounded-full border border-border bg-card text-sm leading-none text-muted-foreground shadow-md transition hover:border-rose-300 hover:bg-rose-500 hover:text-white"
      >
        ×
      </button>
      <div className="flex items-center justify-between rounded-t-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground">
        <span>🧪 สาร</span>
        <span className="font-mono text-[10px] text-muted-foreground">#{id}</span>
      </div>
      <div className="nodrag nowheel space-y-1.5 p-3">
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
          placeholder="ชื่อสาร"
          value={data.name ?? ""}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
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
    // Walk upstream from the result → collect every substance AND modifier in the
    // chain (supports substance → modifier → result and longer chains).
    const allEdges = getEdges();
    const allNodes = getNodes();
    const incoming = (nid: string) => allEdges.filter((e) => e.target === nid).map((e) => e.source);
    const seen = new Set<string>();
    const stack = [id];
    const subs: SubstanceData[] = [];
    const mods: ModifierData[] = [];
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
          mods.push(md);
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
      const { job_id } = await api.createAssessment(formula, data.region, null);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const rec = await api.getAssessment(job_id);
          if (rec.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            patch({ status: "completed", endpoints: applyModifiers(rec.result?.endpoints as any, mods) });
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
      <div className="nodrag nowheel space-y-2 p-3">
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

// ─────────────────────────── Modifier node ───────────────────────────
// A "ตัวปรับสูตร" inserted in the chain reduces an unwanted property (endpoint)
// of the substances upstream of it — e.g. add a soothing agent to cut irritation
// without removing the active ingredient.
type ModTarget = "skin" | "eye" | "sens" | "acute" | "all";
type ModifierData = {
  name: string;
  smiles: string;
  concentration: number;
  target: ModTarget;
  reduce: number;
};
const MOD_TARGET_LABEL: Record<ModTarget, string> = {
  skin: "ระคายเคืองผิว",
  eye: "ระคายเคืองตา",
  sens: "แพ้ผิวหนัง",
  acute: "พิษเฉียบพลัน",
  all: "ทุกด้าน",
};

function applyModifiers(
  endpoints: Record<string, { peak_score: number }> | undefined,
  mods: ModifierData[],
): Record<string, { peak_score: number }> {
  const out: Record<string, { peak_score: number }> = {};
  ENDPOINTS.forEach((ep) => {
    let sc = endpoints?.[ep]?.peak_score ?? 0;
    mods.forEach((m) => {
      if (m.target === ep || m.target === "all") sc *= 1 - m.reduce;
    });
    out[ep] = { ...(endpoints?.[ep] ?? {}), peak_score: Math.max(0, sc) };
  });
  return out;
}

function ModifierNode({ id, data }: NodeProps<ModifierData>) {
  const { setNodes, setEdges } = useReactFlow();
  const patch = (p: Partial<ModifierData>) =>
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
  const remove = () => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };
  return (
    <div className="relative w-52 rounded-lg border-2 border-amber-300 bg-amber-50 shadow-md">
      <button
        onClick={remove}
        title="ลบ node"
        className="nodrag nopan absolute -right-2 -top-2 z-10 grid size-5 place-items-center rounded-full border border-border bg-card text-sm leading-none text-muted-foreground shadow-md hover:border-rose-300 hover:bg-rose-500 hover:text-white"
      >
        ×
      </button>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-background !bg-amber-400" />
      <div className="rounded-t-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">🧩 ตัวปรับสูตร</div>
      <div className="nodrag nowheel space-y-1.5 p-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-amber-600">◈</span>
          <input
            className="min-w-0 flex-1 rounded border border-amber-200 bg-card px-2 py-1 text-foreground"
            value={data.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="ชื่อสาร"
          />
          <input
            type="number"
            min={0}
            max={100}
            className="w-11 rounded border border-amber-200 bg-card px-1 py-1 text-right font-mono tabular-nums text-foreground"
            value={data.concentration}
            onChange={(e) => patch({ concentration: parseFloat(e.target.value) || 0 })}
          />
          <span className="text-[10px] text-muted-foreground">%</span>
        </div>
        <div className="truncate pl-4 font-mono text-[10px] text-muted-foreground">{data.smiles || "—"}</div>
        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          ลดด้าน:
          <select
            className="rounded border border-amber-200 bg-card px-1 py-0.5 text-xs text-foreground"
            value={data.target}
            onChange={(e) => patch({ target: e.target.value as ModTarget })}
          >
            {(["skin", "eye", "sens", "acute", "all"] as ModTarget[]).map((t) => (
              <option key={t} value={t}>{MOD_TARGET_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] text-muted-foreground">
          ลดลง {Math.round(data.reduce * 100)}%
          <input
            type="range"
            min={0}
            max={90}
            value={Math.round(data.reduce * 100)}
            onChange={(e) => patch({ reduce: Number(e.target.value) / 100 })}
            className="w-full accent-amber-500"
          />
        </label>
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-background !bg-amber-400" />
    </div>
  );
}

const nodeTypes = { substance: SubstanceNode, result: ResultNode, modifier: ModifierNode };

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

function GraphInner({
  seed,
  region,
  onSaveFormula,
}: {
  seed: FormulaItem[];
  region: Region;
  onSaveFormula?: (items: FormulaItem[]) => void;
}) {
  const initial = useMemo(() => buildGraph(seed, region), []); // seed once on mount
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // Keep substance nodes in sync with the formula (e.g. AI reduced a concentration).
  // Updates matching nodes' conc/name and appends substances that have no node yet,
  // without wiping user-added modifier/result nodes.
  const prevSeedRef = useRef<string>(JSON.stringify(seed.map((s) => [s.smiles, s.concentration])));
  useEffect(() => {
    const sig = JSON.stringify(seed.map((s) => [s.smiles, s.concentration, s.name]));
    if (sig === prevSeedRef.current) return;
    prevSeedRef.current = sig;
    if (!seed.length) return;
    setNodes((nds) => {
      let next = nds.map((n) => {
        if (n.type !== "substance") return n;
        const d = n.data as SubstanceData;
        const m = seed.find((s) => s.smiles === d.smiles);
        return m ? { ...n, data: { ...d, concentration: m.concentration, name: m.name ?? d.name } } : n;
      });
      const have = new Set(
        next.filter((n) => n.type === "substance").map((n) => (n.data as SubstanceData).smiles),
      );
      let base = next.filter((n) => n.type === "substance").length;
      seed
        .filter((s) => s.smiles && !have.has(s.smiles))
        .forEach((s) => {
          next = [
            ...next,
            {
              id: nextId(),
              type: "substance",
              position: { x: 40, y: 40 + base * 200 },
              data: { name: s.name, smiles: s.smiles, concentration: s.concentration },
            },
          ];
          base += 1;
        });
      return next;
    });
  }, [seed, setNodes]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // categories collapsed state — all open by default
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCat = (c: string) => setCollapsed((s) => ({ ...s, [c]: !s[c] }));

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)),
    [setEdges],
  );

  const addSubstance = (item?: LibItem) =>
    setNodes((nds) => [
      ...nds,
      {
        id: nextId(),
        type: "substance",
        position: { x: 40, y: 40 + Math.min(nds.length, 6) * 60 },
        data: item
          ? { name: item.name, smiles: item.smiles, concentration: item.conc }
          : { name: "", smiles: "", concentration: 10 },
      },
    ]);

  const addResult = () =>
    setNodes((nds) => [
      ...nds,
      {
        id: nextId(),
        type: "result",
        position: { x: 500, y: 40 + Math.min(nds.length, 6) * 90 },
        data: { region, status: "idle" },
      },
    ]);

  const addModifierBySmiles = (smiles: string) => {
    const it = SUBSTANCE_LIBRARY.flatMap((g) => g.items).find((s) => s.smiles === smiles);
    if (!it) return;
    setNodes((nds) => [
      ...nds,
      {
        id: nextId(),
        type: "modifier",
        position: { x: 250, y: 40 + Math.min(nds.length, 6) * 60 },
        data: { name: it.name, smiles: it.smiles, concentration: it.conc, target: "skin", reduce: 0.3 },
      },
    ]);
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
    <div className="relative h-[75vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-border bg-background">
      <div className="absolute left-3 top-3 z-10 flex items-start gap-2">
        {/* Add-substance button + category picker */}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-md transition ${
              pickerOpen
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-primary hover:border-primary"
            }`}
          >
            + เพิ่ม node สาร
            <span className={`text-[9px] transition ${pickerOpen ? "rotate-180" : ""}`}>▾</span>
          </button>

          {pickerOpen && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-[62vh] w-64 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-md">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-muted-foreground">เลือกสารจากหมวดหมู่</span>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>

              {/* blank node option */}
              <button
                onClick={() => addSubstance()}
                className="mb-1.5 w-full rounded-lg border border-dashed border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:border-primary hover:text-primary"
              >
                ✎ สารเปล่า (กรอกเอง)
              </button>

              {SUBSTANCE_LIBRARY.map((group) => {
                const open = !collapsed[group.category];
                return (
                  <div key={group.category} className="mb-1">
                    <button
                      onClick={() => toggleCat(group.category)}
                      className="flex w-full items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-left text-[11px] font-semibold text-foreground hover:bg-secondary"
                    >
                      <span>{group.icon}</span>
                      <span className="flex-1">{group.category}</span>
                      <span className="text-[9px] text-muted-foreground">{group.items.length}</span>
                      <span className={`text-[9px] transition ${open ? "" : "-rotate-90"}`}>▾</span>
                    </button>
                    {open && (
                      <div className="mt-0.5 space-y-0.5 pl-1">
                        {group.items.map((it) => (
                          <button
                            key={it.smiles}
                            onClick={() => addSubstance(it)}
                            title={it.smiles}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-foreground hover:bg-primary/10"
                          >
                            <span className="text-primary">◇</span>
                            <span className="flex-1 truncate">{it.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{it.conc}%</span>
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
            <div className="absolute left-[16.5rem] top-[calc(100%+6px)] z-20 w-52 rounded-xl border border-border bg-card p-2 shadow-md">
              <div className="mb-1 px-1 text-[11px] font-semibold text-muted-foreground">ทดสอบหลายชุดพร้อมกัน</div>
              <button
                onClick={addResult}
                className="flex w-full items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-2 text-xs font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
              >
                🎯 เพิ่ม node ผลการประเมิน
              </button>
              <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted-foreground">
                ต่อสารแต่ละกลุ่มไปคนละ node ผล เพื่อเทียบหลายสูตรพร้อมกัน
              </p>
            </div>
          )}
        </div>

        {/* Add-modifier — pick a REAL substance from the catalog */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addModifierBySmiles(e.target.value);
            e.currentTarget.selectedIndex = 0;
          }}
          title="เพิ่มตัวปรับจากคลังสารจริง"
          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800 shadow-md"
        >
          <option value="">🧩 + ตัวปรับ (เลือกจากคลังสาร)…</option>
          {SUBSTANCE_LIBRARY.map((g) => (
            <optgroup key={g.category} label={`${g.icon} ${g.category}`}>
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
            className="flex items-center gap-1 rounded-lg border border-primary bg-card px-3 py-1.5 text-xs font-medium text-primary shadow-md transition hover:bg-primary hover:text-primary-foreground"
          >
            💾 บันทึกเป็นสูตร
          </button>
        )}

        <span className="rounded-lg border border-border bg-card/80 px-3 py-1.5 text-[11px] text-muted-foreground shadow-md">
          ลากเส้น node → node · แทรก “ตัวปรับ” ระหว่างสาร→ผล เพื่อลดฤทธิ์
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
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#D9DEE3" gap={18} />
        <Controls showInteractive={false} className="[&_button]:!border-border [&_button]:!bg-card [&_button]:!text-foreground [&_button:hover]:!bg-secondary" />
        <MiniMap pannable zoomable className="!bg-card !border !border-border" />
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
          ✕ ลบเส้นเชื่อม
        </button>
      )}
    </div>
  );
}

export default function FormulaGraph({
  seed = [],
  region = "face",
  onSaveFormula,
}: {
  seed?: FormulaItem[];
  region?: Region;
  onSaveFormula?: (items: FormulaItem[]) => void;
}) {
  return (
    <ReactFlowProvider>
      <GraphInner seed={seed} region={region} onSaveFormula={onSaveFormula} />
    </ReactFlowProvider>
  );
}
