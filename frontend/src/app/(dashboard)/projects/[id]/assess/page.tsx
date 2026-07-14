"use client";

// Substance-experiment page ("ทดลองสาร"). White dashboard shell with:
//  - left: formula boxes you build yourself (each a mix of substances + % each)
//  - center: head.glb — click a box to "load" its combined strength onto the
//    brush, then drag on the face to paint the result (FacePaintCanvas)
//  - right: detail of the active box + run/export actions
// Chemical list is mock data; everything here drives local state only.
import React, { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Beaker,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FlaskConical,
  Grid2x2,
  HelpCircle,
  LayoutGrid,
  LineChart,
  Minus,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
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
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// 3D head, paint mode (client-only WebGL): drag on the skin to apply the
// armed formula box's strength as erythema.
const FacePaint = dynamic(
  () => import("@/components/FaceIrritationModel").then((m) => m.FacePaintCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
        กำลังโหลดโมเดล 3 มิติ…
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

type Chemical = {
  id: string;
  name: string;
  cas: string;
  role: string;
  color: string; // flask icon tint
};

const CHEMICALS: Chemical[] = [
  { id: "water", name: "Water (Aqua)", cas: "7732-18-5", role: "ตัวทำละลายหลัก", color: "#3B82F6" },
  { id: "glycerin", name: "Glycerin", cas: "56-81-5", role: "สารให้ความชุ่มชื้น", color: "#0EA5E9" },
  { id: "cetearyl", name: "Cetearyl Alcohol", cas: "67762-27-0", role: "สารเพิ่มความข้น", color: "#EC4899" },
  { id: "cct", name: "Caprylic/Capric Triglyceride", cas: "73398-61-5", role: "สารให้ความลื่น", color: "#F97316" },
  { id: "dimethicone", name: "Dimethicone", cas: "63148-62-9", role: "สารเคลือบผิว", color: "#22C55E" },
  { id: "niacinamide", name: "Niacinamide", cas: "98-92-0", role: "สารออกฤทธิ์", color: "#22C55E" },
  { id: "phenoxyethanol", name: "Phenoxyethanol", cas: "122-99-6", role: "สารกันเสีย", color: "#EC4899" },
  { id: "carbomer", name: "Carbomer", cas: "9007-20-9", role: "สารเพิ่มความหนืด", color: "#3B82F6" },
  { id: "tea", name: "Triethanolamine", cas: "102-71-6", role: "สารปรับค่า pH", color: "#3B82F6" },
  { id: "allantoin", name: "Allantoin", cas: "97-59-6", role: "สารปลอบผิว", color: "#22C55E" },
];
const chemById = (id: string) => CHEMICALS.find((c) => c.id === id)!;

type FormulaBoxItem = { chemicalId: string; concentration: number };
type FormulaBox = { id: string; name: string; items: FormulaBoxItem[] };

// Brush strength = total concentration in the box, capped at 100%. A rough
// stand-in for the real dose-additivity model (scientific/mixture.py) until
// the assessment API is wired up here.
function boxIntensity(box: FormulaBox) {
  const total = box.items.reduce((s, it) => s + it.concentration, 0);
  return Math.max(0, Math.min(1, total / 100));
}

const TABS = [
  { key: "experiment", label: "การทดลอง" },
  { key: "nodemods", label: "โหนดโมเดล" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const RAIL_ICONS: { icon: React.ElementType; label: string; href?: string }[] = [
  { icon: FlaskConical, label: "ทดลอง" },
  { icon: Beaker, label: "สูตร" },
  { icon: Grid2x2, label: "สารเคมี" },
  { icon: LayoutGrid, label: "เทมเพลต" },
  { icon: LineChart, label: "ผลลัพธ์" },
  { icon: SlidersHorizontal, label: "เปรียบเทียบ" },
  { icon: Settings, label: "ตั้งค่า" },
  { icon: HelpCircle, label: "ช่วยเหลือ" },
];

export default function ExperimentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("experiment");
  const [projectName, setProjectName] = useState("Hand Cream Formula Test");
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [zoomPct, setZoomPct] = useState(100);

  // ── Resizable / collapsible panels (Figma-style) ──
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(340);
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const startResize = (side: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
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
      items: [
        { chemicalId: "water", concentration: 65 },
        { chemicalId: "glycerin", concentration: 20 },
      ],
    },
  ]);
  const [activeBoxId, setActiveBoxId] = useState<string | null>("box-1");
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<string>("all");
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const boxIdSeq = useRef(1);

  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? null;
  const pickerTargetId = editingBoxId ?? activeBoxId;
  const pickerTarget = boxes.find((b) => b.id === pickerTargetId) ?? null;

  const pickerCategories = useMemo(
    () => Array.from(new Set(CHEMICALS.map((c) => c.role))),
    [],
  );
  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return CHEMICALS.filter((c) => {
      const matchesCategory = pickerCategory === "all" || c.role === pickerCategory;
      const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.cas.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [pickerQuery, pickerCategory]);

  const addBox = () => {
    boxIdSeq.current += 1;
    const id = `box-${boxIdSeq.current}`;
    setBoxes((prev) => [...prev, { id, name: `สูตร ${String.fromCharCode(64 + boxIdSeq.current)}`, items: [] }]);
    setActiveBoxId(id);
    setEditingBoxId(id);
    setPickerOpen(true);
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
    setBoxes((prev) =>
      prev.map((b) =>
        b.id === boxId && !b.items.some((it) => it.chemicalId === chemicalId)
          ? { ...b, items: [...b.items, { chemicalId, concentration: 10 }] }
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
    <SidebarProvider>
      <div data-project-id={params.id} className="app-light relative flex h-screen w-full overflow-hidden bg-card text-foreground">
        {/* ── Icon rail (shadcn Sidebar, icon-only, no toggle) — hidden entirely while the left panel is collapsed ── */}
        {!leftCollapsed && (
          <Sidebar
            collapsible="none"
            className="h-screen w-14 shrink-0 border-r border-border bg-card"
          >
            <SidebarContent className="py-3 gap-0">
              <SidebarMenu className="items-center gap-1">
                {RAIL_ICONS.map(({ icon: Icon, label, href }, i) => (
                  <SidebarMenuItem key={label}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          isActive={i === 0}
                          size="default"
                          onClick={() => {
                            if (label === "ผลลัพธ์") router.push(`/projects/${params.id}/results`);
                            else if (href) router.push(href);
                          }}
                          className="size-10 justify-center p-0"
                        >
                          <Icon className="size-[18px]" />
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-white">{label}</TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarContent>
            <SidebarFooter className="py-3 items-center">
              <span className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                A
              </span>
            </SidebarFooter>
          </Sidebar>
        )}

        {/* Figma-style floating pill — replaces the whole left side (nav + panel) while collapsed.
            Clicking the name (not the icon) reopens the panel; the icon is a decorative label. */}
        {leftCollapsed && (
          <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-xl border border-border bg-card py-2 pl-2 pr-3 shadow-md">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
            >
              <PanelLeft className="size-4" />
            </span>
            <button
              aria-label="เปิดแผง"
              onClick={() => setLeftCollapsed(false)}
              className="max-w-[160px] truncate rounded px-0.5 text-left text-sm font-semibold text-foreground hover:text-primary"
            >
              {projectName}
            </button>
          </div>
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
          className={`flex shrink-0 flex-col ${leftCollapsed ? "overflow-hidden border-r-0" : "border-r border-border"}`}
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
              <span className="text-xs text-muted-foreground">คลิกกล่องเพื่อใช้ทาสี</span>
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
              return (
                <div
                  key={box.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveBoxId(box.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveBoxId(box.id)}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${active ? "border-primary bg-accent/50 ring-1 ring-primary/30" : "border-border bg-card hover:bg-secondary"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                        }`}
                    >
                      <Beaker className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">{box.name}</span>
                    {intensity > 0 && (
                      <Badge variant={active ? "default" : "secondary"} className="shrink-0 px-1.5 py-0 text-[10px]">
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
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="mt-3 border-t border-border pt-3">
                          <button
                            onClick={() => {
                              setSettingsOpenId(null);
                              setDeleteConfirmId(box.id);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                            ลบสูตรนี้
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {box.items.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {box.items.map((it) => {
                        const c = chemById(it.chemicalId);
                        return (
                          <div
                            key={it.chemicalId}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 py-2 pl-2 pr-2.5"
                          >
                            <span
                              className="grid size-7 shrink-0 place-items-center rounded-md"
                              style={{ backgroundColor: `${c.color}1A` }}
                            >
                              <FlaskConical className="size-3.5" style={{ color: c.color }} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium leading-tight text-foreground">
                                {c.name}
                              </span>
                              <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                                CAS {c.cas}
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
                <TabsList className="pointer-events-auto h-10 rounded-xl border border-border bg-card p-1.5 shadow-md">
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
                  key={activeBoxId ?? "none"}
                  brushValue={activeBox ? boxIntensity(activeBox) : 0}
                  armed={!!activeBox && activeBox.items.length > 0}
                  background="#F7F5F4"
                  onZoomChange={setZoomPct}
                />

                {/* Substance picker drawer — only visible after "เพิ่มสารลงกล่องนี้" is clicked */}
                <Drawer
                  open={pickerOpen}
                  onOpenChange={(open) => {
                    setPickerOpen(open);
                    if (!open) {
                      setPickerQuery("");
                      setPickerCategory("all");
                    }
                  }}
                >
                  <DrawerContent className="mt-0 max-h-[46vh]">
                    <DrawerHeader className="flex-row items-center justify-between gap-3 space-y-0 text-left pb-3">
                      <DrawerTitle>คลังสารเคมี</DrawerTitle>
                    </DrawerHeader>

                    <div className="flex items-center gap-3 px-4 pb-3">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={pickerQuery}
                          onChange={(e) => setPickerQuery(e.target.value)}
                          placeholder="ค้นหาสารเคมี หรือ INCI"
                          className="h-9 w-full rounded-lg border border-border bg-secondary/50 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                        />
                      </div>
                      <div className="relative shrink-0">
                        <select
                          value={pickerCategory}
                          onChange={(e) => setPickerCategory(e.target.value)}
                          className="h-9 appearance-none rounded-lg border border-border bg-card py-0 pl-3 pr-8 text-sm text-foreground outline-none focus:border-primary"
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
                    </div>

                    <div className="px-4 pb-5">
                      <div className="relative">
                        <div
                          onWheel={(e) => {
                            if (e.deltaY === 0) return;
                            e.currentTarget.scrollLeft += e.deltaY;
                            e.preventDefault();
                          }}
                          className="no-scrollbar flex gap-3 overflow-x-auto"
                        >
                          {pickerTarget &&
                            pickerResults.map((c) => {
                              const already = pickerTarget.items.some((it) => it.chemicalId === c.id);
                              return (
                                <div
                                  key={c.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => !already && addItem(pickerTarget.id, c.id)}
                                  onKeyDown={(e) => {
                                    if ((e.key === "Enter" || e.key === " ") && !already) {
                                      e.preventDefault();
                                      addItem(pickerTarget.id, c.id);
                                    }
                                  }}
                                  className={`flex w-60 shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${already
                                    ? "border-border bg-secondary/40"
                                    : "cursor-pointer border-border bg-card hover:border-primary/50 hover:bg-accent/40"
                                    }`}
                                >
                                  <span
                                    className={`grid size-8 shrink-0 place-items-center rounded-md ${already ? "bg-muted" : ""}`}
                                    style={already ? undefined : { backgroundColor: `${c.color}1A` }}
                                  >
                                    <FlaskConical
                                      className={`size-4 ${already ? "text-muted-foreground" : ""}`}
                                      style={already ? undefined : { color: c.color }}
                                    />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                                    <span className="block truncate text-[11px] text-muted-foreground">CAS {c.cas}</span>
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
                          {pickerTarget && pickerResults.length === 0 && (
                            <p className="w-full py-6 text-center text-xs text-muted-foreground">
                              ไม่พบสารเคมีที่ตรงกับคำค้นหา
                            </p>
                          )}
                        </div>

                        {pickerTarget && pickerResults.length > 0 && (
                          <>
                            <ChevronLeft
                              aria-hidden
                              className="pointer-events-none absolute -left-0.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40"
                            />
                            <ChevronRight
                              aria-hidden
                              className="pointer-events-none absolute -right-0.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </DrawerContent>
                </Drawer>
              </>
            </TabsContent>

            <TabsContent value="nodemods" className="min-h-0 flex-1 mt-0 overflow-auto p-4">
              <FormulaGraph region="face" />
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

        {/* ── Right: active box detail + actions ── */}
        <aside
          style={{ width: leftCollapsed ? 0 : rightWidth }}
          className={`flex shrink-0 flex-col overflow-y-auto ${leftCollapsed ? "overflow-x-hidden border-l-0" : "border-l border-border"}`}
        >
          <div className="flex items-center gap-2 px-5 py-4">
            <Button className="h-10 flex-1 gap-2 text-sm font-semibold">
              <FlaskConical className="size-4" />
              เริ่มการทดลอง
            </Button>
            <Button variant="outline" size="icon" aria-label="Export PDF" className="size-10 shrink-0">
              <Download className="size-4" />
            </Button>
          </div>

          <button
            onClick={() => router.push(`/projects/${params.id}/results`)}
            className="mx-5 mt-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-primary transition-colors hover:bg-accent/60"
          >
            <LineChart className="size-4" />
            ดูผลลัพธ์
          </button>

          {/* Active box detail */}
          <div className="mx-5 mt-4 rounded-xl border border-border p-4">
            {!activeBox ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                เลือกกล่องสูตรด้านซ้าย เพื่อโหลดความเข้มข้นลงพู่กัน
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Beaker className="size-4" />
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">{activeBox.name}</span>
                  <Badge className="ml-auto shrink-0 px-1.5 py-0 text-[10px]">{activeBox.items.length} สาร</Badge>
                </div>

                {activeBox.items.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    กล่องนี้ยังไม่มีสาร — กด “เพิ่มสารลงกล่องนี้” จากแผงซ้าย หรือแถบด้านบนโมเดล
                  </p>
                ) : (
                  <dl className="mt-3 space-y-1.5 text-xs">
                    {activeBox.items.map((it) => {
                      const c = chemById(it.chemicalId);
                      return (
                        <div key={it.chemicalId} className="flex justify-between gap-3">
                          <dt className="truncate text-muted-foreground">{c.name}</dt>
                          <dd className="shrink-0 font-medium text-foreground">{it.concentration}%</dd>
                        </div>
                      );
                    })}
                    <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-semibold">
                      <dt className="text-foreground">ความเข้มข้นรวม</dt>
                      <dd className="text-primary">{Math.round(boxIntensity(activeBox) * 100)}%</dd>
                    </div>
                  </dl>
                )}

                {activeBox.items.length > 0 && (
                  <p className="mt-3 rounded-lg bg-accent/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    🖌️ กล่องนี้พร้อมทาแล้ว — ลากบนใบหน้าตรงกลางเพื่อระบายผล
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </SidebarProvider>
  );
}
