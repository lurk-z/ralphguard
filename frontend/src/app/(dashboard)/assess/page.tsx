"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Eraser,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { SemanticIcon, type SemanticIconName } from "@/components/SemanticIcon";

import {
  AssessmentRecord,
  ApiError,
  apiErrorMessage,
  EndpointMetric,
  FormulaItem,
  IngredientRegistryItem,
  ModelInfoPayload,
  ModelMetricsPayload,
  ProjectOut,
  Region,
  api,
  substanceDepictionUrl,
} from "@/lib/api";
import {
  PRODUCT_TEMPLATES,
  SUBSTANCE_LIBRARY,
  withWaterBase,
  isWaterItem,
  catalogWithVerifiedRegistry,
  normalizeSubstanceName,
  resolveCatalogSubstance,
  type CatalogItem,
} from "@/lib/catalog";
import VoiceAssistant from "@/components/VoiceAssistant";
import CsvImportModal from "@/components/CsvImportModal";
import LabelScanModal, { type ScanImportContext } from "@/components/LabelScanModal";
import ManualSubstanceModal from "@/components/ManualSubstanceModal";
import SubstanceHoverCard from "@/components/SubstanceHoverCard";
import SubstanceLibraryPage from "@/components/SubstanceLibraryPage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  assessmentStartProblem,
  formulaReadinessProblem,
} from "@/lib/assessment-preconditions";
import {
  assessmentPollDelay,
  assessmentPollExpired,
  assessmentPollResponseIsCurrent,
} from "@/lib/assessment-polling";
import {
  prepareOcrFormulaReplacement,
} from "@/lib/formula-ocr";
import { formulaGraphItemsSignature } from "@/lib/formula-graph";
import { buildAssessmentReportHtml } from "@/lib/assessment-report";
import {
  resolveManualSubstanceMatch,
  resolveManualSubstanceRegistryMatch,
  searchManualSubstanceSuggestions,
} from "@/lib/manual-substance";
import { parseProjectRouteId } from "@/lib/project-routing";
import { isAbortError, logRequestFailure } from "@/lib/request-reliability";
import {
  loadFavoriteSubstanceKeys,
  loadLocalSubstances,
  localSubstanceKey,
  normalizedSmiles,
  saveFavoriteSubstanceKeys,
  systemSubstanceKey,
  type LocalSubstance,
} from "@/lib/substance-library-local";
import {
  FORMULA_GRAPH_DRAFT_ID,
  loadProjectWorkspace,
  formulaAssessmentSignature,
  saveProjectWorkspace,
  type FormulaAssessmentSnapshot,
  type FormulaGraphSnapshot,
  type PaintMaskSnapshot,
  type ProjectWorkspaceDraft,
  type WorkspaceFormula,
  type WorkspaceMode,
} from "@/lib/project-workspace";

