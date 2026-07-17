"use client";

// Substance-experiment page ("ทดลองสาร"). White dashboard shell with:
//  - left: formula boxes you build yourself (each a mix of substances + % each)
//  - center: head.glb — click a box to "load" its combined strength onto the
//    brush, then drag on the face to paint the result (FacePaintCanvas)
//  - right: time-course/day selector + AI chat + real per-day results
// Substances come from catalog.ts (GOD's real ingredient database); an
// assessment runs against the real QSAR backend via api.createAssessment.
import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import {
  Beaker,
  ChevronDown,
  Download,
  FlaskConical,
  Minus,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Trash2,
  Droplet,
  Leaf,
  Sparkles,
  Heart,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import AiChatPanel from "@/components/AiChatPanel";
import CanvasToolbar from "@/components/CanvasToolbar";
import LabelScanModal from "@/components/LabelScanModal";
import { CHEMICAL_GROUPS, chemById } from "@/lib/chemicals";
import { PRODUCT_TEMPLATES, isWaterItem, withWaterBase } from "@/lib/catalog";
import { useSubstanceHoverCard } from "@/components/SubstanceInfoCard";
import { extractFormula, type AssistantAction } from "@/lib/assistant";
import type {
  AssessmentResultPayload,
  FormulaItem,
  OcrItem,
  Region,
  ModelMetricsPayload,
  ModelInfoPayload,
  EndpointMetric,
} from "@/lib/api";
import { api } from "@/lib/api";
import { addJob, getProject, renameProject } from "@/lib/projects";

function ModelLoader() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => (prev >= 95 ? prev : prev + 5));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-[200px] text-center flex flex-col items-center">
      <Progress value={progress} className="h-1 w-full" />
      <p className="mt-3 text-xs font-medium text-muted-foreground">กำลังโหลดโมเดล 3 มิติ…</p>
    </div>
  );
}

// 3D head, paint mode (client-only WebGL): drag on the skin to apply the
// armed formula box's strength as erythema.
const FacePaint = dynamic(
  () => import("@/components/FaceIrritationModel").then((m) => m.FacePaintCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center bg-[#F7F5F4]">
        <ModelLoader />
      </div>
    ),
  },
);

// Node graph (client-only, uses reactflow): build a mixture as a wired node
// pipeline (substance nodes → result node) and run the real QSAR assessment.
const FormulaGraph = dynamic(() => import("@/components/FormulaGraph"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
      กำลังโหลด Node Graph…
    </div>
  ),
});

type FormulaBoxItem = {
  chemicalId: string; // SMILES — the catalog's key
  concentration: number;
  /**
   * Display name for a substance the catalog does not carry — a SMILES typed
   * into a blank node graph node, say. Catalog substances leave this unset and
   * read their name from the catalog instead.
   */
  name?: string;
};
type FormulaBox = {
  id: string;
  name: string;
  items: FormulaBoxItem[];
  color?: string;
  icon?: BoxIconName;
};

const BOX_ICONS = {
  beaker: Beaker,
  flask: FlaskConical,
  droplet: Droplet,
  leaf: Leaf,
  sparkles: Sparkles,
  heart: Heart,
};

type BoxIconName = keyof typeof BOX_ICONS;

/** Names boxes saved out of the node graph, and counts them for numbering. */
const GRAPH_BOX_PREFIX = "สูตรจาก Node";

const BOX_COLORS = [
  "#009FA5", // Teal
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#F43F5E", // Rose
  "#F59E0B", // Amber
  "#F97316", // Orange
  "#64748B", // Slate
  "#EC4899", // Pink
];

// Total concentration in the box, capped at 100% — the box card's % badge,
// and the paint brush's fallback strength before any real assessment result
// exists for this box (FacePaintCanvas prefers real per-day `layers` once a
// Run has completed; see paintLayers below).
function boxIntensity(box: FormulaBox) {
  const total = box.items.reduce((s, it) => s + it.concentration, 0);
  return Math.max(0, Math.min(1, total / 100));
}

/**
 * Name/SMILES/role for a row, whether or not the catalog knows the substance.
 * Off-catalog rows still render and still reach the model — they just have no
 * catalog blurb to show.
 */
function itemChemical(it: FormulaBoxItem): { name: string; smiles: string; role?: string } {
  const c = chemById(it.chemicalId);
  if (c) return { name: c.name, smiles: c.smiles, role: c.role };
  return { name: it.name?.trim() || "สารกำหนดเอง", smiles: it.chemicalId };
}

/** A box's rows as the catalog/API shape. Boxes hold actives only — no water. */
function boxToFormulaItems(box: FormulaBox): FormulaItem[] {
  return box.items.map((it) => {
    const c = itemChemical(it);
    return { name: c.name, smiles: c.smiles, concentration: it.concentration };
  });
}

/**
 * The formula as it will be assessed: actives plus the auto-balanced water base.
 * withWaterBase is the same helper /assess submits through, so the % shown to
 * the user and the % sent to the model can't drift apart.
 */
function boxWithWaterBase(box: FormulaBox): FormulaItem[] {
  return withWaterBase(boxToFormulaItems(box));
}

/** Water's balancing % for a box — 0 once the actives already reach 100%. */
function waterPctOf(box: FormulaBox): number {
  return boxWithWaterBase(box).find(isWaterItem)?.concentration ?? 0;
}

