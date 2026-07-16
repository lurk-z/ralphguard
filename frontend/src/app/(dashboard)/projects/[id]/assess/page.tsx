"use client";

// Substance-experiment page ("ทดลองสาร"). White dashboard shell with:
//  - left: formula boxes you build yourself (each a mix of substances + % each)
//  - center: head.glb — click a box to "load" its combined strength onto the
//    brush, then drag on the face to paint the result (FacePaintCanvas)
//  - right: detail of the active box + run/export actions
// Chemical list is mock data; everything here drives local state only.
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
import { CHEMICAL_GROUPS, chemById } from "@/lib/chemicals";
import { PRODUCT_TEMPLATES, isWaterItem, withWaterBase } from "@/lib/catalog";
import type { FormulaItem, Region } from "@/lib/api";
import { buildMockAssessmentResult, saveMockAssessmentResult } from "@/lib/mockAssessment";

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

type FormulaBoxItem = { chemicalId: string; concentration: number };
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

// Brush strength = total concentration in the box, capped at 100%. A rough
// stand-in for the real dose-additivity model (scientific/mixture.py) until
// the assessment API is wired up here.
function boxIntensity(box: FormulaBox) {
  const total = box.items.reduce((s, it) => s + it.concentration, 0);
  return Math.max(0, Math.min(1, total / 100));
}

/** A box's rows as the catalog/API shape. Boxes hold actives only — no water. */
function boxToFormulaItems(box: FormulaBox): FormulaItem[] {
  return box.items.flatMap((it) => {
    const c = chemById(it.chemicalId);
    return c ? [{ name: c.name, smiles: c.smiles, concentration: it.concentration }] : [];
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
] as const;
type TabKey = (typeof TABS)[number]["key"];

// 4 QSAR endpoints (matches scientific/pipeline.py). Score here is a local
// stand-in derived from box concentration, not the real assessment pipeline.
const RESULT_ENDPOINTS = [
  { key: "skin", label: "ระคายเคืองผิว" },
  { key: "eye", label: "ระคายเคืองตา" },
  { key: "sens", label: "แพ้ผิวหนัง" },
  { key: "acute", label: "พิษเฉียบพลัน" },
] as const;
function bandTH(score: number) {
  if (score <= 0) return "ไม่มี";
  if (score <= 2) return "ต่ำ";
  if (score <= 3) return "กลาง";
  return "สูง";
}
function bandColor(score: number) {
  if (score <= 0) return "bg-muted-foreground/40";
  if (score <= 2) return "bg-emerald-500";
  if (score <= 3) return "bg-amber-500";
  return "bg-destructive";
}

export default function ExperimentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("experiment");
  const [projectName, setProjectName] = useState("Hand Cream Formula Test");
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [zoomPct, setZoomPct] = useState(25);
  const [dayIdx, setDayIdx] = useState<0 | 1 | 2>(1); // 0=Day1, 1=Day3, 2=Day7
  // Results only appear after running an assessment (see handleRun / CanvasToolbar's Run button).
  const [hasAssessed, setHasAssessed] = useState(false);
  const [running, setRunning] = useState(false);

  const [brushSizePct, setBrushSizePct] = useState(10);
  const [clearTrigger, setClearTrigger] = useState(0);

  const ZOOM_STEP = 10;
  const BRUSH_STEP = 10;
  const handleClear = () => setClearTrigger((t) => t + 1);
  const handleRun = () => {
    setRunning(true);
    // Mock scoring pipeline — swap for api.createAssessment once the real
    // QSAR backend is wired up here; results/page.tsx already prefers a
    // real API response over this mock and only falls back to it.
    setTimeout(() => {
      const result = buildMockAssessmentResult(activeBox?.items ?? [], region);
      saveMockAssessmentResult(params.id, result);
      setHasAssessed(true);
      setRunning(false);
      router.push(`/projects/${params.id}/results`);
    }, 1500);
  };
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<string>("all");
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const boxIdSeq = useRef(1);

  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? null;
  const pickerTargetId = editingBoxId ?? activeBoxId;
  const pickerTarget = boxes.find((b) => b.id === pickerTargetId) ?? null;

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

    boxIdSeq.current += 1;
    const id = `box-${boxIdSeq.current}`;
    const iconsList = Object.keys(BOX_ICONS) as BoxIconName[];
    setBoxes((prev) => [
      ...prev,
      {
        id,
        name: t.name,
        color: BOX_COLORS[(boxIdSeq.current - 1) % BOX_COLORS.length],
        icon: iconsList[(boxIdSeq.current - 1) % iconsList.length],
        // Template formulas are actives-only and every SMILES is in the
        // catalog, so these all resolve through chemById.
        items: t.formula.map((f) => ({ chemicalId: f.smiles, concentration: f.concentration })),
      },
    ]);
    setActiveBoxId(id);
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
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
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
                        const c = chemById(it.chemicalId);
                        if (!c) return null;
                        return (
                          <div
                            key={it.chemicalId}
                            onClick={(e) => e.stopPropagation()}
                            title={c.role ?? undefined}
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
                                    title={c.role ?? undefined}
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
              <FormulaGraph region={region} />
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
            <p className="mb-2 text-xs font-medium text-muted-foreground">การจำลองตามเวลา</p>
            <div className="flex gap-1.5">
              {[1, 3, 7].map((d, i) => (
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
            <AiChatPanel />
          </div>

          {/* Reserved results area — always visible, filled in once an assessment runs */}
          <div className="h-64 shrink-0 overflow-y-auto border-t border-border bg-accent/30 px-4 py-4">
            <p className="mb-3 text-sm font-bold text-foreground">ผลการประเมิน</p>
            {hasAssessed ? (
              <div className="space-y-3.5">
                {RESULT_ENDPOINTS.map((ep) => {
                  const score = activeBox ? Math.round(boxIntensity(activeBox) * 4) : 0;
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
                          style={{ width: `${(score / 4) * 100}%` }}
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
    </div>
  );
}