// ── 3D head (client-only). Auto-fills irritation by the result intensity. ──
const FaceView = dynamic(
  () => import("@/components/SymptomFaceCanvas").then((m) => m.SymptomFaceCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-xs text-slate-800/50">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

// ── Inflammation trend chart (client-only, recharts) ──
const TrendChart = dynamic(() => import("@/components/TrendChart"), { ssr: false });

// ── Node graph (client-only) ──
const FormulaGraph = dynamic(() => import("@/components/FormulaGraph"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-xs text-slate-800/50">
      กำลังโหลด Node Graph…
    </div>
  ),
});

type Mode = WorkspaceMode;
type PrimaryNavigationItem = "assessment" | "substances";

const REGIONS: { value: Region; label: string; icon: SemanticIconName }[] = [
  { value: "forearm", label: "ท่อนแขน", icon: "muscle" },
  { value: "hand", label: "มือ", icon: "hand" },
  { value: "face", label: "ใบหน้า", icon: "scan" },
  { value: "eye", label: "ดวงตา", icon: "eye" },
];
const FORMULA_REGION_OPTIONS: {
  value: Region;
  label: string;
  icon: SemanticIconName;
  description: string;
}[] = [
    {
      value: "face",
      label: "ใบหน้า",
      icon: "scan",
      description: "ประเมินการใช้บนผิวหน้า โดยเน้นความเสี่ยงระคายเคืองผิว และยังแสดงผลครบ 4 ด้าน",
    },
    {
      value: "eye",
      label: "ดวงตา",
      icon: "eye",
      description: "ประเมินการใช้รอบดวงตา โดยให้น้ำหนักความเสี่ยงระคายเคืองตามากขึ้น และยังแสดงผลครบ 4 ด้าน",
    },
  ];
const ENDPOINTS = ["skin", "eye", "sens", "acute"] as const;
type AssessmentEndpoint = (typeof ENDPOINTS)[number];
type DeveloperTestScores = Record<AssessmentEndpoint, number>;
const DEFAULT_DEVELOPER_TEST_SCORES: DeveloperTestScores = {
  skin: 50,
  eye: 50,
  sens: 50,
  acute: 50,
};
const ENDPOINT_LABEL_TH: Record<string, string> = {
  skin: "ระคายเคืองผิว",
  eye: "ระคายเคืองตา",
  sens: "แพ้ผิวหนัง",
  acute: "พิษเฉียบพลันต่อร่างกาย",
};
const DAY_LABELS = [1, 3, 7];
const bandOf = (s: number) => (s < 25 ? "low" : s < 50 ? "moderate" : s < 75 ? "high" : "severe");
const BAND_HEX: Record<string, string> = { low: "#16A34A", moderate: "#E08A00", high: "#DC2626", severe: "#B91C1C" };
const BAND_LABEL: Record<string, string> = { low: "ต่ำ", moderate: "กลาง", high: "สูง", severe: "รุนแรง" };
// Applicability-domain / model confidence display
const CONF_TH: Record<string, string> = { High: "สูง", Medium: "กลาง", Low: "ต่ำ" };
const CONF_HEX: Record<string, string> = { High: "#16A34A", Medium: "#E08A00", Low: "#DC2626" };
const CONF_ORDER: Record<string, number> = { High: 2, Medium: 1, Low: 0 };
// Distinct neon color per endpoint so painted layers are visually different.
const EP_COLOR: Record<string, string> = {
  skin: "#FF3B5C",  // แดง
  eye: "#22D3EE",   // ฟ้า
  sens: "#A855F7",  // ม่วง
  acute: "#F59E0B", // ส้ม
};

const PRODUCT_TYPES = [
  "โทนเนอร์",
  "เซรั่ม / เอสเซนส์",
  "ครีม / โลชั่น",
  "เจล / โฟมล้าง",
  "สเปรย์ / มิสต์",
  "ครีมกันแดด",
  "เมคอัพ",
  "อื่นๆ",
];
const PRODUCT_TYPE_ICONS: Record<string, SemanticIconName> = {
  "โทนเนอร์": "droplet",
  "เซรั่ม / เอสเซนส์": "syringe",
  "ครีม / โลชั่น": "leaf",
  "เจล / โฟมล้าง": "bubbles",
  "สเปรย์ / มิสต์": "spray",
  "ครีมกันแดด": "sun",
  "เมคอัพ": "brush",
  "อื่นๆ": "package",
};

// ประเภทที่ปกติต้องมีน้ำเป็นเบส — ใช้เตือนเมื่อสัดส่วนสารเต็ม 100% จนไม่เหลือที่ให้น้ำ
const WATER_BASED_TYPES = new Set([
  "โทนเนอร์",
  "เซรั่ม / เอสเซนส์",
  "ครีม / โลชั่น",
  "เจล / โฟมล้าง",
  "สเปรย์ / มิสต์",
  "ครีมกันแดด",
]);

const LEFT_SIDEBAR_DEFAULT_WIDTH = 324;
const LEFT_SIDEBAR_MIN_WIDTH = 260;
const LEFT_SIDEBAR_MAX_WIDTH = 420;
// Primary navigation is intentionally hidden from the Assess UI. Keeping the
// offset as a constant lets the dormant substance-library route stay intact.
const NAVIGATION_SIDEBAR_WIDTH = 0;
const FORMULA_PANEL_COLLAPSED_WIDTH = 48;
const ASSESSMENT_INSPECTOR_WIDTH = LEFT_SIDEBAR_DEFAULT_WIDTH;
const MIN_DESKTOP_CANVAS_WIDTH = 700;
const COMPACT_WORKSPACE_MAX_WIDTH = 1399;
const SUBSTANCE_LIBRARY_PAGE_SIZE = 60;
const PAINT_BRUSH_CONTROL_MIN = 10;
const PAINT_BRUSH_CONTROL_MAX = 100;
const PAINT_BRUSH_CONTROL_MAX_STEP = 10;
const PAINT_BRUSH_RENDER_MIN = 20;
const PAINT_BRUSH_RENDER_MAX = 85;
const paintBrushRenderSize = (controlPercent: number) =>
  PAINT_BRUSH_RENDER_MIN +
  ((controlPercent - PAINT_BRUSH_CONTROL_MIN) /
    (PAINT_BRUSH_CONTROL_MAX - PAINT_BRUSH_CONTROL_MIN)) *
  (PAINT_BRUSH_RENDER_MAX - PAINT_BRUSH_RENDER_MIN);

const maxLeftSidebarWidthForViewport = (viewportWidth: number) =>
  Math.min(
    LEFT_SIDEBAR_MAX_WIDTH,
    Math.max(
      LEFT_SIDEBAR_MIN_WIDTH,
      viewportWidth - NAVIGATION_SIDEBAR_WIDTH - ASSESSMENT_INSPECTOR_WIDTH - MIN_DESKTOP_CANVAS_WIDTH,
    ),
  );

const clampLeftSidebarWidth = (width: number, viewportWidth = Number.POSITIVE_INFINITY) =>
  Math.min(
    maxLeftSidebarWidthForViewport(viewportWidth),
    Math.max(LEFT_SIDEBAR_MIN_WIDTH, width),
  );

export default function StudioPage() {
  const router = useRouter();
  const workspaceShellRef = useRef<HTMLDivElement>(null);
  const mobileBrushControlRef = useRef<HTMLDivElement>(null);
  const formulaCompactTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorCompactTriggerRef = useRef<HTMLButtonElement>(null);
  const trendTriggerRef = useRef<HTMLButtonElement>(null);
  const trendDrawerRef = useRef<HTMLDivElement>(null);
  const bottomToolbarRef = useRef<HTMLDivElement>(null);
  const leftSidebarWidthRef = useRef(LEFT_SIDEBAR_DEFAULT_WIDTH);
  const leftSidebarMaxWidthRef = useRef(LEFT_SIDEBAR_MAX_WIDTH);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(LEFT_SIDEBAR_DEFAULT_WIDTH);
  const [leftSidebarMaxWidth, setLeftSidebarMaxWidth] = useState(LEFT_SIDEBAR_MAX_WIDTH);
  const [isLeftSidebarResizing, setIsLeftSidebarResizing] = useState(false);
  const [formulaSidebarCollapsed, setFormulaSidebarCollapsed] = useState(false);
  const [isCompactWorkspace, setIsCompactWorkspace] = useState(false);
  const [isMobileWorkspace, setIsMobileWorkspace] = useState(false);
  const [compactPanel, setCompactPanel] = useState<"formula" | "inspector" | null>(null);
  const [activeNavigationItem, setActiveNavigationItem] =
    useState<PrimaryNavigationItem>("assessment");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [project, setProject] = useState<ProjectOut | null>(null);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [savingProjectName, setSavingProjectName] = useState(false);
  const [projectContextStatus, setProjectContextStatus] = useState<"loading" | "ready" | "standalone">("loading");
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("assess");
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateRisk, setTemplateRisk] = useState<"all" | "low" | "mid" | "high">("all");
  const [eraseMode, setEraseMode] = useState(false);
  const [brushSizeControlPct, setBrushSizeControlPct] = useState(50);
  const [mobileBrushSliderOpen, setMobileBrushSliderOpen] = useState(false);
  const brushSizePct = paintBrushRenderSize(brushSizeControlPct);
  const [clearPaintRequest, setClearPaintRequest] = useState(0);
  const [showTrend, setShowTrend] = useState(false);
  const [expandedFormulaIds, setExpandedFormulaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [formulas, setFormulas] = useState<WorkspaceFormula[]>([]);
  const [activeId, setActiveId] = useState("");
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [libraryTargetFormulaId, setLibraryTargetFormulaId] = useState<string | null>(null);
  const [compactFormulaSettingsId, setCompactFormulaSettingsId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [productTypeMenuOpen, setProductTypeMenuOpen] = useState(false);
  const [customProductType, setCustomProductType] = useState("");
  const [starterFormulaMenuOpen, setStarterFormulaMenuOpen] = useState(false);
  const [formulaPendingDeletion, setFormulaPendingDeletion] = useState<WorkspaceFormula | null>(null);
  const [paintPendingClearFormula, setPaintPendingClearFormula] = useState<WorkspaceFormula | null>(null);
  const [formulaDetailsEditingId, setFormulaDetailsEditingId] = useState<string | null>(null);
  const [manualSubstanceTargetFormulaId, setManualSubstanceTargetFormulaId] = useState<string | null>(null);
  const [manualSubstanceName, setManualSubstanceName] = useState("");
  const [manualSubstanceSmiles, setManualSubstanceSmiles] = useState("");
  const [manualSubstanceBusy, setManualSubstanceBusy] = useState(false);
  const [manualSubstanceError, setManualSubstanceError] = useState<string | null>(null);
  const [manualRegistryItems, setManualRegistryItems] = useState<IngredientRegistryItem[]>([]);
  const [manualRegistryLoading, setManualRegistryLoading] = useState(false);
  const manualSubstanceControllerRef = useRef<AbortController | null>(null);
  const [recentlyCreatedFormulaId, setRecentlyCreatedFormulaId] = useState<string | null>(null);
  const [recentlyAddedIngredient, setRecentlyAddedIngredient] = useState<{
    formulaId: string;
    index: number;
  } | null>(null);
  const [draft, setDraft] = useState<{ name: string; type: string; region: Region; from: string }>({
    name: "",
    type: "ครีม / โลชั่น",
    region: "face",
    from: "blank",
  });
  const selectedDraftTemplate = useMemo(
    () => PRODUCT_TEMPLATES.find((template) => template.id === draft.from),
    [draft.from],
  );
  const manualSubstanceSuggestions = useMemo(
    () => searchManualSubstanceSuggestions(manualRegistryItems, manualSubstanceName),
    [manualRegistryItems, manualSubstanceName],
  );
  const activeFormula = formulas.find((f) => f.id === activeId);
  const formula = activeFormula?.items ?? [];
  const graphOwnerId = activeFormula?.id ?? FORMULA_GRAPH_DRAFT_ID;

  useEffect(() => {
    if (formulaSidebarCollapsed) setLibraryTargetFormulaId(null);
  }, [formulaSidebarCollapsed]);
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${COMPACT_WORKSPACE_MAX_WIDTH}px)`);
    const mobileMedia = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      const compact = window.innerWidth <= COMPACT_WORKSPACE_MAX_WIDTH;
      const mobile = window.innerWidth <= 767;
      setIsCompactWorkspace(compact);
      setIsMobileWorkspace(mobile);
      const nextMaxWidth = compact
        ? LEFT_SIDEBAR_MAX_WIDTH
        : maxLeftSidebarWidthForViewport(window.innerWidth);
      leftSidebarMaxWidthRef.current = nextMaxWidth;
      setLeftSidebarMaxWidth(nextMaxWidth);
      if (!compact) {
        setCompactPanel(null);
        setLeftSidebarWidth((currentWidth) => {
          const nextWidth = clampLeftSidebarWidth(currentWidth, window.innerWidth);
          leftSidebarWidthRef.current = nextWidth;
          return nextWidth;
        });
      }
    };
    syncViewport();
    media.addEventListener("change", syncViewport);
    mobileMedia.addEventListener("change", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      media.removeEventListener("change", syncViewport);
      mobileMedia.removeEventListener("change", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);
  useEffect(() => {
    if (!manualSubstanceTargetFormulaId || manualRegistryItems.length > 0) return;
    const controller = new AbortController();
    let alive = true;
    setManualRegistryLoading(true);

    const loadRegistry = async () => {
      const collected: IngredientRegistryItem[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await api.listIngredientRegistry(
          "verified",
          pageSize,
          offset,
          controller.signal,
        );
        collected.push(...page);
        if (page.length < pageSize) break;
      }
      if (alive) setManualRegistryItems(collected);
    };

    void loadRegistry()
      .catch((cause: unknown) => {
        if (!isAbortError(cause) && alive) {
          logRequestFailure("load manual substance suggestions", cause);
        }
      })
      .finally(() => {
        if (alive) setManualRegistryLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [manualSubstanceTargetFormulaId, manualRegistryItems.length]);

  useEffect(() => {
    if (!recentlyCreatedFormulaId) return;
    const timeout = window.setTimeout(() => setRecentlyCreatedFormulaId(null), 700);
    return () => window.clearTimeout(timeout);
  }, [recentlyCreatedFormulaId]);
  useEffect(() => {
    if (!recentlyAddedIngredient) return;
    const timeout = window.setTimeout(() => setRecentlyAddedIngredient(null), 700);
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedIngredient]);
  const setFormula = (u: FormulaItem[] | ((prev: FormulaItem[]) => FormulaItem[])) =>
    setFormulas((prev) =>
      prev.map((f) =>
        f.id === activeId
          ? { ...f, items: typeof u === "function" ? (u as (p: FormulaItem[]) => FormulaItem[])(f.items) : u }
          : f,
      ),
    );
  const setFormulaById = (
    formulaId: string,
    update: FormulaItem[] | ((previous: FormulaItem[]) => FormulaItem[]),
  ) =>
    setFormulas((previous) =>
      previous.map((formulaItem) =>
        formulaItem.id === formulaId
          ? {
            ...formulaItem,
            items:
              typeof update === "function"
                ? (update as (items: FormulaItem[]) => FormulaItem[])(formulaItem.items)
                : update,
          }
          : formulaItem,
      ),
    );
  const [region, setRegion] = useState<Region>("face");
  const [dayIdx, setDayIdx] = useState(1);
  const [rightInspectorTab, setRightInspectorTab] = useState<"results" | "assistant">("results");
  const [assessmentByFormulaId, setAssessmentByFormulaId] = useState<
    Record<string, FormulaAssessmentSnapshot>
  >({});
  const [paintByFormulaId, setPaintByFormulaId] = useState<
    Record<string, PaintMaskSnapshot>
  >({});
  const [graphByFormulaId, setGraphByFormulaId] = useState<
    Record<string, FormulaGraphSnapshot>
  >({});
  const graphByFormulaIdRef = useRef(graphByFormulaId);
  graphByFormulaIdRef.current = graphByFormulaId;
  const [submittingFormulaIds, setSubmittingFormulaIds] = useState<string[]>([]);
  const assessmentGenerationByFormulaId = useRef<Record<string, number>>({});
  const assessmentStartControllerByFormulaId = useRef<Record<string, AbortController>>({});
  const announcedAssessmentIds = useRef(new Set<string>());
  const announcedTimedOutJobIds = useRef(new Set<string>());
  const pollingFailuresByJobId = useRef<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  // Local visual QA only. These values never enter an assessment payload or
  // the project workspace snapshot, so they cannot replace scientific output.
  const [developerTestEnabled, setDeveloperTestEnabled] = useState(false);
  const [developerTestScores, setDeveloperTestScores] = useState<DeveloperTestScores>(
    DEFAULT_DEVELOPER_TEST_SCORES,
  );

  // Formula-owned snapshots must never outlive their formula. The standalone
  // project Graph draft is intentionally retained when no formula is selected.
  useEffect(() => {
    const validFormulaIds = new Set(formulas.map((formulaItem) => formulaItem.id));
    setPaintByFormulaId((previous) => {
      const orphanIds = Object.keys(previous).filter((formulaId) => !validFormulaIds.has(formulaId));
      if (orphanIds.length === 0) return previous;
      const nextPaint = { ...previous };
      orphanIds.forEach((formulaId) => delete nextPaint[formulaId]);
      return nextPaint;
    });
    setGraphByFormulaId((previous) => {
      const orphanIds = Object.keys(previous).filter(
        (formulaId) =>
          formulaId !== FORMULA_GRAPH_DRAFT_ID && !validFormulaIds.has(formulaId),
      );
      if (orphanIds.length === 0) return previous;
      const nextGraph = { ...previous };
      orphanIds.forEach((formulaId) => delete nextGraph[formulaId]);
      return nextGraph;
    });
  }, [formulas]);

  useEffect(
    () => () => {
      Object.values(assessmentStartControllerByFormulaId.current).forEach((controller) =>
        controller.abort(),
      );
      assessmentStartControllerByFormulaId.current = {};
    },
    [],
  );

  // `/projects/:id/assess` redirects here with projectId so there is only one
  // real assessment workspace. Every run remains attached to that project.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("projectId");
    if (raw === null) {
      setProjectContextStatus("standalone");
      return;
    }
    const id = parseProjectRouteId(raw);
    if (id === null) {
      router.replace("/projects?projectError=invalid-project");
      return;
    }

    let alive = true;
    const controller = new AbortController();
    api
      .getProject(id, controller.signal)
      .then((loadedProject) => {
        if (!alive) return;
        const savedWorkspace = loadProjectWorkspace(loadedProject.id);
        if (savedWorkspace) {
          setFormulas(savedWorkspace.formulas);
          setActiveId(savedWorkspace.activeFormulaId);
          setRegion(savedWorkspace.region);
          setDayIdx(savedWorkspace.dayIdx);
          setMode(savedWorkspace.mode);
          // Formula details now live inside each card, so restore the active
          // formula as the initially expanded card instead of opening a
          // separate formulation panel over the model.
          setExpandedFormulaIds(
            savedWorkspace.activeFormulaId
              ? new Set([savedWorkspace.activeFormulaId])
              : new Set(),
          );
          setAssessmentByFormulaId(savedWorkspace.assessmentByFormulaId);
          setPaintByFormulaId(savedWorkspace.paintByFormulaId);
          setGraphByFormulaId(savedWorkspace.graphByFormulaId);
        }
        setProject(loadedProject);
        setProjectId(loadedProject.id);
        setWorkspaceHydrated(true);
        setProjectContextStatus("ready");
      })
      .catch((cause) => {
        if (!alive || isAbortError(cause)) return;
        logRequestFailure("load assessment project", cause);
        const reason = cause instanceof ApiError && cause.status === 404
          ? "project-not-found"
          : "project-load-failed";
        router.replace(`/projects?projectError=${reason}`);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [router]);

  const workspaceDraft = useMemo<ProjectWorkspaceDraft>(
    () => ({
      formulas,
      activeFormulaId: activeId,
      region,
      dayIdx: dayIdx === 0 || dayIdx === 2 ? dayIdx : 1,
      mode,
      formulaPanelOpen: false,
      assessmentByFormulaId,
      paintByFormulaId,
      graphByFormulaId,
    }),
    [
      formulas,
      activeId,
      region,
      dayIdx,
      mode,
      assessmentByFormulaId,
      paintByFormulaId,
      graphByFormulaId,
    ],
  );
  const latestWorkspaceDraft = useRef(workspaceDraft);
  latestWorkspaceDraft.current = workspaceDraft;
  const previewGraphSnapshot = (
    formulaId: string,
    snapshot: FormulaGraphSnapshot,
  ) => {
    const ownerExists =
      formulaId === FORMULA_GRAPH_DRAFT_ID
      || latestWorkspaceDraft.current.formulas.some((formula) => formula.id === formulaId);
    if (!formulaId || !ownerExists) return false;
    const nextGraphByFormulaId = {
      ...graphByFormulaIdRef.current,
      [formulaId]: snapshot,
    };
    graphByFormulaIdRef.current = nextGraphByFormulaId;
    latestWorkspaceDraft.current = {
      ...latestWorkspaceDraft.current,
      graphByFormulaId: nextGraphByFormulaId,
    };
    return true;
  };
  const commitGraphSnapshot = (
    formulaId: string,
    snapshot: FormulaGraphSnapshot,
  ) => {
    if (!previewGraphSnapshot(formulaId, snapshot)) return;
    setGraphByFormulaId((previous) => ({
      ...previous,
      [formulaId]: snapshot,
    }));
  };

  // Save a sanitized, project-scoped draft after meaningful workspace changes.
  // Hydration must finish first so the default React state can never overwrite
  // a saved workspace before it has been restored.
  useEffect(() => {
    if (!projectId || projectContextStatus !== "ready" || !workspaceHydrated) return;
    const timeout = window.setTimeout(() => {
      if (!saveProjectWorkspace(projectId, workspaceDraft)) {
        console.warn(`Unable to persist workspace for project ${projectId}`);
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [projectId, projectContextStatus, workspaceHydrated, workspaceDraft]);

  // Flush the latest draft on refresh, tab close, or client-side navigation so
  // a change made just before leaving is not lost to the debounce window.
  useEffect(() => {
    if (!projectId || projectContextStatus !== "ready" || !workspaceHydrated) return;
    const flush = () => {
      saveProjectWorkspace(projectId, latestWorkspaceDraft.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [projectId, projectContextStatus, workspaceHydrated]);

  const activeSubstances = useMemo(
    () =>
      formula.filter(
        (item) =>
          !isWaterItem(item) &&
          Boolean(item.name?.trim() || item.smiles.trim()),
      ),
    [formula],
  );
  const formulaReadinessIssue = formulaReadinessProblem({
    projectStatus: projectContextStatus,
    hasProjectId: projectId !== null,
    hasSelectedFormula: Boolean(activeFormula),
    substances: activeSubstances,
  });
  const formulaReady = formulaReadinessIssue === null;
  const activePaintSnapshot = paintByFormulaId[activeId];
  const hasActivePaint = activePaintSnapshot?.hasPaint === true;

  const currentActiveInputSignature = formulaAssessmentSignature(formula, region);
  const storedActiveAssessmentSnapshot = assessmentByFormulaId[activeId];
  const activeAssessmentSnapshot =
    storedActiveAssessmentSnapshot?.inputSignature === currentActiveInputSignature
      ? storedActiveAssessmentSnapshot
      : undefined;
  const jobId = activeAssessmentSnapshot?.jobId ?? null;
  const assessment = activeAssessmentSnapshot?.assessment ?? null;
  const running = submittingFormulaIds.includes(activeId);
  const endpoints = assessment?.result?.endpoints ?? null;
  const completed = assessment?.status === "completed";
  const assessing = running || (!!jobId && !completed && assessment?.status !== "failed");
  const formulaCoverage = assessment?.result?.formula_coverage;

  // Formula name for the paint-mode hover tooltip. Ingredient names belong in
  // the formula editor; the model tooltip identifies the formula being painted.
  const productName = useMemo(() => {
    return activeFormula?.name?.trim() || "สูตรที่ประเมิน";
  }, [activeFormula?.name]);

  // Time-course trend data (Day 1/3/7) for the line chart.
  const trendData = useMemo(() => {
    if (!endpoints) return [];
    return [0, 1, 2].map((i) => {
      const row: Record<string, number | string> = { day: `วันที่ ${DAY_LABELS[i]}` };
      ENDPOINTS.forEach((ep) => {
        row[ep] = Math.round(endpoints[ep]?.timecourse?.[i] ?? 0);
      });
      return row as { day: string } & Record<string, number | string>;
    });
  }, [endpoints]);
  const trendLines = ENDPOINTS.map((ep) => ({
    key: ep,
    label: ENDPOINT_LABEL_TH[ep],
    color: EP_COLOR[ep],
  }));

  const trendAnalytics = useMemo(() => {
    if (!endpoints) return null;

    const series = ENDPOINTS.map((endpoint) => {
      const scores = [0, 1, 2].map((index) =>
        Math.round(endpoints[endpoint]?.timecourse?.[index] ?? 0),
      );
      const peakScore = Math.max(...scores);
      const peakIndex = scores.indexOf(peakScore);
      const delta = scores[2] - scores[0];
      return {
        endpoint,
        label: ENDPOINT_LABEL_TH[endpoint],
        color: EP_COLOR[endpoint],
        scores,
        peakScore,
        peakDay: DAY_LABELS[peakIndex],
        delta,
      };
    });

    const peak = series.reduce((highest, current) =>
      current.peakScore > highest.peakScore ? current : highest,
    );
    const largestChange = series.reduce((largest, current) =>
      Math.abs(current.delta) > Math.abs(largest.delta) ? current : largest,
    );
    const directions = series.reduce(
      (summary, current) => {
        if (current.delta > 3) summary.increasing += 1;
        else if (current.delta < -3) summary.decreasing += 1;
        else summary.stable += 1;
        return summary;
      },
      { increasing: 0, decreasing: 0, stable: 0 },
    );

    return { series, peak, largestChange, directions };
  }, [endpoints]);

  // Per-endpoint paint layers — each endpoint paints in its own neon color.
  const paintLayers = useMemo(() => {
    if (!endpoints) return [];
    return ENDPOINTS.map((ep) => {
      const endpoint = endpoints[ep];
      const sc = endpoint?.timecourse?.[dayIdx] ?? endpoint?.peak_score ?? 0;
      return {
        key: ep,
        label: ENDPOINT_LABEL_TH[ep],
        score: sc,
        color: EP_COLOR[ep],
        band: bandOf(sc),
        confidenceLevel: endpoint?.confidence?.level,
        inDomain: endpoint?.confidence?.in_domain,
      };
    });
  }, [endpoints, dayIdx]);

  const resultConfidenceSummary = useMemo(() => {
    if (!endpoints) return null;
    let level: string | null = null;
    let lowestOrder = Number.POSITIVE_INFINITY;
    let outOfDomainCount = 0;

    ENDPOINTS.forEach((ep) => {
      const confidence = endpoints[ep]?.confidence;
      if (!confidence) return;
      const order = CONF_ORDER[confidence.level] ?? 1;
      if (order < lowestOrder) {
        lowestOrder = order;
        level = confidence.level;
      }
      if (confidence.in_domain === false) outOfDomainCount += 1;
    });

    return level ? { level, outOfDomainCount } : null;
  }, [endpoints]);

  const activeRegionLabel = REGIONS.find((item) => item.value === region)?.label ?? region;

  const developerTestLayers = useMemo(
    () =>
      ENDPOINTS.map((ep) => {
        const score = developerTestScores[ep];
        return {
          key: ep,
          label: ENDPOINT_LABEL_TH[ep],
          score,
          color: EP_COLOR[ep],
          band: bandOf(score),
        };
      }),
    [developerTestScores],
  );
  const resultReady = completed || developerTestEnabled;
  const paintReady = formulaReady || developerTestEnabled;
  const modelLayers = developerTestEnabled ? developerTestLayers : paintLayers;

  useEffect(() => {
    if (!hasActivePaint) setEraseMode(false);
  }, [activeId, hasActivePaint]);
  useEffect(() => {
    if (!paintReady) setMobileBrushSliderOpen(false);
  }, [paintReady]);
  useEffect(() => {
    if (!mobileBrushSliderOpen) return;
    const closeMobileBrushSlider = (event: PointerEvent) => {
      if (mobileBrushControlRef.current?.contains(event.target as Node)) return;
      setMobileBrushSliderOpen(false);
    };
    document.addEventListener("pointerdown", closeMobileBrushSlider);
    return () => document.removeEventListener("pointerdown", closeMobileBrushSlider);
  }, [mobileBrushSliderOpen]);
  useEffect(() => {
    const shell = workspaceShellRef.current;
    const toolbar = bottomToolbarRef.current;
    if (!shell || !toolbar || mode !== "assess") return;

    const updateToolbarClearance = () => {
      const rect = toolbar.getBoundingClientRect();
      if (rect.height <= 0) return;
      const bottomGap = Math.max(0, window.innerHeight - rect.bottom);
      const clearance = Math.ceil(rect.height + bottomGap + 8);
      shell.style.setProperty("--assess-toolbar-clearance", `${clearance}px`);
    };

    const observer = new ResizeObserver(updateToolbarClearance);
    observer.observe(toolbar);
    window.addEventListener("resize", updateToolbarClearance);
    updateToolbarClearance();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateToolbarClearance);
      shell.style.removeProperty("--assess-toolbar-clearance");
    };
  }, [mode, paintReady]);

  // Per-substance confidence / applicability-domain (worst endpoint), keyed by SMILES.
  const subConf = useMemo(() => {
    const map = new Map<string, { level: string; inDomain: boolean; reason: string }>();
    const subs = assessment?.result?.substances;
    if (!subs) return map;
    for (const s of subs) {
      let level = "High";
      let inDomain = true;
      let reason = "";
      for (const ep of Object.keys(s.per_endpoint || {})) {
        const pe = (s.per_endpoint as any)[ep];
        if (!pe?.confidence) continue;
        if (CONF_ORDER[pe.confidence.level] < CONF_ORDER[level]) {
          level = pe.confidence.level;
          reason = pe.confidence.reason_th;
        }
        if (pe.in_domain === false) inDomain = false;
      }
      const rec = { level, inDomain, reason };
      map.set(s.smiles, rec);
      map.set(s.canonical_smiles, rec);
    }
    return map;
  }, [assessment]);

  // Formula-level reliability: true when most endpoints are Low-confidence / out-of-domain.
  const lowConfidence = useMemo(() => {
    const eps = assessment?.result?.endpoints;
    if (!eps) return false;
    const list = Object.values(eps);
    const bad = list.filter(
      (e) => e.confidence && (e.confidence.level === "Low" || e.confidence.in_domain === false),
    ).length;
    return list.length > 0 && bad >= Math.ceil(list.length / 2);
  }, [assessment]);

  const pendingAssessmentJobs = useMemo(
    () =>
      Object.entries(assessmentByFormulaId)
        .filter(([, snapshot]) =>
          Boolean(
            snapshot.jobId &&
            snapshot.assessment?.status !== "completed" &&
            snapshot.assessment?.status !== "failed",
          ),
        )
        .map(([formulaId, snapshot]) => ({
          formulaId,
          jobId: snapshot.jobId!,
          startedAt: snapshot.startedAt,
          inputSignature: snapshot.inputSignature,
        })),
    [assessmentByFormulaId],
  );
  const pendingAssessmentKey = pendingAssessmentJobs
    .map(({ formulaId, jobId: pendingJobId, startedAt, inputSignature }) =>
      `${formulaId}:${pendingJobId}:${startedAt}:${inputSignature}`,
    )
    .sort()
    .join("|");

  // Poll every pending formula, not only the currently selected one. Switching
  // formula therefore cannot stop or steal another formula's assessment job.
  useEffect(() => {
    if (!pendingAssessmentJobs.length) return;
    let cancelled = false;
    let nextPoll: number | null = null;
    const requestController = new AbortController();
    const jobs = pendingAssessmentJobs;
    const tick = async () => {
      const expiredJobs = jobs.filter(({ startedAt }) =>
        assessmentPollExpired(startedAt),
      );
      for (const { formulaId, jobId: expiredJobId } of expiredJobs) {
        if (!announcedTimedOutJobIds.current.has(expiredJobId)) {
          announcedTimedOutJobIds.current.add(expiredJobId);
          toast.error("งานวิเคราะห์ใช้เวลานานเกินกำหนด กรุณาเริ่มทดสอบใหม่");
        }
        setAssessmentByFormulaId((previous) => {
          const current = previous[formulaId];
          if (!current || current.jobId !== expiredJobId) return previous;
          return {
            ...previous,
            [formulaId]: { ...current, jobId: null },
          };
        });
      }

      const activeJobs = jobs.filter(({ startedAt }) =>
        !assessmentPollExpired(startedAt),
      );
      await Promise.all(
        activeJobs.map(async ({ formulaId, jobId: pendingJobId, inputSignature }) => {
          try {
            const record = await api.getAssessment(
              pendingJobId,
              requestController.signal,
            );
            if (cancelled) return;
            if (
              !assessmentPollResponseIsCurrent(
                latestWorkspaceDraft.current.assessmentByFormulaId[formulaId],
                pendingJobId,
                inputSignature,
              )
            ) {
              return;
            }
            pollingFailuresByJobId.current[pendingJobId] = 0;
            if (
              (record.status === "completed" || record.status === "failed") &&
              !announcedAssessmentIds.current.has(record.id)
            ) {
              announcedAssessmentIds.current.add(record.id);
              const formulaName = latestWorkspaceDraft.current.formulas.find(
                (item) => item.id === formulaId,
              )?.name;
              if (record.status === "completed") {
                toast.success(`วิเคราะห์${formulaName ? ` “${formulaName}”` : "สูตร"}เสร็จสิ้น`);
              } else {
                toast.error(record.error || `วิเคราะห์${formulaName ? ` “${formulaName}”` : "สูตร"}ไม่สำเร็จ`);
              }
            }
            setAssessmentByFormulaId((previous) => {
              const current = previous[formulaId];
              if (
                !assessmentPollResponseIsCurrent(
                  current,
                  pendingJobId,
                  inputSignature,
                )
              ) {
                return previous;
              }
              return {
                ...previous,
                [formulaId]: { ...current, assessment: record },
              };
            });
          } catch (cause) {
            // A route/formula change aborts the shared controller and must not
            // count as a network failure. The HTTP helper's own 12s timeout is
            // different: count it so repeated timeouts receive backoff.
            if (cancelled || requestController.signal.aborted) return;
            pollingFailuresByJobId.current[pendingJobId] =
              (pollingFailuresByJobId.current[pendingJobId] ?? 0) + 1;
            if (formulaId === activeId) {
              setError(apiErrorMessage(cause, "ตรวจสอบสถานะการวิเคราะห์ไม่สำเร็จ"));
            }
          }
        }),
      );
      if (cancelled || activeJobs.length === 0) return;
      const highestFailureCount = activeJobs.reduce(
        (highest, { jobId: activeJobId }) =>
          Math.max(highest, pollingFailuresByJobId.current[activeJobId] ?? 0),
        0,
      );
      nextPoll = window.setTimeout(
        () => void tick(),
        assessmentPollDelay(highestFailureCount),
      );
    };
    void tick();
    return () => {
      cancelled = true;
      requestController.abort();
      if (nextPoll !== null) window.clearTimeout(nextPoll);
    };
    // The stable key changes only when the set of pending formula/job pairs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAssessmentKey, activeId]);

  const invalidateFormulaAssessment = (formulaId: string) => {
    assessmentStartControllerByFormulaId.current[formulaId]?.abort();
    delete assessmentStartControllerByFormulaId.current[formulaId];
    setSubmittingFormulaIds((current) => current.filter((id) => id !== formulaId));
    assessmentGenerationByFormulaId.current[formulaId] =
      (assessmentGenerationByFormulaId.current[formulaId] ?? 0) + 1;
    setAssessmentByFormulaId((previous) => {
      if (!(formulaId in previous)) return previous;
      const next = { ...previous };
      delete next[formulaId];
      return next;
    });
    if (formulaId === activeId) setError(null);
  };

  const runFormula = async (
    candidate: FormulaItem[],
    formulaId = activeId,
    runRegion = region,
  ) => {
    setError(null);
    const selectedFormula = formulas.find((item) => item.id === formulaId);
    const substances = candidate.filter(
      (item) =>
        !isWaterItem(item) &&
        Boolean(item.name?.trim() || item.smiles.trim()),
    );
    const storedSnapshot = assessmentByFormulaId[formulaId];
    const hasPendingJob = Boolean(
      storedSnapshot?.jobId &&
      storedSnapshot.assessment?.status !== "completed" &&
      storedSnapshot.assessment?.status !== "failed",
    );
    const problem = assessmentStartProblem({
      projectStatus: projectContextStatus,
      hasProjectId: projectId !== null,
      hasSelectedFormula: Boolean(selectedFormula),
      substances,
      hasPaint: paintByFormulaId[formulaId]?.hasPaint === true,
      isSubmitting: submittingFormulaIds.includes(formulaId),
      hasPendingJob,
    });
    if (problem) {
      setError(problem);
      toast.warning(problem);
      return;
    }

    const runGeneration = assessmentGenerationByFormulaId.current[formulaId] ?? 0;
    const controller = new AbortController();
    assessmentStartControllerByFormulaId.current[formulaId] = controller;
    setSubmittingFormulaIds((current) =>
      current.includes(formulaId) ? current : [...current, formulaId],
    );
    try {
      const actives = substances;
      const validation = await Promise.all(
        actives.map((item) => api.validateSmiles(item.smiles, controller.signal)),
      );
      const invalidAt = validation.findIndex((item) => !item.valid);
      if (invalidAt >= 0) {
        const message = `SMILES ของ ${actives[invalidAt].name || `สารลำดับ ${invalidAt + 1}`} ไม่ถูกต้อง`;
        setError(message);
        toast.warning(message);
        return;
      }
      const cleaned = withWaterBase(actives); // น้ำเป็นเบส เติมให้รวม 100%
      const inputSignature = formulaAssessmentSignature(actives, runRegion);
      const { job_id } = await api.createAssessment(
        cleaned,
        runRegion,
        projectId,
        controller.signal,
      );
      if ((assessmentGenerationByFormulaId.current[formulaId] ?? 0) !== runGeneration) return;

      setAssessmentByFormulaId((previous) => ({
        ...previous,
        [formulaId]: {
          inputSignature,
          jobId: job_id,
          assessment: null,
          startedAt: new Date().toISOString(),
        },
      }));
    } catch (cause: unknown) {
      if (
        !isAbortError(cause) &&
        assessmentStartControllerByFormulaId.current[formulaId] === controller &&
        latestWorkspaceDraft.current.activeFormulaId === formulaId
      ) {
        logRequestFailure("start assessment", cause);
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        toast.error(`เริ่มการวิเคราะห์ไม่สำเร็จ: ${message}`);
      }
    } finally {
      if (assessmentStartControllerByFormulaId.current[formulaId] === controller) {
        delete assessmentStartControllerByFormulaId.current[formulaId];
        setSubmittingFormulaIds((current) => current.filter((id) => id !== formulaId));
      }
    }
  };
  const run = () => {
    // A real run always returns the viewport to scientific assessment output.
    setDeveloperTestEnabled(false);
    setEraseMode(false);
    runFormula(formula);
  };

  const patchFormulaItem = (formulaId: string, i: number, p: Partial<FormulaItem>) => {
    if (p.smiles !== undefined || p.concentration !== undefined) {
      invalidateFormulaAssessment(formulaId);
    }
    setFormulaById(formulaId, (prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)),
    );
  };
  const removeFormulaItem = (formulaId: string, i: number) => {
    invalidateFormulaAssessment(formulaId);
    setFormulaById(formulaId, (prev) => prev.filter((_, idx) => idx !== i));
  };
  const openManualSubstance = (formulaId: string) => {
    setManualSubstanceTargetFormulaId(formulaId);
    setManualSubstanceName("");
    setManualSubstanceSmiles("");
    setManualSubstanceError(null);
  };
  const closeManualSubstance = () => {
    manualSubstanceControllerRef.current?.abort();
    manualSubstanceControllerRef.current = null;
    setManualSubstanceBusy(false);
    setManualSubstanceTargetFormulaId(null);
    setManualSubstanceError(null);
  };
  const chooseManualSubstanceSuggestion = (item: IngredientRegistryItem) => {
    setManualSubstanceName(item.inci_name || item.canonical_name);
    setManualSubstanceSmiles(item.canonical_smiles?.trim() || "");
    setManualSubstanceError(null);
  };
  const submitManualSubstance = async () => {
    const formulaId = manualSubstanceTargetFormulaId;
    const name = manualSubstanceName.trim();
    const smiles = manualSubstanceSmiles.trim();
    if (!formulaId || manualSubstanceBusy) return;
    if (!name && !smiles) {
      setManualSubstanceError("กรุณาระบุชื่อสารหรือ SMILES อย่างน้อย 1 ช่อง");
      return;
    }

    manualSubstanceControllerRef.current?.abort();
    const controller = new AbortController();
    manualSubstanceControllerRef.current = controller;
    setManualSubstanceBusy(true);
    setManualSubstanceError(null);

    try {
      let registryMatch = resolveManualSubstanceRegistryMatch({
        items: manualRegistryItems,
        name,
        smiles,
      });
      let canonicalInputSmiles = "";
      if (smiles && !registryMatch.item) {
        const validation = await api.validateSmiles(smiles, controller.signal);
        if (!validation.valid) {
          setManualSubstanceError("SMILES ไม่ถูกต้อง กรุณาตรวจสอบโครงสร้างอีกครั้ง");
          return;
        }
        canonicalInputSmiles = validation.canonical || smiles;
        registryMatch = resolveManualSubstanceRegistryMatch({
          items: manualRegistryItems,
          name,
          smiles: canonicalInputSmiles,
        });
      } else if (registryMatch.item) {
        canonicalInputSmiles = registryMatch.item.canonical_smiles?.trim() || smiles;
      }

      let resolvedName = "";
      let canonicalSmiles = "";
      if (registryMatch.item) {
        resolvedName = registryMatch.item.inci_name || registryMatch.item.canonical_name;
        canonicalSmiles = registryMatch.item.canonical_smiles?.trim() || "";
      } else {
        // Once the complete verified registry is available, a missing local
        // identity is authoritative and no slower profile request is needed.
        if (manualRegistryItems.length > 0 && !manualRegistryLoading) {
          setManualSubstanceError(registryMatch.error);
          return;
        }

        const nameProfile = name
          ? await api.getSubstanceProfile(name, undefined, controller.signal)
          : null;
        const smilesProfile = canonicalInputSmiles
          ? nameProfile?.found_in_registry === true &&
            nameProfile.canonical_smiles?.trim() === canonicalInputSmiles
            ? nameProfile
            : await api.getSubstanceProfile(undefined, canonicalInputSmiles, controller.signal)
          : null;
        const match = resolveManualSubstanceMatch({
          hasName: Boolean(name),
          hasSmiles: Boolean(smiles),
          nameProfile,
          smilesProfile,
        });
        if (!match.profile) {
          setManualSubstanceError(match.error);
          return;
        }
        resolvedName = match.profile.inci_name || match.profile.canonical_name;
        canonicalSmiles = match.profile.canonical_smiles?.trim() || "";
      }

      if (!canonicalSmiles) {
        setManualSubstanceError("พบสารในฐานข้อมูล แต่ยังไม่มี SMILES ที่ยืนยันแล้วสำหรับการประเมิน");
        return;
      }
      const targetFormula = formulas.find((formulaItem) => formulaItem.id === formulaId);
      if (!targetFormula) {
        closeManualSubstance();
        return;
      }
      if (targetFormula.items.some((item) => item.smiles.trim() === canonicalSmiles)) {
        setManualSubstanceError("สารนี้มีอยู่ในสูตรแล้ว");
        return;
      }

      const addedIndex = targetFormula.items.length;
      invalidateFormulaAssessment(formulaId);
      setFormulaById(formulaId, (previous) => [
        ...previous,
        { name: resolvedName, smiles: canonicalSmiles, concentration: 0 },
      ]);
      setRecentlyAddedIngredient({ formulaId, index: addedIndex });
      closeManualSubstance();
      toast.success(`เพิ่ม ${resolvedName} จากฐานข้อมูลแล้ว`);
    } catch (cause: unknown) {
      if (isAbortError(cause)) return;
      setManualSubstanceError(apiErrorMessage(cause, "ตรวจสอบสารไม่สำเร็จ"));
    } finally {
      if (manualSubstanceControllerRef.current === controller) {
        manualSubstanceControllerRef.current = null;
        setManualSubstanceBusy(false);
      }
    }
  };

  // Create / select saved formulas
  const closeFormulaEditor = () => {
    setShowCreate(false);
    setFormulaDetailsEditingId(null);
    setProductTypeMenuOpen(false);
    setStarterFormulaMenuOpen(false);
  };
  const openCreate = () => {
    setFormulaDetailsEditingId(null);
    setDraft({
      name: "สูตร " + String.fromCharCode(64 + Math.min(26, formulas.length + 1)),
      type: "ครีม / โลชั่น",
      region: "face",
      from: "blank",
    });
    setProductTypeMenuOpen(false);
    setCustomProductType("");
    setStarterFormulaMenuOpen(false);
    setShowCreate(true);
  };
  const openEditFormula = (formulaToEdit: WorkspaceFormula) => {
    const productType = formulaToEdit.type?.trim() || "ครีม / โลชั่น";
    const isKnownProductType = PRODUCT_TYPES.includes(productType);
    setFormulaDetailsEditingId(formulaToEdit.id);
    setDraft({
      name: formulaToEdit.name,
      type: isKnownProductType ? productType : "อื่นๆ",
      region: formulaToEdit.region,
      from: "blank",
    });
    setCustomProductType(isKnownProductType ? "" : productType);
    setProductTypeMenuOpen(false);
    setStarterFormulaMenuOpen(false);
    setShowCreate(true);
  };
  const createFormula = () => {
    const formulaType = draft.type === "อื่นๆ" ? customProductType.trim() : draft.type;
    if (!formulaType) {
      toast.error("กรุณาระบุประเภทผลิตภัณฑ์");
      return;
    }
    if (formulaDetailsEditingId) {
      const currentFormula = formulas.find((formulaItem) => formulaItem.id === formulaDetailsEditingId);
      if (!currentFormula) {
        closeFormulaEditor();
        return;
      }
      const nextName = draft.name.trim() || "สูตรไม่มีชื่อ";
      const regionChanged = currentFormula.region !== draft.region;
      if (regionChanged) {
        invalidateFormulaAssessment(currentFormula.id);
        setPaintByFormulaId((previous) => {
          if (!(currentFormula.id in previous)) return previous;
          const nextPaint = { ...previous };
          delete nextPaint[currentFormula.id];
          return nextPaint;
        });
      }
      setFormulas((previous) =>
        previous.map((formulaItem) =>
          formulaItem.id === currentFormula.id
            ? { ...formulaItem, name: nextName, type: formulaType, region: draft.region }
            : formulaItem,
        ),
      );
      if (currentFormula.id === activeId) setRegion(draft.region);
      closeFormulaEditor();
      toast.success("บันทึกข้อมูลสูตรแล้ว");
      return;
    }
    const id = "f" + Date.now();
    let items: FormulaItem[] = [];
    let reg = draft.region;
    if (draft.from !== "blank") {
      const t = PRODUCT_TEMPLATES.find((x) => x.id === draft.from);
      if (t) {
        items = t.formula.map((f) => ({ ...f }));
        reg = t.region === "eye" ? "eye" : "face";
      }
    }
    setFormulas((prev) => [...prev, { id, name: draft.name.trim() || "สูตรใหม่", type: formulaType, region: reg, items }]);
    setActiveId(id);
    setExpandedFormulaIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setRecentlyCreatedFormulaId(id);
    setRegion(reg);
    closeFormulaEditor();
  };

  const duplicateFormula = (formulaToCopy: WorkspaceFormula) => {
    const baseName = `${formulaToCopy.name || "สูตร"} สำเนา`;
    let nextName = baseName;
    let copyNumber = 2;
    while (formulas.some((formulaItem) => formulaItem.name === nextName)) {
      nextName = `${baseName} ${copyNumber}`;
      copyNumber += 1;
    }
    const id = "f" + Date.now();
    const pastedFormula: WorkspaceFormula = {
      id,
      name: nextName,
      type: formulaToCopy.type,
      region: formulaToCopy.region,
      items: formulaToCopy.items.map((item) => ({ ...item })),
    };
    setFormulas((previous) => [...previous, pastedFormula]);
    setActiveId(id);
    setExpandedFormulaIds((current) => new Set(current).add(id));
    setRecentlyCreatedFormulaId(id);
    setRegion(pastedFormula.region);
    setError(null);
    toast.success(`สร้าง “${nextName}” แล้ว`);
  };
  // Save the current node graph as a brand-new formula (from node mode).
  const saveGraphAsFormula = (items: FormulaItem[]) => {
    const actives = items.filter((it) => it.smiles.trim() && !isWaterItem(it));
    if (!actives.length) return;
    const id = "f" + Date.now();
    const n = formulas.filter((f) => (f.type || "").includes("Node")).length + 1;
    setFormulas((prev) => [...prev, { id, name: `สูตรจาก Node ${n}`, type: "จาก Node graph", region, items: actives }]);
    setActiveId(id);
    setExpandedFormulaIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setRecentlyCreatedFormulaId(id);
  };
  const selectFormula = (id: string) => {
    const selected = formulas.find((item) => item.id === id);
    setActiveId(id);
    if (selected) setRegion(selected.region);
    setError(null);
  };
  const clearFormulaSelection = () => {
    setActiveId("");
    setEditingFormulaId(null);
    setLibraryTargetFormulaId(null);
    setEraseMode(false);
    setError(null);
  };
  const renameFormula = (id: string, name: string) =>
    setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  const deleteFormula = (id: string) => {
    const next = formulas.filter((f) => f.id !== id);
    setFormulas(next);
    setExpandedFormulaIds((current) => {
      const nextExpanded = new Set(current);
      nextExpanded.delete(id);
      return nextExpanded;
    });
    invalidateFormulaAssessment(id);
    setPaintByFormulaId((previous) => {
      if (!(id in previous)) return previous;
      const nextPaint = { ...previous };
      delete nextPaint[id];
      return nextPaint;
    });
    setGraphByFormulaId((previous) => {
      if (!(id in previous)) return previous;
      const nextGraph = { ...previous };
      delete nextGraph[id];
      return nextGraph;
    });
    if (id === activeId) {
      const nextActiveFormula = next[0];
      setActiveId(nextActiveFormula?.id ?? "");
      if (nextActiveFormula) setRegion(nextActiveFormula.region);
    }
    if (editingFormulaId === id) setEditingFormulaId(null);
    if (libraryTargetFormulaId === id) setLibraryTargetFormulaId(null);
  };

  // Load a full product template (replaces the current formula + region).
  const loadTemplate = (id: string) => {
    const t = PRODUCT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const nextRegion: Region = t.region === "eye" ? "eye" : "face";
    invalidateFormulaAssessment(activeId);
    setFormula(t.formula.map((f) => ({ ...f })));
    setFormulas((previous) =>
      previous.map((item) => item.id === activeId ? { ...item, region: nextRegion } : item),
    );
    setRegion(nextRegion); // model is head-only
  };

  // Import an AI-suggested formula straight into the Formulation input.
  const importFormula = (items: FormulaItem[]) => {
    const mapped = items
      .map((it) => {
        const hit = resolveCatalogSubstance(it.name || "");
        return {
          name: hit?.name || it.name || "",
          smiles: hit?.smiles || it.smiles, // prefer catalog SMILES when the name matches
          concentration: it.concentration,
        };
      })
      .filter((it) => it.smiles && !isWaterItem(it));
    if (!mapped.length) return;
    invalidateFormulaAssessment(activeId);
    setFormula(mapped);
  };

  // Agent actions are previewed in VoiceAssistant, then validated and applied
  // atomically here. A multi-step edit followed by `run` therefore evaluates
  // the new formula rather than stale React state.
  const runAssistantAction = async (actions: any[]) => {
    if (!Array.isArray(actions) || !actions.length) return;
    let nextFormula = formula.map((item) => ({ ...item }));
    let createdId: string | null = null;
    let createdName = "สูตรใหม่";
    let renamedTo: string | null = null;
    let nextMode: Mode | null = null;
    let shouldRun = false;

    const checkedConcentration = (raw: unknown, label: string) => {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`${label}: ความเข้มข้นต้องอยู่ระหว่าง 0–100%`);
      }
      return value;
    };
    const checkedItem = async (raw: any): Promise<FormulaItem | null> => {
      const name = String(raw?.name || "").trim();
      const catalogHit = resolveCatalogSubstance(name);
      const suppliedSmiles = String(raw?.smiles || "").trim();
      const unsupportedMixture = /\b(witch\s*hazel|aloe\s*vera|extract|leaf\s+juice|fragrance|parfum|essential\s+oil)\b/i;
      if (!catalogHit && unsupportedMixture.test(name)) {
        throw new Error(`${name} เป็นสารสกัดหรือสารผสม จึงห้าม AI แทนด้วย SMILES ของโมเลกุลเดียว`);
      }
      const smiles = catalogHit?.smiles || suppliedSmiles;
      const resolvedName = catalogHit?.name || name;
      if ((!smiles && !name) || isWaterItem({ smiles, name })) return null;
      if (!smiles) throw new Error(`AI ไม่ได้ระบุโครงสร้างของ ${name}`);
      const validation = await api.validateSmiles(smiles);
      if (!validation.valid) throw new Error(`AI ส่ง SMILES ไม่ถูกต้องสำหรับ ${resolvedName || smiles}`);
      return {
        name: resolvedName,
        smiles: validation.canonical || smiles,
        concentration: checkedConcentration(raw?.concentration ?? 0, resolvedName || smiles),
      };
    };
    const checkedItems = async (raw: any): Promise<FormulaItem[]> => {
      if (!Array.isArray(raw)) throw new Error("รูปแบบรายการสารจาก AI ไม่ถูกต้อง");
      const resolved = await Promise.all(raw.map(checkedItem));
      return resolved.filter((item): item is FormulaItem => item !== null);
    };

    for (const action of actions) {
      const a = action || {};
      switch (a.type) {
        case "add_substance":
          {
            const item = await checkedItem(a);
            if (!item) throw new Error("AI ไม่ได้ระบุสารที่เพิ่มให้ครบ");
            nextFormula.push(item);
          }
          break;
        case "set_concentration": {
          const rawKey = String(a.name || a.smiles || "").trim();
          const key = normalizeSubstanceName(rawKey);
          const concentration = checkedConcentration(a.concentration, String(a.name || "สาร"));
          let found = false;
          nextFormula = nextFormula.map((item) => {
            const matches = normalizeSubstanceName(item.name || "") === key || item.smiles.trim().toLowerCase() === rawKey.toLowerCase();
            if (matches) found = true;
            return matches ? { ...item, concentration } : item;
          });
          if (!found) throw new Error(`ไม่พบ ${a.name || a.smiles} ในสูตรปัจจุบัน`);
          break;
        }
        case "remove_substance": {
          const rawKey = String(a.name || a.smiles || "").trim();
          const key = normalizeSubstanceName(rawKey);
          nextFormula = nextFormula.filter(
            (item) => normalizeSubstanceName(item.name || "") !== key && item.smiles.trim().toLowerCase() !== rawKey.toLowerCase(),
          );
          break;
        }
        case "set_formula": {
          nextFormula = await checkedItems(a.items);
          if (!nextFormula.length) throw new Error("สูตรที่ AI ส่งกลับมาว่างเปล่า");
          break;
        }
        case "create_formula": {
          createdId = "f" + Date.now();
          createdName = String(a.name || "สูตรใหม่").trim() || "สูตรใหม่";
          nextFormula = await checkedItems(a.items);
          if (!nextFormula.length) throw new Error("สูตรที่ AI สร้างไม่มีสารที่ประเมินได้");
          break;
        }
        case "rename_formula": {
          const name = String(a.name || "").trim();
          if (name) renamedTo = name;
          break;
        }
        case "replace_substance": {
          const rawKey = String(a.from || a.name || "").trim();
          const key = normalizeSubstanceName(rawKey);
          const replacement = await checkedItem({
            name: a.to || a.to_name,
            smiles: a.smiles || a.to_smiles,
            concentration: a.concentration ?? 0,
          });
          if (!replacement) throw new Error("ข้อมูลสารทดแทนไม่ครบ");
          let found = false;
          nextFormula = nextFormula.map((item) => {
            const matches = normalizeSubstanceName(item.name || "") === key || item.smiles.trim().toLowerCase() === rawKey.toLowerCase();
            if (!matches) return item;
            found = true;
            return { ...replacement, concentration: a.concentration != null ? replacement.concentration : item.concentration };
          });
          if (!found) throw new Error(`ไม่พบ ${a.from || a.name} ที่ต้องการแทนที่`);
          break;
        }
        case "goto":
          if (a.tab === "assess" || a.tab === "nodes" || a.tab === "trust") nextMode = a.tab;
          break;
        case "run":
          shouldRun = true;
          break;
        case "clear":
          nextFormula = [];
          break;
        default:
          throw new Error(`ไม่อนุญาตคำสั่ง AI ชนิด ${String(a.type || "unknown")}`);
      }
    }

    const total = nextFormula.reduce((sum, item) => sum + item.concentration, 0);
    if (total > 100.0001) throw new Error(`สูตรหลังปรับรวม ${total.toFixed(2)}% ซึ่งเกิน 100%`);

    if (createdId) {
      const id = createdId;
      setFormulas((previous) => [...previous, { id, name: renamedTo || createdName, type: "สร้างโดย AI (ยืนยันแล้ว)", region, items: nextFormula }]);
      setActiveId(id);
    } else {
      invalidateFormulaAssessment(activeId);
      setFormula(nextFormula);
      if (renamedTo && activeId) renameFormula(activeId, renamedTo);
    }
    if (nextMode) setMode(nextMode);
    if (shouldRun) {
      await runFormula(nextFormula, createdId ?? activeId, region);
    }
  };

  // Add one ingredient (picked from the catalog dropdown) as a new formula row.
  const addFromCatalog = (formulaId: string, it: CatalogItem) => {
    const addedIndex = formulas.find((item) => item.id === formulaId)?.items.length ?? 0;
    invalidateFormulaAssessment(formulaId);
    setFormulaById(formulaId, (prev) => [
      ...prev,
      { name: it.name, smiles: it.smiles, concentration: it.conc },
    ]);
    setRecentlyAddedIngredient({ formulaId, index: addedIndex });
  };

  // OCR: read an ingredient-label photo (via the LabelScanModal popup).
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTargetFormulaId, setScanTargetFormulaId] = useState<string | null>(null);
  const [scanTargetProjectId, setScanTargetProjectId] = useState<number | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvTargetFormulaId, setCsvTargetFormulaId] = useState<string | null>(null);
  const [csvTargetProjectId, setCsvTargetProjectId] = useState<number | null>(null);
  const openLabelScan = (formulaId: string) => {
    setScanTargetFormulaId(formulaId);
    setScanTargetProjectId(projectId);
    setScanOpen(true);
  };
  const closeLabelScan = () => {
    setScanOpen(false);
    setScanTargetFormulaId(null);
    setScanTargetProjectId(null);
  };
  const openCsvImport = (formulaId: string) => {
    setCsvTargetFormulaId(formulaId);
    setCsvTargetProjectId(projectId);
    setCsvOpen(true);
  };
  const closeCsvImport = () => {
    setCsvOpen(false);
    setCsvTargetFormulaId(null);
    setCsvTargetProjectId(null);
  };
  useEffect(() => {
    if (scanOpen && scanTargetProjectId !== projectId) {
      setScanOpen(false);
      setScanTargetFormulaId(null);
      setScanTargetProjectId(null);
    }
  }, [projectId, scanOpen, scanTargetProjectId]);
  useEffect(() => {
    if (csvOpen && csvTargetProjectId !== projectId) {
      setCsvOpen(false);
      setCsvTargetFormulaId(null);
      setCsvTargetProjectId(null);
    }
  }, [csvOpen, csvTargetProjectId, projectId]);
  const importScannedItems = (
    scanned: { name: string; smiles: string; concentration: number }[],
    context: ScanImportContext,
  ) => {
    const targetFormulaId = scanTargetFormulaId;
    if (!targetFormulaId) {
      toast.error("ไม่พบกล่องสูตรปลายทาง กรุณาเปิด OCR ใหม่");
      return;
    }
    if (scanTargetProjectId !== projectId) {
      toast.error("โปรเจกต์เปลี่ยนระหว่างสแกน ผล OCR จึงถูกยกเลิก");
      return;
    }
    if (!latestWorkspaceDraft.current.formulas.some((item) => item.id === targetFormulaId)) {
      toast.error("กล่องสูตรที่เริ่มสแกนถูกลบแล้ว กรุณาเลือกกล่องใหม่");
      return;
    }

    try {
      const prepared = prepareOcrFormulaReplacement(scanned);
      if (!prepared.items.length) {
        throw new Error("ไม่มีสารที่มี SMILES และความเข้มข้นถูกต้องให้นำเข้า");
      }
      invalidateFormulaAssessment(targetFormulaId);
      // OCR is an explicit replace operation for the formula that owned the
      // modal when it opened. Switching cards while OCR runs cannot redirect it.
      setFormulas((previous) =>
        previous.map((item) =>
          item.id === targetFormulaId ? { ...item, items: prepared.items } : item,
        ),
      );

      const skippedReasonCounts = prepared.skipped.reduce<Record<string, number>>(
        (counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] ?? 0) + 1 }),
        {},
      );
      const omittedGroups = [
        { label: "ไม่มี SMILES", count: (skippedReasonCounts["missing-smiles"] ?? 0) + context.recognizedNoStructure.length },
        { label: "ไม่ได้เลือก", count: context.unselected.length },
        { label: "จับคู่ไม่ได้", count: context.unmatched.length },
        { label: "รายการซ้ำ", count: skippedReasonCounts.duplicate ?? 0 },
        { label: "ความเข้มข้นไม่ถูกต้อง", count: skippedReasonCounts["invalid-concentration"] ?? 0 },
        { label: "น้ำฐาน", count: skippedReasonCounts.water ?? 0 },
        { label: "เกินจำนวนที่รองรับ", count: skippedReasonCounts["item-limit"] ?? 0 },
      ].filter((group) => group.count > 0);
      const omittedCount = omittedGroups.reduce((sum, group) => sum + group.count, 0);

      if (omittedCount > 0) {
        toast.warning(`นำเข้า ${prepared.items.length} สารสำเร็จ`, {
          description: (
            <div className="space-y-1">
              <p>ข้าม {omittedCount} รายการ</p>
              <p>{omittedGroups.map((group) => `${group.label} ${group.count}`).join(" · ")}</p>
            </div>
          ),
          duration: 6000,
        });
      } else {
        toast.success(`นำเข้า ${prepared.items.length} สารสำเร็จ`, {
          description: "แทนที่รายการเดิมในกล่องสูตรที่เริ่มสแกนแล้ว",
        });
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "นำเข้าผล OCR ไม่สำเร็จ");
    }
  };
  const requestDeleteFormula = (formulaToDelete: WorkspaceFormula) => {
    if (formulaToDelete.items.length > 0) {
      setFormulaPendingDeletion(formulaToDelete);
      return;
    }
    deleteFormula(formulaToDelete.id);
  };

  const importCsvItems = (imported: FormulaItem[], fileName: string) => {
    const targetFormulaId = csvTargetFormulaId;
    if (!targetFormulaId) {
      toast.error("ไม่พบกล่องสูตรปลายทาง กรุณาเปิดนำเข้า CSV ใหม่");
      return false;
    }
    if (csvTargetProjectId !== projectId) {
      toast.error("โปรเจกต์เปลี่ยนระหว่างตรวจ CSV ผลนำเข้าจึงถูกยกเลิก");
      return false;
    }
    if (!latestWorkspaceDraft.current.formulas.some((item) => item.id === targetFormulaId)) {
      toast.error("กล่องสูตรที่เลือกถูกลบระหว่างตรวจ CSV กรุณาเลือกกล่องใหม่");
      return false;
    }

    invalidateFormulaAssessment(targetFormulaId);
    setFormulas((previous) =>
      previous.map((item) =>
        item.id === targetFormulaId ? { ...item, items: imported } : item,
      ),
    );
    setError(null);
    const unresolved = imported.filter((item) => !item.smiles.trim()).length;
    toast.success(`นำเข้า ${imported.length} สารจาก ${fileName} แล้ว`, {
      description: unresolved
        ? `${unresolved} สารยังไม่มี SMILES และจะไม่ถูกส่งเข้า QSAR`
        : "แทนที่รายการเดิมในกล่องสูตรที่เลือก",
    });
    return true;
  };

  // AI: auto-adjust the % of each substance to realistic/safest cosmetic levels.
  const [optBusy, setOptBusy] = useState(false);
  const [optMsg, setOptMsg] = useState<string | null>(null);
  const [pendingOptimization, setPendingOptimization] = useState<FormulaItem[] | null>(null);
  const optimizationControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    optimizationControllerRef.current?.abort();
    optimizationControllerRef.current = null;
    setOptBusy(false);
    setPendingOptimization(null);
  }, [activeId]);
  useEffect(() => () => optimizationControllerRef.current?.abort(), []);
  const optimizeFormula = async () => {
    if (optBusy) return;
    const actives = formula.filter((it) => it.smiles.trim() && !isWaterItem(it));
    if (!actives.length) return;
    const targetFormulaId = activeId;
    const targetSignature = formulaGraphItemsSignature(actives);
    optimizationControllerRef.current?.abort();
    const controller = new AbortController();
    optimizationControllerRef.current = controller;
    setOptBusy(true);
    setOptMsg(null);
    setPendingOptimization(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const list = actives
        .map((it) => `- ${it.name || it.smiles} (SMILES ${it.smiles}) ปัจจุบัน ${it.concentration}%`)
        .join("\n");
      const question =
        "ช่วยปรับอัตราส่วน % ของสารในสูตรนี้ให้สมจริงตามมาตรฐานเครื่องสำอางและปลอดภัยที่สุด " +
        "(ลดสารก่อระคายเคือง/สารกันเสียลงสู่ระดับที่ใช้จริง เช่น สารกันเสีย <1%, กรด 2-10%, humectant 3-15%). " +
        "ห้ามเพิ่มหรือลบสาร คงสารเดิมและ SMILES เดิมไว้ทุกตัว ไม่ต้องใส่ Water. " +
        'ตอบกลับเป็น <formula>[{"name","smiles","concentration"}]</formula> เท่านั้น:\n' +
        list;
      const r = await fetch(`${API}/api/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context: null }),
        signal: controller.signal,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.detail || `HTTP ${r.status}`);
      }
      const { answer } = await r.json();
      const block =
        answer.match(/<formula>([\s\S]*?)<\/formula>/i) || answer.match(/<action>([\s\S]*?)<\/action>/i);
      if (!block) throw new Error("AI ไม่ได้ส่งสูตรกลับมา");
      let raw = JSON.parse(block[1].trim());
      // <action> form → pull the items array out of a set_formula/create_formula command
      if (!Array.isArray(raw)) raw = [raw];
      if (raw[0] && raw[0].items) raw = raw[0].items;
      const items = raw
        .filter((x: any) => x && x.smiles && !isWaterItem(x))
        .map((x: any) => ({ name: String(x.name || ""), smiles: String(x.smiles), concentration: Number(x.concentration) || 0 }));
      if (!items.length) throw new Error("สูตรที่ได้ว่างเปล่า");
      const before = actives.map((item) => item.smiles).sort();
      const after = items.map((item: FormulaItem) => item.smiles).sort();
      if (before.length !== after.length || before.some((smiles, index) => smiles !== after[index])) {
        throw new Error("AI เปลี่ยนชนิดสารหรือ SMILES จึงไม่อนุญาตให้นำเข้า");
      }
      const total = items.reduce((sum: number, item: FormulaItem) => sum + item.concentration, 0);
      if (items.some((item: FormulaItem) => item.concentration <= 0 || item.concentration > 100) || total > 100.0001) {
        throw new Error(`อัตราส่วนที่ AI เสนอไม่ถูกต้อง (รวม ${total.toFixed(2)}%)`);
      }
      const currentFormula = latestWorkspaceDraft.current.formulas.find(
        (item) => item.id === targetFormulaId,
      );
      if (
        optimizationControllerRef.current !== controller ||
        !currentFormula ||
        formulaGraphItemsSignature(
          currentFormula.items.filter((item) => item.smiles.trim() && !isWaterItem(item)),
        ) !== targetSignature
      ) {
        return;
      }
      setPendingOptimization(items);
      setOptMsg("AI เสนออัตราส่วนใหม่แล้ว กรุณาตรวจ Before → After ก่อนยืนยัน");
    } catch (cause: unknown) {
      if (!isAbortError(cause) && optimizationControllerRef.current === controller) {
        logRequestFailure("optimize formula", cause);
        setOptMsg("ปรับไม่สำเร็จ: " + (cause instanceof Error ? cause.message : String(cause)));
      }
    } finally {
      if (optimizationControllerRef.current === controller) {
        optimizationControllerRef.current = null;
        setOptBusy(false);
      }
    }
  };

  // Build one evidence-first A4 report and print it through the browser.
  const exportPdf = async () => {
    if (!activeFormula) {
      toast.error("กรุณาเลือกสูตรก่อนออกรายงาน");
      return;
    }

    const reportRegion = assessment?.result?.region ?? activeFormula.region ?? region;
    const regionLabel = REGIONS.find((item) => item.value === reportRegion)?.label ?? reportRegion;
    const items = withWaterBase(
      formula.filter((item) => item.smiles.trim() && item.concentration > 0 && !isWaterItem(item)),
    );
    let modelMetrics: ModelMetricsPayload | null = null;
    let modelInfo: ModelInfoPayload | null = null;
    try {
      [modelMetrics, modelInfo] = await Promise.all([
        api.getModelMetrics(),
        api.getModelInfo(),
      ]);
    } catch (cause) {
      logRequestFailure("load PDF evidence", cause);
      toast.warning("โหลดข้อมูลโมเดลได้ไม่ครบ", {
        description: "รายงานจะระบุส่วนที่ไม่มีข้อมูลตามจริง",
      });
    }

    const html = buildAssessmentReportHtml({
      projectName: project?.name || projectNameDraft.trim() || "โปรเจกต์ปัจจุบัน",
      projectId,
      formulaName: activeFormula.name || "ไม่ระบุชื่อสูตร",
      formulaType: activeFormula.type || "ไม่ระบุประเภท",
      regionLabel,
      formula: items,
      assessment,
      modelMetrics,
      modelInfo,
      generatedAt: new Date(),
      logoUrl: new URL("/icons/logo.png", window.location.origin).href,
    });

    const iframe = document.createElement("iframe");
    iframe.title = "ตัวอย่างรายงาน RalphGuard";
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
    });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      toast.error("ไม่สามารถเปิดหน้าต่างพิมพ์รายงานได้");
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    let printStarted = false;
    const printReport = () => {
      if (printStarted) return;
      printStarted = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(() => iframe.remove(), 3000);
      }
    };
    const logo = doc.querySelector<HTMLImageElement>(".brand img");
    if (logo && !logo.complete) {
      const fallback = window.setTimeout(printReport, 1500);
      const printWhenReady = () => {
        window.clearTimeout(fallback);
        window.setTimeout(printReport, 100);
      };
      logo.addEventListener("load", printWhenReady, { once: true });
      logo.addEventListener("error", printWhenReady, { once: true });
    } else {
      window.setTimeout(printReport, 150);
    }
  };

  const applyLeftSidebarWidth = (width: number) => {
    const nextWidth = clampLeftSidebarWidth(width, window.innerWidth);
    leftSidebarWidthRef.current = nextWidth;
    workspaceShellRef.current?.style.setProperty("--left-sidebar-width", `${nextWidth}px`);
    return nextWidth;
  };

  const beginLeftSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = leftSidebarWidthRef.current;
    let nextWidth = startWidth;
    let animationFrame = 0;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    handle.setPointerCapture(pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setIsLeftSidebarResizing(true);

    const renderWidth = () => {
      animationFrame = 0;
      applyLeftSidebarWidth(nextWidth);
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampLeftSidebarWidth(startWidth + moveEvent.clientX - startX, window.innerWidth);
      if (!animationFrame) animationFrame = window.requestAnimationFrame(renderWidth);
    };

    const finishResize = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      nextWidth = applyLeftSidebarWidth(nextWidth);
      setLeftSidebarWidth(nextWidth);
      setIsLeftSidebarResizing(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  };

  const resizeLeftSidebarWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    const step = event.shiftKey ? 24 : 12;

    if (event.key === "ArrowLeft") nextWidth = leftSidebarWidthRef.current - step;
    if (event.key === "ArrowRight") nextWidth = leftSidebarWidthRef.current + step;
    if (event.key === "Home") nextWidth = LEFT_SIDEBAR_MIN_WIDTH;
    if (event.key === "End") nextWidth = leftSidebarMaxWidthRef.current;
    if (nextWidth === null) return;

    event.preventDefault();
    nextWidth = applyLeftSidebarWidth(nextWidth);
    setLeftSidebarWidth(nextWidth);
  };

  const restoreWorkspaceTriggerFocus = (
    target: "formula" | "inspector" | "trend" | null,
  ) => {
    if (!target) return;
    window.requestAnimationFrame(() => {
      if (target === "formula") formulaCompactTriggerRef.current?.focus();
      if (target === "inspector") inspectorCompactTriggerRef.current?.focus();
      if (target === "trend") trendTriggerRef.current?.focus();
    });
  };

  const closeCompactWorkspacePanel = (restoreFocus = false) => {
    const panelToRestore = compactPanel;
    setCompactPanel(null);
    if (restoreFocus) restoreWorkspaceTriggerFocus(panelToRestore);
  };

  const openCompactWorkspacePanel = (panel: "formula" | "inspector") => {
    setLibraryTargetFormulaId(null);
    setShowTrend(false);
    setCompactPanel(panel);
  };

  const toggleCompactWorkspacePanel = (panel: "formula" | "inspector") => {
    if (compactPanel === panel) {
      closeCompactWorkspacePanel(true);
      return;
    }
    openCompactWorkspacePanel(panel);
  };

  const openSubstanceLibrary = (formulaId: string) => {
    setShowTrend(false);
    setCompactPanel(null);
    setLibraryTargetFormulaId(formulaId);
  };

  const closeSubstanceLibrary = (restoreFocus = false) => {
    setLibraryTargetFormulaId(null);
    if (restoreFocus && isCompactWorkspace) {
      restoreWorkspaceTriggerFocus("formula");
    }
  };

  const closeTrendPanel = (restoreFocus = false) => {
    setShowTrend(false);
    if (restoreFocus) restoreWorkspaceTriggerFocus("trend");
  };

  const toggleTrendPanel = () => {
    setLibraryTargetFormulaId(null);
    setCompactPanel(null);
    setShowTrend((current) => !current);
  };

  useEffect(() => {
    if (!showTrend) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || trendDrawerRef.current?.contains(target)) return;
      setShowTrend(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [showTrend]);

  const closeWorkspaceOverlays = () => {
    setCompactPanel(null);
    setLibraryTargetFormulaId(null);
    setShowTrend(false);
  };

  const handleWorkspaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || libraryTargetFormulaId) return;
    if (showTrend) {
      event.preventDefault();
      closeTrendPanel(true);
      return;
    }
    if (compactPanel) {
      event.preventDefault();
      closeCompactWorkspacePanel(true);
    }
  };

  const toggleFormulaSidebar = () => {
    if (isCompactWorkspace) {
      toggleCompactWorkspacePanel("formula");
      return;
    }
    setFormulaSidebarCollapsed((collapsed) => !collapsed);
  };

  const changePrimaryNavigation = (item: PrimaryNavigationItem) => {
    closeWorkspaceOverlays();
    if (item === activeNavigationItem) return;
    setActiveNavigationItem(item);
  };

  const startEditingProjectName = () => {
    if (!project || savingProjectName) return;
    setProjectNameDraft(project.name);
    setEditingProjectName(true);
  };

  const saveProjectName = async () => {
    if (!project || savingProjectName) return;
    const nextName = projectNameDraft.trim();
    if (!nextName) {
      toast.error("กรุณาระบุชื่อโปรเจกต์");
      return;
    }
    if (nextName === project.name) {
      setEditingProjectName(false);
      return;
    }

    setSavingProjectName(true);
    try {
      const updatedProject = await api.updateProject(
        project.id,
        nextName,
        project.description ?? undefined,
        project.color_key,
        project.icon_key,
      );
      setProject(updatedProject);
      setProjectNameDraft(updatedProject.name);
      setEditingProjectName(false);
      toast.success(`เปลี่ยนชื่อโปรเจกต์เป็น “${updatedProject.name}” แล้ว`);
    } catch (cause) {
      if (!isAbortError(cause)) {
        logRequestFailure("rename assessment project", cause);
        toast.error(apiErrorMessage(cause, "เปลี่ยนชื่อโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง"));
      }
    } finally {
      setSavingProjectName(false);
    }
  };

  return (
    <div
      ref={workspaceShellRef}
      onKeyDown={handleWorkspaceKeyDown}
      data-compact-panel={compactPanel ?? "none"}
      className={`assess-workspace-shell app-light relative grid h-screen grid-rows-[3.5rem_minmax(0,1fr)] overflow-hidden bg-background text-foreground ${activeNavigationItem === "assessment" && compactPanel === null ? "assess-mobile-focus-mode" : ""} ${activeNavigationItem === "assessment" && compactPanel === "inspector" ? "assess-mobile-inspector-mode" : ""} ${isLeftSidebarResizing ? "select-none" : ""}`}
      style={
        {
          "--navigation-sidebar-width": `${NAVIGATION_SIDEBAR_WIDTH}px`,
          "--left-sidebar-width": `${leftSidebarWidth}px`,
          "--right-inspector-width": `${ASSESSMENT_INSPECTOR_WIDTH}px`,
          gridTemplateColumns: `var(--navigation-sidebar-width) ${formulaSidebarCollapsed
            ? `${FORMULA_PANEL_COLLAPSED_WIDTH}px`
            : "var(--left-sidebar-width)"
            } minmax(0,1fr) ${activeNavigationItem === "assessment" ? "var(--right-inspector-width)" : "0px"}`,
        } as React.CSSProperties
      }
    >
      {/* Formula panel header */}
      <div
        className={`assess-formula-header relative z-40 col-start-2 row-start-1 flex min-w-0 items-center border-b border-border bg-card ${formulaSidebarCollapsed && !isCompactWorkspace ? "justify-center px-0" : "border-r px-3"
          }`}
      >
        {(!formulaSidebarCollapsed || isCompactWorkspace) && (
          <div className="flex h-full min-w-0 flex-1 items-center">
            <a
              href="/projects"
              aria-label="กลับไปหน้าโปรเจกต์ทั้งหมด"
              title="กลับไปหน้าโปรเจกต์ทั้งหมด"
              className="mr-2 grid size-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <img
                src="/icons/logo.png"
                alt=""
                aria-hidden="true"
                className="size-7 object-contain"
              />
            </a>
            {editingProjectName && project ? (
              <input
                autoFocus
                value={projectNameDraft}
                maxLength={100}
                disabled={savingProjectName}
                aria-label="แก้ไขชื่อโปรเจกต์"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setProjectNameDraft(event.target.value)}
                onBlur={() => void saveProjectName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setProjectNameDraft(project.name);
                    setEditingProjectName(false);
                  }
                }}
                className="h-8 w-full min-w-0 rounded-md border border-primary/50 bg-white px-2 text-sm font-semibold text-slate-800 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-wait disabled:opacity-60"
              />
            ) : (
              <button
                type="button"
                onClick={startEditingProjectName}
                disabled={!project || savingProjectName}
                title={project ? "คลิกเพื่อแก้ไขชื่อโปรเจกต์" : undefined}
                className="flex h-8 w-full min-w-0 items-center truncate rounded-md px-2 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:hover:bg-transparent"
              >
                {project?.name ?? "โปรเจกต์ปัจจุบัน"}
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={toggleFormulaSidebar}
          aria-label={isCompactWorkspace ? "ปิดกล่องสูตร" : formulaSidebarCollapsed ? "ขยายกล่องสูตร" : "ย่อกล่องสูตร"}
          title={isCompactWorkspace ? "ปิดกล่องสูตร" : formulaSidebarCollapsed ? "ขยายกล่องสูตร" : "ย่อกล่องสูตร"}
          className={`grid size-9 shrink-0 place-items-center text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${formulaSidebarCollapsed && !isCompactWorkspace ? "bg-transparent" : "ml-2 rounded-lg hover:bg-slate-100"
            }`}
        >
          {formulaSidebarCollapsed && !isCompactWorkspace ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <div
        role="separator"
        aria-label="ปรับความกว้างแถบสูตร"
        aria-orientation="vertical"
        aria-valuemin={LEFT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={leftSidebarMaxWidth}
        aria-valuenow={leftSidebarWidth}
        tabIndex={formulaSidebarCollapsed ? -1 : 0}
        title="ลากเพื่อปรับความกว้างแถบสูตร"
        onPointerDown={beginLeftSidebarResize}
        onKeyDown={resizeLeftSidebarWithKeyboard}
        className={`assess-formula-resizer group absolute inset-y-0 z-50 w-2 -translate-x-1/2 touch-none cursor-col-resize focus-visible:outline-none ${formulaSidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        style={{
          left: "calc(var(--navigation-sidebar-width) + var(--left-sidebar-width))",
        }}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 ${isLeftSidebarResizing
            ? "bg-brand"
            : "bg-transparent group-hover:bg-brand/60 group-focus-visible:bg-brand"
            }`}
        />
      </div>

      {/* Main content top app bar */}
      <header className="assess-main-header sticky top-0 z-40 col-start-3 row-start-1 flex min-w-0 items-center justify-between gap-2 border-b border-border bg-card px-4 shadow-sm">
        {activeNavigationItem === "assessment" && (
          <button
            ref={formulaCompactTriggerRef}
            type="button"
            onClick={() => toggleCompactWorkspacePanel("formula")}
            aria-label="เปิดกล่องสูตร"
            aria-expanded={compactPanel === "formula"}
            className="assess-compact-trigger grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}
        {/* Primary modes stay visually centered regardless of left/right actions. */}
        {activeNavigationItem === "assessment" ? (
          <div className="absolute left-1/2 top-1/2 flex max-w-[calc(100%-8rem)] -translate-x-1/2 -translate-y-1/2 items-center rounded-xl bg-muted p-1">
            {(
              [
                ["assess", "ประเมิน", "flask"],
                ["nodes", "Nodes", "puzzle"],
                ["trust", "ความน่าเชื่อถือ", "shield"],
              ] as [Mode, string, SemanticIconName][]
            ).map(([m, label, icon]) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => {
                    changePrimaryNavigation("assessment");
                    setMode(m);
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition ${active
                    ? "bg-white font-semibold text-brand-dark shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                    }`}
                >
                  <SemanticIcon name={icon} className="size-3.5" />
                  <span className="hidden truncate sm:inline">{label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div id="substance-library-toolbar-host" className="flex min-w-0 flex-1 items-center" />
        )}
        {activeNavigationItem === "assessment" && (
          <button
            ref={inspectorCompactTriggerRef}
            type="button"
            onClick={() => toggleCompactWorkspacePanel("inspector")}
            aria-label="เปิดผลการทดสอบและผู้ช่วย AI"
            aria-expanded={compactPanel === "inspector"}
            className="assess-compact-trigger grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <SemanticIcon name="chart" className="size-4" />
          </button>
        )}
      </header>

      {/* Right sidebar header */}
      {activeNavigationItem === "assessment" && (
        <div className="assess-inspector-header relative z-40 col-start-4 row-start-1 flex items-center justify-between gap-3 border-b border-l border-border bg-card px-4">
          <div className="assess-inspector-tabs flex min-w-0 items-center rounded-lg bg-slate-100 p-1" role="tablist" aria-label="เนื้อหาแถบด้านขวา">
            {(
              [
                ["results", "ผลทดสอบ"],
                ["assistant", "ผู้ช่วย AI"],
              ] as ["results" | "assistant", string][]
            ).map(([tab, label]) => {
              const active = rightInspectorTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setRightInspectorTab(tab)}
                  className={`flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-[10px] transition-colors ${active
                    ? "bg-white font-semibold text-brand-dark shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                    }`}
                >
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={exportPdf}
            className="hidden h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-brand/50 hover:bg-teal-50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 md:flex"
            title="ส่งออกรายงาน PDF จากข้อมูลการประเมิน"
          >
            <SemanticIcon name="file" className="size-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={() => closeCompactWorkspacePanel(true)}
            aria-label="ปิดผลการทดสอบและผู้ช่วย AI"
            className="assess-compact-trigger size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <SemanticIcon name="x" className="size-4" />
          </button>
        </div>
      )}

      {compactPanel && (
        <button
          type="button"
          aria-label="ปิดแผงด้านข้าง"
          onClick={() => closeCompactWorkspacePanel(true)}
          className="assess-compact-backdrop fixed inset-0 z-[55] bg-slate-950/25"
        />
      )}

      {/* Four independent columns */}
      <div className="contents">
        {/* Left panel — Pages + Layers */}
        <aside
          aria-hidden={isCompactWorkspace ? compactPanel !== "formula" : formulaSidebarCollapsed}
          inert={isCompactWorkspace && compactPanel !== "formula" ? ("true" as unknown as boolean) : undefined}
          onClick={(event) => {
            if (event.target === event.currentTarget) clearFormulaSelection();
          }}
          className={`assess-formula-panel assess-scrollbar relative z-40 col-start-2 row-start-2 flex h-full min-h-0 w-full flex-col ${formulaSidebarCollapsed && !isCompactWorkspace
            ? `pointer-events-none overflow-hidden border-r-0 ${activeNavigationItem === "assessment" && mode === "assess" ? "bg-[#F8FAFC]" : "bg-background"}`
            : "overflow-y-auto border-r border-border bg-card opacity-100"
            }`}
        >
          {(!formulaSidebarCollapsed || isCompactWorkspace) && (
            <>
              <Section
                title="กล่องสูตร"
                className="border-b-0"
                action={(
                  <button
                    type="button"
                    onClick={openCreate}
                    aria-label="สร้างสูตร"
                    title="สร้างสูตร"
                    className="grid size-8 shrink-0 place-items-center rounded-lg border border-brand/40 bg-white text-brand transition-colors hover:border-brand hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              >
                <div className="space-y-2">
                  {formulas.length === 0 && (
                    <div
                      role="status"
                      className="flex flex-col items-center px-4 py-8 text-center"
                    >
                      <span className="grid size-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                        <SemanticIcon name="flask" className="size-4" />
                      </span>
                      <p className="mt-3 text-sm font-medium text-slate-700">ยังไม่มีสูตร</p>
                      <p className="mt-1 max-w-48 text-[10px] leading-4 text-slate-400">
                        สร้างสูตรใหม่เพื่อเพิ่มสารและเริ่มการประเมิน
                      </p>
                      <button
                        type="button"
                        onClick={openCreate}
                        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-medium text-white transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2"
                      >
                        <Plus className="size-3.5" />
                        สร้างสูตรใหม่
                      </button>
                    </div>
                  )}
                  {formulas.map((f) => {
                    const selected = f.id === activeId;
                    const expanded = expandedFormulaIds.has(f.id);
                    const formulaTotalPct =
                      Math.round(
                        f.items.reduce(
                          (sum, item) => sum + (Number(item.concentration) || 0),
                          0,
                        ) * 10,
                      ) / 10;
                    const formulaWaterPct = Math.max(
                      0,
                      Math.round((100 - formulaTotalPct) * 10) / 10,
                    );
                    const formulaExcessPct = Math.max(
                      0,
                      Math.round((formulaTotalPct - 100) * 10) / 10,
                    );
                    const formulaWaterMissing =
                      WATER_BASED_TYPES.has(f.type || "") && formulaWaterPct <= 0;
                    const formulaRegionMeta =
                      REGIONS.find((item) => item.value === f.region) ?? REGIONS[2];

                    return (
                      <div
                        key={f.id}
                        className={`overflow-hidden rounded-2xl border bg-white transition-[border-color,background-color,box-shadow] duration-200 ${selected
                          ? "border-brand bg-teal-50/30 shadow-sm"
                          : "border-slate-200 hover:border-brand/40"
                          } ${f.id === recentlyCreatedFormulaId
                            ? "animate-in fade-in-0 slide-in-from-bottom-2 ring-2 ring-brand/20 duration-300 motion-reduce:animate-none"
                            : ""
                          }`}
                      >
                        <div className="flex min-h-14 items-center gap-2 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => selectFormula(f.id)}
                            aria-label={`เลือก ${f.name} · ทดสอบบริเวณ${formulaRegionMeta.label}`}
                            aria-pressed={selected}
                            title={`บริเวณทดสอบ: ${formulaRegionMeta.label}`}
                            className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${selected ? "bg-teal-100 text-brand" : "bg-slate-100 text-slate-500"
                              }`}
                          >
                            <SemanticIcon name={formulaRegionMeta.icon} className="size-4" />
                          </button>

                          {editingFormulaId === f.id ? (
                            <input
                              autoFocus
                              value={f.name}
                              onChange={(event) => renameFormula(f.id, event.target.value)}
                              onBlur={() => setEditingFormulaId(null)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === "Escape") {
                                  setEditingFormulaId(null);
                                }
                              }}
                              className="h-9 min-w-0 flex-1 rounded-lg border border-brand bg-white px-2 text-sm text-slate-800 outline-none ring-brand/20 focus:ring-2"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => selectFormula(f.id)}
                              onDoubleClick={() => setEditingFormulaId(f.id)}
                              title="ดับเบิลคลิกเพื่อแก้ชื่อ"
                              className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                            >
                              <span className="truncate text-sm font-semibold text-slate-800">{f.name}</span>
                              <span className="truncate text-[10px] text-slate-400">{f.type}</span>
                            </button>
                          )}

                          <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold tabular-nums text-slate-600">
                            {f.items.length} สาร
                          </span>

                          {isCompactWorkspace ? (
                            <button
                              type="button"
                              aria-label={`ตั้งค่า ${f.name}`}
                              title="ตั้งค่าสูตร"
                              onClick={(event) => {
                                event.stopPropagation();
                                setCompactFormulaSettingsId(f.id);
                              }}
                              className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                            >
                              <Settings className="size-4" />
                            </button>
                          ) : (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`ตั้งค่า ${f.name}`}
                                  title="ตั้งค่าสูตร"
                                  onClick={(event) => event.stopPropagation()}
                                  className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                                >
                                  <Settings className="size-4" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="right" align="start" className="w-44 p-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    selectFormula(f.id);
                                    openEditFormula(f);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-100"
                                >
                                  <SemanticIcon name="pencil" className="size-3.5" />
                                  แก้ไขสูตร
                                </button>
                                <button
                                  type="button"
                                  onClick={() => duplicateFormula(f)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-100"
                                >
                                  <Copy className="size-3.5" />
                                  คัดลอกและวาง
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDeleteFormula(f)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-600 transition hover:bg-rose-50"
                                >
                                  <SemanticIcon name="trash" className="size-3.5" />
                                  ลบสูตร
                                </button>
                              </PopoverContent>
                            </Popover>
                          )}

                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={expanded ? `ย่อ ${f.name}` : `กาง ${f.name}`}
                            title={expanded ? "ย่อกล่องสูตร" : "กางกล่องสูตร"}
                            onClick={() => {
                              setExpandedFormulaIds((current) => {
                                const next = new Set(current);
                                if (next.has(f.id)) next.delete(f.id);
                                else next.add(f.id);
                                return next;
                              });
                            }}
                            className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                          >
                            <ChevronDown className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>

                        {expanded && (
                          <div className="animate-in border-t border-slate-200/80 px-3 pb-3 pt-2 fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none">
                            <div className="space-y-2.5">
                              <SubstanceHoverCard
                                name="Water (Aqua)"
                                smiles="O"
                                className="min-h-14 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2"
                              >
                                <div className="flex items-center gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-normal text-slate-800">Water</div>
                                    <div className="mt-0.5 truncate text-[9px] leading-none text-sky-700">Base · เติมให้สูตรครบ 100%</div>
                                  </div>
                                  <span className="flex h-8 w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-white px-2 text-center text-xs font-semibold tabular-nums text-slate-800">
                                    {formulaWaterPct} %
                                  </span>
                                </div>
                              </SubstanceHoverCard>

                              {formulaWaterMissing && (
                                <div className="flex gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[10px] leading-snug text-amber-700">
                                  <SemanticIcon name="alert" className="mt-0.5 size-3 shrink-0" />
                                  <span>
                                    {formulaExcessPct > 0
                                      ? `สารรวม ${formulaTotalPct}% — เกิน ${formulaExcessPct}% กรุณาลดสัดส่วนสาร`
                                      : "สารรวมเต็ม 100% แล้ว กรุณาลดสัดส่วนสาร"}
                                  </span>
                                </div>
                              )}

                              {f.items.map((item, index) => {
                                const wasJustAdded =
                                  recentlyAddedIngredient?.formulaId === f.id &&
                                  recentlyAddedIngredient.index === index;
                                return (
                                  <SubstanceHoverCard
                                    key={`${item.smiles}-${index}`}
                                    name={item.name}
                                    smiles={item.smiles}
                                    openOnCardClick
                                    className={`min-h-14 cursor-pointer rounded-xl border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-300 ${wasJustAdded
                                      ? "animate-in border-brand/40 bg-teal-50 ring-1 ring-brand/20 fade-in-0 slide-in-from-right-2 motion-reduce:animate-none"
                                      : "border-slate-200 bg-slate-50/80"
                                      }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center">
                                          <span
                                            className="block min-w-0 flex-1 truncate text-xs font-medium text-slate-800"
                                            title={item.name || "ยังไม่มีชื่อสาร"}
                                          >
                                            {item.name || "ยังไม่มีชื่อสาร"}
                                          </span>
                                        </div>
                                        <span
                                          className="mt-0.5 block w-full truncate font-sans text-[9px] leading-none text-slate-400"
                                          title={item.smiles || "ไม่มีข้อมูล SMILES"}
                                        >
                                          {item.smiles || "ไม่มีข้อมูล SMILES"}
                                        </span>
                                      </div>
                                      <label
                                        data-substance-action
                                        className="flex h-8 w-[4.5rem] shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2"
                                      >
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step={0.1}
                                          inputMode="decimal"
                                          aria-label={`เปอร์เซ็นต์ของ ${item.name || `สารลำดับที่ ${index + 1}`}`}
                                          className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold tabular-nums text-slate-800 outline-none"
                                          value={item.concentration}
                                          onFocus={(event) => event.currentTarget.select()}
                                          onChange={(event) => {
                                            const normalized = event.currentTarget.value.replace(/^0+(?=\d)/, "");
                                            if (normalized !== event.currentTarget.value) event.currentTarget.value = normalized;
                                            patchFormulaItem(f.id, index, {
                                              concentration: Number.parseFloat(normalized) || 0,
                                            });
                                          }}
                                          onBlur={(event) => {
                                            const normalized = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0));
                                            event.currentTarget.value = String(normalized);
                                            patchFormulaItem(f.id, index, { concentration: normalized });
                                          }}
                                        />
                                        <span className="ml-1 text-[10px] text-slate-400">%</span>
                                      </label>
                                      <button
                                        type="button"
                                        data-substance-action
                                        onClick={() => removeFormulaItem(f.id, index)}
                                        aria-label={`ลบ ${item.name || `สารลำดับที่ ${index + 1}`}`}
                                        title="ลบสาร"
                                        className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                                      >
                                        <Minus className="size-3" />
                                      </button>
                                    </div>
                                    {completed && subConf.get(item.smiles) && (() => {
                                      const confidence = subConf.get(item.smiles)!;
                                      return (
                                        <div className="mt-1 flex items-center gap-1 text-[9px]" title={confidence.reason}>
                                          <span className="size-1.5 rounded-full" style={{ background: CONF_HEX[confidence.level] }} />
                                          <span className="text-slate-400">ความเชื่อมั่น {CONF_TH[confidence.level] ?? confidence.level}</span>
                                          {!confidence.inDomain && (
                                            <span className="inline-flex items-center gap-0.5 font-medium text-rose-500">
                                              · <SemanticIcon name="alert" className="size-2.5" /> นอกขอบเขตโมเดล
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </SubstanceHoverCard>
                                );
                              })}

                              <div className="flex gap-0">
                                <SubstanceLibraryTrigger
                                  onOpen={() => openSubstanceLibrary(f.id)}
                                  disabled={activeNavigationItem === "substances"}
                                />
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label="วิธีเพิ่มสารอื่น"
                                      title="วิธีเพิ่มสารอื่น"
                                      className="group grid h-9 w-9 shrink-0 place-items-center rounded-r-lg border border-l-0 border-dashed border-brand/40 bg-white text-brand transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 data-[state=open]:bg-teal-50"
                                    >
                                      <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    side="bottom"
                                    align="end"
                                    sideOffset={6}
                                    collisionPadding={12}
                                    className="z-[110] w-48 p-1.5"
                                  >
                                    <DropdownMenuItem
                                      onSelect={() => openManualSubstance(f.id)}
                                      className="gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700"
                                    >
                                      <Plus className="size-3.5" /> เพิ่มสารเปล่า
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => openLabelScan(f.id)}
                                      className="gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700"
                                    >
                                      <SemanticIcon name="camera" className="size-3.5" /> OCR รูปฉลาก
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => openCsvImport(f.id)}
                                      className="gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700"
                                    >
                                      <SemanticIcon name="file-spreadsheet" className="size-3.5" />
                                      นำเข้า CSV
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>

                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>

              {showTemplates && (
                <Section title="เทมเพลตผลิตภัณฑ์">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="flex-1 text-[11px] text-slate-800/50">เลือกสูตรตัวอย่าง แล้วกด Run</p>
                    <select
                      value={templateRisk}
                      onChange={(e) => setTemplateRisk(e.target.value as "all" | "low" | "mid" | "high")}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-800"
                      title="กรองตามระดับความเสี่ยง (สำหรับทดสอบ)"
                    >
                      <option value="all">ทุกระดับ</option>
                      <option value="low">ต่ำ</option>
                      <option value="mid">กลาง</option>
                      <option value="high">สูง</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    {PRODUCT_TEMPLATES.filter((t) => templateRisk === "all" || t.risk === templateRisk).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => loadTemplate(t.id)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:border-brand hover:bg-teal-50"
                      >
                        <div className="flex items-center gap-1.5 text-sm">
                          <SemanticIcon name={t.icon} className="size-4" />
                          <span className="font-medium text-slate-800">{t.name}</span>
                          <span className="ml-auto font-mono text-[10px] text-brand">{t.formula.length} สาร</span>
                        </div>
                        <div className="mt-0.5 text-[10px] leading-snug text-slate-800/50">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </Section>
              )}

            </>
          )}
        </aside>

        {/* Center canvas */}
        <main className="assess-center-canvas relative col-start-3 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden">
          <SubstanceLibraryPage
            active={activeNavigationItem === "substances"}
            activeFormulaName={activeFormula?.name}
            selectedItems={formula}
            onToggleFormula={(item) => {
              if (!activeId) return;
              const selectedIndex = formula.findIndex(
                (formulaItem) => formulaItem.smiles.trim() === item.smiles.trim(),
              );
              if (selectedIndex >= 0) {
                removeFormulaItem(activeId, selectedIndex);
                return;
              }
              addFromCatalog(activeId, {
                name: item.name,
                smiles: item.smiles,
                conc: item.concentration,
              });
            }}
          />
          {mode === "assess" && (
            <Viewport
              paintOwnerKey={`${projectId ?? "standalone"}:${activeId}`}
              initialPaint={paintByFormulaId[activeId] ?? null}
              occupiedPaint={Object.entries(paintByFormulaId)
                .filter(([formulaId]) => formulaId !== activeId)
                .map(([, snapshot]) => snapshot)}
              onPaintChange={(snapshot) => {
                setPaintByFormulaId((previous) => ({
                  ...previous,
                  [activeId]: snapshot,
                }));
              }}
              onPaintBlocked={() => {
                toast.warning("บริเวณนี้มีรอยจากกล่องสูตรอื่นแล้ว");
              }}
              region={region}
              paintReady={paintReady}
              resultReady={resultReady}
              productName={developerTestEnabled ? `${productName} · ค่าทดสอบ` : productName}
              activeFormulaName={activeFormula?.name}
              layers={modelLayers}
              eraseMode={eraseMode}
              brushSizePct={brushSizePct}
              brushSizeControlPct={brushSizeControlPct}
              onBrushSizeControlChange={setBrushSizeControlPct}
              clearPaintRequest={clearPaintRequest}
              active={activeNavigationItem === "assessment"}
            />
          )}

          {mode === "assess" && showTrend && activeNavigationItem === "assessment" && (
            <div
              aria-hidden="true"
              onClick={() => closeTrendPanel(true)}
              className="assess-trend-backdrop absolute inset-0 z-[45] hidden bg-slate-950/20"
            />
          )}

          {/* Inflammation trend — opens immediately without motion. */}
          {mode === "assess" && (
            <div
              ref={trendDrawerRef}
              aria-hidden={activeNavigationItem !== "assessment"}
              // React 18 expects inert to be serialized, while its typings still model a boolean.
              inert={activeNavigationItem !== "assessment" ? ("true" as unknown as boolean) : undefined}
              className={`assess-trend-drawer absolute right-0 top-4 z-50 flex items-start ${showTrend ? "assess-trend-open" : ""}`}
            >
              <div className={`assess-trend-width overflow-hidden ${showTrend ? "is-open" : ""}`}>
                <div className="assess-trend-panel assess-scrollbar w-full overflow-y-auto overscroll-contain rounded-l-2xl border border-r-0 border-slate-200 bg-white p-4 text-slate-800 shadow-xl">
                  <div className="assess-trend-header flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-lg"><SemanticIcon name="activity" className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">แนวโน้มความเสี่ยงตามเวลา</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">เปรียบเทียบคะแนนจำลอง Day 1, Day 3 และ Day 7</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => closeTrendPanel(true)}
                      aria-label="ปิดกราฟแนวโน้ม"
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 md:hidden"
                    >
                      <SemanticIcon name="x" className="size-4" />
                    </button>
                  </div>
                  {completed && trendData.length ? (
                    <>
                      {trendAnalytics && (
                        <div className="assess-trend-metrics mb-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[9px] font-medium text-slate-500">
                              <SemanticIcon name="arrow-up" className="size-3.5 text-slate-400" />
                              จุดสูงสุด
                            </div>
                            <div className="mt-1.5 flex items-end justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-[11px] font-semibold text-slate-800" title={trendAnalytics.peak.label}>{trendAnalytics.peak.label}</div>
                                <div className="mt-0.5 text-[9px] text-slate-400">เกิดใน Day {trendAnalytics.peak.peakDay}</div>
                              </div>
                              <div className="shrink-0 font-mono text-lg font-semibold tabular-nums text-slate-800">
                                {trendAnalytics.peak.peakScore}<span className="text-[9px] font-medium text-slate-400">/100</span>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[9px] font-medium text-slate-500">
                              <SemanticIcon name="activity" className="size-3.5 text-slate-400" />
                              เปลี่ยนแปลงมากที่สุด
                            </div>
                            <div className="mt-1.5 flex items-end justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-[11px] font-semibold text-slate-800" title={trendAnalytics.largestChange.label}>{trendAnalytics.largestChange.label}</div>
                                <div className="mt-0.5 text-[9px] text-slate-400">Day 1 → Day 7</div>
                              </div>
                              <div className={`shrink-0 font-mono text-lg font-semibold tabular-nums ${trendAnalytics.largestChange.delta > 0 ? "text-rose-600" : trendAnalytics.largestChange.delta < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                                {trendAnalytics.largestChange.delta > 0 ? "+" : ""}{trendAnalytics.largestChange.delta}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="assess-trend-chart rounded-xl border border-slate-200 bg-white px-2 pb-2 pt-2">
                        <div className="px-1 pb-1 text-[9px] font-medium text-slate-500">คะแนนจำลองตามเวลา</div>
                        <TrendChart data={trendData} lines={trendLines} compact={isMobileWorkspace} />
                      </div>

                      <div className="assess-trend-legend mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {trendLines.map((l) => (
                          <span key={l.key} className="flex items-center gap-1 text-[10px] text-slate-500">
                            <span className="h-0.5 w-4 rounded" style={{ background: l.color }} />
                            {l.label}
                          </span>
                        ))}
                      </div>

                      {trendAnalytics && (
                        <div className="assess-trend-table mt-3 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[10px] font-semibold text-slate-700">ระดับความเสี่ยงแต่ละช่วงเวลา</div>
                            <div className="text-[9px] text-slate-400">สีเข้ม = คะแนนสูงขึ้น</div>
                          </div>
                          <div className="grid grid-cols-[minmax(0,1fr)_44px_44px_44px] items-center gap-1.5">
                            <span />
                            {DAY_LABELS.map((day) => (
                              <span key={day} className="text-center text-[9px] font-medium text-slate-400">Day {day}</span>
                            ))}
                            {trendAnalytics.series.map((item) => (
                              <div key={item.endpoint} className="contents">
                                <div className="flex min-w-0 items-center gap-1.5 pr-1">
                                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: item.color }} />
                                  <span className="truncate text-[9px] text-slate-600" title={item.label}>{item.label}</span>
                                </div>
                                {item.scores.map((score, index) => {
                                  const band = bandOf(score);
                                  return (
                                    <div
                                      key={`${item.endpoint}-${DAY_LABELS[index]}`}
                                      title={`${item.label} · Day ${DAY_LABELS[index]}: ${score}/100 ระดับ${BAND_LABEL[band]}`}
                                      className="assess-trend-score-cell grid h-7 place-items-center rounded-md border text-[9px] font-semibold tabular-nums"
                                      style={{
                                        borderColor: `${BAND_HEX[band]}38`,
                                        backgroundColor: `${BAND_HEX[band]}14`,
                                        color: BAND_HEX[band],
                                      }}
                                    >
                                      {score}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="assess-trend-scale mt-3 overflow-hidden rounded-full border border-slate-200">
                        <div className="grid h-1.5 grid-cols-4">
                          <span className="bg-green-600" />
                          <span className="bg-amber-500" />
                          <span className="bg-red-500" />
                          <span className="bg-red-800" />
                        </div>
                      </div>
                      <div className="assess-trend-scale mt-1 flex justify-between text-[9px] text-slate-400">
                        <span>0 · ต่ำ</span><span>25</span><span>50</span><span>75</span><span>100 · รุนแรง</span>
                      </div>
                      <p className="assess-trend-disclaimer mt-3 text-[9px] leading-relaxed text-slate-400">
                        กราฟนี้เป็นผลจำลองจากแบบจำลอง QSAR สำหรับการคัดกรองเบื้องต้น ไม่ใช่ผลการทดลองทางคลินิก
                      </p>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
                      <div className="text-2xl opacity-30">⌁</div>
                      <div className="mt-2 text-xs font-medium text-slate-500">ยังไม่มีข้อมูลแนวโน้ม</div>
                      <div className="mt-1 text-[10px] text-slate-400">กด “ประเมินสูตร” เพื่อสร้างข้อมูล Day 1/3/7</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="relative">
                <button
                  ref={trendTriggerRef}
                  onClick={toggleTrendPanel}
                  aria-label={showTrend ? "ปิดกราฟแนวโน้ม" : "เปิดกราฟแนวโน้ม"}
                  className={`assess-trend-trigger grid size-10 place-items-center rounded-l-xl border border-r-0 border-slate-200 text-base shadow-card ${showTrend ? "bg-brand text-white" : "bg-white text-slate-600 hover:text-brand"
                    }`}
                >
                  <SemanticIcon name="activity" className="size-4" />
                </button>
              </div>
            </div>
          )}
          {activeNavigationItem !== "substances" && mode === "nodes" && (
            <div className="absolute inset-0">
              <FormulaGraph
                key={`${projectId ?? "standalone"}:${graphOwnerId}`}
                seed={activeFormula?.items ?? []}
                region={activeFormula?.region ?? region}
                projectId={projectId}
                snapshot={graphByFormulaId[graphOwnerId] ?? null}
                onSnapshotPreview={(snapshot) =>
                  previewGraphSnapshot(graphOwnerId, snapshot)
                }
                onSnapshotChange={(snapshot) =>
                  commitGraphSnapshot(graphOwnerId, snapshot)
                }
                onSaveFormula={saveGraphAsFormula}
                syncWithSeed={Boolean(activeFormula)}
                onRegionChange={(nextRegion) => {
                  setRegion(nextRegion);
                  if (!activeFormula) return;
                  invalidateFormulaAssessment(graphOwnerId);
                  setFormulas((previous) =>
                    previous.map((formulaItem) =>
                      formulaItem.id === graphOwnerId
                        ? { ...formulaItem, region: nextRegion }
                        : formulaItem,
                    ),
                  );
                }}
              />
            </div>
          )}
          {mode === "trust" && <TrustReport />}

          {/* Paint follows formula readiness; assessment follows paint ownership. */}
          {mode === "assess" && (
            <div ref={bottomToolbarRef} className="assess-bottom-toolbar pointer-events-none z-40 order-3 mt-auto mb-3 shrink-0 self-center print:hidden md:mb-4 md:mr-4 md:self-end">
              <div className="pointer-events-auto flex w-[calc(100vw-1.5rem)] max-w-[22rem] flex-col rounded-xl border border-slate-200 bg-white p-1.5 md:w-auto md:max-w-none md:p-1">
                {paintReady && (
                  <div ref={mobileBrushControlRef} className="w-full border-b border-slate-100 pb-1">
                    <button
                      type="button"
                      aria-expanded={mobileBrushSliderOpen}
                      aria-controls="brush-size-slider"
                      onClick={() => setMobileBrushSliderOpen((open) => !open)}
                      className="flex h-11 w-full items-center justify-between rounded-lg px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 md:h-9 md:text-[11px]"
                    >
                      <span>ขนาดรอย</span>
                      <span className="tabular-nums text-brand">{brushSizeControlPct}%</span>
                    </button>
                    {mobileBrushSliderOpen && (
                      <div
                        id="brush-size-slider"
                        className="px-3 pb-1 pt-1"
                      >
                        <Slider
                          aria-label="ปรับขนาดรอยทา"
                          min={PAINT_BRUSH_CONTROL_MIN}
                          max={PAINT_BRUSH_CONTROL_MAX}
                          step={1}
                          value={[brushSizeControlPct]}
                          onValueChange={(values) => {
                            const nextValue = values[0];
                            if (typeof nextValue === "number") setBrushSizeControlPct(nextValue);
                          }}
                          className="h-8 touch-none [&_[role=slider]]:size-6 [&_[role=slider]]:border-2 [&_[role=slider]]:bg-white"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>10%</span>
                          <span>100%</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex min-w-0 w-full items-center justify-center gap-1 md:w-auto md:gap-0.5">
                  <button
                    type="button"
                    onClick={() => setEraseMode((value) => !value)}
                    disabled={!activeFormula || !hasActivePaint}
                    title={!activeFormula ? "เลือกกล่องสูตรก่อน" : !hasActivePaint ? "สูตรที่เลือกยังไม่มีรอยทา" : eraseMode ? "ปิดโหมดลบ" : "เปิดยางลบแบบระบาย"}
                    aria-label={eraseMode ? "ปิดโหมดลบรอย" : "เปิดโหมดลบรอย"}
                    aria-pressed={eraseMode}
                    className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-semibold transition md:h-8 md:flex-none md:px-2.5 md:text-[11px] ${eraseMode
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      }`}
                  >
                    <Eraser className="size-3.5" />
                    <span className="hidden min-[360px]:inline">ลบรอย</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeFormula) setPaintPendingClearFormula(activeFormula);
                    }}
                    disabled={!activeFormula || !hasActivePaint}
                    title={!activeFormula ? "เลือกกล่องสูตรก่อน" : !hasActivePaint ? "สูตรที่เลือกยังไม่มีรอยทา" : `ลบรอยทาทั้งหมดของ ${activeFormula.name}`}
                    aria-label="ลบรอยทั้งหมด"
                    className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600 md:h-8 md:flex-none md:px-2.5 md:text-[11px]"
                  >
                    <SemanticIcon name="trash" className="size-3.5" />
                    <span className="hidden min-[360px]:inline">ลบทั้งหมด</span>
                  </button>
                  <span aria-hidden="true" className="h-5 w-px shrink-0 bg-slate-200" />
                  <button
                    type="button"
                    disabled={assessing || !activeFormula}
                    title={!activeFormula ? "เลือกกล่องสูตรก่อนประเมิน" : assessing ? "กำลังประเมินสูตร" : completed ? "ประเมินอีกครั้ง" : "ประเมินสูตร"}
                    aria-label={assessing ? "กำลังประเมินสูตร" : completed ? "ประเมินอีกครั้ง" : "ประเมินสูตร"}
                    onClick={() => {
                      setEraseMode(false); // กดประเมิน = กลับมาโหมด paint ผลลัพธ์
                      run();
                    }}
                    className="flex h-11 w-[7.5rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand px-2 text-xs font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:w-auto md:min-w-28 md:gap-2 md:px-4 md:text-[12px]"
                  >
                    <SemanticIcon name={assessing || completed ? "refresh" : "play"} className="size-4" />
                    <span>{assessing ? "กำลังประเมิน" : completed ? "ประเมินใหม่" : "เริ่มประเมิน"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right inspector */}
        {activeNavigationItem === "assessment" && (
          <aside
            aria-hidden={isCompactWorkspace ? compactPanel !== "inspector" : undefined}
            inert={isCompactWorkspace && compactPanel !== "inspector" ? ("true" as unknown as boolean) : undefined}
            className="assess-right-inspector col-start-4 row-start-2 flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border bg-card"
          >
            {mode === "trust" ? (
              <div className="p-4 text-xs leading-relaxed text-slate-800/55">
                เลือก <b>Pages › ประเมินความเสี่ยง</b> เพื่อแก้สูตรและดูผลบนหุ่น 3D
              </div>
            ) : (
              <>
                <div
                  role="tabpanel"
                  aria-label="ผลการทดสอบ"
                  className={`${rightInspectorTab === "results" ? "flex" : "hidden"} assess-scrollbar h-full min-h-0 flex-col overflow-y-auto`}
                >
                  <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="เลือกช่วงเวลาจำลอง">
                      {DAY_LABELS.map((d, i) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDayIdx(i)}
                          aria-pressed={i === dayIdx}
                          className={`h-8 rounded-lg border text-[11px] transition-colors ${i === dayIdx ? "border-brand bg-brand font-semibold text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-brand/40 hover:bg-teal-50 hover:text-brand-dark"
                            }`}
                        >
                          Day {d}
                        </button>
                      ))}
                    </div>

                  </div>

                  <Section>
                    {error && (
                      <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-relaxed text-rose-700">
                        <SemanticIcon name="alert" className="mt-0.5 size-4 shrink-0" />
                        <div><div className="font-semibold">ประเมินไม่สำเร็จ</div><div className="mt-0.5 text-rose-600">{error}</div></div>
                      </div>
                    )}

                    {(!completed || !endpoints) && (
                      <AssessmentResultsPlaceholder
                        regionLabel={activeRegionLabel}
                        assessing={assessing || Boolean(jobId)}
                      />
                    )}

                    {completed && endpoints && (
                      <div className="space-y-3">
                        {formulaCoverage && formulaCoverage.coverage_percentage < 100 && (
                          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-900">
                            <SemanticIcon name="alert" className="mt-0.5 size-4 shrink-0 text-amber-600" />
                            <div>
                              <div className="font-semibold">ผลนี้ยังไม่ครอบคลุมทั้งสูตร</div>
                              <div className="mt-0.5 text-amber-800">ประเมินได้ {formulaCoverage.coverage_percentage}% · ยังประเมินไม่ได้ {formulaCoverage.unresolved_ingredients} รายการ</div>
                            </div>
                          </div>
                        )}

                        {lowConfidence && (
                          <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] leading-relaxed text-rose-800">
                            <SemanticIcon name="shield" className="mt-0.5 size-4 shrink-0 text-rose-600" />
                            <span><b>ควรตรวจสอบผลเพิ่มเติม</b><br />มีข้อมูลนอกขอบเขตแบบจำลอง อย่าตีความคะแนนต่ำว่าปลอดภัยโดยอัตโนมัติ</span>
                          </div>
                        )}

                        {[
                          { title: "ผลประเมิน", description: activeRegionLabel, layers: paintLayers },
                        ].map((group) => (
                          <div key={group.title}>
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="text-[13px] font-semibold text-slate-800">{group.title}</div>
                              {group.description && <div className="text-[10px] text-slate-400">{group.description}</div>}
                            </div>
                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                              {group.layers.map((layer, index) => {
                                const confidence = endpoints[layer.key]?.confidence;
                                return (
                                  <div key={layer.key} className={`p-3.5 ${index > 0 ? "border-t border-slate-100" : ""}`}>
                                    <div className="flex items-baseline justify-between gap-3">
                                      <div className="min-w-0 truncate text-xs font-semibold text-slate-800">{layer.label}</div>
                                      <div className="shrink-0 font-mono text-base font-semibold tabular-nums text-slate-900">{Math.round(layer.score)}<span className="text-[10px] font-medium text-slate-400">/100</span></div>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
                                      <div className="min-w-0 truncate text-slate-500">
                                        ความน่าเชื่อถือของโมเดล {confidence ? (CONF_TH[confidence.level] ?? confidence.level) : "ไม่มีข้อมูล"}
                                        {confidence?.in_domain === false ? " · นอกขอบเขต" : ""}
                                      </div>
                                      <div className="shrink-0 font-semibold" style={{ color: BAND_HEX[layer.band] }}>ระดับ{BAND_LABEL[layer.band]}</div>
                                    </div>
                                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                      <AnimatedScoreBar score={layer.score} color={BAND_HEX[layer.band]} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                            <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-slate-600"><SemanticIcon name="shield" className="size-4 shrink-0" /> ความน่าเชื่อถือ</div>
                            <div className="mt-2 text-base font-semibold text-slate-800">{resultConfidenceSummary ? (CONF_TH[resultConfidenceSummary.level] ?? resultConfidenceSummary.level) : "ไม่มีข้อมูล"}</div>
                            <div className="mt-1 truncate whitespace-nowrap text-[10px] text-slate-400">{resultConfidenceSummary?.outOfDomainCount ? `นอกขอบเขต ${resultConfidenceSummary.outOfDomainCount} ด้าน` : "ตรวจขอบเขตโมเดล"}</div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                            <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-slate-600"><SemanticIcon name="target" className="size-4 shrink-0" /> ครอบคลุมสูตร</div>
                            <div className="mt-2 text-base font-semibold text-slate-800">{formulaCoverage ? `${formulaCoverage.coverage_percentage}%` : "ไม่มีข้อมูล"}</div>
                            <div className="mt-1 truncate whitespace-nowrap text-[10px] text-slate-400">{formulaCoverage ? `${formulaCoverage.total_ingredients - formulaCoverage.unresolved_ingredients}/${formulaCoverage.total_ingredients} รายการ` : "รอข้อมูลสูตร"}</div>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* AI — auto-adjust ratios for a realistic / safest result */}
                    {formula.some((it) => it.smiles.trim() && !isWaterItem(it)) && (
                      <div className="mt-3">
                        <button
                          onClick={optimizeFormula}
                          disabled={optBusy}
                          className="w-full rounded-lg border border-brand/40 bg-teal-50 py-1.5 text-xs font-medium text-brand-dark transition hover:bg-teal-100 disabled:opacity-60"
                        >
                          <span className="inline-flex items-center justify-center gap-1"><SemanticIcon name={optBusy ? "timer" : "bot"} className="size-3.5" /> {optBusy ? "กำลังให้ AI วิเคราะห์…" : "ให้ AI เสนออัตราส่วนใหม่"}</span>
                        </button>
                        {optMsg && <div className="mt-1 text-[10px] leading-snug text-slate-500">{optMsg}</div>}
                        {pendingOptimization && (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                            <div className="mb-1 text-[10px] font-semibold text-amber-800">ตรวจสอบข้อเสนอ</div>
                            <div className="space-y-1">
                              {pendingOptimization.map((item, index) => {
                                const old = formula.find((current) => current.smiles === item.smiles)?.concentration ?? 0;
                                return (
                                  <div key={`${item.smiles}-${index}`} className="flex items-center gap-1 text-[10px] text-amber-900">
                                    <span className="min-w-0 flex-1 truncate">{item.name || item.smiles}</span>
                                    <span className="font-mono text-amber-600">{old}% → {item.concentration}%</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="mt-2 flex gap-1.5">
                              <button
                                onClick={() => {
                                  invalidateFormulaAssessment(activeId);
                                  setFormula(pendingOptimization);
                                  setPendingOptimization(null);
                                  setOptMsg("ยืนยันอัตราส่วนใหม่แล้ว กด Run เพื่อประเมิน");
                                }}
                                className="flex-1 rounded bg-brand px-2 py-1 text-[10px] font-semibold text-white"
                              >
                                ยืนยัน
                              </button>
                              <button
                                onClick={() => { setPendingOptimization(null); setOptMsg(null); }}
                                className="rounded border border-amber-200 bg-white px-2 py-1 text-[10px] text-amber-800"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setDeveloperTestEnabled((enabled) => {
                          if (enabled) setEraseMode(false);
                          return !enabled;
                        });
                      }}
                      aria-pressed={developerTestEnabled}
                      className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors print:hidden ${developerTestEnabled
                        ? "border-violet-700 bg-violet-700 text-white hover:bg-violet-800"
                        : "border-violet-200 bg-violet-50/60 text-violet-800 hover:bg-violet-100"
                        }`}
                    >
                      <SemanticIcon name="flask" className="size-4" />
                      {developerTestEnabled ? "ปิดโหมดทดสอบ" : "โหมดทดสอบ"}
                    </button>

                    {developerTestEnabled && (
                      <div className="mt-2 space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 print:hidden">
                        <div className="flex flex-wrap gap-1.5">
                          {[0, 30, 55, 85].map((score) => (
                            <button
                              key={score}
                              type="button"
                              onClick={() => setDeveloperTestScores({ skin: score, eye: score, sens: score, acute: score })}
                              className="rounded-md border border-violet-200 bg-white px-2 py-1 text-[9px] font-medium text-violet-700 hover:bg-violet-100"
                            >
                              ทั้งหมด {score}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setDeveloperTestScores(DEFAULT_DEVELOPER_TEST_SCORES)}
                            className="ml-auto rounded-md px-2 py-1 text-[9px] font-medium text-slate-500 hover:bg-white"
                          >
                            รีเซ็ต
                          </button>
                        </div>

                        {ENDPOINTS.map((endpoint) => {
                          const score = developerTestScores[endpoint];
                          const band = bandOf(score);
                          return (
                            <label key={endpoint} className="grid grid-cols-[minmax(0,1fr)_46px] items-center gap-x-2 gap-y-1">
                              <span className="flex min-w-0 items-center justify-between gap-2 text-[10px] text-slate-700">
                                <span className="truncate">{ENDPOINT_LABEL_TH[endpoint]}</span>
                                <span className="shrink-0 font-mono font-semibold tabular-nums" style={{ color: BAND_HEX[band] }}>
                                  {score} · {BAND_LABEL[band]}
                                </span>
                              </span>
                              <input
                                aria-label={`${ENDPOINT_LABEL_TH[endpoint]} (0 ถึง 100)`}
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={score}
                                onChange={(event) => {
                                  const nextScore = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                                  setDeveloperTestScores((current) => ({ ...current, [endpoint]: nextScore }));
                                }}
                                className="row-span-2 h-8 rounded-lg border border-violet-200 bg-white px-1 text-center font-mono text-[11px] font-semibold text-violet-800 outline-none focus:border-violet-500"
                              />
                              <input
                                aria-label={`ปรับ${ENDPOINT_LABEL_TH[endpoint]}`}
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={score}
                                onChange={(event) => setDeveloperTestScores((current) => ({ ...current, [endpoint]: Number(event.target.value) }))}
                                className="h-1.5 w-full cursor-pointer accent-violet-600"
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </Section>

                  <div className="border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:hidden">
                    <button
                      type="button"
                      onClick={exportPdf}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:border-brand/50 hover:bg-teal-50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    >
                      <SemanticIcon name="file" className="size-4" />
                      PDF
                    </button>
                  </div>

                </div>
                <div
                  role="tabpanel"
                  aria-label="ผู้ช่วย AI"
                  className={`${rightInspectorTab === "assistant" ? "flex" : "hidden"} h-full min-h-0 flex-col`}
                >
                  <VoiceAssistant
                    productName={productName}
                    layers={paintLayers}
                    ready={completed}
                    formula={formula}
                    coverage={formulaCoverage ? {
                      percentage: formulaCoverage.coverage_percentage,
                      unresolved: formulaCoverage.unresolved_ingredients,
                    } : undefined}
                    onImportFormula={importFormula}
                    onAction={runAssistantAction}
                  />
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Create-formula modal (centered, blurred backdrop) */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-900/30 p-3 backdrop-blur-sm animate-in fade-in-0 duration-200 motion-reduce:animate-none sm:p-4"
          onClick={closeFormulaEditor}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-formula-title"
            className={`my-auto flex max-h-[calc(100dvh-1.5rem)] w-full animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none sm:max-h-[calc(100dvh-2rem)] ${formulaDetailsEditingId ? "max-w-[520px]" : "max-w-[740px]"}`}
            onSubmit={(event) => {
              event.preventDefault();
              createFormula();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5 sm:py-4">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-brand">
                <SemanticIcon name="flask" className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 id="create-formula-title" className="text-base font-semibold text-slate-800">
                  {formulaDetailsEditingId ? "แก้ไขสูตร" : "สร้างสูตรใหม่"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formulaDetailsEditingId
                    ? "แก้ชื่อ ประเภทผลิตภัณฑ์ และบริเวณทดสอบ"
                    : "กำหนดข้อมูลสูตรและเลือกวิธีเริ่มต้น"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFormulaEditor}
                aria-label="ปิด"
                className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <SemanticIcon name="x" className="size-4" />
              </button>
            </header>

            <div className={`grid min-h-0 flex-1 overflow-y-auto ${formulaDetailsEditingId ? "grid-cols-1" : "md:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]"}`}>
              <section className="space-y-3.5 p-4 sm:p-5">


                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">ชื่อสูตร</span>
                  <input
                    autoFocus
                    value={draft.name}
                    maxLength={100}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="เช่น ครีมบำรุงสูตร 1"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/10"
                  />
                </label>

                <div className="space-y-3">
                  <div className="min-w-0">
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">ประเภทผลิตภัณฑ์</span>
                    <Popover open={productTypeMenuOpen} onOpenChange={setProductTypeMenuOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="เลือกประเภทผลิตภัณฑ์"
                          aria-expanded={productTypeMenuOpen}
                          className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-sm text-slate-800 outline-none transition-colors hover:border-slate-300 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/10"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-teal-50 text-brand">
                            <SemanticIcon name={PRODUCT_TYPE_ICONS[draft.type] ?? "package"} className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{draft.type}</span>
                          <ChevronDown className={`size-3.5 shrink-0 text-slate-400 transition-transform ${productTypeMenuOpen ? "rotate-180" : ""}`} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        sideOffset={6}
                        className="z-[140] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] rounded-xl border-slate-200 p-1.5 shadow-lg"
                      >
                        <div className="px-2 pb-1.5 pt-1 text-[10px] font-medium text-slate-500">เลือกประเภทผลิตภัณฑ์</div>
                        <div className="grid grid-cols-2 gap-1">
                          {PRODUCT_TYPES.map((type) => {
                            const selected = draft.type === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                  setDraft((current) => ({ ...current, type }));
                                  setProductTypeMenuOpen(false);
                                }}
                                className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs transition-colors ${selected
                                  ? "border-brand/30 bg-teal-50 text-brand-dark"
                                  : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                                  }`}
                              >
                                <span className={`grid size-7 shrink-0 place-items-center rounded-md ${selected ? "bg-white text-brand" : "bg-slate-100 text-slate-500"}`}>
                                  <SemanticIcon name={PRODUCT_TYPE_ICONS[type] ?? "package"} className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1 leading-tight">{type}</span>
                                {selected && <SemanticIcon name="check" className="size-3 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {draft.type === "อื่นๆ" && (
                      <label className="mt-2 block animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
                        <span className="mb-1.5 block text-[11px] font-medium text-slate-600">
                          ระบุประเภทผลิตภัณฑ์ <span className="text-red-500">*</span>
                        </span>
                        <input
                          autoFocus
                          required
                          value={customProductType}
                          maxLength={80}
                          onChange={(event) => setCustomProductType(event.target.value)}
                          placeholder="เช่น มาสก์หน้า หรือ บาล์ม"
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/10"
                        />
                      </label>
                    )}
                    {formulaDetailsEditingId && (
                      <p className="mt-2 text-[10px] leading-4 text-slate-400">
                        ประเภทผลิตภัณฑ์ใช้จัดหมวดหมู่และช่วยเตือนเรื่องน้ำฐาน โดยไม่เปลี่ยนคะแนนประเมินโดยตรง
                      </p>
                    )}
                  </div>

                  <fieldset className="min-w-0">
                    <legend className="mb-1.5 text-xs font-medium text-slate-600">บริเวณทดสอบ</legend>
                    <TooltipProvider delayDuration={250}>
                      <div className="grid grid-cols-2 gap-2">
                        {FORMULA_REGION_OPTIONS.map((option) => {
                          const selected = draft.region === option.value;
                          return (
                            <Tooltip key={option.value}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={`${option.label} · ${option.description}`}
                                  onClick={() => setDraft((current) => ({ ...current, region: option.value }))}
                                  className={`flex h-10 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 ${selected
                                    ? "border-brand/40 bg-teal-50 text-brand-dark"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                >
                                  <SemanticIcon name={option.icon} className={`size-3.5 shrink-0 ${selected ? "text-brand" : "text-slate-400"}`} />
                                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                  {selected && <SemanticIcon name="check" className="size-3 shrink-0 text-brand" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                sideOffset={7}
                                className="z-[140] max-w-64 border border-slate-200 bg-white px-3 py-2 font-normal text-slate-800 shadow-lg"
                              >
                                <div className="font-normal">ทดสอบบริเวณ{option.label}</div>
                                <div className="mt-0.5 text-[10px] font-normal leading-4 text-slate-600">
                                  {option.description}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  </fieldset>
                </div>
              </section>

              {!formulaDetailsEditingId && (
                <section className="space-y-3.5 border-t border-slate-200 bg-white p-4 sm:p-5 md:border-l md:border-t-0">


                  <div className="block">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">รูปแบบสารเริ่มต้น</span>
                      <span className="text-[10px] font-normal text-slate-400">ไม่บังคับ</span>
                    </div>
                    <Popover open={starterFormulaMenuOpen} onOpenChange={setStarterFormulaMenuOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="เลือกรูปแบบสารเริ่มต้น"
                          aria-expanded={starterFormulaMenuOpen}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2.5 text-left outline-none transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:border-slate-300 focus-visible:ring-2 focus-visible:ring-slate-200"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                              <SemanticIcon
                                name={selectedDraftTemplate?.icon ?? "clipboard"}
                                className="size-3.5"
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-xs font-normal text-slate-800">
                                  {selectedDraftTemplate?.name ?? "สูตรเปล่า (กรอกเอง)"}
                                </span>
                                <ChevronDown
                                  className={`size-3.5 shrink-0 text-slate-400 transition-transform ${starterFormulaMenuOpen ? "rotate-180" : ""}`}
                                />
                              </div>
                            </div>
                          </div>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        sideOffset={6}
                        className="z-[140] w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-xl border-slate-200 p-0 shadow-xl"
                      >
                        <div className="border-b border-slate-100 px-3 py-2.5">
                          <p className="text-xs font-normal text-slate-800">เลือกรูปแบบสารเริ่มต้น</p>
                        </div>
                        <div className="max-h-80 space-y-1 overflow-y-auto p-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDraft((current) => ({ ...current, from: "blank" }));
                              setStarterFormulaMenuOpen(false);
                            }}
                            className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${draft.from === "blank"
                              ? "border-slate-200 bg-slate-50"
                              : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                              }`}
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                              <SemanticIcon name="clipboard" className="size-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-normal text-slate-800">สูตรเปล่า (กรอกเอง)</span>
                            </span>
                            {draft.from === "blank" && <SemanticIcon name="check" className="size-3.5 shrink-0 text-brand" />}
                          </button>

                          {PRODUCT_TEMPLATES.map((template) => {
                            const selected = draft.from === template.id;
                            return (
                              <button
                                key={template.id}
                                type="button"
                                onClick={() => {
                                  setDraft((current) => ({ ...current, from: template.id }));
                                  setStarterFormulaMenuOpen(false);
                                }}
                                className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors ${selected
                                  ? "border-slate-200 bg-slate-50"
                                  : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                                  }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                                    <SemanticIcon name={template.icon} className="size-3.5" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-normal text-slate-800">{template.name}</span>
                                  </span>
                                  {selected && <SemanticIcon name="check" className="size-3.5 shrink-0 text-brand" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>

                    {selectedDraftTemplate && (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold text-slate-700">สารในรูปแบบนี้</span>
                          <span className="text-[10px] text-slate-400">{selectedDraftTemplate.formula.length} รายการ</span>
                        </div>
                        <div className="space-y-1.5">
                          {selectedDraftTemplate.formula.map((item) => (
                            <div
                              key={`selected-${selectedDraftTemplate.id}-${item.smiles}`}
                              className="flex items-center justify-between gap-3 rounded-lg bg-white px-2.5 py-2"
                            >
                              <span className="min-w-0 truncate text-[11px] font-medium text-slate-700">{item.name}</span>
                              <span className="shrink-0 text-[11px] font-semibold text-brand">{item.concentration}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={closeFormulaEditor}
                className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                {formulaDetailsEditingId ? "บันทึกการแก้ไข" : "สร้างสูตร"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {manualSubstanceTargetFormulaId && (
        <ManualSubstanceModal
          name={manualSubstanceName}
          smiles={manualSubstanceSmiles}
          busy={manualSubstanceBusy}
          error={manualSubstanceError}
          suggestions={manualSubstanceSuggestions}
          suggestionsLoading={manualRegistryLoading}
          onNameChange={(value) => {
            setManualSubstanceName(value);
            setManualSubstanceError(null);
          }}
          onSmilesChange={(value) => {
            setManualSubstanceSmiles(value);
            setManualSubstanceError(null);
          }}
          onSelectSuggestion={chooseManualSubstanceSuggestion}
          onClose={closeManualSubstance}
          onSubmit={() => void submitManualSubstance()}
        />
      )}

      <SubstanceLibraryDrawer
        open={Boolean(libraryTargetFormulaId)}
        compact={isCompactWorkspace}
        mobile={isMobileWorkspace}
        formulaName={
          formulas.find((formulaItem) => formulaItem.id === libraryTargetFormulaId)?.name ?? "สูตร"
        }
        leftOffset={isCompactWorkspace ? NAVIGATION_SIDEBAR_WIDTH : NAVIGATION_SIDEBAR_WIDTH + leftSidebarWidth}
        selectedItems={
          formulas.find((formulaItem) => formulaItem.id === libraryTargetFormulaId)?.items ?? []
        }
        onClose={() => closeSubstanceLibrary(true)}
        onAdd={(item) => {
          if (!libraryTargetFormulaId) return;
          addFromCatalog(libraryTargetFormulaId, item);
        }}
        onRemove={(index) => {
          if (!libraryTargetFormulaId) return;
          removeFormulaItem(libraryTargetFormulaId, index);
        }}
      />

      <Sheet
        open={Boolean(compactFormulaSettingsId)}
        onOpenChange={(open) => {
          if (!open) setCompactFormulaSettingsId(null);
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="z-[100] bg-slate-950/30"
          className="z-[110] gap-0 rounded-t-2xl border-slate-200 bg-white p-0 shadow-2xl data-[state=closed]:duration-150 data-[state=open]:duration-150 sm:left-1/2 sm:max-w-md sm:-translate-x-1/2"
          aria-label="ตั้งค่าสูตร"
        >
          <SheetTitle className="sr-only">ตั้งค่าสูตร</SheetTitle>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" />
          <div className="border-b border-slate-100 px-4 pb-3 pt-2">
            <div className="text-sm font-semibold text-slate-800">ตั้งค่าสูตร</div>
            <div className="mt-0.5 truncate text-[11px] text-slate-400">
              {formulas.find((formulaItem) => formulaItem.id === compactFormulaSettingsId)?.name ?? "สูตร"}
            </div>
          </div>
          <div className="grid gap-1.5 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              onClick={() => {
                const targetFormula = formulas.find((formulaItem) => formulaItem.id === compactFormulaSettingsId);
                if (!targetFormula) return;
                setCompactFormulaSettingsId(null);
                selectFormula(targetFormula.id);
                openEditFormula(targetFormula);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <SemanticIcon name="pencil" className="size-4" />
              </span>
              แก้ไขสูตร
            </button>
            <button
              type="button"
              onClick={() => {
                const targetFormula = formulas.find((formulaItem) => formulaItem.id === compactFormulaSettingsId);
                if (!targetFormula) return;
                setCompactFormulaSettingsId(null);
                duplicateFormula(targetFormula);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <Copy className="size-4" />
              </span>
              คัดลอกและวาง
            </button>
            <button
              type="button"
              onClick={() => {
                const targetFormula = formulas.find((formulaItem) => formulaItem.id === compactFormulaSettingsId);
                if (!targetFormula) return;
                setCompactFormulaSettingsId(null);
                requestDeleteFormula(targetFormula);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-500">
                <SemanticIcon name="trash" className="size-4" />
              </span>
              ลบสูตร
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(formulaPendingDeletion)}
        onOpenChange={(open) => {
          if (!open) setFormulaPendingDeletion(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ลบสูตร “{formulaPendingDeletion?.name}” ใช่ไหม?
            </AlertDialogTitle>
            <AlertDialogDescription>
              สูตรนี้มีสาร {formulaPendingDeletion?.items.length ?? 0} รายการ ผลประเมิน รอยที่ทา
              และข้อมูลของสูตรนี้จะถูกลบทั้งหมด
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600"
              onClick={() => {
                if (!formulaPendingDeletion) return;
                deleteFormula(formulaPendingDeletion.id);
                setFormulaPendingDeletion(null);
              }}
            >
              <SemanticIcon name="trash" className="size-4" />
              ลบสูตร
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(paintPendingClearFormula)}
        onOpenChange={(open) => {
          if (!open) setPaintPendingClearFormula(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ลบรอยทาทั้งหมดของ “{paintPendingClearFormula?.name}” ใช่ไหม?
            </AlertDialogTitle>
            <AlertDialogDescription>
              ระบบจะลบรอยทาและการแสดงระคายเคืองตาของสูตรนี้ออกจากโมเดล โดยไม่ลบสูตร ผลประเมิน หรือรอยทาของสูตรอื่น
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600"
              onClick={() => {
                if (!paintPendingClearFormula || paintPendingClearFormula.id !== activeId) return;
                setEraseMode(false);
                setClearPaintRequest((request) => request + 1);
                setPaintPendingClearFormula(null);
              }}
            >
              <SemanticIcon name="trash" className="size-4" />
              ลบรอยทั้งหมด
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CsvImportModal open={csvOpen} onClose={closeCsvImport} onImport={importCsvItems} />
      <LabelScanModal open={scanOpen} onClose={closeLabelScan} onImport={importScannedItems} />
    </div>
  );
}

function AssessmentResultsPlaceholder({
  regionLabel,
  assessing,
}: {
  regionLabel: string;
  assessing: boolean;
}) {
  const groups = [
    {
      title: "ผลประเมิน",
      description: regionLabel,
      endpoints: ENDPOINTS,
    },
  ];
  const pendingLabel = assessing ? "กำลังประเมิน" : "รอประเมิน";

  return (
    <div className="space-y-3" aria-busy={assessing}>
      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-slate-800">{group.title}</div>
            {group.description && <div className="text-[10px] text-slate-400">{group.description}</div>}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {group.endpoints.map((endpoint, index) => (
              <div key={endpoint} className={`p-3.5 ${index > 0 ? "border-t border-slate-100" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 truncate text-xs font-semibold text-slate-800">{ENDPOINT_LABEL_TH[endpoint]}</div>
                  <div className="shrink-0 font-mono text-base font-semibold tabular-nums text-slate-500">--<span className="text-[10px] font-medium text-slate-400">/100</span></div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-[10px]">
                  <div className="min-w-0 truncate text-slate-500">ความน่าเชื่อถือของโมเดล --</div>
                  <div className="shrink-0 font-semibold text-slate-400">{pendingLabel}</div>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-slate-600"><SemanticIcon name="shield" className="size-4 shrink-0" /> ความน่าเชื่อถือ</div>
          <div className="mt-2 text-base font-semibold text-slate-500">--</div>
          <div className="mt-1 truncate whitespace-nowrap text-[10px] text-slate-400">รอผลประเมิน</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-slate-600"><SemanticIcon name="target" className="size-4 shrink-0" /> ครอบคลุมสูตร</div>
          <div className="mt-2 text-base font-semibold text-slate-500">--</div>
          <div className="mt-1 truncate whitespace-nowrap text-[10px] text-slate-400">--/-- รายการ</div>
        </div>
      </div>
    </div>
  );
}

function AnimatedScoreBar({ score, color }: { score: number; color: string }) {
  const targetScore = Math.max(0, Math.min(100, score));
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => setDisplayScore(targetScore));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [targetScore]);

  return (
    <div
      className="h-full rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none"
      style={{ width: `${displayScore}%`, backgroundColor: color }}
    />
  );
}

function SubstanceThumbnail({
  name,
  smiles,
  compact = false,
}: {
  name: string;
  smiles: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [smiles]);

  return (
    <span
      aria-hidden="true"
      title={name}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200/80 bg-white ${compact ? "size-8" : "size-10"}`}
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
          className={`size-full object-contain ${compact ? "p-0.5" : "p-1"}`}
        />
      ) : (
        <SemanticIcon name="flask" className={`${compact ? "size-3.5" : "size-4"} text-slate-400`} />
      )}
    </span>
  );
}

function SubstanceLibraryTrigger({
  onOpen,
  disabled = false,
}: {
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className={`group flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-l-lg border border-dashed bg-white px-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20 ${disabled
        ? "cursor-not-allowed border-slate-200 text-slate-300"
        : "border-brand/40 text-brand hover:border-brand hover:bg-teal-50"
        }`}
      aria-label={disabled ? "กำลังเปิดหน้าคลังสารเคมีทั้งหมด" : "เปิดคลังสาร"}
      aria-haspopup="dialog"
    >
      <Plus className="size-3.5 shrink-0" />
      <span className="truncate text-xs font-medium">เพิ่มสาร</span>
    </button>
  );
}

function SubstanceLibraryDrawer({
  open,
  compact,
  mobile,
  formulaName,
  leftOffset,
  selectedItems,
  onClose,
  onAdd,
  onRemove,
}: {
  open: boolean;
  compact: boolean;
  mobile: boolean;
  formulaName: string;
  leftOffset: number;
  selectedItems: FormulaItem[];
  onClose: () => void;
  onAdd: (item: CatalogItem) => void;
  onRemove: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [registryItems, setRegistryItems] = useState<IngredientRegistryItem[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [localSubstances, setLocalSubstances] = useState<LocalSubstance[]>([]);
  const [favoriteSubstanceKeys, setFavoriteSubstanceKeys] = useState<string[]>([]);
  const [visibleItemCount, setVisibleItemCount] = useState(SUBSTANCE_LIBRARY_PAGE_SIZE);
  const [detailOpen, setDetailOpen] = useState(false);
  const [compactCategorySheetOpen, setCompactCategorySheetOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCategory("all");
      setDetailOpen(false);
      setCompactCategorySheetOpen(false);
    }
    setVisibleItemCount(SUBSTANCE_LIBRARY_PAGE_SIZE);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    setLocalSubstances(loadLocalSubstances(storage));
    setFavoriteSubstanceKeys(loadFavoriteSubstanceKeys(storage));
  }, [open]);

  useEffect(() => {
    if (!open || registryItems.length) return;
    const controller = new AbortController();
    let alive = true;
    setRegistryLoading(true);

    const loadVerifiedRegistry = async () => {
      const collected: IngredientRegistryItem[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await api.listIngredientRegistry(
          "verified",
          pageSize,
          offset,
          controller.signal,
        );
        collected.push(...page);
        if (page.length < pageSize) break;
      }
      if (alive) setRegistryItems(collected);
    };

    loadVerifiedRegistry()
      .catch((cause) => {
        if (!alive || isAbortError(cause)) return;
      })
      .finally(() => {
        if (alive) setRegistryLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, registryItems.length]);

  const localFavoriteKeyBySmiles = useMemo(
    () => new Map(
      localSubstances.map((item) => [normalizedSmiles(item.smiles), localSubstanceKey(item.id)]),
    ),
    [localSubstances],
  );
  const favoriteSubstanceKeySet = useMemo(
    () => new Set(favoriteSubstanceKeys),
    [favoriteSubstanceKeys],
  );
  const favoriteKeyForItem = (item: CatalogItem) =>
    localFavoriteKeyBySmiles.get(normalizedSmiles(item.smiles)) ?? systemSubstanceKey(item.smiles);

  const libraryGroups = useMemo(() => {
    const systemGroups = catalogWithVerifiedRegistry(registryItems);
    const systemSmiles = new Set(
      systemGroups.flatMap((group) => group.items.map((item) => normalizedSmiles(item.smiles))),
    );
    const localItems: CatalogItem[] = localSubstances
      .filter((item) => !systemSmiles.has(normalizedSmiles(item.smiles)))
      .map((item) => ({ name: item.name, smiles: item.smiles, conc: 0 }));
    const favoriteItems: CatalogItem[] = [
      ...localItems.filter((item) => favoriteSubstanceKeySet.has(favoriteKeyForItem(item))),
      ...systemGroups.flatMap((group) =>
        group.items.filter((item) => favoriteSubstanceKeySet.has(systemSubstanceKey(item.smiles))),
      ),
    ];
    const remainingSystemGroups = systemGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !favoriteSubstanceKeySet.has(systemSubstanceKey(item.smiles))),
      }))
      .filter((group) => group.items.length > 0);

    return [
      ...(localItems.length
        ? [{ category: "สารที่เพิ่มเอง", icon: "pencil" as const, items: localItems }]
        : []),
      ...(favoriteItems.length
        ? [{ category: "รายการโปรด", icon: "star" as const, items: favoriteItems }]
        : []),
      ...remainingSystemGroups,
    ];
  }, [favoriteSubstanceKeySet, localSubstances, registryItems]);
  const selectedItemIndexBySmiles = useMemo(
    () =>
      new Map(
        selectedItems.map((item, index) => [item.smiles.trim().toLowerCase(), index]),
      ),
    [selectedItems],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const categories = useMemo(
    () => libraryGroups.map((group) => group.category),
    [libraryGroups],
  );
  const categoryIconByName = useMemo(
    () => new Map(libraryGroups.map((group) => [group.category, group.icon])),
    [libraryGroups],
  );
  const selectedCategoryIcon =
    category === "all" ? "beaker" : categoryIconByName.get(category) ?? "package";
  const filteredGroups = useMemo(
    () =>
      libraryGroups.filter((group) => category === "all" || group.category === category).map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.name} ${item.smiles} ${group.category}`.toLowerCase().includes(normalizedQuery),
        ),
      })).filter((group) => group.items.length > 0),
    [category, libraryGroups, normalizedQuery],
  );
  const resultCount = filteredGroups.reduce((total, group) => total + group.items.length, 0);
  const visibleEnd = Math.min(visibleItemCount, resultCount);
  const hasMoreItems = visibleEnd < resultCount;
  const visibleGroups = useMemo(() => {
    let groupStart = 0;

    return filteredGroups.flatMap((group) => {
      const groupEnd = groupStart + group.items.length;
      const sliceEnd = Math.min(group.items.length, visibleItemCount - groupStart);
      groupStart = groupEnd;

      if (sliceEnd <= 0) return [];
      const items = group.items.slice(0, sliceEnd);
      return items.length ? [{ ...group, items, totalItems: group.items.length }] : [];
    });
  }, [filteredGroups, visibleItemCount]);

  const toggleFavorite = (item: CatalogItem) => {
    const favoriteKey = favoriteKeyForItem(item);
    const isFavorite = favoriteSubstanceKeySet.has(favoriteKey);
    const nextKeys = isFavorite
      ? favoriteSubstanceKeys.filter((key) => key !== favoriteKey)
      : [favoriteKey, ...favoriteSubstanceKeys];
    try {
      saveFavoriteSubstanceKeys(window.localStorage, nextKeys);
      setFavoriteSubstanceKeys(nextKeys);
      setVisibleItemCount(SUBSTANCE_LIBRARY_PAGE_SIZE);
      if (isFavorite && !nextKeys.length && category === "รายการโปรด") setCategory("all");
      toast.success(
        isFavorite
          ? `นำ ${item.name} ออกจากรายการโปรดแล้ว`
          : `เพิ่ม ${item.name} ในรายการโปรดแล้ว`,
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "บันทึกรายการโปรดไม่สำเร็จ");
    }
  };

  return (
    <>
      <Sheet
        open={open}
        modal={compact || mobile}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
      >
        <SheetContent
          side="left"
          showCloseButton={false}
          overlayClassName={compact ? "z-[80] bg-slate-950/20" : "z-10 bg-transparent"}
          onInteractOutside={(event) => {
            if (detailOpen) event.preventDefault();
          }}
          aria-label="คลังสาร RalphGuard"
          className={mobile
            ? "z-[90] flex w-screen max-w-none flex-col gap-0 overflow-hidden border-0 bg-card p-0 shadow-none data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-none"
            : `${compact ? "z-[90]" : "z-20"} flex w-80 max-w-none flex-col gap-0 overflow-hidden border-r border-border bg-card p-0 pl-7 shadow-xl sm:max-w-none`}
          style={mobile
            ? {
              left: 0,
              top: 0,
              width: "100vw",
              height: "100dvh",
              maxWidth: "100vw",
              animationDuration: "0ms",
              transitionDuration: "0ms",
            }
            : {
              left: leftOffset - 28,
              top: 56,
              height: "calc(100vh - 56px)",
              maxWidth: `calc(100vw - ${leftOffset - 28}px)`,
              animationDuration: "180ms",
              transitionDuration: "180ms",
            }}
        >
          <SheetTitle className="sr-only">คลังสาร</SheetTitle>
          {mobile && (
            <div className="flex min-h-14 items-center gap-2 border-b border-border px-3">
              <button
                type="button"
                onClick={onClose}
                aria-label={`กลับไป${formulaName}`}
                className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">คลังสาร</div>
                <div className="truncate text-[10px] text-slate-400">เพิ่มสารลงใน {formulaName}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-slate-50/70 px-3 focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/10">
              <Search className="size-3.5 shrink-0 text-slate-400" />
              <input
                autoFocus={open}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleItemCount(SUBSTANCE_LIBRARY_PAGE_SIZE);
                }}
                placeholder="ค้นหา"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
              />
              {registryLoading && (
                <span aria-label="กำลังโหลดคลังสาร" className="size-2 shrink-0 animate-pulse rounded-full bg-brand" />
              )}
            </label>
            {compact ? (
              <button
                type="button"
                onClick={() => setCompactCategorySheetOpen(true)}
                aria-label={`กรองสารตามประเภท: ${category === "all" ? "ทุกประเภท" : category}`}
                title={category === "all" ? "ทุกประเภท" : category}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-brand outline-none transition-colors hover:border-brand/40 hover:bg-teal-50/40 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/10"
              >
                <SemanticIcon name={selectedCategoryIcon} className="size-3.5" />
              </button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`กรองสารตามประเภท: ${category === "all" ? "ทุกประเภท" : category}`}
                    title={category === "all" ? "ทุกประเภท" : category}
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-brand outline-none transition-colors hover:border-brand/40 hover:bg-teal-50/40 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/10"
                  >
                    <SemanticIcon name={selectedCategoryIcon} className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side={mobile ? "bottom" : "right"}
                  align={mobile ? "end" : "start"}
                  sideOffset={mobile ? 6 : 26}
                  collisionPadding={12}
                  className="z-[110] max-h-64 w-56 overflow-y-auto p-1.5"
                >
                  <DropdownMenuRadioGroup
                    value={category}
                    onValueChange={(value) => {
                      setCategory(value);
                      setVisibleItemCount(SUBSTANCE_LIBRARY_PAGE_SIZE);
                    }}
                  >
                    <DropdownMenuRadioItem
                      value="all"
                      className="gap-2 rounded-lg px-2 py-1.5 text-[11px] data-[state=checked]:bg-teal-50 data-[state=checked]:font-semibold data-[state=checked]:text-brand [&>span:first-child]:hidden"
                    >
                      <SemanticIcon name="beaker" className="size-3.5 shrink-0" />
                      <span className="truncate">ทุกประเภท</span>
                    </DropdownMenuRadioItem>
                    {categories.map((categoryName) => (
                      <DropdownMenuRadioItem
                        key={categoryName}
                        value={categoryName}
                        className="gap-2 rounded-lg px-2 py-1.5 text-[11px] data-[state=checked]:bg-teal-50 data-[state=checked]:font-semibold data-[state=checked]:text-brand [&>span:first-child]:hidden"
                      >
                        <SemanticIcon
                          name={categoryIconByName.get(categoryName) ?? "package"}
                          className="size-3.5 shrink-0"
                        />
                        <span className="truncate">{categoryName}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div
            aria-busy={registryLoading}
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onScroll={(event) => {
              const viewport = event.currentTarget;
              const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 180;
              if (nearBottom && hasMoreItems) {
                setVisibleItemCount((count) =>
                  Math.min(count + SUBSTANCE_LIBRARY_PAGE_SIZE, resultCount),
                );
              }
            }}
          >
            {visibleGroups.length ? (
              <>
                {visibleGroups.map((group) => (
                  <section key={group.category} className="mb-2 last:mb-0">
                    <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-white/95 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur">
                      <SemanticIcon name={group.icon} className="size-3.5" />
                      <span>{group.category}</span>
                      <span className="ml-auto font-normal tabular-nums">{group.totalItems}</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => {
                        const selectedIndex =
                          selectedItemIndexBySmiles.get(item.smiles.trim().toLowerCase()) ?? -1;
                        const alreadySelected = selectedIndex >= 0;
                        const displayedConcentration = alreadySelected
                          ? selectedItems[selectedIndex].concentration
                          : item.conc;
                        const favorite = favoriteSubstanceKeySet.has(favoriteKeyForItem(item));
                        return (
                          <SubstanceHoverCard
                            key={`${group.category}-${item.smiles}`}
                            name={item.name}
                            smiles={item.smiles}
                            openOnContextMenu
                            contextMenuOnly
                            onOpenChange={setDetailOpen}
                            className="block"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              aria-pressed={alreadySelected}
                              aria-label={alreadySelected ? `ลบ ${item.name} ออกจากสูตร` : `เพิ่ม ${item.name} เข้าสูตร`}
                              title="คลิกซ้ายเพื่อเพิ่มหรือลบ · คลิกขวาเพื่อดูรายละเอียด"
                              onClick={() => {
                                if (alreadySelected) onRemove(selectedIndex);
                                else onAdd(item);
                              }}
                              onKeyDown={(event) => {
                                if ((event.target as HTMLElement).closest("[data-substance-action]")) return;
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                if (alreadySelected) onRemove(selectedIndex);
                                else onAdd(item);
                              }}
                              className={`group flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 ${alreadySelected
                                ? "border-brand/50 bg-teal-50 ring-1 ring-brand/10"
                                : "border-slate-200 bg-slate-50/70 hover:border-brand/30 hover:bg-teal-50/60"
                                }`}
                            >
                              <SubstanceThumbnail name={item.name} smiles={item.smiles} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-slate-800">
                                  {item.name}
                                </span>
                                <span className="mt-1 block truncate font-sans text-[9px] text-slate-500">
                                  {item.smiles}
                                </span>
                              </span>
                              <button
                                type="button"
                                data-substance-action
                                aria-label={favorite ? `นำ ${item.name} ออกจากรายการโปรด` : `เพิ่ม ${item.name} ในรายการโปรด`}
                                title={favorite ? "นำออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
                                aria-pressed={favorite}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleFavorite(item);
                                }}
                                className={`group/star grid size-7 shrink-0 place-items-center bg-transparent p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${favorite
                                  ? "text-amber-500 opacity-100"
                                  : "text-slate-400 opacity-0 group-hover:opacity-100 hover:text-amber-500 focus-visible:opacity-100 focus-visible:text-amber-500"
                                  }`}
                              >
                                <SemanticIcon
                                  name="star"
                                  className={`size-3.5 transition-colors ${favorite ? "fill-current" : "fill-none group-hover/star:fill-current"}`}
                                />
                              </button>
                              <span className={`min-w-9 shrink-0 text-right text-xs font-semibold tabular-nums ${alreadySelected
                                ? "text-brand"
                                : "text-slate-600"
                                }`}
                              >
                                {displayedConcentration}%
                              </span>
                            </div>
                          </SubstanceHoverCard>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </>
            ) : (
              <div className="grid place-items-center px-4 py-10 text-center">
                <span className="grid size-10 place-items-center rounded-full bg-slate-50 text-slate-300">⌕</span>
                <div className="mt-2 text-xs font-medium text-slate-600">ไม่พบสารที่ค้นหา</div>
                <div className="mt-1 text-[10px] text-slate-400">ลองค้นด้วยชื่อ INCI หรือ SMILES อื่น</div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={open && compact && compactCategorySheetOpen}
        onOpenChange={(nextOpen) => setCompactCategorySheetOpen(nextOpen)}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="z-[100] bg-slate-950/30"
          className="z-[110] flex max-h-[70dvh] flex-col gap-0 rounded-t-2xl border-slate-200 bg-white p-0 shadow-2xl data-[state=closed]:duration-150 data-[state=open]:duration-150 sm:left-1/2 sm:max-w-md sm:-translate-x-1/2"
          aria-label="เลือกประเภทสาร"
        >
          <SheetTitle className="sr-only">เลือกประเภทสาร</SheetTitle>
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200" />
          <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-2">
            <div className="text-sm font-semibold text-slate-800">ประเภทสาร</div>
            <div className="mt-0.5 text-[11px] text-slate-400">เลือกประเภทที่ต้องการแสดง</div>
          </div>
          <div className="assess-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              onClick={() => {
                setCategory("all");
                setVisibleItemCount(SUBSTANCE_LIBRARY_PAGE_SIZE);
                setCompactCategorySheetOpen(false);
              }}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${category === "all" ? "bg-teal-50 font-semibold text-brand" : "text-slate-700 hover:bg-slate-100"}`}
            >
              <SemanticIcon name="beaker" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">ทุกประเภท</span>
              {category === "all" && <SemanticIcon name="check" className="size-4 shrink-0" />}
            </button>
            {categories.map((categoryName) => {
              const selected = category === categoryName;
              return (
                <button
                  key={categoryName}
                  type="button"
                  onClick={() => {
                    setCategory(categoryName);
                    setVisibleItemCount(SUBSTANCE_LIBRARY_PAGE_SIZE);
                    setCompactCategorySheetOpen(false);
                  }}
                  className={`mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 ${selected ? "bg-teal-50 font-semibold text-brand" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  <SemanticIcon
                    name={categoryIconByName.get(categoryName) ?? "package"}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{categoryName}</span>
                  {selected && <SemanticIcon name="check" className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({
  title,
  children,
  action,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-b border-slate-200 px-4 py-3 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
          {title && (
            <div
              className={
                action
                  ? "text-sm font-semibold text-slate-900"
                  : "text-[11px] font-semibold uppercase tracking-wide text-slate-800/40"
              }
            >
              {title}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Viewport({
  paintOwnerKey,
  initialPaint,
  occupiedPaint,
  onPaintChange,
  onPaintBlocked,
  region,
  paintReady,
  resultReady,
  productName,
  activeFormulaName,
  layers,
  eraseMode,
  brushSizePct,
  brushSizeControlPct,
  onBrushSizeControlChange,
  clearPaintRequest,
  active,
}: {
  paintOwnerKey: string;
  initialPaint: PaintMaskSnapshot | null;
  occupiedPaint: PaintMaskSnapshot[];
  onPaintChange: (snapshot: PaintMaskSnapshot) => void;
  onPaintBlocked: () => void;
  region: Region;
  paintReady: boolean;
  resultReady: boolean;
  productName: string;
  activeFormulaName?: string;
  layers: { key: string; label: string; score: number; color: string; band: string }[];
  eraseMode: boolean;
  brushSizePct: number;
  brushSizeControlPct: number;
  onBrushSizeControlChange: (size: number) => void;
  clearPaintRequest: number;
  active: boolean;
}) {
  const interactionRef = useRef<HTMLDivElement>(null);
  const brushFeedbackRef = useRef<HTMLSpanElement>(null);
  const latestBrushPointerRef = useRef<{ x: number; y: number } | null>(null);
  const brushPreviewActiveRef = useRef(false);
  const brushFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brushPreviewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const changeBrushSize = (event: WheelEvent) => {
      if (!event.ctrlKey || !paintReady) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY < 0 ? 1 : -1;
      const normalizedDelta = Math.abs(event.deltaY) *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? 100
            : 1);
      const changeAmount = Math.min(
        PAINT_BRUSH_CONTROL_MAX_STEP,
        Math.max(1, Math.ceil(normalizedDelta / 12)),
      );
      const nextControlPercent = Math.min(
        PAINT_BRUSH_CONTROL_MAX,
        Math.max(
          PAINT_BRUSH_CONTROL_MIN,
          brushSizeControlPct + direction * changeAmount,
        ),
      );
      if (nextControlPercent !== brushSizeControlPct) {
        onBrushSizeControlChange(nextControlPercent);
      }
      const pointer = latestBrushPointerRef.current;
      if (pointer && brushFeedbackRef.current) {
        brushPreviewActiveRef.current = true;
        brushFeedbackRef.current.textContent = `หัวทา ${nextControlPercent}%`;
        brushFeedbackRef.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y + 14}px, 0) translateX(-50%)`;
        brushFeedbackRef.current.style.opacity = "1";
      }
      if (brushFeedbackTimerRef.current) clearTimeout(brushFeedbackTimerRef.current);
      if (brushPreviewHideTimerRef.current) clearTimeout(brushPreviewHideTimerRef.current);
      brushFeedbackTimerRef.current = setTimeout(() => {
        if (brushFeedbackRef.current) brushFeedbackRef.current.style.opacity = "0";
      }, 650);
      brushPreviewHideTimerRef.current = setTimeout(() => {
        brushPreviewActiveRef.current = false;
      }, 1150);
    };
    interaction.addEventListener("wheel", changeBrushSize, { passive: false, capture: true });
    return () => interaction.removeEventListener("wheel", changeBrushSize, true);
  }, [brushSizeControlPct, onBrushSizeControlChange, paintReady]);

  useEffect(
    () => () => {
      if (brushFeedbackTimerRef.current) clearTimeout(brushFeedbackTimerRef.current);
      if (brushPreviewHideTimerRef.current) clearTimeout(brushPreviewHideTimerRef.current);
    },
    [],
  );

  return (
    <div
      aria-hidden={!active}
      // React 18 expects inert to be serialized, while its typings still model a boolean.
      inert={!active ? ("true" as unknown as boolean) : undefined}
      className="assess-viewport relative order-2 min-h-0 min-w-0 flex-1"
    >
      <div className="relative h-full w-full">
        <div className="absolute left-4 top-4 z-10 flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-2.5 shadow-sm backdrop-blur">
          <span className={`grid size-6 shrink-0 place-items-center rounded-lg ${activeFormulaName ? "bg-teal-50 text-brand" : "bg-slate-100 text-slate-400"}`}>
            <SemanticIcon
              name={activeFormulaName ? FORMULA_REGION_OPTIONS.find((option) => option.value === region)?.icon ?? "scan" : "flask"}
              className="size-3.5"
            />
          </span>
          <span className="max-w-52 truncate text-[11px] font-semibold text-slate-700">
            {activeFormulaName ? `เลือกสูตร ${activeFormulaName} อยู่` : "ยังไม่ได้เลือกสูตร"}
          </span>
        </div>
        <div
          ref={interactionRef}
          className={`absolute inset-0 ${paintReady ? "cursor-crosshair" : ""}`}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const pointer = {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            };
            latestBrushPointerRef.current = pointer;
            if (!brushPreviewActiveRef.current || !brushFeedbackRef.current) return;
            brushFeedbackRef.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y + 14}px, 0) translateX(-50%)`;
          }}
          onPointerLeave={() => {
            brushPreviewActiveRef.current = false;
            latestBrushPointerRef.current = null;
            if (brushFeedbackRef.current) brushFeedbackRef.current.style.opacity = "0";
          }}
        >
          <FaceView
            paintOwnerKey={paintOwnerKey}
            layers={layers}
            armed={paintReady}
            revealResults={resultReady}
            productName={productName}
            eraseMode={eraseMode}
            brushSizePct={brushSizePct}
            clearPaintRequest={clearPaintRequest}
            background="#F8FAFC"
            initialPaint={initialPaint}
            onPaintChange={onPaintChange}
            occupiedPaint={occupiedPaint}
            onPaintBlocked={onPaintBlocked}
            paused={!active}
          />
          {paintReady && (
            <span
              ref={brushFeedbackRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 z-20 whitespace-nowrap rounded-md bg-slate-900/85 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity duration-500"
            >
              หัวทา {brushSizeControlPct}%
            </span>
          )}
        </div>
        {/* Risk legend */}
        {resultReady && (
          <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] backdrop-blur">
            {(["low", "moderate", "high", "severe"] as const).map((b) => (
              <span key={b} className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: BAND_HEX[b] }} />
                {BAND_LABEL[b]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrustReport() {
  const [metrics, setMetrics] = useState<ModelMetricsPayload | null>(null);
  const [info, setInfo] = useState<ModelInfoPayload | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api.getModelMetrics(controller.signal).then(setMetrics).catch((cause) => {
      if (!isAbortError(cause)) logRequestFailure("load trust metrics", cause);
    });
    api.getModelInfo(controller.signal).then(setInfo).catch((cause) => {
      if (!isAbortError(cause)) logRequestFailure("load trust model info", cause);
    });
    return () => controller.abort();
  }, []);
  const pct = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(2));

  return (
    <div className="absolute inset-0 overflow-x-hidden overflow-y-auto p-3 sm:p-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-8">
        <h1 className="font-display text-xl font-bold sm:text-2xl">ความน่าเชื่อถือของโมเดล</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-800/60 sm:text-sm">
          ทุกการทำนายมาพร้อมตัวชี้วัดประสิทธิภาพ ความไม่แน่นอน และขอบเขตการใช้งาน (Applicability Domain) ตามหลัก OECD สำหรับ QSAR
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 sm:mt-6">
          <table className="w-full table-fixed text-xs sm:text-sm">
            <colgroup>
              <col className="w-[38%] sm:w-auto" />
              <col className="w-[15.5%] sm:w-auto" />
              <col className="w-[15.5%] sm:w-auto" />
              <col className="w-[15.5%] sm:w-auto" />
              <col className="w-[15.5%] sm:w-auto" />
            </colgroup>
            <thead className="bg-slate-100 text-[9px] text-slate-800/55 sm:text-xs">
              <tr>
                <th className="px-2 py-2.5 text-left sm:px-4">Endpoint</th>
                <th className="px-1 py-2.5 text-center sm:px-4">AUC</th>
                <th className="px-1 py-2.5 text-center sm:px-4">
                  <span className="sm:hidden">Bal.<br />Acc</span>
                  <span className="hidden sm:inline">Balanced Acc</span>
                </th>
                <th className="px-1 py-2.5 text-center sm:px-4">
                  <span className="sm:hidden">Sens.</span>
                  <span className="hidden sm:inline">Sensitivity</span>
                </th>
                <th className="px-1 py-2.5 text-center sm:px-4">
                  <span className="sm:hidden">Spec.</span>
                  <span className="hidden sm:inline">Specificity</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics?.endpoints.map((m: EndpointMetric) => (
                <tr key={m.endpoint} className="border-t border-slate-200">
                  <td className="px-2 py-3 sm:px-4">
                    <span className="block break-words font-medium leading-snug">{m.label_th}</span>{" "}
                    <span className="font-mono text-[9px] text-slate-800/40 sm:text-xs">{m.endpoint}</span>
                    {m.endpoint === "eye" && (
                      <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[8px] font-semibold text-amber-700 sm:ml-1.5 sm:px-1.5 sm:text-[9px]">preliminary</span>
                    )}
                    {m.metrics && (
                      <div className="mt-0.5 text-[9px] text-slate-400">
                        n={(m.metrics.n_pos ?? 0) + (m.metrics.n_neg ?? 0) || "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-1 py-3 text-center font-mono font-semibold tabular-nums text-brand sm:px-4">{pct(m.metrics?.auc)}</td>
                  <td className="px-1 py-3 text-center font-mono tabular-nums sm:px-4">{pct(m.metrics?.balanced_accuracy)}</td>
                  <td className="px-1 py-3 text-center font-mono tabular-nums sm:px-4">{pct(m.metrics?.sensitivity)}</td>
                  <td className="px-1 py-3 text-center font-mono tabular-nums sm:px-4">{pct(m.metrics?.specificity)}</td>
                </tr>
              ))}
              {!metrics?.endpoints?.length && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-800/40">ยังไม่มีข้อมูล (รัน data_prep.py)</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {metrics?.note_th && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800">
            <b>ขอบเขตของตัวเลข:</b> {metrics.note_th}
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-2 font-semibold">สัญญาณความเชื่อมั่น</h3>
            <ul className="space-y-1.5 text-xs text-slate-800/70">
              <li><b>1 · Domain</b> — ระยะห่างจากชุดฝึก (in/out-of-domain)</li>
              <li><b>2 · Model score</b> — ความห่างจาก operating threshold</li>
              <li><b>3 · Structural alert</b> — ความสอดคล้องกับกฎ SMARTS</li>
              <li><b>4 · Ensemble</b> — ความเห็นต่างระหว่างสมาชิกโมเดล</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-2 font-semibold">มาตรฐาน OECD</h3>
            <p className="text-xs leading-relaxed text-slate-800/70">
              Endpoint ชัดเจน · อัลกอริทึมโปร่งใส · Applicability Domain · Goodness-of-fit &amp; robustness · การตีความเชิงกลไก
            </p>
          </div>
        </div>

        {info?.methodology?.limitations && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-2 text-sm font-semibold">ข้อจำกัดที่เปิดเผย</h3>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
              {info.methodology.limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-brand/20 bg-teal-50/40 px-4 py-3 text-xs text-slate-800/70">
          โมเดลนี้เป็นเครื่องมือ <b>คัดกรอง</b> เพื่อจัดลำดับความเสี่ยงในระยะต้น ไม่ใช่การทดแทนการทดสอบตามข้อกำหนดหรือการประเมินโดยผู้เชี่ยวชาญ
          {info?.disclaimer_th ? "" : ""}
        </div>
      </div>
    </div>
  );
}