const TABS = [
  { key: "experiment", label: "การทดลอง" },
  { key: "nodemods", label: "โหนดโมเดล" },
  { key: "trust", label: "ความน่าเชื่อถือ" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const DAY_LABELS = [1, 3, 7] as const;

// 4 QSAR endpoints (matches scientific/pipeline.py / backend's real keys).
const RESULT_ENDPOINTS = [
  { key: "skin", label: "ระคายเคืองผิว" },
  { key: "eye", label: "ระคายเคืองตา" },
  { key: "sens", label: "แพ้ผิวหนัง" },
  { key: "acute", label: "พิษเฉียบพลัน" },
] as const;

// Same 4 colours FaceIrritationModel.tsx's shader expects — it reads the brush
// HUE to pick lesion morphology, so these can't drift from that file's EP_COLOR.
const EP_COLOR: Record<string, string> = {
  skin: "#FF3B5C",
  eye: "#22D3EE",
  sens: "#A855F7",
  acute: "#F59E0B",
};

// 0–100 score → severity band, matching the backend's own thresholds
// (EndpointResultPayload.band) and every other band-labelled view in the app.
function bandOf(score: number): "low" | "moderate" | "high" | "severe" {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "severe";
}
const BAND_LABEL_TH: Record<string, string> = { low: "ต่ำ", moderate: "ปานกลาง", high: "สูง", severe: "รุนแรง" };

function bandTH(score: number) {
  return BAND_LABEL_TH[bandOf(score)];
}
const BAND_BG_CLASS: Record<string, string> = {
  low: "bg-emerald-500",
  moderate: "bg-amber-500",
  high: "bg-orange-500",
  severe: "bg-destructive",
};
function bandColor(score: number) {
  return score <= 0 ? "bg-muted-foreground/40" : BAND_BG_CLASS[bandOf(score)];
}

export default function ExperimentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("experiment");
  const [projectName, setProjectName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load project name from localStorage on mount
  useEffect(() => {
    const proj = getProject(params.id);
    if (proj) setProjectName(proj.name);
  }, [params.id]);
  const [zoomPct, setZoomPct] = useState(25);
  const [dayIdx, setDayIdx] = useState<0 | 1 | 2>(1); // 0=Day1, 1=Day3, 2=Day7
  // Real per-box results, so the paint canvas and the score panel below can
  // show what leaving each formula on skin for Day 1/3/7 actually predicts —
  // keyed by box id (not just "the last run") so switching boxes shows each
  // one's own result instead of losing it, unlike /assess's single `assessment`.
  const [resultByBox, setResultByBox] = useState<Record<string, AssessmentResultPayload>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  /** Set once a job is queued; the poll below watches it until it settles. */
  const [jobId, setJobId] = useState<string | null>(null);
  /** Which box the in-flight/last job belongs to — may not be activeBoxId if
   *  the user switched boxes while a run was still polling. */
  const [runBoxId, setRunBoxId] = useState<string | null>(null);

  const [brushSizePct, setBrushSizePct] = useState(10);
  const [clearTrigger, setClearTrigger] = useState(0);

  const ZOOM_STEP = 10;
  const BRUSH_STEP = 10;
  const handleClear = () => setClearTrigger((t) => t + 1);
  /**
   * Submit the active box to the QSAR backend, exactly as /assess does: actives
   * only, water balanced back in, and no dose-less rows. The job is queued, so
   * the id it returns is picked up by the poll below.
   */
  const handleRun = async () => {
    setRunError(null);
    const boxId = activeBox?.id ?? null;
    const actives = activeBox
      ? boxToFormulaItems(activeBox).filter((it) => it.smiles.trim() && it.concentration > 0)
      : [];
    if (!boxId || !actives.length) {
      setRunError("เพิ่มอย่างน้อย 1 สาร + ความเข้มข้น");
      return;
    }
    setRunning(true);
    setRunBoxId(boxId);
    try {
      // Projects live in this browser, so the backend has no row to file the
      // run under — the project keeps the job id instead (see lib/projects).
      const { job_id } = await api.createAssessment(withWaterBase(actives), region, null);
      addJob(params.id, job_id);
      setJobId(job_id);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  };
  // Watch a queued job until it settles, on /assess's 1.5s cadence.
  //
  // Unlike /assess (single formula, one page's worth of state) this workspace
  // stays put after a run completes instead of navigating to /results: the
  // whole point of wiring this up is to let Day 1/3/7 drive the paint canvas
  // right here. /results (with its trend chart, radar and PDF export) is a
  // click away via "ดูรายงานฉบับเต็ม" once a result exists.
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const settle = (err: string | null) => {
      if (!alive) return;
      setRunning(false);
      setJobId(null);
      setRunError(err);
    };
    const tick = async () => {
      try {
        const rec = await api.getAssessment(jobId);
        if (!alive) return;
        if (rec.status === "completed") {
          settle(null);
          if (runBoxId && rec.result) {
            setResultByBox((prev) => ({ ...prev, [runBoxId]: rec.result! }));
          }
        } else if (rec.status === "failed") {
          settle(rec.error ?? "การประเมินล้มเหลว");
        }
      } catch (e) {
        settle(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [jobId, runBoxId]);

  const handleZoomIn = () => setZoomPct((z) => Math.min(100, z + ZOOM_STEP));
  const handleZoomOut = () => setZoomPct((z) => Math.max(0, z - ZOOM_STEP));
  const handleZoomReset = () => setZoomPct(25);

  const handleBrushSizeReset = () => setBrushSizePct(10);

  // ── Resizable / collapsible panels (Figma-style) ──
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(340);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  // The persistent icon rail (in the shared project layout) is a fixed w-14
  // (56px) and always on screen; the picker sheet slides out right after it
  // plus the formula-box panel, not from the true viewport edge.
  const ICON_RAIL_WIDTH = 56;
  const pickerLeftOffset = ICON_RAIL_WIDTH + (leftCollapsed ? 0 : leftWidth);

  const startResize = (side: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startW = side === "left" ? leftWidth : rightWidth;
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      if (side === "left") setLeftWidth(Math.max(240, Math.min(480, startW + delta)));
      else setRightWidth(Math.max(280, Math.min(520, startW - delta)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setIsResizing(false);
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ── Formula boxes ──
  const [boxes, setBoxes] = useState<FormulaBox[]>([
    {
      id: "box-1",
      name: "สูตร A",
      color: "#009FA5",
      icon: "beaker",
      // Catalog ids are SMILES. Water is deliberately absent from the pickable
      // catalog — /assess tops a formula up to 100% with it via withWaterBase().
      items: [
        { chemicalId: "OCC(O)CO", concentration: 20 }, // Glycerin
        { chemicalId: "CC(O)CO", concentration: 10 }, // Propylene Glycol
      ],
    },
  ]);
  const [activeBoxId, setActiveBoxId] = useState<string | null>("box-1");
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  // Which body site the formula is assessed against. Templates set it; there is
  // no picker for it in this workspace yet (/assess has one).
  const [region, setRegion] = useState<Region>("face");
  // Rest on any substance row for the catalog's description of it.
  const substanceHover = useSubstanceHoverCard();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<string>("all");
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const boxIdSeq = useRef(1);

  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? null;
  const activeResult = activeBoxId ? resultByBox[activeBoxId] : undefined;
  const pickerTargetId = editingBoxId ?? activeBoxId;
  const pickerTarget = boxes.find((b) => b.id === pickerTargetId) ?? null;

  /**
   * Per-endpoint score for the box's real result at the selected day, in the
   * shape FacePaintCanvas paints from. Mirrors /assess's own paintLayers
   * exactly: endpoints[ep].timecourse[dayIdx], falling back to peak_score for
   * an endpoint the backend didn't return a timecourse for.
   */
  const paintLayers = useMemo(() => {
    if (!activeResult) return [];
    return RESULT_ENDPOINTS.map((ep) => {
      const e = activeResult.endpoints[ep.key];
      const score = e?.timecourse?.[dayIdx] ?? e?.peak_score ?? 0;
      return { key: ep.key, label: ep.label, score, color: EP_COLOR[ep.key], band: bandOf(score) };
    });
  }, [activeResult, dayIdx]);

  const pickerCategories = useMemo(() => CHEMICAL_GROUPS.map((g) => g.category), []);
  // Keep the catalog's grouping so the list can carry a header per category,
  // and drop groups that the query empties out.
  const pickerGroups = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return CHEMICAL_GROUPS.filter((g) => pickerCategory === "all" || g.category === pickerCategory)
      .map((g) => ({
        category: g.category,
        items: g.items.filter(
          (c) => !q || c.name.toLowerCase().includes(q) || c.smiles.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [pickerQuery, pickerCategory]);

  /**
   * Add a named box, seeded with items — the shared path for templates, the
   * node graph's save, and the assistant. Returns the new box's id.
   */
  const addBoxFrom = (name: string, items: FormulaBoxItem[]) => {
    boxIdSeq.current += 1;
    const id = `box-${boxIdSeq.current}`;
    const iconsList = Object.keys(BOX_ICONS) as BoxIconName[];
    setBoxes((prev) => [
      ...prev,
      {
        id,
        name,
        items,
        color: BOX_COLORS[(boxIdSeq.current - 1) % BOX_COLORS.length],
        icon: iconsList[(boxIdSeq.current - 1) % iconsList.length],
      },
    ]);
    setActiveBoxId(id);
    return id;
  };

  /**
   * {name, smiles, concentration} from a template, the graph or the assistant,
   * as box rows. Water is dropped — boxes hold actives only and withWaterBase
   * puts it back at assessment time.
   */
  const toBoxItems = (arr: unknown): FormulaBoxItem[] =>
    Array.isArray(arr)
      ? arr
          .map((it) => {
            const o = (it ?? {}) as Record<string, unknown>;
            return {
              smiles: String(o.smiles ?? "").trim(),
              name: String(o.name ?? ""),
              concentration: Number(o.concentration) || 0,
            };
          })
          .filter((it) => it.smiles && !isWaterItem(it))
          .map((it) => ({
            chemicalId: it.smiles,
            concentration: it.concentration,
            ...(chemById(it.smiles) ? {} : { name: it.name }),
          }))
      : [];

  const addBox = () => {
    boxIdSeq.current += 1;
    const id = `box-${boxIdSeq.current}`;
    const color = BOX_COLORS[(boxIdSeq.current - 1) % BOX_COLORS.length];
    const iconsList = Object.keys(BOX_ICONS) as BoxIconName[];
    const icon = iconsList[(boxIdSeq.current - 1) % iconsList.length];
    setBoxes((prev) => [
      ...prev,
      {
        id,
        name: `สูตร ${String.fromCharCode(64 + boxIdSeq.current)}`,
        items: [],
        color,
        icon,
      },
    ]);
    setActiveBoxId(id);
    setEditingBoxId(id);
    // Let the user open the chemical library themselves — show the rename
    // popover instead so a fresh box gets a name first.
    setSettingsOpenId(id);
  };

  /**
   * What the assistant is allowed to talk about. The backend prompt forbids
   * inventing numbers that aren't in here, so this must describe the formula
   * exactly as the user sees it.
   */
  const buildChatContext = () => {
    const box = activeBox;
    const comp =
      box && box.items.length
        ? `สูตรปัจจุบัน (สาร + %):\n${boxToFormulaItems(box)
            .map((f) => `- ${f.name || f.smiles} ${f.concentration}%`)
            .join("\n")}\n(หมายเหตุ: Water (Aqua) เป็นเบสเติมอัตโนมัติให้ครบ 100% ไม่ต้องสั่งเอง)`
        : "ยังไม่มีสารในสูตร";
    const result = box ? resultByBox[box.id] : undefined;
    const scores = result
      ? `คะแนนความเสี่ยง 0-100 ที่วันที่ ${DAY_LABELS[dayIdx]} (ปัจจุบันเลือกดูอยู่):\n${RESULT_ENDPOINTS
          .map((ep) => {
            const e = result.endpoints[ep.key];
            const sc = Math.round(e?.timecourse?.[dayIdx] ?? e?.peak_score ?? 0);
            return `- ${ep.label}: ${sc}/100 (ระดับ${BAND_LABEL_TH[bandOf(sc)]})`;
          })
          .join("\n")}`
      : "ยังไม่มีผลการประเมิน (ผู้ใช้ยังไม่ได้กดเริ่มทดสอบ)";
    return `ผลิตภัณฑ์/สูตร: ${box?.name ?? "-"}\n${comp}\n\n${scores}`;
  };

  /** Turn the assistant's suggested formula into a box of its own. */
  const importAssistantFormula = (items: FormulaItem[]) => {
    const rows = toBoxItems(items);
    if (rows.length) addBoxFrom("สูตรจาก AI", rows);
  };

  /**
   * Carry out the agent commands from a reply, mirroring /assess's handler.
   * Names are matched case-insensitively against either the substance name or
   * its SMILES, the way the backend prompt tells the model to address them.
   */
  const runAssistantAction = (actions: AssistantAction[]) => {
    const targetId = activeBoxId;
    const keyOf = (a: AssistantAction) => String(a.name ?? a.smiles ?? "").trim().toLowerCase();
    const matches = (it: FormulaBoxItem, key: string) => {
      const c = itemChemical(it);
      return c.name.trim().toLowerCase() === key || c.smiles.trim().toLowerCase() === key;
    };
    const patchActive = (fn: (items: FormulaBoxItem[]) => FormulaBoxItem[]) =>
      setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, items: fn(b.items) } : b)));
    const toItem = (name: unknown, smiles: string, conc: unknown): FormulaBoxItem => ({
      chemicalId: smiles,
      concentration: Number(conc) || 0,
      ...(chemById(smiles) ? {} : { name: String(name ?? "") }),
    });

    actions.forEach((a) => {
      switch (a?.type) {
        case "add_substance": {
          const smiles = String(a.smiles ?? "").trim();
          if (smiles && !isWaterItem({ smiles })) {
            patchActive((items) => [...items, toItem(a.name, smiles, a.concentration ?? 10)]);
          }
          break;
        }
        case "set_concentration": {
          const key = keyOf(a);
          const c = Number(a.concentration);
          if (key && !Number.isNaN(c)) {
            patchActive((items) => items.map((it) => (matches(it, key) ? { ...it, concentration: c } : it)));
          }
          break;
        }
        case "remove_substance": {
          const key = keyOf(a);
          if (key) patchActive((items) => items.filter((it) => !matches(it, key)));
          break;
        }
        case "replace_substance": {
          const key = String(a.from ?? a.name ?? "").trim().toLowerCase();
          const smiles = String(a.smiles ?? a.to_smiles ?? "").trim();
          if (key && smiles && !isWaterItem({ smiles, name: String(a.to ?? "") })) {
            patchActive((items) =>
              items.map((it) =>
                matches(it, key)
                  ? toItem(a.to ?? a.to_name ?? itemChemical(it).name, smiles, a.concentration ?? it.concentration)
                  : it,
              ),
            );
          }
          break;
        }
        case "set_formula": {
          const items = toBoxItems(a.items);
          if (items.length) patchActive(() => items);
          break;
        }
        case "create_formula":
          addBoxFrom(String(a.name ?? "สูตรใหม่"), toBoxItems(a.items));
          break;
        case "rename_formula": {
          const name = String(a.name ?? "").trim();
          if (name && targetId) {
            setBoxes((prev) => prev.map((b) => (b.id === targetId ? { ...b, name } : b)));
          }
          break;
        }
        case "goto":
          // /assess also has a "trust" tab; this workspace doesn't.
          if (a.tab === "assess") setTab("experiment");
          else if (a.tab === "nodes") setTab("nodemods");
          break;
        case "run":
          handleRun();
          break;
        case "clear":
          patchActive(() => []);
          break;
      }
    });
  };

  /**
   * "💾 บันทึกเป็นสูตร" in the node graph. The graph hands its substances back
   * with the water base already applied; boxes hold actives only, so drop it
   * again — /assess does exactly the same on its side.
   */
  const saveGraphAsFormula = (items: FormulaItem[]) => {
    const rows = toBoxItems(items);
    if (!rows.length) return;
    const n = boxes.filter((b) => b.name.startsWith(GRAPH_BOX_PREFIX)).length + 1;
    addBoxFrom(`${GRAPH_BOX_PREFIX} ${n}`, rows);
  };

  // ── Arriving from the templates page with ?template=<id> ──
  // Build a box from the catalog template, mirroring what /assess's create-
  // formula modal does. Runs once: the param is dropped straight afterwards so
  // a refresh (or a back-navigation) can't stack duplicate boxes.
  const templateId = useSearchParams().get("template");
  const templateApplied = useRef(false);
  useEffect(() => {
    if (!templateId || templateApplied.current) return;
    const t = PRODUCT_TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    templateApplied.current = true;

    addBoxFrom(t.name, toBoxItems(t.formula));
    // /assess narrows a template's region to what the 3D head can actually
    // show, so hand/forearm templates are assessed as face there too.
    setRegion(t.region === "eye" ? "eye" : "face");
    router.replace(`/projects/${params.id}/assess`, { scroll: false });
  }, [templateId, params.id, router]);

  const changeBoxColor = (id: string, color: string) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, color } : b)));
  };

  const changeBoxIcon = (id: string, icon: BoxIconName) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, icon } : b)));
  };

  const removeBox = (id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    if (activeBoxId === id) setActiveBoxId(null);
    if (editingBoxId === id) {
      setEditingBoxId(null);
      setPickerOpen(false);
    }
  };

  const renameBox = (id: string, name: string) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
  };

  const boxPendingDelete = boxes.find((b) => b.id === deleteConfirmId) ?? null;

  const addItem = (boxId: string, chemicalId: string) => {
    // Seed the row with the catalog's suggested %, the way /assess does.
    const concentration = chemById(chemicalId)?.conc ?? 10;
    setBoxes((prev) =>
      prev.map((b) =>
        b.id === boxId && !b.items.some((it) => it.chemicalId === chemicalId)
          ? { ...b, items: [...b.items, { chemicalId, concentration }] }
          : b,
      ),
    );
  };

  const updateItem = (boxId: string, chemicalId: string, concentration: number) => {
    setBoxes((prev) =>
      prev.map((b) =>
        b.id === boxId
          ? { ...b, items: b.items.map((it) => (it.chemicalId === chemicalId ? { ...it, concentration } : it)) }
          : b,
      ),
    );
  };

  const removeItem = (boxId: string, chemicalId: string) => {
    setBoxes((prev) =>
      prev.map((b) => (b.id === boxId ? { ...b, items: b.items.filter((it) => it.chemicalId !== chemicalId) } : b)),
    );
  };

  const openPickerFor = (boxId: string) => {
    setEditingBoxId(boxId);
    setPickerOpen(true);
  };

  // ── OCR: read an ingredient-label photo into a specific box ──
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTargetId, setScanTargetId] = useState<string | null>(null);
  const openScanFor = (boxId: string) => {
    setScanTargetId(boxId);
    setScanOpen(true);
  };
  /**
   * Merge scanned substances into the target box. Unlike /assess (which has one
   * formula and replaces it wholesale), this workspace holds several named
   * boxes, so overwriting one on a photo scan would be surprising — matches the
   * modal's own "＋ เพิ่มเข้าสูตร" ("add to formula") label instead of GOD's
   * literal replace behaviour. Duplicates (by SMILES) are skipped rather than
   * double-counted.
   */
  const importOcrItems = (boxId: string, items: OcrItem[]) => {
    const actives = items.filter((it) => it.smiles?.trim() && !isWaterItem(it));
    if (!actives.length) return;
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.id !== boxId) return b;
        const existing = new Set(b.items.map((it) => it.chemicalId));
        const added = actives
          .filter((it) => !existing.has(it.smiles))
          .map((it) => ({
            chemicalId: it.smiles,
            concentration: it.concentration,
            ...(chemById(it.smiles) ? {} : { name: it.name }),
          }));
        return added.length ? { ...b, items: [...b.items, ...added] } : b;
      }),
    );
  };

  // ── AI: nudge each substance's % toward realistic, safer cosmetic levels ──
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [optMsg, setOptMsg] = useState<{ boxId: string; ok: boolean; text: string } | null>(null);
  const optimizeBox = async (box: FormulaBox) => {
    const actives = boxToFormulaItems(box); // already water-free
    if (!actives.length) return;
    setOptimizingId(box.id);
    setOptMsg(null);
    try {
      const list = actives
        .map((it) => `- ${it.name || it.smiles} (SMILES ${it.smiles}) ปัจจุบัน ${it.concentration}%`)
        .join("\n");
      const question =
        "ช่วยปรับอัตราส่วน % ของสารในสูตรนี้ให้สมจริงตามมาตรฐานเครื่องสำอางและปลอดภัยที่สุด " +
        "(ลดสารก่อระคายเคือง/สารกันเสียลงสู่ระดับที่ใช้จริง เช่น สารกันเสีย <1%, กรด 2-10%, humectant 3-15%). " +
        "ห้ามเพิ่มหรือลบสาร คงสารเดิมและ SMILES เดิมไว้ทุกตัว ไม่ต้องใส่ Water. " +
        'ตอบกลับเป็น <formula>[{"name","smiles","concentration"}]</formula> เท่านั้น:\n' +
        list;
      const { answer } = await api.chat(question);
      const items = extractFormula(answer);
      if (!items.length) throw new Error("AI ไม่ได้ส่งสูตรกลับมา");

      // The prompt says "don't add or remove a substance" — nothing enforces
      // that on the model's side, so a reply that changed the SMILES set is
      // rejected rather than silently corrupting the box.
      const before = new Set(actives.map((a) => a.smiles));
      const after = new Set(items.map((it) => it.smiles).filter(Boolean));
      const sameSet = before.size === after.size && [...before].every((s) => after.has(s));
      if (!sameSet) throw new Error("AI เปลี่ยนรายการสาร ไม่ใช่แค่ % — ไม่นำผลมาใช้เพื่อความปลอดภัยของสูตร");

      setBoxes((prev) =>
        prev.map((b) =>
          b.id === box.id
            ? {
                ...b,
                items: items.map((it) => ({
                  chemicalId: it.smiles,
                  concentration: it.concentration,
                  ...(chemById(it.smiles) ? {} : { name: it.name }),
                })),
              }
            : b,
        ),
      );
      setOptMsg({ boxId: box.id, ok: true, text: "✓ AI ปรับอัตราส่วนให้แล้ว — ตรวจ % แล้วกด ▶ Run ประเมินได้เลย" });
    } catch (e) {
      setOptMsg({ boxId: box.id, ok: false, text: "✗ ปรับไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setOptimizingId(null);
    }
  };

  return (
    <div data-project-id={params.id} className="relative flex h-full w-full overflow-hidden">
        {/* Figma-style floating pill — replaces the formula-box panel while collapsed. */}
        {leftCollapsed && (
          <button
            aria-label="เปิดแผง"
            onClick={() => setLeftCollapsed(false)}
            className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-xl border border-border bg-card py-2.5 pl-3.5 pr-3 shadow-md text-left text-sm font-semibold text-foreground hover:text-primary transition-colors group"
          >
            <span>{projectName}</span>
            <PanelLeft className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </button>
        )}

        {/* Figma-style floating toolbar — stands in for the hidden right panel's run/export actions */}
        {leftCollapsed && (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-xl border border-border bg-card p-1.5 shadow-md">
            <button
              aria-label="เริ่มการทดลอง"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <FlaskConical className="size-4" />
            </button>
            <button
              aria-label="Export PDF"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Download className="size-4" />
            </button>
            {tab === "experiment" && (
              <span className="ml-0.5 shrink-0 rounded-md px-2 text-xs font-medium tabular-nums text-muted-foreground">
                {zoomPct}%
              </span>
            )}
          </div>
        )}

        {/* ── Formula boxes ── */}
        <aside
          style={{ width: leftCollapsed ? 0 : leftWidth }}
          className={`relative z-30 flex shrink-0 flex-col bg-card ${
            isResizing ? "" : "transition-all duration-300 ease-in-out"
          } ${leftCollapsed ? "overflow-hidden border-r-0" : "border-r border-border"}`}
        >
          <div className="flex items-center gap-2 px-4 py-4">
            {editingName ? (
              <input
                ref={nameInputRef}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={() => {
                  renameProject(params.id, projectName.trim() || projectName);
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    renameProject(params.id, projectName.trim() || projectName);
                    setEditingName(false);
                  }
                }}
                autoFocus
                className="min-w-0 flex-1 rounded border border-primary bg-transparent px-2 py-0.5 text-sm font-semibold text-foreground outline-none ring-1 ring-primary"
              />
            ) : (
              <>
                <button
                  aria-label="แก้ไขชื่อโปรเจ็ค"
                  onClick={() => {
                    setEditingName(true);
                    setTimeout(() => nameInputRef.current?.select(), 0);
                  }}
                  className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  {projectName}
                </button>
                <button
                  aria-label="ย่อแผง"
                  onClick={() => setLeftCollapsed(true)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <PanelLeft className="size-4" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center justify-between px-4">
            <h2 className="text-sm font-bold text-foreground">กล่องสูตร</h2>
            <div className="flex items-center gap-2">
              <button
                aria-label="สร้างกล่องสูตรใหม่"
                onClick={addBox}
                className="grid size-6 shrink-0 place-items-center rounded-md border border-primary/40 text-primary transition-colors hover:bg-accent/60"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
            {boxes.map((box) => {
              const active = box.id === activeBoxId;
              const intensity = boxIntensity(box);
              const boxColor = box.color || "#009FA5";
              return (
                <div
                  key={box.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveBoxId(box.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveBoxId(box.id)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all duration-200 ${
                    active
                      ? ""
                      : "border-border bg-card hover:bg-secondary"
                  }`}
                  style={
                    active
                      ? {
                          borderColor: boxColor,
                          boxShadow: `0 0 0 1px ${boxColor}33`,
                          backgroundColor: `${boxColor}0D`,
                        }
                      : {}
                  }
                >
                  <div className="flex items-center gap-2">
                    {(() => {
                      const IconComponent = BOX_ICONS[box.icon || "beaker"] || Beaker;
                      return (
                        <span
                          className="grid size-7 shrink-0 place-items-center rounded-lg"
                          style={
                            active
                              ? { backgroundColor: boxColor, color: "#FFFFFF" }
                              : { backgroundColor: `${boxColor}1A`, color: boxColor }
                          }
                        >
                          <IconComponent className="size-3.5" />
                        </span>
                      );
                    })()}
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">{box.name}</span>
                    {intensity > 0 && (
                      <Badge
                        variant={active ? "default" : "secondary"}
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                        style={
                          active
                            ? { backgroundColor: boxColor, color: "#FFFFFF" }
                            : {}
                        }
                      >
                        {Math.round(intensity * 100)}%
                      </Badge>
                    )}
                    <Popover
                      open={settingsOpenId === box.id}
                      onOpenChange={(open) => setSettingsOpenId(open ? box.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          aria-label="ตั้งค่ากล่องสูตร"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Settings className="size-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        onClick={(e) => e.stopPropagation()}
                        align="end"
                        className="w-64 p-3"
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor={`box-name-${box.id}`} className="text-xs text-muted-foreground">
                            ตั้งชื่อสูตร
                          </Label>
                          <Input
                            id={`box-name-${box.id}`}
                            value={box.name}
                            onChange={(e) => renameBox(box.id, e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-8 text-sm"
                          />
                        </div>

                        <div className="mt-3.5 space-y-1.5">
                          <Label className="text-xs text-muted-foreground font-semibold">
                            สีกล่องและไอคอนสูตร
                          </Label>
                          <div className="grid grid-cols-5 gap-2 pt-1">
                            {BOX_COLORS.map((color) => {
                              const isSelected = boxColor === color;
                              return (
                                <button
                                  key={color}
                                  onClick={() => changeBoxColor(box.id, color)}
                                  className="group relative size-7 rounded-full transition-all duration-100 active:scale-90 hover:scale-105 border border-black/5"
                                  style={{ backgroundColor: color }}
                                  title={color}
                                >
                                  {isSelected && (
                                    <span className="absolute inset-0 m-auto size-2 rounded-full bg-white shadow-sm" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-3.5 space-y-1.5">
                          <Label className="text-xs text-muted-foreground font-medium">
                            ไอคอนประจำกล่องสูตร
                          </Label>
                          <div className="flex gap-2 pt-1 overflow-x-auto pb-1">
                            {Object.entries(BOX_ICONS).map(([iconName, IconComponent]) => {
                              const isSelected = (box.icon || "beaker") === iconName;
                              return (
                                <button
                                  key={iconName}
                                  onClick={() => changeBoxIcon(box.id, iconName as BoxIconName)}
                                  className="grid size-7 shrink-0 place-items-center rounded-lg border transition-all duration-100 active:scale-90 hover:scale-105"
                                  style={
                                    isSelected
                                      ? { borderColor: boxColor, backgroundColor: `${boxColor}1A`, color: boxColor }
                                      : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                                  }
                                  title={iconName}
                                >
                                  <IconComponent className="size-3.5" />
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-3 border-t border-border pt-3">
                          <button
                            onClick={() => {
                              setSettingsOpenId(null);
                              // Empty box, nothing to lose — skip the confirmation dialog.
                              if (box.items.length === 0) removeBox(box.id);
                              else setDeleteConfirmId(box.id);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                            ลบ
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {box.items.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {/* Water base — not an editable row: it balances to fill
                          whatever the actives leave, exactly as /assess does. */}
                      {(() => {
                        const waterPct = waterPctOf(box);
                        return waterPct > 0 ? (
                          <div className="rounded-lg border border-border/60 bg-secondary/40 py-2 pl-2.5 pr-2.5">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium leading-tight text-foreground">
                                  Water (Aqua)
                                </span>
                                <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground">
                                  O
                                </span>
                              </span>
                              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                                {waterPct}%
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                              เบส · ปรับอัตโนมัติให้รวม 100%
                            </p>
                          </div>
                        ) : (
                          <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[10px] leading-snug text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400">
                            ⚠️ สัดส่วนสารรวม ≥ 100% แล้ว จึงไม่เหลือที่ให้น้ำเป็นเบส — ลองลดความเข้มข้นลง
                          </p>
                        );
                      })()}
                      {box.items.map((it) => {
                        const c = itemChemical(it);
                        return (
                          <div
                            key={it.chemicalId}
                            onClick={(e) => e.stopPropagation()}
                            {...substanceHover.bind(c.name, c.smiles)}
                            className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 py-2 pl-2.5 pr-2.5"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium leading-tight text-foreground">
                                {c.name}
                              </span>
                              <span className="block truncate font-mono text-[10px] leading-tight text-muted-foreground">
                                {c.smiles}
                              </span>
                            </span>
                            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={it.concentration}
                                onChange={(e) =>
                                  updateItem(
                                    box.id,
                                    it.chemicalId,
                                    Math.max(0, Math.min(100, Number(e.target.value))),
                                  )
                                }
                                aria-label={`ความเข้มข้น ${c.name}`}
                                className="w-8 border-0 bg-transparent p-0 text-right text-xs font-semibold tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <span className="text-[10px] text-muted-foreground">%</span>
                            </div>
                            <button
                              aria-label={`ลบ ${c.name}`}
                              onClick={() => removeItem(box.id, it.chemicalId)}
                              className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                            >
                              <Minus className="size-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPickerFor(box.id);
                    }}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-accent/40"
                  >
                    <Plus className="size-3.5" />
                    เพิ่มสาร
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openScanFor(box.id);
                    }}
                    className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    📷 อ่านฉลากส่วนผสมจากรูป (OCR)
                  </button>
                  {box.items.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        optimizeBox(box);
                      }}
                      disabled={optimizingId === box.id}
                      className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
                    >
                      {optimizingId === box.id ? "⏳ กำลังให้ AI ปรับ…" : "🤖 ใช้ AI ปรับอัตราส่วนสารอัตโนมัติ"}
                    </button>
                  )}
                  {optMsg && optMsg.boxId === box.id && (
                    <p className={`mt-1 text-[10px] leading-snug ${optMsg.ok ? "text-primary" : "text-destructive"}`}>
                      {optMsg.text}
                    </p>
                  )}
                </div>
              );
            })}

            {boxes.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                ยังไม่มีกล่องสูตร — กด + ด้านบนเพื่อสร้างกล่องแรก
              </p>
            )}
          </div>

          <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ลบ "{boxPendingDelete?.name}" ใช่ไหม?</AlertDialogTitle>
                <AlertDialogDescription>
                  สารทั้งหมดจะถูกลบ และไม่สามารถย้อนกลับได้
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (deleteConfirmId) removeBox(deleteConfirmId);
                    setDeleteConfirmId(null);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  ลบ
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </aside>

        {/* Left resize handle */}
        {!leftCollapsed && (
          <div
            role="separator"
            aria-label="ปรับขนาดแผงกล่องสูตร"
            onPointerDown={startResize("left")}
            className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/50" />
          </div>
        )}

        {/* ── Center: tabs + 3D head + substance picker ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabKey)}
            className="relative flex min-h-0 flex-1 flex-col"
          >
            {/* View switcher — floating pill only while the side panels are collapsed, otherwise the regular in-flow bar */}
            {leftCollapsed ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
                <div className="pointer-events-auto rounded-xl border border-border bg-card p-1 shadow-md">
                  <TabsList className="h-9 rounded-lg bg-muted p-1">
                    {TABS.map((t) => (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className="rounded-md px-5 text-sm font-medium text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                      >
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </div>
            ) : (
              <div className="flex justify-center border-b border-border py-3">
                <TabsList className="h-9 rounded-lg bg-muted p-1">
                  {TABS.map((t) => (
                    <TabsTrigger
                      key={t.key}
                      value={t.key}
                      className="rounded-md px-5 text-sm font-medium text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            )}

            <TabsContent value="experiment" className="relative min-h-0 flex-1 mt-0">
              <>
                <FacePaint
                  layers={paintLayers}
                  brushValue={activeBox ? boxIntensity(activeBox) : 0}
                  armed={!!activeBox && activeBox.items.length > 0}
                  background="#F7F5F4"
                  zoomPct={zoomPct}
                  brushSizePct={brushSizePct}
                  clearTrigger={clearTrigger}
                  onZoomChange={setZoomPct}
                />

                {/* Bottom-centred floating toolbar */}
                <CanvasToolbar
                  brushSizePct={brushSizePct}
                  running={running}
                  onRun={handleRun}
                  onClear={handleClear}
                  onBrushSizeReset={handleBrushSizeReset}
                  onBrushSizeChange={setBrushSizePct}
                />

                {/* Substance picker sheet — slides out right after the formula-box panel, no dark backdrop */}
                <Sheet
                  open={pickerOpen}
                  onOpenChange={(open) => {
                    setPickerOpen(open);
                    if (!open) {
                      setPickerQuery("");
                      setPickerCategory("all");
                    }
                  }}
                >
                  <SheetContent
                    side="left"
                    overlayClassName="z-20 bg-transparent"
                    style={{ left: pickerLeftOffset - 28 }}
                    className="z-20 flex w-80 flex-col gap-0 border-r border-border bg-card p-0 pl-7 sm:max-w-none"
                  >
                    <SheetHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border px-4 py-3 pr-12 text-left">
                      <SheetTitle className="shrink-0">คลังสารเคมี</SheetTitle>
                      <div className="relative shrink-0">
                        <select
                          value={pickerCategory}
                          onChange={(e) => setPickerCategory(e.target.value)}
                          className="h-8 appearance-none rounded-lg border border-border bg-card py-0 pl-3 pr-8 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <option value="all">หมวดหมู่ทั้งหมด</option>
                          {pickerCategories.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </SheetHeader>

                    <div className="px-4 py-3">
                      <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={pickerQuery}
                          onChange={(e) => setPickerQuery(e.target.value)}
                          placeholder="ค้นหาสารเคมี หรือ INCI"
                          className="h-9 w-full rounded-lg border border-border bg-secondary/50 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                      {pickerTarget &&
                        pickerGroups.map((g) => (
                          <div key={g.category} className="mb-4 last:mb-0">
                            <h4 className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                              {g.category}
                            </h4>
                            <div className="space-y-2">
                              {g.items.map((c) => {
                                const already = pickerTarget.items.some((it) => it.chemicalId === c.id);
                                return (
                                  <div
                                    key={c.id}
                                    role="button"
                                    tabIndex={0}
                                    {...substanceHover.bind(c.name, c.smiles)}
                                    onClick={() => !already && addItem(pickerTarget.id, c.id)}
                                    onKeyDown={(e) => {
                                      if ((e.key === "Enter" || e.key === " ") && !already) {
                                        e.preventDefault();
                                        addItem(pickerTarget.id, c.id);
                                      }
                                    }}
                                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${already
                                      ? "border-border bg-secondary/40"
                                      : "cursor-pointer border-border bg-card hover:border-primary/50 hover:bg-accent/40"
                                      }`}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-foreground">
                                        {c.name} ({c.conc}%)
                                      </span>
                                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                        {c.smiles}
                                      </span>
                                    </span>
                                    {already ? (
                                      <button
                                        aria-label={`ลบ ${c.name} ออกจากกล่อง`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeItem(pickerTarget.id, c.id);
                                        }}
                                        className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                                      >
                                        <Minus className="size-3.5" />
                                      </button>
                                    ) : (
                                      <span className="shrink-0 rounded-full border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary">
                                        เพิ่ม
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      {pickerTarget && pickerGroups.length === 0 && (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          ไม่พบสารเคมีที่ตรงกับคำค้นหา
                        </p>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            </TabsContent>

            <TabsContent value="nodemods" className="relative min-h-0 flex-1 mt-0">
              {/* key: rebuild the graph when the active box changes, so it
                  seeds from that box instead of keeping the old nodes. */}
              <FormulaGraph
                key={activeBoxId}
                seed={activeBox ? boxToFormulaItems(activeBox) : []}
                region={region}
                onSaveFormula={saveGraphAsFormula}
              />
            </TabsContent>

            <TabsContent value="trust" className="relative min-h-0 flex-1 mt-0">
              <TrustReport />
            </TabsContent>
          </Tabs>
        </main>

        {/* Right resize handle */}
        {!leftCollapsed && (
          <div
            role="separator"
            aria-label="ปรับขนาดแผงรายละเอียด"
            onPointerDown={startResize("right")}
            className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize"
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/50" />
          </div>
        )}

        {/* ── Right: time-course selector + AI chat panel ── */}
        <aside
          style={{ width: leftCollapsed ? 0 : rightWidth }}
          className={`flex shrink-0 flex-col overflow-hidden bg-card ${
            isResizing ? "" : "transition-all duration-300 ease-in-out"
          } ${leftCollapsed ? "border-l-0" : "border-l border-border"}`}
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">การจำลองตามเวลา</p>
            <p className="mb-2 text-[10px] leading-snug text-muted-foreground/70">
              {activeResult
                ? "เลือกวันเพื่อโหลดความรุนแรงของวันนั้นเข้าพู่กัน แล้วคลิก/ลากบนโมเดลเพื่อดูผล"
                : "กด “เริ่มทดสอบ” ก่อน แล้วค่อยเลือกวันเพื่อดูความรุนแรงที่คาดว่าจะเกิดขึ้น"}
            </p>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setDayIdx(i as 0 | 1 | 2)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${dayIdx === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                >
                  Day {d}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 opacity-90">
            <AiChatPanel
              buildContext={buildChatContext}
              onAction={runAssistantAction}
              onImportFormula={importAssistantFormula}
            />
          </div>

          {/* Reserved results area — always visible, filled in once an assessment runs */}
          <div className="h-64 shrink-0 overflow-y-auto border-t border-border bg-accent/30 px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-foreground">
                ผลการประเมิน{activeResult && ` · Day ${DAY_LABELS[dayIdx]}`}
              </p>
              {activeResult && (
                <button
                  onClick={() => router.push(`/projects/${params.id}/results`)}
                  className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                >
                  ดูรายงานฉบับเต็ม →
                </button>
              )}
            </div>
            {runBoxId === activeBoxId && runError && (
              <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] leading-snug text-destructive">
                ⚠️ {runError}
              </p>
            )}
            {runBoxId === activeBoxId && running && !runError && (
              <p className="mb-3 text-xs text-muted-foreground">กำลังประเมิน…</p>
            )}
            {activeResult ? (
              <div className="space-y-3.5">
                {RESULT_ENDPOINTS.map((ep) => {
                  const e = activeResult.endpoints[ep.key];
                  const score = Math.round(e?.timecourse?.[dayIdx] ?? e?.peak_score ?? 0);
                  return (
                    <div key={ep.key}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{ep.label}</span>
                        <span className="font-mono text-sm font-bold text-primary">
                          {score} <span className="text-xs font-medium text-muted-foreground">- {bandTH(score)}</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${bandColor(score)}`}
                          style={{ width: `${Math.min(100, score)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                กด Run เพื่อประเมินความเสี่ยง ผลลัพธ์จะแสดงที่นี่
              </p>
            )}
          </div>
        </aside>
      {substanceHover.card}
      <LabelScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onImport={(items) => scanTargetId && importOcrItems(scanTargetId, items)}
      />
    </div>
  );
}

// ── Trust / Model Reliability Report ──────────────────────────
// Ported from /assess's inline TrustReport. Shows QSAR model
// performance metrics, OECD principles, and uncertainty layers.
function TrustReport() {
  const [metrics, setMetrics] = useState<ModelMetricsPayload | null>(null);
  const [info, setInfo] = useState<ModelInfoPayload | null>(null);
  useEffect(() => {
    api.getModelMetrics().then(setMetrics).catch(() => {});
    api.getModelInfo().then(setInfo).catch(() => {});
  }, []);
  const pct = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(2));

  return (
    <div className="absolute inset-0 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">ความน่าเชื่อถือของโมเดล</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ทุกการทำนายมาพร้อมตัวชี้วัดประสิทธิภาพ ความไม่แน่นอน และขอบเขตการใช้งาน (Applicability Domain) ตามหลัก OECD สำหรับ QSAR
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left">Endpoint</th>
                <th className="px-4 py-2.5">AUC</th>
                <th className="px-4 py-2.5">Balanced Acc</th>
                <th className="px-4 py-2.5">Sensitivity</th>
                <th className="px-4 py-2.5">Specificity</th>
              </tr>
            </thead>
            <tbody>
              {metrics?.endpoints.map((m: EndpointMetric) => (
                <tr key={m.endpoint} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.label_th}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{m.endpoint}</span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-semibold text-primary">{pct(m.metrics?.auc)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.balanced_accuracy)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.sensitivity)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.specificity)}</td>
                </tr>
              ))}
              {!metrics?.endpoints?.length && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">ยังไม่มีข้อมูล (รัน data_prep.py)</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-2 font-semibold text-foreground">ความไม่แน่นอน 3 ชั้น</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><b>1 · Aleatoric</b> — noise ในข้อมูลการทดลอง</li>
              <li><b>2 · Epistemic</b> — ความไม่แน่นอนของตัวโมเดล (ensemble)</li>
              <li><b>3 · Domain</b> — ระยะห่างจากชุดฝึก (in/out-of-domain)</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-2 font-semibold text-foreground">มาตรฐาน OECD</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Endpoint ชัดเจน · อัลกอริทึมโปร่งใส · Applicability Domain · Goodness-of-fit &amp; robustness · การตีความเชิงกลไก
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
          โมเดลนี้เป็นเครื่องมือ <b>คัดกรอง</b> เพื่อจัดลำดับความเสี่ยงในระยะต้น ไม่ใช่การทดแทนการทดสอบตามข้อกำหนดหรือการประเมินโดยผู้เชี่ยวชาญ
          {info?.disclaimer_th ? "" : ""}
        </div>
      </div>
    </div>
  );
}
