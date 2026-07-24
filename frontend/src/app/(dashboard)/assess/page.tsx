"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ChevronDown, Eraser, FileUp, House, Search } from "lucide-react";
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
import LabelScanModal, { type ScanImportContext } from "@/components/LabelScanModal";
import SubstanceHoverCard from "@/components/SubstanceHoverCard";
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
import { assessmentStartProblem } from "@/lib/assessment-preconditions";
import {
  assessmentPollDelay,
  assessmentPollExpired,
  assessmentPollResponseIsCurrent,
} from "@/lib/assessment-polling";
import {
  assertNoDuplicateFormulaRows,
  parseFormulaCsv,
  type ParsedFormulaCsvRow,
} from "@/lib/formula-csv";
import {
  describeOcrSkippedItems,
  prepareOcrFormulaReplacement,
} from "@/lib/formula-ocr";
import { formulaGraphItemsSignature } from "@/lib/formula-graph";
import { parseProjectRouteId } from "@/lib/project-routing";
import { isAbortError, logRequestFailure } from "@/lib/request-reliability";
import {
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

const REGIONS: { value: Region; label: string; icon: SemanticIconName }[] = [
  { value: "forearm", label: "ท่อนแขน", icon: "muscle" },
  { value: "hand", label: "มือ", icon: "hand" },
  { value: "face", label: "ใบหน้า", icon: "scan" },
  { value: "eye", label: "ดวงตา", icon: "eye" },
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
  acute: "พิษเฉียบพลัน",
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

// ประเภทที่ปกติต้องมีน้ำเป็นเบส — ใช้เตือนเมื่อสัดส่วนสารเต็ม 100% จนไม่เหลือที่ให้น้ำ
const WATER_BASED_TYPES = new Set([
  "โทนเนอร์",
  "เซรั่ม / เอสเซนส์",
  "ครีม / โลชั่น",
  "เจล / โฟมล้าง",
  "สเปรย์ / มิสต์",
  "ครีมกันแดด",
]);

export default function StudioPage() {
  const router = useRouter();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [project, setProject] = useState<ProjectOut | null>(null);
  const [projectContextStatus, setProjectContextStatus] = useState<"loading" | "ready" | "standalone">("loading");
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("assess");
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateRisk, setTemplateRisk] = useState<"all" | "low" | "mid" | "high">("all");
  const [eraseMode, setEraseMode] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [formulaPanelOpen, setFormulaPanelOpen] = useState(false);
  const [formulas, setFormulas] = useState<WorkspaceFormula[]>([
    { id: "f1", name: "สูตร A", type: "ครีม / โลชั่น", region: "face", items: [] },
  ]);
  const [activeId, setActiveId] = useState("f1");
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formulaPendingDeletion, setFormulaPendingDeletion] = useState<WorkspaceFormula | null>(null);
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
  const activeFormula = formulas.find((f) => f.id === activeId) ?? formulas[0];
  const formula = activeFormula?.items ?? [];

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
  const [region, setRegion] = useState<Region>("face");
  const [dayIdx, setDayIdx] = useState(1);
  const [assessmentByFormulaId, setAssessmentByFormulaId] = useState<
    Record<string, FormulaAssessmentSnapshot>
  >({});
  const [paintByFormulaId, setPaintByFormulaId] = useState<
    Record<string, PaintMaskSnapshot>
  >({});
  const [graphByFormulaId, setGraphByFormulaId] = useState<
    Record<string, FormulaGraphSnapshot>
  >({});
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
          // Always start with the formula panel closed when entering a project.
          setFormulaPanelOpen(false);
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
      formulaPanelOpen,
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
      formulaPanelOpen,
      assessmentByFormulaId,
      paintByFormulaId,
      graphByFormulaId,
    ],
  );
  const latestWorkspaceDraft = useRef(workspaceDraft);
  latestWorkspaceDraft.current = workspaceDraft;

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

  // Water base = balance to 100% (formula stores actives only).
  const waterPct = Math.max(
    0,
    Math.round((100 - formula.reduce((s, it) => s + (Number(it.concentration) || 0), 0)) * 10) / 10,
  );
  // ประเภทต้องมีน้ำ แต่สารเต็ม 100% จนไม่เหลือที่ให้น้ำ → เตือน
  const waterMissing = WATER_BASED_TYPES.has(activeFormula?.type || "") && waterPct <= 0;

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
  const modelReady = completed || developerTestEnabled;
  const modelLayers = developerTestEnabled ? developerTestLayers : paintLayers;

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

  const patchItem = (i: number, p: Partial<FormulaItem>) => {
    if (p.smiles !== undefined || p.concentration !== undefined) {
      invalidateFormulaAssessment(activeId);
    }
    setFormula((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  };
  const removeItem = (i: number) => {
    invalidateFormulaAssessment(activeId);
    setFormula((prev) => prev.filter((_, idx) => idx !== i));
  };
  const addItem = () => {
    const addedIndex = formula.length;
    invalidateFormulaAssessment(activeId);
    setFormula((prev) => [...prev, { name: "", smiles: "", concentration: 10 }]);
    setRecentlyAddedIngredient({ formulaId: activeId, index: addedIndex });
  };

  // Create / select saved formulas
  const openCreate = () => {
    setDraft({
      name: "สูตร " + String.fromCharCode(64 + Math.min(26, formulas.length + 1)),
      type: "ครีม / โลชั่น",
      region: "face",
      from: "blank",
    });
    setShowCreate(true);
  };
  const createFormula = () => {
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
    setFormulas((prev) => [...prev, { id, name: draft.name.trim() || "สูตรใหม่", type: draft.type, region: reg, items }]);
    setActiveId(id);
    setRecentlyCreatedFormulaId(id);
    setRegion(reg);
    setShowCreate(false);
  };
  // Save the current node graph as a brand-new formula (from node mode).
  const saveGraphAsFormula = (items: FormulaItem[]) => {
    const actives = items.filter((it) => it.smiles.trim() && !isWaterItem(it));
    if (!actives.length) return;
    const id = "f" + Date.now();
    const n = formulas.filter((f) => (f.type || "").includes("Node")).length + 1;
    setFormulas((prev) => [...prev, { id, name: `สูตรจาก Node ${n}`, type: "จาก Node graph", region, items: actives }]);
    setActiveId(id);
    setRecentlyCreatedFormulaId(id);
  };
  const syncFormulaFromGraph = (formulaId: string, items: FormulaItem[]) => {
    const current = latestWorkspaceDraft.current.formulas.find(
      (formula) => formula.id === formulaId,
    );
    if (!current) return;
    if (formulaGraphItemsSignature(current.items) === formulaGraphItemsSignature(items)) {
      return;
    }
    invalidateFormulaAssessment(formulaId);
    setFormulas((previous) =>
      previous.map((formula) =>
        formula.id === formulaId ? { ...formula, items } : formula,
      ),
    );
  };
  const selectFormula = (id: string) => {
    const selected = formulas.find((item) => item.id === id);
    setActiveId(id);
    if (selected) setRegion(selected.region);
    // Selecting a formula should immediately reveal its ingredients. The
    // viewport arrow remains available as an independent open/close control.
    setFormulaPanelOpen(true);
    setError(null);
  };
  const renameFormula = (id: string, name: string) =>
    setFormulas((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  const deleteFormula = (id: string) => {
    if (formulas.length <= 1) return; // keep at least one
    const next = formulas.filter((f) => f.id !== id);
    setFormulas(next);
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
      setActiveId(next[0].id);
    }
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
  const addFromCatalog = (it: CatalogItem) => {
    const addedIndex = formula.length;
    invalidateFormulaAssessment(activeId);
    setFormula((prev) => [...prev, { name: it.name, smiles: it.smiles, concentration: it.conc }]);
    setRecentlyAddedIngredient({ formulaId: activeId, index: addedIndex });
  };

  // OCR: read an ingredient-label photo (via the LabelScanModal popup).
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTargetFormulaId, setScanTargetFormulaId] = useState<string | null>(null);
  const [scanTargetProjectId, setScanTargetProjectId] = useState<number | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvStatus, setCsvStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const openLabelScan = () => {
    setScanTargetFormulaId(activeId);
    setScanTargetProjectId(projectId);
    setScanOpen(true);
  };
  const closeLabelScan = () => {
    setScanOpen(false);
    setScanTargetFormulaId(null);
    setScanTargetProjectId(null);
  };
  useEffect(() => {
    if (scanOpen && scanTargetProjectId !== projectId) {
      setScanOpen(false);
      setScanTargetFormulaId(null);
      setScanTargetProjectId(null);
    }
  }, [projectId, scanOpen, scanTargetProjectId]);
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

      const unresolved = context.recognizedNoStructure.map((name) => `${name} (ไม่มี SMILES)`);
      const unselected = context.unselected.map((name) => `${name} (ไม่ได้เลือก)`);
      const unmatched = context.unmatched.map((name) => `${name} (จับคู่ไม่ได้)`);
      const skipped = describeOcrSkippedItems(prepared.skipped);
      const notImported = [skipped, ...unresolved, ...unselected, ...unmatched].filter(Boolean);
      toast.success(`นำเข้า ${prepared.items.length} สารแล้ว`, {
        description: notImported.length
          ? `ไม่ได้นำเข้า: ${notImported.join(", ")}`
          : "แทนที่รายการเดิมในกล่องสูตรที่เริ่มสแกน",
      });
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

  const importCsvFile = async (file: File) => {
    const targetFormulaId = activeId;
    setCsvBusy(true);
    setCsvStatus(null);
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("กรุณาเลือกไฟล์นามสกุล .csv");
      }
      const parsed = parseFormulaCsv(await file.text());
      const resolved = parsed.map((row) => {
        const catalogHit = row.name ? resolveCatalogSubstance(row.name) : undefined;
        return {
          ...row,
          name: catalogHit?.name || row.name,
          smiles: row.smiles || catalogHit?.smiles || "",
          suppliedSmiles: row.smiles,
        };
      });

      const validated = await Promise.all(
        resolved.map(async (item) => {
          if (!item.suppliedSmiles) return item;
          const result = await api.validateSmiles(item.suppliedSmiles);
          if (!result.valid) throw new Error(`แถว ${item.line}: SMILES ของ ${item.name || "สาร"} ไม่ถูกต้อง`);
          return { ...item, smiles: result.canonical || item.suppliedSmiles };
        }),
      );
      const normalizedRows: ParsedFormulaCsvRow[] = validated.map(
        ({ line, name, smiles, concentration }) => ({
          line,
          name,
          smiles,
          concentration,
        }),
      );
      // Resolve catalog names and canonicalize supplied SMILES first, then run
      // duplicate detection again to catch aliases such as Ethanol vs CCO.
      assertNoDuplicateFormulaRows(normalizedRows);
      const imported: FormulaItem[] = normalizedRows
        .map(({ name, smiles, concentration }) => ({ name, smiles, concentration }))
        .filter((item) => !isWaterItem(item));
      if (!imported.length) {
        throw new Error("CSV ต้องมีสารอย่างน้อย 1 รายการที่ไม่ใช่น้ำ");
      }
      if (!latestWorkspaceDraft.current.formulas.some((item) => item.id === targetFormulaId)) {
        throw new Error("กล่องสูตรที่เลือกถูกลบระหว่างนำเข้า กรุณาเลือกกล่องใหม่");
      }

      invalidateFormulaAssessment(targetFormulaId);
      // CSV import is an explicit replace operation for the formula that was
      // selected when the upload began. It never leaks into a later selection.
      setFormulas((previous) =>
        previous.map((item) =>
          item.id === targetFormulaId ? { ...item, items: imported } : item,
        ),
      );
      setError(null);
      const unresolved = imported.filter((item) => !item.smiles).length;
      setCsvStatus({
        tone: "ok",
        text: unresolved
          ? `นำเข้า ${imported.length} สารแล้ว · ${unresolved} สารยังไม่มีโครงสร้างและจะไม่ถูกส่งเข้า QSAR`
          : `นำเข้า ${imported.length} สารจาก ${file.name} แล้ว`,
      });
    } catch (cause) {
      setCsvStatus({ tone: "error", text: cause instanceof Error ? cause.message : "นำเข้า CSV ไม่สำเร็จ" });
    } finally {
      setCsvBusy(false);
    }
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

  // Build a real, data-filled PDF report from a template (not a screenshot) and
  // print it via a hidden iframe → the user picks "Save as PDF".
  const exportPdf = () => {
    const esc = (s: unknown) =>
      String(s ?? "").replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
    const regionLabel = REGIONS.find((r) => r.value === region)?.label ?? region;
    const items = withWaterBase(
      formula.filter((it) => it.smiles.trim() && it.concentration > 0 && !isWaterItem(it)),
    );
    const eps = endpoints as Record<string, { peak_score?: number; timecourse?: number[] }> | null;
    const scoreAt = (ep: string, d: number) =>
      Math.round((eps?.[ep]?.timecourse?.[d] ?? eps?.[ep]?.peak_score ?? 0) as number);
    const now = new Date();
    const dateStr = now.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });

    const ingredientRows = items
      .map(
        (it) =>
          `<tr><td>${esc(it.name || "-")}</td><td class="mono">${esc(it.smiles)}</td><td class="num">${it.concentration}%</td></tr>`,
      )
      .join("");

    let resultBlock: string;
    let noteBlock = "";
    if (completed && eps) {
      resultBlock = `<table class="tbl">
        <thead><tr><th style="text-align:left">ปลายทางความเสี่ยง</th><th>Day 1</th><th>Day 3</th><th>Day 7</th></tr></thead>
        <tbody>${ENDPOINTS.map((ep) => {
          const cells = [0, 1, 2]
            .map((d) => {
              const sc = scoreAt(ep, d);
              const b = bandOf(sc);
              return `<td class="num"><span class="pill" style="background:${BAND_HEX[b]}">${sc} · ${BAND_LABEL[b]}</span></td>`;
            })
            .join("");
          return `<tr><td>${ENDPOINT_LABEL_TH[ep]}</td>${cells}</tr>`;
        }).join("")}</tbody></table>`;
      const top = ENDPOINTS.map((ep) => ({ label: ENDPOINT_LABEL_TH[ep], sc: scoreAt(ep, dayIdx) })).sort(
        (a, b) => b.sc - a.sc,
      )[0];
      const b = bandOf(top.sc);
      noteBlock = `<div class="note"><b>ข้อสังเกต:</b> ความเสี่ยงเด่นที่สุด (Day ${DAY_LABELS[dayIdx]}) คือ “${esc(top.label)}” ที่ ${top.sc}/100 (ระดับ${BAND_LABEL[b]})${
        top.sc >= 50 ? " — ควรทบทวน/ลดความเข้มข้นของสารหลักก่อนพัฒนาต่อ" : " — อยู่ในเกณฑ์ที่จัดการได้"
      }</div>`;
    } else {
      resultBlock = `<p class="muted">ยังไม่ได้กด Run ประเมิน — รายงานนี้แสดงเฉพาะข้อมูลสูตร</p>`;
    }

    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>RalphGuard — รายงานการประเมิน</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:'LINE Seed Sans TH','Sarabun','Segoe UI',system-ui,sans-serif; color:#0F1C1E; font-size:12px; line-height:1.5; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #0D9488; padding-bottom:10px; }
  .brand { display:flex; align-items:center; gap:8px; }
  .logo { width:30px; height:30px; border-radius:7px; display:block; object-fit:contain; }
  .brand b { font-size:18px; }
  .brand span { display:block; font-size:10px; color:#5b7075; }
  .date { font-size:10px; color:#5b7075; text-align:right; }
  h2 { font-size:13px; color:#0D9488; margin:20px 0 8px; border-left:4px solid #2DD4BF; padding-left:8px; }
  .meta { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:14px; }
  .meta div { background:#F0FaF9; border:1px solid #d7ebe8; border-radius:8px; padding:8px 10px; }
  .meta .k { font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#6b8085; }
  .meta .v { font-size:13px; font-weight:600; margin-top:2px; }
  table.tbl { width:100%; border-collapse:collapse; }
  table.tbl th, table.tbl td { border:1px solid #e2e8ea; padding:6px 8px; font-size:11.5px; }
  table.tbl th { background:#0D9488; color:#fff; font-weight:600; }
  table.tbl td.num { text-align:center; }
  table.tbl .mono { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:10px; color:#556; }
  .pill { display:inline-block; color:#fff; border-radius:999px; padding:2px 8px; font-size:10px; font-weight:600; }
  .muted { color:#8a9a9e; font-style:italic; }
  .note { margin-top:10px; background:#FFF7ED; border:1px solid #fed7aa; border-radius:8px; padding:8px 10px; font-size:11.5px; }
  .foot { margin-top:26px; border-top:1px solid #e2e8ea; padding-top:8px; font-size:9.5px; color:#8a9a9e; line-height:1.5; }
</style></head><body>
  <div class="head">
    <div class="brand"><img class="logo" src="/icons/logo.png" alt="RalphGuard"><div><b>RalphGuard</b><span>รายงานการประเมินความเสี่ยงสารเคมี (In-silico QSAR)</span></div></div>
    <div class="date">ออกรายงาน<br>${esc(dateStr)}</div>
  </div>

  <div class="meta">
    <div><div class="k">ชื่อสูตร</div><div class="v">${esc(activeFormula?.name ?? "-")}</div></div>
    <div><div class="k">ประเภท</div><div class="v">${esc(activeFormula?.type ?? "-")}</div></div>
    <div><div class="k">บริเวณทดสอบ</div><div class="v">${esc(regionLabel)}</div></div>
    <div><div class="k">จำนวนสาร</div><div class="v">${items.length} รายการ</div></div>
  </div>

  <h2>ส่วนผสม (Formula)</h2>
  <table class="tbl">
    <thead><tr><th style="text-align:left">สาร</th><th style="text-align:left">SMILES</th><th style="text-align:center">สัดส่วน</th></tr></thead>
    <tbody>${ingredientRows}</tbody>
  </table>

  <h2>ผลการประเมินความเสี่ยง</h2>
  ${resultBlock}
  ${noteBlock}

  <div class="foot">
    เอกสารนี้สร้างจากการคัดกรองด้วยแบบจำลอง QSAR (in-silico) เพื่อประเมินความเสี่ยงเบื้องต้นเท่านั้น
    ไม่สามารถทดแทนการทดสอบจริงตามมาตรฐาน และไม่ใช่คำวินิจฉัยทางการแพทย์ · RalphGuard · NSC 2026 (28P14E01438)
  </div>
</body></html>`;

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const go = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => iframe.remove(), 1500);
      }
    };
    const logo = doc.querySelector<HTMLImageElement>(".logo");
    if (logo && !logo.complete) {
      const fallback = window.setTimeout(go, 1000);
      const printWhenReady = () => {
        window.clearTimeout(fallback);
        window.setTimeout(go, 50);
      };
      logo.addEventListener("load", printWhenReady, { once: true });
      logo.addEventListener("error", printWhenReady, { once: true });
    } else {
      setTimeout(go, 100);
    }
  };

  return (
    <div className="app-light isolate flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Temporary assess UI preview — same RalphGuard theme, clearer workflow. */}
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 shadow-sm">
        {/* logo */}
        <div className="mr-1 flex items-center gap-2 pr-2">
          <img
            src="/icons/logo.png"
            alt="RalphGuard Logo"
            className="size-8 rounded-xl object-contain overflow-hidden shadow-sm"
          />
          <div className="leading-tight">
            <span className="block font-display text-sm font-bold">Ralph<span className="text-brand">Guard</span></span>
            <span className="block text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">Assessment Studio</span>
          </div>
        </div>

        <a
          href="/projects"
          className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition hover:border-primary/35 hover:bg-accent hover:text-accent-foreground"
          title="กลับหน้าแรก"
          aria-label="กลับหน้าแรก"
        >
          <House className="size-4" />
          <span className="hidden lg:inline">หน้าแรก</span>
        </a>

        {/* tabs */}
        <div className="flex items-center rounded-xl bg-muted p-1">
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
                onClick={() => setMode(m)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition ${
                  active
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

        {mode === "assess" && (
          <div className="ml-2 hidden items-center gap-1.5 xl:flex">
            <WorkflowChip step="1" label="เตรียมสูตร" done={formula.length > 0} active={!jobId} />
            <span className="h-px w-4 bg-slate-200" />
            <WorkflowChip step="2" label={assessing ? "กำลังประเมิน" : "ประเมิน"} done={completed} active={assessing} />
            <span className="h-px w-4 bg-slate-200" />
            <WorkflowChip step="3" label="ดูผลลัพธ์" done={completed} active={completed} />
          </div>
        )}

        {/* right actions */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportPdf} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand" title="ส่งออกรายงาน PDF จากข้อมูลการประเมิน">
            PDF
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="relative z-0 flex min-h-0 flex-1">
        {/* Icon rail */}
        <nav className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3">
          {[
            { m: "assess" as Mode, icon: "file" as SemanticIconName, title: "ไฟล์" },
            { m: "nodes" as Mode, icon: "puzzle" as SemanticIconName, title: "Nodes" },
            { m: "trust" as Mode, icon: "shield" as SemanticIconName, title: "ความน่าเชื่อถือ" },
          ].map((it) => (
            <button
              key={it.m}
              onClick={() => setMode(it.m)}
              title={it.title}
              className={`grid size-9 place-items-center rounded-lg text-base transition ${
                mode === it.m ? "bg-teal-50 text-brand" : "text-slate-800/45 hover:bg-slate-100"
              }`}
            >
              <SemanticIcon name={it.icon} className="size-4" />
            </button>
          ))}
          <button
            onClick={() => setShowTemplates((s) => !s)}
            title="เทมเพลตผลิตภัณฑ์"
            className={`grid size-9 place-items-center rounded-lg text-base transition ${
              showTemplates ? "bg-teal-50 text-brand" : "text-slate-800/45 hover:bg-slate-100"
            }`}
          >
            <SemanticIcon name="spray" className="size-4" />
          </button>
          <a href="/projects" title="หน้าแรก" aria-label="หน้าแรก" className="mt-auto grid size-9 place-items-center rounded-lg text-slate-800/40 hover:bg-slate-100"><SemanticIcon name="home" className="size-4" /></a>
        </nav>

        {/* Left panel — Pages + Layers */}
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="font-display text-sm font-semibold">การประเมินสารเคมี</div>
            {project && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="truncate">บันทึกผลใน {project.name}</span>
              </div>
            )}
          </div>

          <Section title="สูตรที่สร้าง">
            <div className="space-y-1">
              {formulas.map((f) => (
                <div
                  key={f.id}
                  onClick={() => selectFormula(f.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectFormula(f.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={f.id === activeId}
                  aria-label={`เลือก ${f.name} และแสดงส่วนผสม`}
                  className={`group flex w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition ${
                    f.id === activeId
                      ? "border-brand bg-teal-50 text-brand-dark"
                      : "border-slate-200 bg-white text-slate-800 hover:border-brand/50"
                  } ${
                    f.id === recentlyCreatedFormulaId
                      ? "animate-in fade-in-0 slide-in-from-bottom-2 ring-2 ring-brand/20 duration-300 motion-reduce:animate-none"
                      : ""
                  }`}
                >
                  <SemanticIcon name="flask" className="size-4 shrink-0" />
                  {editingFormulaId === f.id ? (
                    <input
                      autoFocus
                      value={f.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => renameFormula(f.id, e.target.value)}
                      onBlur={() => setEditingFormulaId(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditingFormulaId(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-brand bg-white px-1 text-sm text-slate-800 outline-none"
                    />
                  ) : (
                    <div
                      className="flex min-w-0 flex-1 flex-col"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingFormulaId(f.id);
                      }}
                      title="ดับเบิลคลิกเพื่อแก้ชื่อ"
                    >
                      <span className="truncate font-medium">{f.name}</span>
                      {f.type && <span className="truncate text-[9px] font-normal text-slate-400">{f.type}</span>}
                    </div>
                  )}
                  <span className="font-mono text-[10px] text-slate-400">{f.items.length} สาร</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFormulaId(f.id);
                    }}
                    title="แก้ชื่อสูตร"
                    aria-label="แก้ชื่อสูตร"
                    className="grid size-4 shrink-0 place-items-center rounded text-slate-300 opacity-0 transition hover:text-brand group-hover:opacity-100"
                  >
                    <SemanticIcon name="pencil" className="size-3" />
                  </button>
                  {formulas.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDeleteFormula(f);
                      }}
                      title="ลบสูตร"
                      aria-label="ลบสูตร"
                      className="grid size-4 shrink-0 place-items-center rounded text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                    >
                      <SemanticIcon name="trash" className="size-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={openCreate}
                className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-medium text-brand transition hover:border-brand hover:bg-teal-50"
              >
                + สร้างสูตร
              </button>
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

        </aside>

        {/* Center canvas */}
        <main className="relative flex min-w-0 flex-1 overflow-hidden bg-background">
          {mode === "assess" && (
            <Viewport
              panelOpen={formulaPanelOpen}
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
              dayIdx={dayIdx}
              region={region}
              ready={modelReady}
              developerPreview={developerTestEnabled}
              productName={developerTestEnabled ? `${productName} · ค่าทดสอบ` : productName}
              layers={modelLayers}
              eraseMode={eraseMode}
            />
          )}

          {/* Floating Layers panel — docked top-left inside the viewport */}
          {mode === "assess" && (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-20 w-72"
            >
              <button
                type="button"
                onClick={() => setFormulaPanelOpen((open) => !open)}
                aria-expanded={formulaPanelOpen}
                aria-label={formulaPanelOpen ? "ปิดส่วนผสมของสูตร" : "เปิดส่วนผสมของสูตร"}
                title={formulaPanelOpen ? "ปิดส่วนผสมของสูตร" : "เปิดส่วนผสมของสูตร"}
                className="pointer-events-auto absolute left-2 top-1/2 z-30 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-950 shadow-md transition hover:scale-105 hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-brand/40"
              >
                {formulaPanelOpen ? "←" : "→"}
              </button>

              <div
                className={`absolute inset-y-0 right-0 flex w-72 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-[transform,opacity] duration-300 ease-in-out motion-reduce:transition-none ${
                  formulaPanelOpen
                    ? "pointer-events-auto translate-x-0 opacity-100"
                    : "pointer-events-none -translate-x-full opacity-0"
                }`}
              >
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-lg bg-teal-50 text-xs font-bold text-brand">1</span>
                  <div>
                    <div className="text-xs font-semibold text-slate-800">ส่วนผสมของสูตร</div>
                    <div className="text-[10px] text-slate-400">{activeFormula?.name ?? "สูตร"} · {formula.length} สาร</div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="mb-2 text-[11px] font-semibold text-slate-500">สูตร (Formulation)</div>
                <div className="space-y-1.5">
                  <SubstanceHoverCard
                    name="Water (Aqua)"
                    smiles="O"
                    className="rounded-lg border border-sky-200 bg-sky-50/60 p-1.5"
                  >
                    <div className="flex items-center gap-1 text-xs">
                      <SemanticIcon name="droplet" className="size-3.5 text-sky-500" />
                      <span className="flex-1 font-medium text-slate-700">Water (Aqua)</span>
                      <span className="font-mono tabular-nums text-slate-600">{waterPct}</span>
                      <span className="text-[10px] text-slate-400">%</span>
                    </div>
                    <div className="pl-4 text-[9px] text-slate-400">เบส · ปรับอัตโนมัติให้รวม 100%</div>
                  </SubstanceHoverCard>
                  {waterMissing && (
                    <div className="flex gap-1 rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-[10px] leading-snug text-amber-700">
                      <SemanticIcon name="alert" className="mt-0.5 size-3 shrink-0" />
                      <span>สูตรประเภท “{activeFormula?.type}” ปกติต้องมีน้ำเป็นเบส แต่สัดส่วนสารตอนนี้รวม ≥ 100% แล้ว
                      จึงไม่เหลือที่ให้น้ำ — ลองลดความเข้มข้นลง</span>
                    </div>
                  )}
                  {formula.map((it, i) => {
                    const wasJustAdded =
                      recentlyAddedIngredient?.formulaId === activeId &&
                      recentlyAddedIngredient.index === i;
                    return (
                      <SubstanceHoverCard
                        key={i}
                        name={it.name}
                        smiles={it.smiles}
                        className={`rounded-lg border p-1.5 transition-[background-color,border-color,box-shadow] duration-300 ${
                          wasJustAdded
                            ? "animate-in border-brand/30 bg-teal-50/80 ring-1 ring-brand/20 fade-in-0 slide-in-from-right-2 motion-reduce:animate-none"
                            : "border-slate-200 bg-slate-100/50"
                        }`}
                      >
                      <div className="flex items-center gap-1">
                        <SemanticIcon name="circle" className="size-2.5 shrink-0 text-brand" />
                        <input
                          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                          placeholder="ชื่อสาร"
                          title={it.name}
                          value={it.name ?? ""}
                          onChange={(e) => patchItem(i, { name: e.target.value })}
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          inputMode="decimal"
                          className="w-12 shrink-0 bg-transparent text-right font-mono text-xs tabular-nums outline-none"
                          value={it.concentration}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const normalized = e.currentTarget.value.replace(/^0+(?=\d)/, "");
                            if (normalized !== e.currentTarget.value) e.currentTarget.value = normalized;
                            patchItem(i, { concentration: Number.parseFloat(normalized) || 0 });
                          }}
                          onBlur={(e) => {
                            const normalized = Math.min(100, Math.max(0, Number(e.currentTarget.value) || 0));
                            e.currentTarget.value = String(normalized);
                            patchItem(i, { concentration: normalized });
                          }}
                        />
                        <span className="shrink-0 text-[10px] text-slate-800/40">%</span>
                        <button onClick={() => removeItem(i)} aria-label="ลบสาร" className="shrink-0 text-slate-800/30 hover:text-rose-500"><SemanticIcon name="x" className="size-3" /></button>
                      </div>
                      <input
                        className="mt-1 w-full bg-transparent font-mono text-[10px] text-slate-800/45 outline-none"
                        placeholder="SMILES"
                        value={it.smiles}
                        onChange={(e) => patchItem(i, { smiles: e.target.value })}
                      />
                      {completed && subConf.get(it.smiles) && (() => {
                        const c = subConf.get(it.smiles)!;
                        return (
                          <div className="mt-0.5 flex items-center gap-1 text-[9px]" title={c.reason}>
                            <span className="size-1.5 rounded-full" style={{ background: CONF_HEX[c.level] }} />
                            <span className="text-slate-400">ความเชื่อมั่น {CONF_TH[c.level] ?? c.level}</span>
                            {!c.inDomain && <span className="inline-flex items-center gap-0.5 font-medium text-rose-500">· <SemanticIcon name="alert" className="size-2.5" /> นอกขอบเขตโมเดล</span>}
                          </div>
                        );
                      })()}
                      </SubstanceHoverCard>
                    );
                  })}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button onClick={addItem} className="text-xs font-medium text-brand hover:underline">+ เพิ่มสาร</button>
                    <span className="text-[10px] text-slate-800/30">หรือ</span>
                    <SubstanceLibraryPicker onSelect={addFromCatalog} />
                  </div>

                  {/* Formula import tools */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={openLabelScan}
                      className="rounded-lg border border-dashed border-brand/40 px-2 py-2 text-xs font-medium text-brand transition hover:bg-teal-50"
                    >
                      <span className="inline-flex items-center gap-1"><SemanticIcon name="camera" className="size-3.5" /> OCR รูปฉลาก</span>
                    </button>
                    <label
                      htmlFor="formula-csv-upload"
                      className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand/40 px-2 py-2 text-xs font-medium text-brand transition hover:bg-teal-50 ${
                        csvBusy ? "pointer-events-none opacity-50" : ""
                      }`}
                    >
                      <FileUp className="size-3.5" />
                      {csvBusy ? "กำลังอ่าน…" : "นำเข้า CSV"}
                    </label>
                    <input
                      id="formula-csv-upload"
                      type="file"
                      accept=".csv,text/csv"
                      disabled={csvBusy}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void importCsvFile(file);
                      }}
                    />
                  </div>
                  <div className="text-[9px] leading-relaxed text-slate-400">
                    CSV: <span className="font-mono">name, smiles, concentration</span> · ไม่สร้าง SMILES ที่ไม่มีในไฟล์หรือคลังสาร
                    <a
                      href="/formula-example-10-ingredients.csv"
                      download
                      className="mt-1 block w-fit font-semibold text-brand hover:underline"
                    >
                      ↓ ดาวน์โหลดไฟล์ตัวอย่าง 10 สาร
                    </a>
                  </div>
                  {csvStatus && (
                    <div
                      className={`rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${
                        csvStatus.tone === "ok"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {csvStatus.text}
                    </div>
                  )}

                </div>
              </div>
              </div>
            </div>
          )}

          {/* Inflammation trend — slides in from the right edge (site theme) */}
          {mode === "assess" && (
            <div className="absolute right-0 top-24 z-20 flex items-start">
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showTrend ? "w-[420px]" : "w-0"}`}>
                <div className="w-[420px] max-w-[calc(100vw-2rem)] rounded-l-2xl border border-r-0 border-slate-200 bg-white p-4 text-slate-800 shadow-xl">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-lg"><SemanticIcon name="chart" className="size-4" /></span>
                    <div>
                      <div className="text-sm font-semibold">แนวโน้มความเสี่ยงตามเวลา</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">เปรียบเทียบคะแนนจำลอง Day 1, Day 3 และ Day 7</div>
                    </div>
                    <button
                      onClick={() => setShowTrend(false)}
                      className="ml-auto grid size-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="ปิดกราฟแนวโน้ม"
                    >
                      <SemanticIcon name="x" className="size-4" />
                    </button>
                  </div>
                  {completed && trendData.length ? (
                    <>
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        {paintLayers.map((layer) => (
                          <div key={layer.key} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="size-2 rounded-full" style={{ background: layer.color }} />
                              <span className="truncate">{layer.label}</span>
                            </div>
                            <div className="mt-1 flex items-end justify-between gap-2">
                              <span className="font-mono text-lg font-semibold tabular-nums text-slate-800">{Math.round(layer.score)}</span>
                              <span className="mb-0.5 text-[9px] font-semibold" style={{ color: BAND_HEX[layer.band] }}>
                                {BAND_LABEL[layer.band]} · Day {DAY_LABELS[dayIdx]}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-2 pb-2 pt-1">
                      <TrendChart data={trendData} lines={trendLines} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {trendLines.map((l) => (
                          <span key={l.key} className="flex items-center gap-1 text-[10px] text-slate-500">
                            <span className="h-0.5 w-4 rounded" style={{ background: l.color }} />
                            {l.label}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 overflow-hidden rounded-full border border-slate-200">
                        <div className="grid h-1.5 grid-cols-4">
                          <span className="bg-green-600" />
                          <span className="bg-amber-500" />
                          <span className="bg-red-500" />
                          <span className="bg-red-800" />
                        </div>
                      </div>
                      <div className="mt-1 flex justify-between text-[9px] text-slate-400">
                        <span>0 · ต่ำ</span><span>25</span><span>50</span><span>75</span><span>100 · รุนแรง</span>
                      </div>
                      <p className="mt-3 text-[9px] leading-relaxed text-slate-400">
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
              <div className="group relative">
                <button
                  onClick={() => setShowTrend((s) => !s)}
                  className={`grid size-10 place-items-center rounded-l-xl border border-r-0 border-slate-200 text-base shadow-card transition ${
                    showTrend ? "bg-brand text-white" : "bg-white text-slate-600 hover:text-brand"
                  }`}
                >
                  <SemanticIcon name="chart" className="size-4" />
                </button>
                <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[11px] text-white opacity-0 shadow transition group-hover:opacity-100">
                  กราฟแนวโน้ม
                </span>
              </div>
            </div>
          )}
          {mode === "nodes" && (
            <div className="absolute inset-0">
              <div className="absolute left-4 top-3 z-10 text-xs font-semibold text-slate-800/60">
                Assessment Node Graph <span className="font-normal text-slate-800/40">· in-silico pipeline</span>
              </div>
              <FormulaGraph
                key={`${projectId ?? "standalone"}:${activeId}`}
                seed={formula}
                region={activeFormula?.region ?? region}
                projectId={projectId}
                snapshot={graphByFormulaId[activeId] ?? null}
                onSnapshotChange={(snapshot) => {
                  setGraphByFormulaId((previous) => ({
                    ...previous,
                    [activeId]: snapshot,
                  }));
                }}
                onFormulaChange={(items) => syncFormulaFromGraph(activeId, items)}
                onSaveFormula={saveGraphAsFormula}
              />
            </div>
          )}
          {mode === "trust" && <TrustReport />}

          {/* Painting and erasing unlock only after this formula has a completed assessment. */}
          {mode === "assess" && (
            <div className="pointer-events-none absolute bottom-4 right-4 z-40 print:hidden">
              <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-soft backdrop-blur">
                <button
                  type="button"
                  onClick={() => setEraseMode((value) => !value)}
                  disabled={!modelReady}
                  title={!modelReady ? "ต้องประเมินสูตรหรือเปิดโหมดทดสอบก่อน" : eraseMode ? "ปิดโหมดลบ" : "เปิดยางลบแบบระบาย"}
                  aria-pressed={eraseMode}
                  className={`flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${
                    eraseMode
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  }`}
                >
                  <Eraser className="size-4" />
                  {eraseMode ? "ลากเพื่อระบายลบ" : "ยางลบ"}
                </button>
                <button
                  disabled={assessing}
                  onClick={() => {
                    setEraseMode(false); // กดประเมิน = กลับมาโหมด paint ผลลัพธ์
                    run();
                  }}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60"
                >
                  {assessing ? "กำลังประเมิน…" : <span className="inline-flex items-center gap-1"><SemanticIcon name={completed ? "refresh" : "play"} className="size-4" /> {completed ? "ประเมินอีกครั้ง" : "ประเมินสูตร"}</span>}
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right inspector */}
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
          {mode === "trust" ? (
            <div className="p-4 text-xs leading-relaxed text-slate-800/55">
              เลือก <b>Pages › ประเมินความเสี่ยง</b> เพื่อแก้สูตรและดูผลบนหุ่น 3D
            </div>
          ) : (
            <>
              <Section title="การจำลองตามเวลา" className="order-2">
                <div className="flex gap-1">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={d}
                      onClick={() => setDayIdx(i)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs transition ${
                        i === dayIdx ? "border-brand bg-brand text-white font-semibold" : "border-slate-200 bg-slate-100 text-slate-800/65 hover:border-brand/50"
                      }`}
                    >
                      Day {d}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="ผู้ช่วย AI" className="order-3">
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
              </Section>

              <Section title="3 · ผลการประเมิน" className="order-1">
                <div className="mb-3 rounded-xl border border-dashed border-violet-300 bg-violet-50/70 p-2.5 print:hidden">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
                      <SemanticIcon name="flask" className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-violet-900">ทดสอบผลโดยผู้พัฒนา</div>
                      <div className="text-[9px] leading-snug text-violet-600">ปรับเฉพาะภาพ 3D ไม่ส่ง API และไม่แก้ผลจริง</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeveloperTestEnabled((enabled) => {
                          if (enabled) setEraseMode(false);
                          return !enabled;
                        });
                      }}
                      aria-pressed={developerTestEnabled}
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${
                        developerTestEnabled
                          ? "bg-violet-700 text-white hover:bg-violet-800"
                          : "border border-violet-300 bg-white text-violet-700 hover:bg-violet-100"
                      }`}
                    >
                      {developerTestEnabled ? "ปิดการทดสอบ" : "เปิดทดสอบ"}
                    </button>
                  </div>

                  {developerTestEnabled && (
                    <div className="mt-3 space-y-2 border-t border-violet-200 pt-2.5">
                      <div className="flex flex-wrap gap-1">
                        {[0, 30, 55, 85].map((score) => (
                          <button
                            key={score}
                            type="button"
                            onClick={() =>
                              setDeveloperTestScores({ skin: score, eye: score, sens: score, acute: score })
                            }
                            className="rounded-md border border-violet-200 bg-white px-2 py-1 text-[9px] font-medium text-violet-700 hover:bg-violet-100"
                          >
                            ทุกค่า {score}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setDeveloperTestScores(DEFAULT_DEVELOPER_TEST_SCORES)}
                          className="ml-auto rounded-md px-2 py-1 text-[9px] font-medium text-slate-500 hover:bg-white"
                        >
                          คืนค่า 50
                        </button>
                      </div>

                      {ENDPOINTS.map((ep) => {
                        const score = developerTestScores[ep];
                        const band = bandOf(score);
                        return (
                          <label key={ep} className="grid grid-cols-[1fr_46px] items-center gap-x-2 gap-y-1">
                            <span className="flex items-center justify-between text-[10px] text-slate-700">
                              <span>{ENDPOINT_LABEL_TH[ep]}</span>
                              <span className="font-mono font-semibold tabular-nums" style={{ color: BAND_HEX[band] }}>
                                {score} · {BAND_LABEL[band]}
                              </span>
                            </span>
                            <input
                              aria-label={`${ENDPOINT_LABEL_TH[ep]} (0 ถึง 100)`}
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={score}
                              onChange={(event) => {
                                const next = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                                setDeveloperTestScores((current) => ({ ...current, [ep]: next }));
                              }}
                              className="row-span-2 h-8 rounded-lg border border-violet-200 bg-white px-1 text-center font-mono text-[11px] font-semibold text-violet-800 outline-none focus:border-violet-500"
                            />
                            <input
                              aria-label={`เลื่อนค่า${ENDPOINT_LABEL_TH[ep]}`}
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={score}
                              onChange={(event) =>
                                setDeveloperTestScores((current) => ({
                                  ...current,
                                  [ep]: Number(event.target.value),
                                }))
                              }
                              className="h-1.5 w-full cursor-pointer accent-violet-600"
                            />
                          </label>
                        );
                      })}

                      <div className="rounded-lg bg-white/80 px-2 py-1.5 text-[9px] leading-snug text-violet-700">
                        Paint บริเวณบนโมเดล แล้วเลื่อนคะแนนเพื่อดูอาการเปลี่ยนทันที ค่าพิษเฉียบพลันเป็นผลเชิงระบบ จึงไม่สร้างรอยผิวเฉพาะจุด
                      </div>
                    </div>
                  )}
                </div>
                {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-600">{error}</div>}
                {!completed && !error && !developerTestEnabled && (
                  <div className="grid place-items-center gap-2 py-6 text-center">
                    <SemanticIcon name="flask" className="size-6 text-slate-800/20" />
                    <p className="text-xs text-slate-800/50">
                      {jobId ? "กำลังประเมิน…" : "ยังไม่ได้ประเมิน"}
                      <br />เลือกสูตร + บริเวณ แล้วกด <span className="text-brand">ประเมินสูตรด้านขวาล่าง</span>
                    </p>
                  </div>
                )}
                {completed && endpoints && (
                  <div className="space-y-2">
                    {lowConfidence && (
                      <div className="flex gap-1.5 rounded-lg border border-rose-300 bg-rose-50 p-2 text-[11px] leading-snug text-rose-700">
                        <SemanticIcon name="alert" className="mt-0.5 size-3.5 shrink-0" />
                        <span>ผลนี้เชื่อถือได้ต่ำ — สารส่วนใหญ่อยู่นอกขอบเขตแบบจำลอง (out-of-domain)
                        โมเดลอาจเดาว่า “ไม่ระคาย” ทั้งที่ไม่เคยเห็นสารกลุ่มนี้ <b>อย่าตีความคะแนนต่ำว่าปลอดภัย</b></span>
                      </div>
                    )}
                    {ENDPOINTS.map((ep) => {
                      const sc = endpoints[ep]?.timecourse?.[dayIdx] ?? endpoints[ep]?.peak_score ?? 0;
                      const band = bandOf(sc);
                      return (
                        <div key={ep}>
                          <div className="mb-0.5 flex justify-between text-[11px]">
                            <span className="text-slate-800/70">{ENDPOINT_LABEL_TH[ep]}</span>
                            <span className="font-mono tabular-nums" style={{ color: BAND_HEX[band] }}>
                              {Math.round(sc)} · {BAND_LABEL[band]}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, sc)}%`, background: BAND_HEX[band] }} />
                          </div>
                          {endpoints[ep]?.confidence && (
                            <div
                              className="mt-0.5 flex items-center gap-1 text-[9px]"
                              title={endpoints[ep]!.confidence!.reason_th}
                            >
                              <span
                                className="size-1.5 rounded-full"
                                style={{ background: CONF_HEX[endpoints[ep]!.confidence!.level] }}
                              />
                              <span className="text-slate-400">
                                ความเชื่อมั่น {CONF_TH[endpoints[ep]!.confidence!.level] ?? endpoints[ep]!.confidence!.level}
                              </span>
                              {endpoints[ep]!.confidence!.in_domain === false && (
                                <span className="font-medium text-rose-500">· นอกขอบเขต</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                    {formulaCoverage && formulaCoverage.coverage_percentage < 100 && (
                      <div className="flex gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-snug text-amber-800">
                        <SemanticIcon name="alert" className="mt-0.5 size-3.5 shrink-0" />
                        <span>ประเมินครอบคลุม {formulaCoverage.coverage_percentage}% · ยังประเมินไม่ได้ {formulaCoverage.unresolved_ingredients} รายการ
                        <br /><b>คะแนนนี้เป็นผลเฉพาะส่วนที่ประเมินได้ ไม่ใช่ความเสี่ยงของสูตรทั้งหมด</b></span>
                      </div>
                    )}
                  </div>
                )}
              </Section>
            </>
          )}
        </aside>
      </div>

      {/* Create-formula modal (centered, blurred backdrop) */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 grid animate-in place-items-center bg-slate-900/30 p-4 fade-in-0 duration-200 backdrop-blur-sm motion-reduce:animate-none"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-[min(92vw,420px)] animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-xl fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-brand"><SemanticIcon name="flask" className="size-4" /></span>
              <h2 className="text-base font-semibold text-slate-800">สร้างสูตรใหม่</h2>
              <button onClick={() => setShowCreate(false)} aria-label="ปิด" className="ml-auto text-slate-400 hover:text-slate-700">
                <SemanticIcon name="x" className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">ชื่อสูตร</span>
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && createFormula()}
                  placeholder="เช่น ครีมบำรุงสูตร 1"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">ประเภทผลิตภัณฑ์</span>
                <select
                  value={draft.type}
                  onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                >
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">บริเวณทดสอบ</span>
                <select
                  value={draft.region}
                  onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value as Region }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                >
                  <option value="face">ใบหน้า</option>
                  <option value="eye">ดวงตา</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">เริ่มจาก</span>
                <select
                  value={draft.from}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand"
                >
                  <option value="blank">สูตรเปล่า (กรอกเอง)</option>
                  {PRODUCT_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              {draft.from === "blank" && (
                <div className="rounded-lg border border-brand/20 bg-teal-50/60 p-3 text-[11px] leading-relaxed text-slate-600">
                  <div className="mb-1.5 flex items-center gap-1 font-semibold text-brand-dark"><SemanticIcon name="clipboard" className="size-3.5" /> สูตรเปล่าต้องกรอกอะไรบ้าง?</div>
                  <ul className="space-y-1">
                    <li>
                      • <b>ชื่อสาร</b> — ชื่อสารเคมี/INCI เช่น Glycerin (ใช้แสดงผล ไม่บังคับ)
                    </li>
                    <li>
                      • <b>SMILES</b> — รหัสโครงสร้างโมเลกุล เช่น{" "}
                      <span className="font-mono text-slate-800">OCC(O)CO</span> —{" "}
                      <b className="text-rose-500">จำเป็น</b> เพราะโมเดลใช้คำนวณความเสี่ยง
                    </li>
                    <li>
                      • <b>ความเข้มข้น (%)</b> — สัดส่วนของสารในสูตร (0–100)
                    </li>
                  </ul>
                  <div className="mt-1.5 text-slate-500">
                    ไม่รู้ SMILES? เลือกจาก “คลังสาร” ในกล่องสูตรได้ หรือถาม AI ให้ช่วยแนะนำ
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={createFormula}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                สร้างสูตร
              </button>
            </div>
          </div>
        </div>
      )}

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

      <LabelScanModal open={scanOpen} onClose={closeLabelScan} onImport={importScannedItems} />
    </div>
  );
}

function SubstanceLibraryPicker({ onSelect }: { onSelect: (item: CatalogItem) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [registryItems, setRegistryItems] = useState<IngredientRegistryItem[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || registryItems.length) return;
    const controller = new AbortController();
    let alive = true;
    setRegistryLoading(true);
    setRegistryError(null);

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
        setRegistryError("โหลด Ingredient Registry ไม่สำเร็จ - ยังใช้คลังพื้นฐานได้");
      })
      .finally(() => {
        if (alive) setRegistryLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, registryItems.length]);

  const libraryGroups = useMemo(() => {
    return catalogWithVerifiedRegistry(registryItems);
  }, [registryItems]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      libraryGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.name} ${item.smiles} ${group.category}`.toLowerCase().includes(normalizedQuery),
        ),
      })).filter((group) => group.items.length > 0),
    [libraryGroups, normalizedQuery],
  );
  const resultCount = filteredGroups.reduce((total, group) => total + group.items.length, 0);
  const libraryCount = libraryGroups.reduce((total, group) => total + group.items.length, 0);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-brand/50 hover:bg-teal-50/50 focus:outline-none focus:ring-2 focus:ring-brand/20"
          aria-label="เลือกสารจากคลัง"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-sm text-brand transition group-hover:bg-brand group-hover:text-white">
            <SemanticIcon name="flask" className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold text-slate-700">เลือกจากคลังสาร</span>
            <span className="block truncate text-[9px] text-slate-400">{libraryCount} สาร · ค้นหาชื่อหรือ SMILES</span>
          </span>
          <ChevronDown className={`size-3.5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        className="w-[350px] overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl"
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-800">คลังสาร RalphGuard</div>
              <div className="text-[9px] text-slate-500">เลือกแล้วระบบจะเพิ่มลงในสูตรทันที</div>
            </div>
            <span className="rounded-full border border-brand/15 bg-white px-2 py-0.5 text-[9px] font-semibold text-brand">
              {resultCount} รายการ
            </span>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
            <Search className="size-3.5 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อสาร, หมวด หรือ SMILES…"
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
          <div className="mt-2 min-h-4 text-[9px]">
            {registryLoading ? (
              <span className="inline-flex items-center gap-1 text-brand">
                <span className="size-2 animate-pulse rounded-full bg-brand" />
                กำลังโหลดสารที่ผ่านการตรวจสอบจาก Ingredient Registry…
              </span>
            ) : registryError ? (
              <span className="text-amber-700">{registryError}</span>
            ) : registryItems.length ? (
              <span className="text-slate-500">
                เชื่อมฐานข้อมูลแล้ว · พบ {registryItems.length.toLocaleString()} รายการที่ยืนยันตัวตน
              </span>
            ) : null}
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {filteredGroups.length ? (
            filteredGroups.map((group) => (
              <section key={group.category} className="mb-2 last:mb-0">
                <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-white/95 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur">
                  <SemanticIcon name={group.icon} className="size-3.5" />
                  <span>{group.category}</span>
                  <span className="ml-auto font-normal tabular-nums">{group.items.length}</span>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={`${group.category}-${item.smiles}`}
                      type="button"
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                      }}
                      className="group/item flex w-full items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-brand/20 hover:bg-teal-50"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-slate-100 bg-slate-50 text-[10px] font-semibold text-slate-500 group-hover/item:border-brand/20 group-hover/item:bg-white group-hover/item:text-brand">
                        +
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-slate-700">{item.name}</span>
                        <span className="block truncate font-mono text-[9px] text-slate-400">{item.smiles}</span>
                      </span>
                      <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[9px] font-semibold tabular-nums text-brand shadow-sm ring-1 ring-brand/10">
                        {item.conc}%
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="grid place-items-center px-4 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-slate-50 text-slate-300">⌕</span>
              <div className="mt-2 text-xs font-medium text-slate-600">ไม่พบสารที่ค้นหา</div>
              <div className="mt-1 text-[10px] text-slate-400">ลองค้นด้วยชื่อ INCI หรือ SMILES อื่น</div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorkflowChip({
  step,
  label,
  done,
  active,
}: {
  step: string;
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${active ? "font-semibold text-brand-dark" : "text-slate-400"}`}>
      <span
        className={`grid size-5 place-items-center rounded-full text-[9px] font-bold ${
          done
            ? "bg-brand text-white"
            : active
              ? "border border-brand bg-teal-50 text-brand"
              : "border border-slate-200 bg-white text-slate-400"
        }`}
      >
        {done ? <SemanticIcon name="check" className="size-3" /> : step}
      </span>
      <span>{label}</span>
    </div>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-b border-slate-200 px-4 py-3 ${className}`}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-800/40">{title}</div>
      {children}
    </div>
  );
}

function Viewport({
  panelOpen,
  paintOwnerKey,
  initialPaint,
  occupiedPaint,
  onPaintChange,
  onPaintBlocked,
  dayIdx,
  region,
  ready,
  developerPreview,
  productName,
  layers,
  eraseMode,
}: {
  panelOpen: boolean;
  paintOwnerKey: string;
  initialPaint: PaintMaskSnapshot | null;
  occupiedPaint: PaintMaskSnapshot[];
  onPaintChange: (snapshot: PaintMaskSnapshot) => void;
  onPaintBlocked: () => void;
  dayIdx: number;
  region: Region;
  ready: boolean;
  developerPreview: boolean;
  productName: string;
  layers: { key: string; label: string; score: number; color: string; band: string }[];
  eraseMode: boolean;
}) {
  return (
    <div className="relative order-2 h-full min-w-0 flex-1">
      <div className="relative h-full w-full bg-[#F4F1EE]">
        <div
          className={`absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            panelOpen ? "translate-x-72" : "translate-x-0"
          }`}
        >
          <span className="grid size-6 place-items-center rounded-lg bg-teal-50 text-xs font-bold text-brand">2</span>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              ดูผลบนโมเดล
              {developerPreview && (
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-700">DEV TEST</span>
              )}
            </div>
            <div className="text-[9px] text-slate-400">
              {developerPreview
                ? "ค่าทดสอบ · Paint แล้วปรับคะแนนด้านขวา"
                : ready
                  ? `Day ${DAY_LABELS[dayIdx]} · Paint แล้ว hover เพื่อดูตำแหน่ง`
                  : "กดประเมินสูตรก่อน จึงจะ Paint บนโมเดลได้"}
            </div>
          </div>
        </div>
        <div
          className={`absolute inset-0 will-change-transform transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            panelOpen ? "translate-x-36" : "translate-x-0"
          }`}
        >
          <FaceView
            paintOwnerKey={paintOwnerKey}
            layers={layers}
            armed={ready}
            productName={productName}
            eraseMode={eraseMode}
            background="#F4F1EE"
            initialPaint={initialPaint}
            onPaintChange={onPaintChange}
            occupiedPaint={occupiedPaint}
            onPaintBlocked={onPaintBlocked}
          />
        </div>
        {!ready && (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-right shadow-sm backdrop-blur">
            <div className="text-[11px] font-semibold text-slate-600">พร้อมประเมินสูตร</div>
            <div className="mt-0.5 text-[9px] text-slate-400">
              บริเวณ <span className="font-medium text-brand">{REGIONS.find((r) => r.value === region)?.label}</span> · กด “ประเมินสูตร” ด้านขวาล่าง
            </div>
          </div>
        )}
        {/* Risk legend */}
        {ready && (
          <div
            className={`absolute bottom-3 left-3 flex gap-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] backdrop-blur transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
              panelOpen ? "translate-x-72" : "translate-x-0"
            }`}
          >
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
    <div className="absolute inset-0 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="font-display text-2xl font-bold">ความน่าเชื่อถือของโมเดล</h1>
        <p className="mt-2 text-sm text-slate-800/60">
          ทุกการทำนายมาพร้อมตัวชี้วัดประสิทธิภาพ ความไม่แน่นอน และขอบเขตการใช้งาน (Applicability Domain) ตามหลัก OECD สำหรับ QSAR
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs text-slate-800/55">
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
                <tr key={m.endpoint} className="border-t border-slate-200">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.label_th}</span>{" "}
                    <span className="font-mono text-xs text-slate-800/40">{m.endpoint}</span>
                    {m.endpoint === "eye" && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">preliminary</span>
                    )}
                    {m.metrics && (
                      <div className="mt-0.5 text-[9px] text-slate-400">
                        n={(m.metrics.n_pos ?? 0) + (m.metrics.n_neg ?? 0) || "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-semibold text-brand">{pct(m.metrics?.auc)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.balanced_accuracy)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.sensitivity)}</td>
                  <td className="px-4 py-3 text-center font-mono">{pct(m.metrics?.specificity)}</td>
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
