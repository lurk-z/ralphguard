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
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import {
  Beaker,
  Camera,
  ChevronDown,
  Download,
  Eraser,
  Eye,
  FileUp,
  FlaskConical,
  LoaderCircle,
  MapPin,
  Minus,
  Palette,
  Paintbrush,
  PanelLeft,
  PencilLine,
  Plus,
  Search,
  Save,
  Settings,
  Trash2,
  TriangleAlert,
  Droplet,
  Leaf,
  Sparkles,
  Heart,
  UserRound,
  WandSparkles,
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
import CsvImportModal, { type CsvImportItem } from "@/components/CsvImportModal";
import { CHEMICAL_GROUPS, CHEMICALS, chemById } from "@/lib/chemicals";
import { PRODUCT_TEMPLATES, isWaterItem, withWaterBase } from "@/lib/catalog";
import { normalizeFormulaIdentity, parseFormulaCsv } from "@/lib/formula-csv";
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
import {
  addJob,
  getProject,
  getProjectWorkspace,
  renameProject,
  saveProjectWorkspace,
} from "@/lib/projects";

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
  () => import("@/components/SymptomFaceCanvas").then((m) => m.SymptomFaceCanvas),
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
  /**
   * Body site this box is assessed against. Per-box (not page-level) so each
   * formula remembers its own test site the way it remembers its own result —
   * /assess only has one formula at a time, so it ties region to creation
   * instead. Restricted to face/eye: the 3D head can't show anything else
   * (see PRODUCT_TEMPLATES' region-narrowing below).
   */
  region?: Region;
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
const UNTITLED_FORMULA_NAME = "ไม่มีชื่อสูตร";

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
const DEFAULT_BOX_COLOR = BOX_COLORS[0];

/** The real substance total shown in the formula card, including overflow. */
function boxTotalPercent(box: FormulaBox) {
  return box.items.reduce((sum, item) => sum + item.concentration, 0);
}

/** Only assessment inputs belong in this signature; presentation metadata does not. */
function assessmentInputSignature(box: FormulaBox) {
  return JSON.stringify({
    region: box.region ?? "face",
    items: box.items
      .map((item) => [item.chemicalId, Number(item.concentration)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  });
}

// Paint strength is capped at 100%, even though the card badge reports the
// uncapped formula total so an invalid over-filled formula remains obvious.
function boxIntensity(box: FormulaBox) {
  return Math.max(0, Math.min(1, boxTotalPercent(box) / 100));
}

/**
 * Name/SMILES/role for a row, whether or not the catalog knows the substance.
 * Off-catalog rows still render and still reach the model — they just have no
 * catalog blurb to show.
 */
function itemChemical(it: FormulaBoxItem): { name: string; smiles: string; role?: string; category?: string } {
  const c = chemById(it.chemicalId);
  if (c) return { name: c.name, smiles: c.smiles, role: c.role, category: c.category };
  return { name: it.name?.trim() || "สารกำหนดเอง", smiles: it.chemicalId };
}

/**
 * A quiet category cue for dense formula rows. Colour is never the only cue:
 * every substance also carries a short text label, so the grouping remains
 * understandable for colour-blind users and in low-contrast displays.
 */
const CATEGORY_STYLES: Record<string, { label: string; accent: string; surface: string }> = {
  "ตัวทำละลาย / แอลกอฮอล์": { label: "ตัวทำละลาย", accent: "#326B76", surface: "#EDF5F6" },
  "กรด (Acids)": { label: "กรด", accent: "#7A6135", surface: "#F7F4EC" },
  "สารกันเสีย (Preservatives)": { label: "สารกันเสีย", accent: "#4C6380", surface: "#F0F3F7" },
  "น้ำหอม / สารก่อภูมิแพ้": { label: "น้ำหอม/ก่อภูมิแพ้", accent: "#765A68", surface: "#F6F1F4" },
  "สารออกฤทธิ์ (Actives)": { label: "สารออกฤทธิ์", accent: "#586783", surface: "#F0F2F7" },
  "สารลดแรงตึงผิว (Surfactants)": { label: "สารทำความสะอาด", accent: "#397075", surface: "#EEF5F5" },
  "สารกันแดด (UV Filters)": { label: "สารกันแดด", accent: "#756643", surface: "#F6F4ED" },
  "อีมอลเลียนต์ / เพิ่มความชุ่มชื้น": { label: "เพิ่มความชุ่มชื้น", accent: "#55705D", surface: "#F0F5F1" },
};

const CUSTOM_CATEGORY_STYLE = { label: "สารกำหนดเอง", accent: "#566574", surface: "#F1F4F6" };

function categoryStyle(category?: string) {
  return (category && CATEGORY_STYLES[category]) || CUSTOM_CATEGORY_STYLE;
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
const DAY_DESCRIPTIONS = [
  "Day 1 · เริ่มแสดงอาการจากการสัมผัส",
  "Day 3 · การระคายเคืองผิวและตามักอยู่ในช่วงสูงสุด",
  "Day 7 · การระคายเคืองอาจลดลง แต่การแพ้อาจชัดขึ้น",
] as const;

// 4 QSAR endpoints (matches scientific/pipeline.py / backend's real keys).
const RESULT_ENDPOINTS = [
  { key: "skin", label: "ระคายเคืองผิว" },
  { key: "eye", label: "ระคายเคืองตา" },
  { key: "sens", label: "แพ้ผิวหนัง" },
  { key: "acute", label: "พิษเฉียบพลัน" },
] as const;

const ENDPOINT_SYMPTOMS: Record<(typeof RESULT_ENDPOINTS)[number]["key"], string[]> = {
  skin: ["ผิวแดง", "แสบหรือคัน", "ผิวบวมเมื่อคะแนนสูง"],
  eye: ["ตาแดง", "แสบตา", "ระคายเคืองรอบดวงตา"],
  sens: ["ผื่นแพ้", "ตุ่มแดง", "อาการคัน"],
  acute: ["บวมเฉียบพลัน", "แสบร้อน", "ระคายเคืองทันที"],
};

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
    if (proj) {
      setProjectName(proj.name);
    }
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
  const [paintedBoxIds, setPaintedBoxIds] = useState<Set<string>>(() => new Set());
  // A saved backend result is not enough to reveal symptoms: it must belong to
  // the paint mask currently on the model. New/cleared paint requires Run again.
  const [assessedPaintBoxIds, setAssessedPaintBoxIds] = useState<Set<string>>(() => new Set());
  const [paintedRegionsByBox, setPaintedRegionsByBox] = useState<Record<string, string[]>>({});
  const [clearGroupRequest, setClearGroupRequest] = useState<{ groupId: string; token: number } | null>(null);
  const [clearAllTrigger, setClearAllTrigger] = useState(0);

  const ZOOM_STEP = 10;
  const BRUSH_STEP = 10;
  const handleClear = () => {
    if (!activeBoxId) {
      toast("ยังไม่ได้เลือกกล่องสูตร — เลือกกล่องที่ต้องการล้างรอยก่อน", {
        icon: <Eraser className="size-4 text-amber-500" />,
      });
      return;
    }
    setPaintedBoxIds((current) => {
      const next = new Set(current);
      next.delete(activeBoxId);
      return next;
    });
    setAssessedPaintBoxIds((current) => {
      if (!current.has(activeBoxId)) return current;
      const next = new Set(current);
      next.delete(activeBoxId);
      return next;
    });
    setPaintedRegionsByBox((current) => {
      if (!(activeBoxId in current)) return current;
      const next = { ...current };
      delete next[activeBoxId];
      return next;
    });
    setClearGroupRequest((current) => ({ groupId: activeBoxId, token: (current?.token ?? 0) + 1 }));
  };
  const handleClearAll = () => {
    if (!paintedBoxIds.size) {
      toast("ยังไม่มีรอยทาบนโมเดล");
      return;
    }
    setPaintedBoxIds(new Set());
    setAssessedPaintBoxIds(new Set());
    setPaintedRegionsByBox({});
    setClearAllTrigger((trigger) => trigger + 1);
  };
  const handlePaintGroupStateChange = (groupId: string, hasPaint: boolean) => {
    setPaintedBoxIds((current) => {
      const next = new Set(current);
      if (hasPaint) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  };
  const handlePaintGroupChange = (groupId: string) => {
    setAssessedPaintBoxIds((current) => {
      if (!current.has(groupId)) return current;
      const next = new Set(current);
      next.delete(groupId);
      return next;
    });
  };
  const handlePaintGroupRegion = (groupId: string, regionName: string) => {
    setPaintedRegionsByBox((current) => {
      const regions = current[groupId] ?? [];
      if (regions.includes(regionName)) return current;
      return { ...current, [groupId]: [...regions, regionName] };
    });
  };
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
    if (!boxId) {
      toast("ยังไม่ได้เลือกกล่องสูตร — เลือกกล่องที่ต้องการทดสอบก่อน", {
        icon: <TriangleAlert className="size-4 text-amber-500" />,
      });
      return;
    }
    if (!actives.length) {
      toast("ยังไม่มีสารในกล่องสูตร — เพิ่มสารอย่างน้อย 1 รายการก่อน", {
        icon: <Beaker className="size-4 text-amber-500" />,
      });
      return;
    }
    if (!paintedBoxIds.has(boxId)) {
      toast("ยังไม่ได้ทาครีม — ทาลงบนผิวโมเดลก่อนเริ่มทดสอบ", {
        icon: <Paintbrush className="size-4 text-amber-500" />,
      });
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
    let settled = false;
    const settle = (err: string | null) => {
      if (!alive || settled) return false;
      settled = true;
      setRunning(false);
      setJobId(null);
      setRunError(err);
      return true;
    };
    const tick = async () => {
      try {
        const rec = await api.getAssessment(jobId);
        if (!alive) return;
        if (rec.status === "completed") {
          if (!settle(null)) return;
          if (runBoxId && rec.result) {
            setResultByBox((prev) => ({ ...prev, [runBoxId]: rec.result! }));
            setAssessedPaintBoxIds((current) => {
              const next = new Set(current);
              next.add(runBoxId);
              return next;
            });
          }
          toast.success("วิเคราะห์เสร็จสิ้น — แสดงผลการประเมินแล้ว");
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
      name: UNTITLED_FORMULA_NAME,
      color: DEFAULT_BOX_COLOR,
      icon: "beaker",
      region: "face",
      // Start empty — water auto-fills to 100% via withWaterBase().
      items: [],
    },
  ]);
  const [activeBoxId, setActiveBoxId] = useState<string | null>("box-1");
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  // Rest on any substance row for the catalog's description of it.
  const substanceHover = useSubstanceHoverCard();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<string>("all");
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [inlineEditingBoxId, setInlineEditingBoxId] = useState<string | null>(null);
  const [inlineNameDraft, setInlineNameDraft] = useState("");
  const [nameSavedBoxId, setNameSavedBoxId] = useState<string | null>(null);
  const [collapsedBoxIds, setCollapsedBoxIds] = useState<Set<string>>(() => new Set());
  const [enteringBoxIds, setEnteringBoxIds] = useState<Set<string>>(() => new Set());
  const [removingItems, setRemovingItems] = useState<Set<string>>(() => new Set());
  const enterTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const removeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxIdSeq = useRef(1);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const assessmentSignaturesRef = useRef<Record<string, string>>({});

  // Restore the experiment workspace that belongs to this project. The loaded
  // id doubles as a hydration guard: without it, the initial empty React state
  // could overwrite the saved snapshot before this effect gets to read it.
  useEffect(() => {
    setLoadedWorkspaceId(null);
    const workspace = getProjectWorkspace(params.id);

    if (workspace) {
      const restoredBoxes: FormulaBox[] = workspace.boxes.map((box) => ({
        id: box.id,
        name: box.name || UNTITLED_FORMULA_NAME,
        items: Array.isArray(box.items)
          ? box.items
            .filter((item) => typeof item?.chemicalId === "string" && item.chemicalId.trim())
            .map((item) => ({
              chemicalId: item.chemicalId,
              concentration: Number.isFinite(item.concentration)
                ? Math.max(0, item.concentration)
                : 0,
              ...(item.name ? { name: item.name } : {}),
            }))
          : [],
        color: box.color || DEFAULT_BOX_COLOR,
        icon:
          box.icon && box.icon in BOX_ICONS
            ? (box.icon as BoxIconName)
            : "beaker",
        region: box.region === "eye" ? "eye" : "face",
      }));

      const restoredIds = new Set(restoredBoxes.map((box) => box.id));
      const restoredResults = Object.fromEntries(
        Object.entries(workspace.resultByBox ?? {}).filter(([boxId]) => restoredIds.has(boxId)),
      ) as Record<string, AssessmentResultPayload>;
      const highestBoxNumber = restoredBoxes.reduce((highest, box) => {
        const match = /^box-(\d+)$/.exec(box.id);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 1);

      boxIdSeq.current = highestBoxNumber;
      assessmentSignaturesRef.current = Object.fromEntries(
        restoredBoxes.map((box) => [box.id, assessmentInputSignature(box)]),
      );
      setPaintedBoxIds(new Set());
      setAssessedPaintBoxIds(new Set());
      setPaintedRegionsByBox({});
      setBoxes(restoredBoxes);
      setActiveBoxId(
        workspace.activeBoxId && restoredIds.has(workspace.activeBoxId)
          ? workspace.activeBoxId
          : restoredBoxes[0]?.id ?? null,
      );
      setResultByBox(restoredResults);
      if (workspace.pendingAssessment) {
        setJobId(workspace.pendingAssessment.jobId);
        setRunBoxId(workspace.pendingAssessment.boxId);
        setRunning(true);
      } else {
        setJobId(null);
        setRunBoxId(null);
        setRunning(false);
      }
      setDayIdx([0, 1, 2].includes(workspace.dayIdx) ? workspace.dayIdx : 1);
      setTab(TABS.some((item) => item.key === workspace.activeTab) ? workspace.activeTab : "experiment");
      setCollapsedBoxIds(
        new Set((workspace.collapsedBoxIds ?? []).filter((boxId) => restoredIds.has(boxId))),
      );
    } else {
      boxIdSeq.current = 1;
      const initialBoxes: FormulaBox[] = [
        {
          id: "box-1",
          name: UNTITLED_FORMULA_NAME,
          color: DEFAULT_BOX_COLOR,
          icon: "beaker",
          region: "face",
          items: [],
        },
      ];
      assessmentSignaturesRef.current = Object.fromEntries(
        initialBoxes.map((box) => [box.id, assessmentInputSignature(box)]),
      );
      setPaintedBoxIds(new Set());
      setAssessedPaintBoxIds(new Set());
      setPaintedRegionsByBox({});
      setBoxes(initialBoxes);
      setActiveBoxId("box-1");
      setResultByBox({});
      setJobId(null);
      setRunBoxId(null);
      setRunning(false);
      setDayIdx(1);
      setTab("experiment");
      setCollapsedBoxIds(new Set());
    }

    setLoadedWorkspaceId(params.id);
  }, [params.id]);

  // Auto-save every meaningful workspace change. localStorage is synchronous,
  // so the newest formula is durable before a refresh or route change without
  // making the user manage a separate Save button.
  useEffect(() => {
    if (loadedWorkspaceId !== params.id) return;
    saveProjectWorkspace(params.id, {
      boxes,
      activeBoxId,
      resultByBox,
      pendingAssessment: jobId && runBoxId ? { jobId, boxId: runBoxId } : null,
      dayIdx,
      activeTab: tab,
      collapsedBoxIds: [...collapsedBoxIds],
    });
  }, [activeBoxId, boxes, collapsedBoxIds, dayIdx, jobId, loadedWorkspaceId, params.id, resultByBox, runBoxId, tab]);

  useEffect(() => {
    const enterTimers = enterTimersRef.current;
    const timers = removeTimersRef.current;
    return () => {
      enterTimers.forEach((timer) => clearTimeout(timer));
      timers.forEach((timer) => clearTimeout(timer));
      if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
    };
  }, []);

  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? null;
  // Keep the backend payload in project storage, but expose it to both the
  // model and result panel only after the current paint mask completes Run.
  const activeResult = activeBoxId && assessedPaintBoxIds.has(activeBoxId)
    ? resultByBox[activeBoxId]
    : undefined;
  // Which body site the active box is assessed against — a property of the
  // box (see FormulaBox.region), not page-level state.
  const region: Region = activeBox?.region ?? "face";
  const handlePaintBlocked = (ownerGroupIds: string[]) => {
    const ownerNames = ownerGroupIds
      .map((groupId) => {
        const index = boxes.findIndex((box) => box.id === groupId);
        const box = boxes[index];
        if (!box) return null;
        return box.name === UNTITLED_FORMULA_NAME
          ? `กล่องสูตร ${index + 1}`
          : box.name;
      })
      .filter(Boolean)
      .join(", ");
    toast(
      ownerNames
        ? `บริเวณนี้ถูกใช้โดย ${ownerNames} แล้ว — กรุณาเลือกตำแหน่งอื่น`
        : "บริเวณนี้มีกล่องสูตรอื่นทาอยู่แล้ว — กรุณาเลือกตำแหน่งอื่น",
      { icon: <TriangleAlert className="size-4 text-amber-500" /> },
    );
  };

  // Results are valid only for the exact formula and test region submitted.
  // Any input mutation invalidates stale scores, symptoms and in-flight work.
  useEffect(() => {
    if (loadedWorkspaceId !== params.id) return;

    const previous = assessmentSignaturesRef.current;
    const next = Object.fromEntries(
      boxes.map((box) => [box.id, assessmentInputSignature(box)]),
    );
    const changed = new Set<string>();

    boxes.forEach((box) => {
      if (previous[box.id] !== undefined && previous[box.id] !== next[box.id]) {
        changed.add(box.id);
      }
    });
    Object.keys(previous).forEach((boxId) => {
      if (!(boxId in next)) changed.add(boxId);
    });
    assessmentSignaturesRef.current = next;
    if (!changed.size) return;

    setResultByBox((current) => {
      if (![...changed].some((boxId) => boxId in current)) return current;
      const updated = { ...current };
      changed.forEach((boxId) => delete updated[boxId]);
      return updated;
    });

    setPaintedBoxIds((current) => {
      const updated = new Set(current);
      changed.forEach((boxId) => updated.delete(boxId));
      return updated;
    });
    setAssessedPaintBoxIds((current) => {
      if (![...changed].some((boxId) => current.has(boxId))) return current;
      const updated = new Set(current);
      changed.forEach((boxId) => updated.delete(boxId));
      return updated;
    });
    setPaintedRegionsByBox((current) => {
      const updated = { ...current };
      changed.forEach((boxId) => delete updated[boxId]);
      return updated;
    });
    const changedBoxId = [...changed][0];
    if (changedBoxId) {
      setClearGroupRequest((current) => ({
        groupId: changedBoxId,
        token: (current?.token ?? 0) + 1,
      }));
    }
    if (runBoxId && changed.has(runBoxId)) {
      setJobId(null);
      setRunBoxId(null);
      setRunning(false);
      setRunError(null);
    }
  }, [boxes, loadedWorkspaceId, params.id, runBoxId]);
  const changeBoxRegion = (id: string, next: Region) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, region: next } : b)));
  };
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

  const formulaPaintGroups = useMemo(
    () => boxes.map((box, index) => {
      const result = assessedPaintBoxIds.has(box.id) ? resultByBox[box.id] : undefined;
      const layers = result
        ? RESULT_ENDPOINTS.map((endpoint) => {
          const value = result.endpoints[endpoint.key];
          const score = value?.timecourse?.[dayIdx] ?? value?.peak_score ?? 0;
          return {
            key: endpoint.key,
            label: endpoint.label,
            score,
            color: EP_COLOR[endpoint.key],
            band: bandOf(score),
          };
        })
        : [];
      return {
        id: box.id,
        name: box.name === UNTITLED_FORMULA_NAME
          ? `กล่องสูตร ${index + 1} · ${UNTITLED_FORMULA_NAME}`
          : box.name,
        color: box.color || DEFAULT_BOX_COLOR,
        layers,
        waiting: running && runBoxId === box.id,
      };
    }),
    [assessedPaintBoxIds, boxes, dayIdx, resultByBox, runBoxId, running],
  );
  const activePaintedRegions = activeBoxId ? paintedRegionsByBox[activeBoxId] ?? [] : [];
  const activeSymptomDetails = activeResult
    ? RESULT_ENDPOINTS.map((endpoint) => {
      const value = activeResult.endpoints[endpoint.key];
      const score = Math.round(value?.timecourse?.[dayIdx] ?? value?.peak_score ?? 0);
      return {
        ...endpoint,
        score,
        symptoms: ENDPOINT_SYMPTOMS[endpoint.key],
      };
    }).filter((item) => item.score > 0)
    : [];

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

  const animateBoxEntry = (id: string) => {
    const previousTimer = enterTimersRef.current.get(id);
    if (previousTimer) clearTimeout(previousTimer);

    setEnteringBoxIds((prev) => new Set(prev).add(id));
    const timer = setTimeout(() => {
      setEnteringBoxIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      enterTimersRef.current.delete(id);
    }, 360);
    enterTimersRef.current.set(id, timer);
  };

  const toggleBoxCollapsed = (id: string) => {
    substanceHover.dismiss();
    setCollapsedBoxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Add a named box, seeded with items — the shared path for templates, the
   * node graph's save, and the assistant. Returns the new box's id.
   */
  const addBoxFrom = (name: string, items: FormulaBoxItem[], region: Region = "face") => {
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
        region,
      },
    ]);
    animateBoxEntry(id);
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
    const color = DEFAULT_BOX_COLOR;
    const iconsList = Object.keys(BOX_ICONS) as BoxIconName[];
    const icon = iconsList[(boxIdSeq.current - 1) % iconsList.length];
    setBoxes((prev) => [
      ...prev,
      {
        id,
        name: UNTITLED_FORMULA_NAME,
        items: [],
        color,
        icon,
        region: "face",
      },
    ]);
    animateBoxEntry(id);
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

    // /assess narrows a template's region to what the 3D head can actually
    // show, so hand/forearm templates are assessed as face there too.
    addBoxFrom(t.name, toBoxItems(t.formula), t.region === "eye" ? "eye" : "face");
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
    setCollapsedBoxIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeBoxId === id) setActiveBoxId(null);
    if (editingBoxId === id) {
      setEditingBoxId(null);
      setPickerOpen(false);
    }
  };

  const renameBox = (id: string, name: string) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
  };

  const beginInlineRename = (box: FormulaBox) => {
    if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
    setNameSavedBoxId(null);
    setActiveBoxId(box.id);
    setInlineNameDraft(box.name === UNTITLED_FORMULA_NAME ? "" : box.name);
    setInlineEditingBoxId(box.id);
  };

  const commitInlineRename = (boxId: string) => {
    if (nameSavedBoxId === boxId) return;
    const nextName = inlineNameDraft.trim() || UNTITLED_FORMULA_NAME;
    renameBox(boxId, nextName);
    setInlineNameDraft(nextName);
    setNameSavedBoxId(boxId);

    if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
    nameSaveTimerRef.current = setTimeout(() => {
      setNameSavedBoxId(null);
      setInlineEditingBoxId((current) => (current === boxId ? null : current));
      nameSaveTimerRef.current = null;
    }, 900);
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
    const rowKey = `${boxId}:${chemicalId}`;
    if (removeTimersRef.current.has(rowKey)) return;

    substanceHover.dismiss();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setRemovingItems((prev) => new Set(prev).add(rowKey));

    const timer = setTimeout(() => {
      setBoxes((prev) =>
        prev.map((b) =>
          b.id === boxId
            ? { ...b, items: b.items.filter((it) => it.chemicalId !== chemicalId) }
            : b,
        ),
      );
      setRemovingItems((prev) => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
      removeTimersRef.current.delete(rowKey);
    }, reducedMotion ? 0 : 190);

    removeTimersRef.current.set(rowKey, timer);
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

  // ── CSV modal state ──────────────────────────────────────────
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvModalBoxId, setCsvModalBoxId] = useState<string | null>(null);
  const openCsvFor = (boxId: string) => {
    setCsvModalBoxId(boxId);
    setCsvModalOpen(true);
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

  // --- CSV modal helpers -------------------------------------------------------
  // parseCsvFile: validate + return item list for CsvImportModal to preview
  // handleCsvConfirm: called when user confirms the list in the modal

  const parseCsvFile = async (boxId: string, file: File): Promise<CsvImportItem[]> => {
    const targetBox = boxes.find((b) => b.id === boxId);
    if (!targetBox) throw new Error("ไม่พบกล่องสูตรที่เลือก");

    const parsed = parseFormulaCsv(await file.text());
    const catalogByName = new Map(
      CHEMICALS.map((c) => [normalizeFormulaIdentity(c.name), c]),
    );
    const prepared = parsed.items.map((item) => {
      const catalog = item.name ? catalogByName.get(normalizeFormulaIdentity(item.name)) : undefined;
      const smiles = item.smiles || catalog?.smiles || "";
      if (!smiles) throw new Error(`แถว ${item.line}: ไม่พบ SMILES และชื่อสารไม่อยู่ในคลัง`);
      return { ...item, catalog, smiles };
    });

    const smilesToValidate = new Set<string>([
      ...prepared.flatMap((i) => [i.smiles, i.catalog?.smiles ?? ""]),
      ...targetBox.items.map((i) => i.chemicalId),
    ].filter(Boolean));
    const validationPairs = await Promise.all(
      [...smilesToValidate].map(async (smiles) => {
        let result;
        try { result = await api.validateSmiles(smiles); } catch (err) {
          throw new Error(`ตรวจสอบ SMILES กับ Backend ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!result.valid) {
          const src = prepared.find((i) => i.smiles === smiles || i.catalog?.smiles === smiles);
          throw new Error(`${src ? `แถว ${src.line}: ` : ""}SMILES ไม่ถูกต้อง: ${smiles}`);
        }
        return [smiles, result.canonical || smiles] as const;
      }),
    );
    const canonicalBySmiles = new Map(validationPairs);

    const imported = prepared
      .map((item) => {
        const canonical = canonicalBySmiles.get(item.smiles) || item.smiles;
        if (item.catalog) {
          const catalogCanonical = canonicalBySmiles.get(item.catalog.smiles) || item.catalog.smiles;
          if (canonical !== catalogCanonical)
            throw new Error(`แถว ${item.line}: name "${item.name}" ไม่ตรงกับ SMILES`);
        }
        return {
          line: item.line,
          name: item.catalog?.name || item.name || canonical,
          chemicalId: item.catalog?.smiles || canonical,
          canonicalId: canonical,
          concentration: item.concentration,
        };
      })
      .filter((item) => !isWaterItem({ name: item.name, smiles: item.chemicalId }));

    if (!imported.length) throw new Error("CSV ไม่มีสารออกฤทธิ์ที่นำเข้าได้");

    const seenCanonical = new Map<string, number>();
    imported.forEach((item) => {
      const prev = seenCanonical.get(item.canonicalId);
      if (prev) throw new Error(`แถว ${item.line}: โครงสร้างซ้ำกับแถว ${prev}`);
      seenCanonical.set(item.canonicalId, item.line);
    });

    const existingCanonical = new Set(targetBox.items.map((i) => canonicalBySmiles.get(i.chemicalId) || i.chemicalId));
    const existingNames = new Set(targetBox.items.map((i) => normalizeFormulaIdentity(itemChemical(i).name)));
    const dup = imported.find((i) => existingCanonical.has(i.canonicalId) || existingNames.has(normalizeFormulaIdentity(i.name)));
    if (dup) throw new Error(`แถว ${dup.line}: "${dup.name}" มีอยู่ในกล่องสูตรแล้ว`);

    const existingTotal = targetBox.items.reduce((s, i) => s + i.concentration, 0);
    const importedTotal = imported.reduce((s, i) => s + i.concentration, 0);
    const combinedTotal = existingTotal + importedTotal;
    if (combinedTotal > 100.0001)
      throw new Error(`สัดส่วนรวมหลังนำเข้าเท่ากับ ${combinedTotal.toFixed(2)}% ซึ่งเกิน 100%`);

    return imported.map((item) => ({
      name: item.name,
      chemicalId: item.chemicalId,
      concentration: item.concentration,
    }));
  };

  const handleCsvConfirm = (boxId: string, items: CsvImportItem[]) => {
    setActiveBoxId(boxId);
    setBoxes((prev) =>
      prev.map((box) =>
        box.id === boxId
          ? {
            ...box,
            items: [
              ...box.items,
              ...items.map((item) => ({
                chemicalId: item.chemicalId,
                concentration: item.concentration,
                ...(chemById(item.chemicalId) ? {} : { name: item.name }),
              })),
            ],
          }
          : box,
      ),
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
    <div
      data-project-id={params.id}
      className="relative flex h-full w-full overflow-hidden"
    >
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
        className={`relative z-30 flex shrink-0 flex-col bg-card ${isResizing ? "" : "transition-all duration-300 ease-in-out"
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

        <div className="mx-4 flex items-center justify-between border-t border-border pt-3">
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

        <div
          className={`hover-scrollbar mt-3 flex-1 overflow-y-auto px-3 pb-3 ${boxes.length === 0 ? "grid place-items-center" : "space-y-3"
            }`}
          onClick={(e) => {
            // A click on the list's own empty background clears the current
            // selection. Clicks inside a formula card keep their normal
            // behavior because their event target is a descendant.
            if (e.target === e.currentTarget) setActiveBoxId(null);
          }}
        >
          {boxes.map((box) => {
            const active = box.id === activeBoxId;
            const collapsed = collapsedBoxIds.has(box.id);
            const intensity = boxIntensity(box);
            const totalPercent = Math.round(boxTotalPercent(box) * 100) / 100;
            const boxColor = box.color || DEFAULT_BOX_COLOR;
            return (
              <div
                key={box.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveBoxId(box.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveBoxId(box.id)}
                className={`cursor-pointer rounded-xl border p-3 transition-all duration-200 ${enteringBoxIds.has(box.id)
                  ? "animate-in fade-in-0 slide-in-from-bottom-3 zoom-in-95 duration-300 ease-out will-change-transform motion-reduce:animate-none"
                  : ""
                  } ${active
                    ? ""
                    : "box-accent-card-hover border-border bg-card"
                  }`}
                style={
                  {
                    "--box-accent": boxColor,
                    ...(active
                      ? {
                        borderColor: boxColor,
                        boxShadow: `0 0 0 1px ${boxColor}33`,
                        backgroundColor: `${boxColor}0D`,
                      }
                      : {}),
                  } as React.CSSProperties
                }
              >
                <div className="box-accent-header-hover -m-1 flex items-center gap-2 rounded-lg p-1 transition-colors duration-200">
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
                  {inlineEditingBoxId === box.id ? (
                    <div className="relative min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={inlineNameDraft}
                        readOnly={nameSavedBoxId === box.id}
                        aria-label="แก้ไขชื่อสูตร"
                        placeholder={UNTITLED_FORMULA_NAME}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setInlineNameDraft(e.target.value)}
                        onBlur={() => commitInlineRename(box.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setNameSavedBoxId(null);
                            setInlineEditingBoxId(null);
                          }
                        }}
                        className={`h-7 w-full rounded-md border px-2 text-sm font-semibold outline-none transition-colors duration-200 ${nameSavedBoxId === box.id
                          ? "border-emerald-400 bg-emerald-50 pr-7 text-emerald-900"
                          : "border-primary/50 bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                          }`}
                      />
                      {nameSavedBoxId === box.id && (
                        <Save
                          className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-emerald-700"
                          aria-label="บันทึกชื่อแล้ว"
                        />
                      )}
                    </div>
                  ) : (
                    <span
                      title={`${box.name} — ดับเบิลคลิกเพื่อแก้ไขชื่อสูตร`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        beginInlineRename(box);
                      }}
                      className={`min-w-0 flex-1 cursor-text truncate whitespace-nowrap text-sm ${box.name === UNTITLED_FORMULA_NAME
                        ? "font-medium italic text-muted-foreground"
                        : "font-semibold text-foreground"
                        }`}
                    >
                      {box.name}
                    </span>
                  )}
                  {box.region === "eye" && (
                    <span
                      title="บริเวณทดสอบ: ดวงตา"
                      aria-label="บริเวณทดสอบ: ดวงตา"
                      className="grid size-5 shrink-0 place-items-center rounded-full border border-sky-200 bg-sky-50 text-sky-700"
                    >
                      <Eye className="size-3" aria-hidden="true" />
                    </span>
                  )}
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
                      สาร {totalPercent}%
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
                        className="box-accent-control grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-200 focus-visible:outline-none"
                      >
                        <Settings className="size-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      onClick={(e) => e.stopPropagation()}
                      side="right"
                      align="start"
                      sideOffset={12}
                      collisionPadding={12}
                      sticky="always"
                      className="max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto p-0"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground">ตั้งค่ากล่องสูตร</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            จัดการชื่อ บริเวณทดสอบ และรูปแบบกล่อง
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="ลบกล่องสูตร"
                          title="ลบกล่องสูตร"
                          onClick={() => {
                            setSettingsOpenId(null);
                            // Empty box, nothing to lose — skip the confirmation dialog.
                            if (box.items.length === 0) removeBox(box.id);
                            else setDeleteConfirmId(box.id);
                          }}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="px-4 py-3.5">
                        <Label
                          htmlFor={`box-name-${box.id}`}
                          className="flex items-center gap-1.5 text-xs font-bold text-foreground"
                        >
                          <PencilLine className="size-3.5 text-primary" aria-hidden="true" />
                          ชื่อสูตร
                        </Label>
                        <Input
                          id={`box-name-${box.id}`}
                          value={box.name}
                          onChange={(e) => renameBox(box.id, e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          className="mt-2 h-10 bg-card text-sm font-semibold"
                        />
                      </div>

                      <div className="border-t border-border px-4 py-3.5">
                        <Label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                          บริเวณทดสอบ
                        </Label>

                        {/* Restricted to face/eye — the 3D head can't show
                              anywhere else (matches PRODUCT_TEMPLATES' own
                              region-narrowing). */}
                        <div className="mt-2.5 flex gap-2">
                          {(
                            [
                              ["face", "ใบหน้า", UserRound],
                              ["eye", "ดวงตา", Eye],
                            ] as const
                          ).map(([value, label, RegionIcon]) => {
                            const isSelected = (box.region ?? "face") === value;
                            return (
                              <button
                                key={value}
                                onClick={() => changeBoxRegion(box.id, value)}
                                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors ${isSelected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
                                  }`}
                              >
                                <RegionIcon className="size-3.5" aria-hidden="true" />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <details className="group border-t border-border">
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <Palette className="size-3.5" aria-hidden="true" />
                          สีและไอคอนกล่อง
                          <span
                            className="ml-auto size-3 rounded-full border border-black/5"
                            style={{ backgroundColor: boxColor }}
                            aria-hidden="true"
                          />
                          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <div className="space-y-3 border-t border-border/60 bg-secondary/20 px-4 py-3">
                          <div>
                            <Label className="text-[10px] font-medium text-muted-foreground">สีเน้น</Label>
                            <div className="mt-2 grid grid-cols-10 gap-1.5">
                              {BOX_COLORS.map((color) => {
                                const isSelected = boxColor === color;
                                return (
                                  <button
                                    key={color}
                                    aria-label={`เปลี่ยนสีกล่องเป็น ${color}`}
                                    onClick={() => changeBoxColor(box.id, color)}
                                    className="relative size-5 rounded-full border border-black/5 transition-transform active:scale-90"
                                    style={{ backgroundColor: color }}
                                  >
                                    {isSelected && (
                                      <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-white shadow-sm" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <Label className="text-[10px] font-medium text-muted-foreground">ไอคอนกล่อง</Label>
                            <div className="mt-2 flex gap-1.5">
                              {Object.entries(BOX_ICONS).map(([iconName, IconComponent]) => {
                                const isSelected = (box.icon || "beaker") === iconName;
                                return (
                                  <button
                                    key={iconName}
                                    aria-label={`เลือกไอคอน ${iconName}`}
                                    onClick={() => changeBoxIcon(box.id, iconName as BoxIconName)}
                                    className="grid size-7 shrink-0 place-items-center rounded-lg border transition-colors active:scale-95"
                                    style={
                                      isSelected
                                        ? { borderColor: boxColor, backgroundColor: `${boxColor}14`, color: boxColor }
                                        : { borderColor: "hsl(var(--border))", backgroundColor: "hsl(var(--card))", color: "hsl(var(--muted-foreground))" }
                                    }
                                  >
                                    <IconComponent className="size-3.5" aria-hidden="true" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </details>

                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? "ขยายกล่องสูตร" : "ย่อกล่องสูตร"}
                    title={collapsed ? "ขยายกล่องสูตร" : "ย่อกล่องสูตร"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBoxCollapsed(box.id);
                    }}
                    className="box-accent-control grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-200 focus-visible:outline-none"
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-300 ease-out ${collapsed ? "-rotate-90" : "rotate-0"}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <div
                  aria-hidden={collapsed}
                  inert={collapsed ? true : undefined}
                  className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${collapsed
                    ? "pointer-events-none grid-rows-[0fr] opacity-0"
                    : "grid-rows-[1fr] opacity-100"
                    }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    {box.items.length > 0 ? (
                      <div className="mt-3 space-y-2.5">
                        {/* Water base — not an editable row: it balances to fill
                          whatever the actives leave, exactly as /assess does. */}
                        {(() => {
                          const waterPct = waterPctOf(box);
                          return waterPct > 0 ? (
                            <div className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium leading-tight text-foreground">
                                    น้ำฐานอัตโนมัติ
                                  </span>
                                  <span className="mt-1 block truncate text-[10px] leading-tight text-sky-700">
                                    Water (Aqua) · เติมให้สูตรครบ 100%
                                  </span>
                                </span>
                                <div className="flex shrink-0 items-center gap-1 rounded-md border border-sky-200 bg-white/90 px-1.5 py-1">
                                  <span className="w-8 text-right text-xs font-semibold tabular-nums text-foreground">
                                    {waterPct}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">%</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[10px] leading-snug text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400">
                              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                              <p>
                                {totalPercent > 100
                                  ? `สารรวม ${totalPercent}% — ลดสัดส่วน`
                                  : "สารรวมครบ 100% — ไม่มีพื้นที่สำหรับน้ำ"}
                              </p>
                            </div>
                          );
                        })()}
                        {box.items.map((it) => {
                          const c = itemChemical(it);
                          const category = categoryStyle(c.category);
                          const rowKey = `${box.id}:${it.chemicalId}`;
                          const isRemoving = removingItems.has(rowKey);
                          return (
                            <div
                              key={it.chemicalId}
                              onClick={(e) => e.stopPropagation()}
                              {...substanceHover.bind(c.name, c.smiles)}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 outline-none transition-[opacity,transform,border-color] duration-200 ease-out motion-reduce:transition-none ${isRemoving
                                ? "pointer-events-none translate-x-3 scale-[0.98] opacity-0"
                                : "animate-in fade-in slide-in-from-right-2 translate-x-0 scale-100 opacity-100"
                                }`}
                              style={{
                                borderColor: `${category.accent}24`,
                                backgroundColor: category.surface,
                              }}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="min-w-0 flex-1 truncate text-xs font-medium leading-tight text-foreground">
                                    {c.name}
                                  </span>
                                  <span
                                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none"
                                    style={{ color: category.accent, backgroundColor: `${category.accent}12` }}
                                  >
                                    {category.label}
                                  </span>
                                </span>
                                <span className="mt-1 block truncate font-mono text-[9px] leading-tight text-muted-foreground">
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
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-4 text-center">
                        <Beaker className="mx-auto size-5 text-muted-foreground/70" aria-hidden="true" />
                        <p className="mt-1.5 text-xs font-medium text-foreground">ยังไม่มีสารในสูตร</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                          เพิ่มจากคลังสาร หรือสแกนฉลากส่วนผสม
                        </p>
                      </div>
                    )}

                    {/* ── Action buttons ── */}
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {/* Split button: กดข้อความ → picker / กดลูกศร → dropdown */}
                      <div className="flex overflow-hidden rounded-lg border border-dashed border-primary/40 transition-colors hover:border-primary">
                        {/* Main action */}
                        <button
                          onClick={(e) => { e.stopPropagation(); openPickerFor(box.id); }}
                          className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary hover:bg-accent/40 transition-colors"
                        >
                          <Plus className="size-3.5" />
                          เพิ่มสาร
                        </button>
                        {/* Divider */}
                        <span className="w-px self-stretch bg-primary/20" />
                        {/* Dropdown trigger */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              aria-label="ตัวเลือกเพิ่มเติม"
                              className="flex items-center justify-center px-2 py-2 text-primary hover:bg-accent/40 transition-colors"
                            >
                              <ChevronDown className="size-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="bottom"
                            align="end"
                            sideOffset={6}
                            className="w-44 p-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openScanFor(box.id); }}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                            >
                              <Camera className="size-3.5 text-muted-foreground" />
                              สแกนฉลาก
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openCsvFor(box.id); }}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                            >
                              <FileUp className="size-3.5 text-muted-foreground" />
                              นำเข้าจาก CSV
                            </button>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* AI ปรับสัดส่วน — ด้านล่าง แสดงเฉพาะเมื่อมีสาร */}
                      {box.items.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); optimizeBox(box); }}
                          disabled={optimizingId === box.id}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-secondary/30 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
                        >
                          {optimizingId === box.id ? (
                            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <WandSparkles className="size-3" aria-hidden="true" />
                          )}
                          {optimizingId === box.id ? "กำลังปรับ…" : "AI ปรับสัดส่วน"}
                        </button>
                      )}
                    </div>

                    {optMsg && optMsg.boxId === box.id && (
                      <p className={`mt-1 text-[10px] leading-snug ${optMsg.ok ? "text-primary" : "text-destructive"}`}>
                        {optMsg.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {boxes.length === 0 && (
            <div className="w-full animate-in fade-in-0 zoom-in-95 px-4 py-8 text-center duration-200 motion-reduce:animate-none">
              <span className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Beaker className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-bold text-foreground">ยังไม่มีกล่องสูตร</p>
              <p className="mx-auto mt-1 max-w-48 text-[11px] leading-relaxed text-muted-foreground">
                สร้างกล่องสูตรเพื่อเริ่มเพิ่มสารและกำหนดสัดส่วน
              </p>
              <button
                type="button"
                onClick={addBox}
                className="mx-auto mt-4 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-[background-color,transform,box-shadow] hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                สร้างกล่องสูตร
              </button>
            </div>
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
                productName={activeBox?.name ?? UNTITLED_FORMULA_NAME}
                background="#F7F5F4"
                zoomPct={zoomPct}
                brushSizePct={brushSizePct}
                onZoomChange={setZoomPct}
                waitingForResult={running}
                day={DAY_LABELS[dayIdx]}
                formulaGroups={formulaPaintGroups}
                activeGroupId={activeBoxId}
                clearGroupRequest={clearGroupRequest}
                clearAllTrigger={clearAllTrigger}
                onPaintGroupStateChange={handlePaintGroupStateChange}
                onPaintGroupChange={handlePaintGroupChange}
                onPaintGroupRegion={handlePaintGroupRegion}
                onPaintBlocked={handlePaintBlocked}
              />

              {/* Bottom-centred floating toolbar */}
              <CanvasToolbar
                brushSizePct={brushSizePct}
                running={running}
                onRun={handleRun}
                onClear={handleClear}
                onClearAll={handleClearAll}
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
                    <div className="relative w-28 min-w-0 shrink">
                      <select
                        aria-label="กรองสารตามหมวดหมู่"
                        value={pickerCategory}
                        onChange={(e) => setPickerCategory(e.target.value)}
                        className="h-8 w-full min-w-0 appearance-none truncate rounded-lg border border-border bg-card py-0 pl-3 pr-8 text-xs text-foreground outline-none transition-colors focus:border-primary"
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
                      pickerGroups.map((g) => {
                        const groupStyle = categoryStyle(g.category);
                        return (
                          <div key={g.category} className="mb-5 last:mb-0">
                            <h4 className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/95 px-1 py-2 text-[11px] font-semibold text-foreground backdrop-blur">
                              {g.category}
                              <span className="ml-auto font-normal tabular-nums text-muted-foreground">
                                {g.items.length} รายการ
                              </span>
                            </h4>
                            <div className="space-y-2">
                              {g.items.map((c) => {
                                const selectedItem = pickerTarget.items.find((it) => it.chemicalId === c.id);
                                const already = !!selectedItem;
                                const displayConcentration = selectedItem?.concentration ?? c.conc;
                                return (
                                  <div
                                    key={c.id}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={already}
                                    aria-label={already ? `ลบ ${c.name} ออกจากสูตร` : `เพิ่ม ${c.name} เข้าสูตร`}
                                    onClick={() =>
                                      already
                                        ? removeItem(pickerTarget.id, c.id)
                                        : addItem(pickerTarget.id, c.id)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        already
                                          ? removeItem(pickerTarget.id, c.id)
                                          : addItem(pickerTarget.id, c.id);
                                      }
                                    }}
                                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${already ? "ring-1" : ""
                                      }`}
                                    style={{
                                      borderColor: already ? `${groupStyle.accent}70` : `${groupStyle.accent}24`,
                                      backgroundColor: groupStyle.surface,
                                      boxShadow: already ? `inset 0 0 0 1px ${groupStyle.accent}20` : undefined,
                                      ...(already ? { "--tw-ring-color": `${groupStyle.accent}30` } : {}),
                                    } as React.CSSProperties}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-semibold text-slate-800">
                                        {c.name}
                                      </span>
                                      <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">
                                        {c.smiles}
                                      </span>
                                    </span>
                                    <span
                                      className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-bold tabular-nums"
                                      style={{
                                        borderColor: `${groupStyle.accent}42`,
                                        backgroundColor: already ? groupStyle.accent : "#FFFFFFCC",
                                        color: already ? "#FFFFFF" : groupStyle.accent,
                                      }}
                                    >
                                      {displayConcentration}%
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
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

          <TabsContent value="nodemods" className="relative mt-0 min-h-0 flex-1 overflow-hidden">
            {/* Independent node-based assessment. It intentionally owns its
                own substances and never reads from or writes to formula boxes. */}
            <FormulaGraph />
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
        className={`flex shrink-0 flex-col overflow-hidden bg-card ${isResizing ? "" : "transition-all duration-300 ease-in-out"
          } ${leftCollapsed ? "border-l-0" : "border-l border-border"}`}
      >
        <div className="border-b border-border px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">ผลการประเมิน</p>
            {activeResult && (
              <button
                onClick={() => router.push(`/projects/${params.id}/results`)}
                aria-label="ดูรายงานฉบับเต็ม"
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Download className="size-3.5" aria-hidden />
                <span>รายงาน</span>
              </button>
            )}
          </div>
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
        {/* Reserved results area — always visible, filled in once an assessment runs */}
        <div className="h-[19.5rem] shrink-0 overflow-hidden border-b border-border bg-accent/30 px-3 py-3">
          {runBoxId === activeBoxId && runError && (
            <div className="mb-3 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] leading-snug text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <p>{runError}</p>
            </div>
          )}
          {activeResult ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <MapPin className="size-3.5 text-primary" aria-hidden />
                  <span>บริเวณที่ทา</span>
                </div>
                {activePaintedRegions.length ? (
                  <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {activePaintedRegions.map((regionName) => (
                      <span
                        key={regionName}
                        className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                      >
                        {regionName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">ยังไม่มีรอยทาของกล่องสูตรนี้บนโมเดล</p>
                )}
              </div>

              <div className="border-t border-border/70 pt-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  <span>อาการที่คาดการณ์</span>
                </div>
                {activeSymptomDetails.length ? (
                  <div className="space-y-1.5">
                    {activeSymptomDetails.map((detail) => {
                      const DetailIcon = detail.key === "eye"
                        ? Eye
                        : detail.key === "sens"
                          ? Sparkles
                          : detail.key === "acute"
                            ? TriangleAlert
                            : Droplet;
                      return (
                        <div key={detail.key} className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/70 px-2 py-1.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                            <DetailIcon className="size-3.5" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-foreground">{detail.label}</span>
                              <span className="shrink-0 font-mono text-[11px] font-bold text-primary">
                                {detail.score} · {bandTH(detail.score)}
                              </span>
                            </div>
                            <p
                              className="truncate text-[10px] leading-4 text-muted-foreground"
                              title={detail.symptoms.join(" · ")}
                            >
                              {detail.symptoms.join(" · ")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">ไม่พบอาการเด่นในวันที่เลือก</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <MapPin className="size-3.5 text-primary" aria-hidden />
                  <span>บริเวณที่ทา</span>
                </div>
                {activePaintedRegions.length ? (
                  <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {activePaintedRegions.map((regionName) => (
                      <span
                        key={regionName}
                        className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                      >
                        {regionName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">ยังไม่มีรอยทาของกล่องสูตรนี้บนโมเดล</p>
                )}
              </div>

              <div className="border-t border-border/70 pt-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  <span>อาการที่คาดการณ์</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-2.5 py-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                    {runBoxId === activeBoxId && running ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <FlaskConical className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      {runBoxId === activeBoxId && running
                        ? "กำลังวิเคราะห์อาการ"
                        : "ยังไม่มีอาการที่คาดการณ์"}
                    </p>
                    <p className="truncate text-[10px] leading-4 text-muted-foreground">
                      {runBoxId === activeBoxId && running
                        ? "รอผลการประเมินจากระบบ"
                        : "กดเริ่มทดสอบเพื่อวิเคราะห์รอยที่ทา"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 opacity-90">
          <AiChatPanel
            buildContext={buildChatContext}
            onAction={runAssistantAction}
            onImportFormula={importAssistantFormula}
          />
        </div>
      </aside>
      {substanceHover.card}
      <LabelScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onImport={(items) => scanTargetId && importOcrItems(scanTargetId, items)}
      />
      <CsvImportModal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onParseFile={(file) => parseCsvFile(csvModalBoxId!, file)}
        onConfirm={(items) => csvModalBoxId && handleCsvConfirm(csvModalBoxId, items)}
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
    api.getModelMetrics().then(setMetrics).catch(() => { });
    api.getModelInfo().then(setInfo).catch(() => { });
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
