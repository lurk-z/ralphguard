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
import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  ChevronDown,
  CircleX,
  FilePenLine,
  FlaskConical,
  Link2,
  LoaderCircle,
  Play,
  Plus,
  Save,
  SlidersHorizontal,
  Target,
  Trash2,
} from "lucide-react";

import { FormulaItem, Region, api } from "../lib/api";
import { SUBSTANCE_LIBRARY, withWaterBase, substanceInfo, type CatalogItem } from "../lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const nameInputId = `substance-${id}-name`;
  const smilesInputId = `substance-${id}-smiles`;
  const concentrationInputId = `substance-${id}-concentration`;

  return (
    <div
      className="relative w-64 overflow-visible rounded-xl border border-border bg-card shadow-md"
      onMouseEnter={startHover}
      onMouseLeave={endHover}
    >
      {showInfo && (data.smiles?.trim() || data.name) && (
        <div className="nodrag nowheel absolute left-full top-0 z-30 ml-3 w-60 rounded-xl border border-border bg-card p-3 text-left shadow-md">
          <div className="flex items-center gap-1.5">
            <FlaskConical className="size-3.5 shrink-0 text-primary" aria-hidden />
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
              <div className="mt-1 flex gap-1.5 text-[10px] leading-snug text-amber-700">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
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
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border bg-secondary/60 px-3 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Beaker className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">สารเคมี</p>
          <p
            className="truncate text-sm font-semibold text-foreground"
            title={data.name?.trim() || "ยังไม่ระบุชื่อสาร"}
          >
            {data.name?.trim() || "ยังไม่ระบุชื่อสาร"}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          #{id}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={remove}
          title="ลบโหนดสาร"
          aria-label={`ลบโหนดสาร ${data.name?.trim() || id}`}
          className="nodrag nopan text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <div className="nodrag nowheel space-y-3 p-3">
        <div className="space-y-1.5">
          <Label htmlFor={nameInputId} className="text-xs font-medium text-foreground">
            ชื่อสาร
          </Label>
          <Input
            id={nameInputId}
            className="h-9 px-2.5 text-sm"
            placeholder="เช่น Ethanol"
            value={data.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={smilesInputId} className="text-xs font-medium text-foreground">
            โครงสร้าง SMILES
          </Label>
          <Input
            id={smilesInputId}
            className="h-9 px-2.5 font-mono text-sm"
            placeholder="เช่น CCO"
            value={data.smiles}
            aria-invalid={valid === false || undefined}
            aria-describedby={valid !== null ? `${smilesInputId}-status` : undefined}
            onChange={(e) => patch({ smiles: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={concentrationInputId} className="text-xs font-medium text-foreground">
            ความเข้มข้น
          </Label>
          <InputGroup className="h-9">
            <InputGroupInput
              id={concentrationInputId}
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="h-9 px-2.5 font-mono text-sm font-semibold tabular-nums"
              value={data.concentration}
              onChange={(e) => patch({ concentration: parseFloat(e.target.value) || 0 })}
            />
            <InputGroupAddon align="inline-end" className="pr-2.5 text-sm font-semibold text-foreground">
              %
            </InputGroupAddon>
          </InputGroup>
        </div>
      </div>
      {valid !== null && (
        <div
          id={`${smilesInputId}-status`}
          role={valid ? "status" : "alert"}
          className={`flex items-center gap-1.5 rounded-b-xl border-t border-border px-3 py-2 text-xs font-medium ${
            valid
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {valid ? (
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <CircleX className="size-3.5 shrink-0" aria-hidden />
          )}
          <span>
            {valid
              ? `โครงสร้างถูกต้อง${mw != null ? ` · MW ${mw}` : ""}`
              : "โครงสร้าง SMILES ไม่ถูกต้อง"}
          </span>
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3.5 !w-3.5 !border-2 !border-background !bg-primary"
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
      <div className="flex items-center gap-1.5 rounded-t-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
        <Target className="size-3.5" aria-hidden />
        <span>ผลการประเมิน</span>
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

        <Button
          type="button"
          size="sm"
          onClick={run}
          disabled={busy}
          className="w-full text-xs"
        >
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          {busy ? "กำลังประเมิน…" : "ประเมิน"}
        </Button>

        {data.status === "failed" && (
          <div className="flex gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>{data.error}</span>
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
      <Button
        type="button"
        variant="destructive"
        size="icon-xs"
        onClick={remove}
        title="ลบ node"
        aria-label="ลบ node ตัวปรับสูตร"
        className="nodrag nopan absolute -right-2 -top-2 z-10 rounded-full shadow-sm"
      >
        <Trash2 aria-hidden />
      </Button>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-background !bg-amber-400" />
      <div className="flex items-center gap-1.5 rounded-t-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
        <SlidersHorizontal className="size-3.5" aria-hidden />
        <span>ตัวปรับสูตร</span>
      </div>
      <div className="nodrag nowheel space-y-1.5 p-3 text-xs">
        <div className="flex items-center gap-1">
          <FlaskConical className="size-3.5 shrink-0 text-amber-600" aria-hidden />
          <Input
            className="h-7 min-w-0 flex-1 border-amber-200 px-2 text-xs"
            value={data.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="ชื่อสาร"
          />
          <Input
            type="number"
            min={0}
            max={100}
            className="h-7 w-12 border-amber-200 px-1 text-right font-mono text-xs tabular-nums"
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
        <label className="block space-y-1.5 text-[11px] text-muted-foreground">
          <span>ลดลง {Math.round(data.reduce * 100)}%</span>
          <Slider
            min={0}
            max={90}
            step={1}
            value={[Math.round(data.reduce * 100)]}
            onValueChange={([value]) => patch({ reduce: value / 100 })}
            className="[&_[role=slider]]:border-amber-400 [&_[role=slider]]:bg-background [&_[data-orientation=horizontal]>span]:bg-amber-500"
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

function buildGraph(seed: FormulaItem[], region: Region): { nodes: Node[]; edges: Edge[] } {
  const items = seed;
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

  // The selected formula is the source of truth. Rebuild when its substances,
  // percentages or test region change so removed/empty formulas cannot leave
  // stale nodes from a previous graph behind.
  const prevSeedRef = useRef<string>(
    JSON.stringify({ region, items: seed.map((s) => [s.smiles, s.concentration, s.name]) }),
  );
  useEffect(() => {
    const sig = JSON.stringify({ region, items: seed.map((s) => [s.smiles, s.concentration, s.name]) });
    if (sig === prevSeedRef.current) return;
    prevSeedRef.current = sig;
    const graph = buildGraph(seed, region);
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [region, seed, setEdges, setNodes]);

  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null);

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
    <div className="relative h-full min-h-0 w-full overflow-hidden border-y border-border bg-background">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="text-primary">
              <Plus aria-hidden />
              เพิ่มโหนด
              <ChevronDown className="ml-0.5 size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">โหนดสาร</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => addSubstance()}>
              <FilePenLine aria-hidden />
              <span className="flex-1">สารเปล่า</span>
              <span className="text-xs font-medium text-foreground">กรอกเอง</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {SUBSTANCE_LIBRARY.map((group) => (
              <DropdownMenuGroup key={group.category}>
                <DropdownMenuLabel className="sticky top-0 z-10 flex items-center gap-2 bg-popover/95 py-2 text-xs text-foreground backdrop-blur">
                  <Beaker className="size-3.5 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{group.category}</span>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{group.items.length}</span>
                </DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.smiles}
                    onSelect={() => addSubstance(item)}
                    className="py-1.5"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{item.name}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{item.conc}%</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={addResult}>
              <Target aria-hidden />
              เพิ่มโหนดผลการประเมิน
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <SlidersHorizontal aria-hidden />
              เพิ่มตัวปรับ
              <ChevronDown className="ml-0.5 size-3" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">เลือกสารสำหรับตัวปรับ</DropdownMenuLabel>
            {SUBSTANCE_LIBRARY.map((group) => (
              <DropdownMenuGroup key={group.category}>
                <DropdownMenuLabel className="sticky top-0 z-10 flex items-center gap-2 bg-popover/95 py-2 text-xs text-foreground backdrop-blur">
                  <SlidersHorizontal className="size-3.5 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{group.category}</span>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{group.items.length}</span>
                </DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.smiles}
                    onSelect={() => addModifierBySmiles(item.smiles)}
                    className="py-1.5"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{item.name}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{item.conc}%</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {onSaveFormula && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={saveAsFormula}
            title="บันทึก node graph ปัจจุบันเป็นสูตรใหม่ในลิสต์"
          >
            <Save aria-hidden />
            บันทึกเป็นสูตร
          </Button>
        )}

        <div className="hidden items-center gap-1.5 border-l border-border px-2 text-[11px] text-muted-foreground xl:flex">
          <Link2 className="size-3.5" aria-hidden />
          <span>ลากจุดเชื่อมระหว่างโหนดเพื่อสร้างลำดับทดสอบ</span>
        </div>
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
        <Button
          type="button"
          variant="destructive"
          size="xs"
          style={{ position: "fixed", left: edgeMenu.x, top: edgeMenu.y, transform: "translate(-50%, -130%)" }}
          onClick={() => {
            setEdges((eds) => eds.filter((e) => e.id !== edgeMenu.id));
            setEdgeMenu(null);
          }}
          className="z-50 shadow-lg"
        >
          <Trash2 aria-hidden />
          ลบเส้นเชื่อม
        </Button>
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
