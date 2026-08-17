"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderOpen,
  LayoutGrid,
  List,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import BrandedProgressLoader from "@/components/BrandedProgressLoader";
import ProjectCreateView from "@/components/projects/ProjectCreateView";
import ProjectFormDialog, {
  type ProjectFormValues,
} from "@/components/projects/ProjectFormDialog";
import ProjectsShell from "@/components/projects/ProjectsShell";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, apiErrorMessage, type ProjectOut } from "@/lib/api";
import { projectColor, projectIcon } from "@/lib/project-appearance";
import { isAbortError, logRequestFailure } from "@/lib/request-reliability";
import { cn } from "@/lib/utils";

gsap.registerPlugin(Flip);

const PROJECT_ROUTE_ERRORS: Record<string, string> = {
  "invalid-project": "รหัสโปรเจกต์ไม่ถูกต้อง",
  "project-not-found": "ไม่พบโปรเจกต์นี้ หรือโปรเจกต์อาจถูกลบแล้ว",
  "project-load-failed": "เปิดโปรเจกต์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์",
};

const PROJECT_COUNT_STORAGE_KEY = "ralphguard:projects:last-known-count";
const LAST_OPENED_PROJECT_STORAGE_KEY = "ralphguard:projects:last-opened-id";
const PROJECTS_PER_PAGE = 9;

const PROJECT_TOAST_CLASSNAMES = {
  toast: "!pr-11",
  closeButton:
    "!left-auto !right-3 !top-1/2 !-translate-y-1/2 !border-0 !bg-transparent !text-foreground/60 !shadow-none",
};

type ProjectFormMode = "edit" | null;
type ProjectPageMode = "list" | "create";
type ProjectLayoutMode = "grid" | "list";
type PaginationEntry = number | "ellipsis";

function paginationEntries(currentPage: number, totalPages: number): PaginationEntry[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const visiblePages = Array.from(
    new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]),
  )
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  const entries: PaginationEntry[] = [];
  visiblePages.forEach((page, index) => {
    const previousPage = visiblePages[index - 1];
    if (previousPage && page - previousPage > 1) {
      entries.push("ellipsis");
    }
    entries.push(page);
  });
  return entries;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function reduceMotionEnabled() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<ProjectPageMode>("list");
  const [formMode, setFormMode] = useState<ProjectFormMode>(null);
  const [formProject, setFormProject] = useState<ProjectOut | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingProject, setDeletingProject] = useState<ProjectOut | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openingProject, setOpeningProject] = useState<ProjectOut | null>(null);
  const [query, setQuery] = useState("");
  const [layoutMode, setLayoutMode] = useState<ProjectLayoutMode>("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [knownProjectCount, setKnownProjectCount] = useState(0);
  const [lastOpenedProjectId, setLastOpenedProjectId] = useState<number | null>(
    null,
  );

  const loadControllerRef = useRef<AbortController | null>(null);
  const formControllerRef = useRef<AbortController | null>(null);
  const deleteControllerRef = useRef<AbortController | null>(null);
  const restoreControllersRef = useRef(new Set<AbortController>());
  const gridRef = useRef<HTMLDivElement | null>(null);
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const newCardIdRef = useRef<number | null>(null);
  const initialGridAnimatedRef = useRef(false);

  useLayoutEffect(() => {
    const storedCount = Number(
      window.localStorage.getItem(PROJECT_COUNT_STORAGE_KEY),
    );
    if (Number.isSafeInteger(storedCount) && storedCount > 0) {
      setKnownProjectCount(storedCount);
    }

    const storedProjectId = Number(
      window.localStorage.getItem(LAST_OPENED_PROJECT_STORAGE_KEY),
    );
    if (Number.isSafeInteger(storedProjectId) && storedProjectId > 0) {
      setLastOpenedProjectId(storedProjectId);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await api.listProjects(controller.signal);
      if (loadControllerRef.current !== controller) return;
      setProjects(rows);
    } catch (cause) {
      if (isAbortError(cause) || loadControllerRef.current !== controller) return;
      logRequestFailure("list projects", cause);
      const message = apiErrorMessage(cause, "โหลดรายการโปรเจกต์ไม่สำเร็จ");
      setLoadError(message);
      toast.error(message);
    } finally {
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const routeError = currentUrl.searchParams.get("projectError");
    if (routeError && PROJECT_ROUTE_ERRORS[routeError]) {
      toast.error(PROJECT_ROUTE_ERRORS[routeError]);
      currentUrl.searchParams.delete("projectError");
      window.history.replaceState(
        window.history.state,
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    }
    void loadProjects();
  }, [loadProjects]);

  useEffect(
    () => () => {
      loadControllerRef.current?.abort();
      formControllerRef.current?.abort();
      deleteControllerRef.current?.abort();
      restoreControllersRef.current.forEach((controller) => controller.abort());
      restoreControllersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (loading || loadError) return;
    setKnownProjectCount(projects.length);
    window.localStorage.setItem(
      PROJECT_COUNT_STORAGE_KEY,
      String(projects.length),
    );
  }, [loadError, loading, projects.length]);

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th-TH");
    const filtered = normalizedQuery
      ? projects.filter((project) =>
          `${project.name} ${project.description ?? ""}`
            .toLocaleLowerCase("th-TH")
            .includes(normalizedQuery),
        )
      : [...projects];

    return filtered.sort((left, right) => {
      if (left.id === lastOpenedProjectId) return -1;
      if (right.id === lastOpenedProjectId) return 1;

      const leftTime = new Date(left.updated_at || left.created_at).getTime();
      const rightTime = new Date(right.updated_at || right.created_at).getTime();
      return rightTime - leftTime;
    });
  }, [lastOpenedProjectId, projects, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(visibleProjects.length / PROJECTS_PER_PAGE),
  );
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * PROJECTS_PER_PAGE;
    return visibleProjects.slice(startIndex, startIndex + PROJECTS_PER_PAGE);
  }, [currentPage, visibleProjects]);
  const visiblePaginationEntries = useMemo(
    () => paginationEntries(currentPage, totalPages),
    [currentPage, totalPages],
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  const captureGridState = useCallback(() => {
    if (!gridRef.current || reduceMotionEnabled()) return;
    const cards = Array.from(
      gridRef.current.querySelectorAll<HTMLElement>("[data-project-card]"),
    );
    if (cards.length > 0) {
      flipStateRef.current = Flip.getState(cards);
    }
  }, []);

  useLayoutEffect(() => {
    if (loading || !gridRef.current || initialGridAnimatedRef.current) return;
    initialGridAnimatedRef.current = true;
    if (reduceMotionEnabled()) return;

    const context = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>("[data-project-card]");
      gsap.from(cards.slice(0, 10), {
        autoAlpha: 0,
        y: 10,
        duration: 0.24,
        stagger: 0.035,
        ease: "power2.out",
        clearProps: "all",
      });
    }, gridRef);
    return () => context.revert();
  }, [loading]);

  useLayoutEffect(() => {
    const state = flipStateRef.current;
    flipStateRef.current = null;
    if (!state || reduceMotionEnabled()) return;
    const animation = Flip.from(state, {
      duration: 0.24,
      ease: "power2.out",
      absolute: true,
      scale: false,
      simple: true,
    });
    return () => {
      animation.kill();
    };
  }, [projects, layoutMode]);

  useLayoutEffect(() => {
    const projectId = newCardIdRef.current;
    newCardIdRef.current = null;
    if (projectId == null || !gridRef.current || reduceMotionEnabled()) return;
    const card = gridRef.current.querySelector<HTMLElement>(
      `[data-project-card="${projectId}"]`,
    );
    if (!card) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        card,
        { autoAlpha: 0, y: 12, scale: 0.98 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.26,
          ease: "power2.out",
          clearProps: "all",
        },
      );
    }, gridRef);
    return () => context.revert();
  }, [projects]);

  const openCreateView = () => {
    setFormProject(null);
    setFormError(null);
    setPageMode("create");
  };

  const openEditDialog = (project: ProjectOut) => {
    setFormProject(project);
    setFormError(null);
    setFormMode("edit");
  };

  const closeForm = () => {
    if (saving) return;
    setFormMode(null);
    setFormProject(null);
    setFormError(null);
  };

  const closeCreateView = () => {
    if (saving) return;
    setPageMode("list");
    setFormError(null);
  };

  const saveProject = async (
    values: ProjectFormValues,
    requestedMode?: "create" | "edit",
  ) => {
    const activeMode = requestedMode ?? formMode;
    if (!activeMode || saving) return;
    setSaving(true);
    setFormError(null);
    formControllerRef.current?.abort();
    const controller = new AbortController();
    formControllerRef.current = controller;

    try {
      if (activeMode === "create") {
        const created = await api.createProject(
          values.name,
          values.description || undefined,
          values.colorKey,
          values.iconKey,
          controller.signal,
        );
        if (formControllerRef.current !== controller) return;
        captureGridState();
        newCardIdRef.current = created.id;
        setProjects((rows) => [created, ...rows]);
        setCurrentPage(1);
        setPageMode("list");
        toast.success(`สร้างโปรเจกต์ “${created.name}” สำเร็จ`, {
          icon: null,
          closeButton: true,
          classNames: PROJECT_TOAST_CLASSNAMES,
        });
      } else if (formProject) {
        const updated = await api.updateProject(
          formProject.id,
          values.name,
          values.description,
          values.colorKey,
          values.iconKey,
          controller.signal,
        );
        if (formControllerRef.current !== controller) return;
        setProjects((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
        setFormMode(null);
        setFormProject(null);
        toast.success(`แก้ไขโปรเจกต์ “${updated.name}” สำเร็จ`, {
          icon: null,
          closeButton: true,
          classNames: PROJECT_TOAST_CLASSNAMES,
        });
      }
    } catch (cause) {
      if (!isAbortError(cause) && formControllerRef.current === controller) {
        logRequestFailure(
          activeMode === "create" ? "create project" : "update project",
          cause,
        );
        setFormError(
          apiErrorMessage(
            cause,
            activeMode === "create"
              ? "สร้างโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง"
              : "แก้ไขโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง",
          ),
        );
      }
    } finally {
      if (formControllerRef.current === controller) {
        formControllerRef.current = null;
        setSaving(false);
      }
    }
  };

  const removeCard = async (project: ProjectOut) => {
    const card = gridRef.current?.querySelector<HTMLElement>(
      `[data-project-card="${project.id}"]`,
    );
    if (card && !reduceMotionEnabled()) {
      await new Promise<void>((resolve) => {
        gsap.to(card, {
          autoAlpha: 0,
          x: 12,
          scale: 0.98,
          duration: 0.16,
          ease: "power1.in",
          onComplete: resolve,
        });
      });
    }
    captureGridState();
    setProjects((rows) => rows.filter((row) => row.id !== project.id));
  };

  const restoreProject = async (project: ProjectOut, originalIndex: number) => {
    const controller = new AbortController();
    restoreControllersRef.current.add(controller);
    try {
      const restored = await api.restoreProject(project.id, controller.signal);
      captureGridState();
      newCardIdRef.current = restored.id;
      setProjects((rows) => {
        if (rows.some((row) => row.id === restored.id)) return rows;
        const next = [...rows];
        next.splice(Math.min(Math.max(originalIndex, 0), next.length), 0, restored);
        return next;
      });
      toast.success(`กู้คืนโปรเจกต์ “${restored.name}” สำเร็จ`, {
        icon: null,
        closeButton: true,
        classNames: PROJECT_TOAST_CLASSNAMES,
      });
    } catch (cause) {
      if (!isAbortError(cause)) {
        logRequestFailure("restore project", cause);
        toast.error(
          apiErrorMessage(cause, "กู้คืนโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง"),
        );
      }
    } finally {
      restoreControllersRef.current.delete(controller);
    }
  };

  const deleteProject = async () => {
    if (!deletingProject || deleting) return;
    const project = deletingProject;
    const originalIndex = projects.findIndex((item) => item.id === project.id);
    setDeleting(true);
    setDeleteError(null);
    deleteControllerRef.current?.abort();
    const controller = new AbortController();
    deleteControllerRef.current = controller;
    try {
      await api.deleteProject(project.id, controller.signal);
      if (deleteControllerRef.current !== controller) return;
      setDeletingProject(null);
      await removeCard(project);
      toast(`ลบโปรเจกต์ “${project.name}” แล้ว`, {
        icon: null,
        closeButton: true,
        classNames: PROJECT_TOAST_CLASSNAMES,
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => void restoreProject(project, originalIndex),
        },
      });
    } catch (cause) {
      if (!isAbortError(cause) && deleteControllerRef.current === controller) {
        logRequestFailure("delete project", cause);
        setDeleteError(
          apiErrorMessage(cause, "ลบโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง"),
        );
      }
    } finally {
      if (deleteControllerRef.current === controller) {
        deleteControllerRef.current = null;
        setDeleting(false);
      }
    }
  };

  const openProject = (project: ProjectOut) => {
    if (openingProject) return;
    setLastOpenedProjectId(project.id);
    window.localStorage.setItem(
      LAST_OPENED_PROJECT_STORAGE_KEY,
      String(project.id),
    );
    setOpeningProject(project);
    router.push(`/projects/${project.id}/assess`);
  };

  const hasProjects = projects.length > 0;
  const noSearchResults = hasProjects && visibleProjects.length === 0;

  return (
    <TooltipProvider delayDuration={400}>
      <ProjectsShell
        onBrandClick={closeCreateView}
        mobileTitle={
          pageMode === "create" ? (
            <nav
              aria-label="เส้นทางหน้าบนมือถือ"
              className="flex min-w-0 items-center gap-1.5"
            >
              <button
                type="button"
                className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                onClick={closeCreateView}
              >
                โปรเจกต์ทั้งหมด
              </button>
              <ChevronRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span aria-current="page" className="truncate text-foreground">
                สร้างโปรเจกต์ใหม่
              </span>
            </nav>
          ) : (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground sm:font-display sm:text-base sm:font-bold">
                โปรเจกต์ทั้งหมด
              </p>
              <p className="mt-0.5 hidden truncate text-[10px] font-normal text-muted-foreground sm:block">
                เลือกโปรเจกต์เพื่อจัดการสูตรและดูผลประเมิน
              </p>
            </div>
          )
        }
        header={
          pageMode === "list" ? (
            <div className="px-4 py-3 sm:px-6 xl:px-8">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="hidden min-w-0 xl:block">
                  <h1 className="font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
                    โปรเจกต์ทั้งหมด
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    เลือกโปรเจกต์เพื่อจัดการสูตรและดูผลประเมิน
                  </p>
                </div>

                <div className="flex w-full items-center justify-start gap-2 sm:w-auto sm:justify-end">
                  <div
                    role="search"
                    aria-label="ค้นหาโปรเจกต์"
                    className="min-w-0 flex-1 sm:w-72 sm:flex-none"
                  >
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        value={query}
                        placeholder="ค้นหาโปรเจกต์"
                        aria-label="ค้นหาโปรเจกต์"
                        className="h-10 bg-background pl-10 shadow-none"
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                  </div>

                  <div
                    role="group"
                    aria-label="รูปแบบการแสดงโปรเจกต์"
                    className="hidden shrink-0 rounded-xl border bg-background p-1 sm:flex"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="แสดงแบบตาราง"
                          aria-pressed={layoutMode === "grid"}
                          className={cn(
                            "size-8",
                            layoutMode === "grid" && "bg-accent text-primary",
                          )}
                          onClick={() => {
                            captureGridState();
                            setLayoutMode("grid");
                          }}
                        >
                          <LayoutGrid className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>แบบตาราง</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="แสดงแบบรายการ"
                          aria-pressed={layoutMode === "list"}
                          className={cn(
                            "size-8",
                            layoutMode === "list" && "bg-accent text-primary",
                          )}
                          onClick={() => {
                            captureGridState();
                            setLayoutMode("list");
                          }}
                        >
                          <List className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>แบบรายการ</TooltipContent>
                    </Tooltip>
                  </div>

                  {(loading || hasProjects) && (
                    <Button
                      type="button"
                      className="size-10 shrink-0 gap-2 px-0 sm:w-auto sm:px-4"
                      aria-label="สร้างโปรเจกต์"
                      onClick={openCreateView}
                    >
                      <Plus className="size-4" />
                      <span className="hidden sm:inline">สร้างโปรเจกต์</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden px-8 py-3 xl:block">
              <nav
                aria-label="เส้นทางหน้า"
                className="flex min-w-0 items-center gap-1.5 text-sm"
              >
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={closeCreateView}
                >
                  โปรเจกต์ทั้งหมด
                </button>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span
                  aria-current="page"
                  className="truncate font-medium text-foreground"
                >
                  สร้างโปรเจกต์ใหม่
                </span>
              </nav>
            </div>
          )
        }
      >
        {openingProject && <BrandedProgressLoader />}

        {pageMode === "create" ? (
          <ProjectCreateView
            saving={saving}
            error={formError}
            onCancel={closeCreateView}
            onSubmit={(values) => saveProject(values, "create")}
          />
        ) : (
          <div className="mx-auto min-w-0 w-full max-w-[92rem] overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">
          {loading && knownProjectCount > 0 && (
              <div
                className={cn(
                  "grid gap-4",
                  layoutMode === "grid"
                    ? "sm:grid-cols-2 2xl:grid-cols-3"
                    : "grid-cols-1",
                )}
              >
                {Array.from(
                  { length: Math.min(knownProjectCount, 3) },
                  (_, item) => (
                  <div
                    key={item}
                    className="self-start overflow-hidden rounded-2xl border bg-card animate-pulse motion-reduce:animate-none"
                  >
                    <div className="h-1 bg-muted" />
                    <div className="p-4 sm:p-5">
                      <div className="flex items-center gap-3">
                        <div className="size-10 shrink-0 rounded-xl bg-muted" />
                        <div className="min-w-0 flex-1">
                          <div className="h-3.5 w-1/3 rounded bg-muted" />
                          <div className="mt-2 h-2.5 w-1/2 rounded bg-muted/70" />
                        </div>
                        <div className="flex gap-2">
                          <div className="size-8 rounded-lg bg-muted/70" />
                          <div className="size-8 rounded-lg bg-muted/70" />
                        </div>
                      </div>
                      <div className="mt-4 border-t pt-3">
                        <div className="h-2.5 w-40 max-w-1/2 rounded bg-muted/70" />
                      </div>
                    </div>
                  </div>
                  ),
                )}
              </div>
            )}

          {!loading && loadError && (
            <div className="mx-auto max-w-2xl px-6 py-16 text-center sm:py-24">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                <RefreshCw className="size-5" />
              </span>
              <h2 className="mt-4 font-semibold text-foreground">โหลดโปรเจกต์ไม่สำเร็จ</h2>
              <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
              <Button className="mt-5 gap-2" onClick={() => void loadProjects()}>
                <RefreshCw className="size-4" />
                ลองอีกครั้ง
              </Button>
            </div>
          )}

          {!loading && !loadError && !hasProjects && (
            <Empty className="mx-auto max-w-xl px-4 py-16 sm:py-24">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-muted">
                  <FolderOpen />
                </EmptyMedia>
                <EmptyTitle>ยังไม่มีโปรเจกต์</EmptyTitle>
                <EmptyDescription className="max-w-sm">
                  สร้างโปรเจกต์แรกเพื่อเริ่มจัดการสูตรและผลประเมิน
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button className="h-11 gap-2 px-6" onClick={openCreateView}>
                  <Plus className="size-4" />
                  สร้างโปรเจกต์
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {!loading && !loadError && noSearchResults && (
            <div className="px-6 py-14 text-center">
              <Search className="mx-auto size-6 text-muted-foreground" />
              <h2 className="mt-3 font-semibold text-foreground">ไม่พบโปรเจกต์ที่ค้นหา</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                ลองเปลี่ยนชื่อหรือคำค้นหาอีกครั้ง
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setQuery("")}>
                ล้างคำค้นหา
              </Button>
            </div>
          )}

          {!loading && !loadError && visibleProjects.length > 0 && (
            <div
              ref={gridRef}
              className={cn(
                "grid min-w-0 gap-4",
                layoutMode === "grid" ? "sm:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1",
              )}
              aria-live="polite"
            >
              {paginatedProjects.map((project) => {
                const color = projectColor(project.color_key);
                const icon = projectIcon(project.icon_key);
                const ProjectIcon = icon.icon;
                return (
                  <Card
                    key={project.id}
                    data-project-card={project.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`เปิดโปรเจกต์ ${project.name}`}
                    className={cn(
                      "group relative flex min-w-0 w-full max-w-full self-start cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      layoutMode === "grid"
                        ? "min-h-[11.5rem]"
                        : "min-h-[5.5rem]",
                      "border-white",
                      color.hoverBorder,
                      color.glow,
                    )}
                    onClick={() => openProject(project)}
                    onKeyDown={(event) => {
                      if (event.currentTarget !== event.target) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openProject(project);
                      }
                    }}
                  >
                    <CardContent
                      className={cn(
                        "flex min-w-0 flex-1 flex-col p-4 sm:p-5",
                        layoutMode === "list" && "sm:flex-row sm:items-center sm:gap-6",
                      )}
                    >
                      <div
                        className={cn(
                          "flex min-w-0 items-center gap-3",
                          layoutMode === "list" && "min-w-0 flex-1",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-xl",
                            color.soft,
                            color.text,
                          )}
                        >
                          <ProjectIcon className="size-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-[15px] font-semibold text-foreground">
                            {project.name}
                          </h2>
                          <p
                            className={cn(
                              "mt-1 text-xs leading-5 text-muted-foreground",
                              layoutMode === "grid" ? "line-clamp-2" : "truncate",
                            )}
                          >
                            {project.description || "ยังไม่มีคำอธิบาย"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`แก้ไขโปรเจกต์ ${project.name}`}
                                className="size-11 text-muted-foreground hover:text-foreground sm:size-9"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditDialog(project);
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>แก้ไขโปรเจกต์</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`ลบโปรเจกต์ ${project.name}`}
                                className="size-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:size-9"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteError(null);
                                  setDeletingProject(project);
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>ลบโปรเจกต์</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "grid grid-cols-2 gap-3 text-xs",
                          layoutMode === "grid"
                            ? "mt-auto border-t pt-3"
                            : "mt-4 border-t pt-3 sm:ml-auto sm:mt-0 sm:w-[21rem] sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0",
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground">สร้างเมื่อ</p>
                            <p className="mt-0.5 truncate font-medium text-foreground">
                              {formatDate(project.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex min-w-0 items-start gap-2">
                          <Clock3 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground">แก้ไขล่าสุด</p>
                            <p className="mt-0.5 truncate font-medium text-foreground">
                              {formatDate(project.updated_at || project.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {Array.from(
                {
                  length: Math.max(
                    0,
                    PROJECTS_PER_PAGE - paginatedProjects.length,
                  ),
                },
                (_, index) => (
                  <div
                    key={`page-space-${index}`}
                    aria-hidden="true"
                    className={cn(
                      "invisible pointer-events-none hidden sm:block",
                      layoutMode === "grid"
                        ? "min-h-[11.5rem]"
                        : "min-h-[5.5rem]",
                    )}
                  />
                ),
              )}
            </div>
          )}

          <Pagination
            className="mt-5"
            aria-label="หน้ารายการโปรเจกต์"
          >
            <PaginationContent className="gap-0.5">
              <PaginationItem>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-0.5 px-2 text-xs text-muted-foreground hover:bg-accent hover:text-primary"
                  aria-label="หน้าก่อนหน้า"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
              </PaginationItem>

              {visiblePaginationEntries.map((entry, index) =>
                entry === "ellipsis" ? (
                  <PaginationItem key={`ellipsis-${index}`}>
                    <PaginationEllipsis className="size-8 text-muted-foreground" />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={entry}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "size-8 text-xs text-foreground hover:bg-accent hover:text-primary",
                        entry === currentPage &&
                          "border border-primary/25 bg-accent text-primary",
                      )}
                      aria-label={`ไปหน้าที่ ${entry}`}
                      aria-current={entry === currentPage ? "page" : undefined}
                      onClick={() => setCurrentPage(entry)}
                    >
                      {entry}
                    </Button>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-0.5 px-2 text-xs text-muted-foreground hover:bg-accent hover:text-primary"
                  aria-label="หน้าถัดไป"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="size-3.5" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          </div>
        )}

        <ProjectFormDialog
          open={formMode === "edit"}
          mode="edit"
          project={formProject}
          saving={saving}
          error={formError}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          onSubmit={(values) => saveProject(values, "edit")}
        />

        <AlertDialog
          open={deletingProject !== null}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setDeletingProject(null);
              setDeleteError(null);
            }
          }}
        >
          <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>ลบโปรเจกต์นี้หรือไม่?</AlertDialogTitle>
              <AlertDialogDescription>
                โปรเจกต์ “{deletingProject?.name}” จะถูกนำออกจากรายการ
                และคุณสามารถกด Undo จากข้อความแจ้งเตือนได้
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(event) => {
                  event.preventDefault();
                  void deleteProject();
                }}
              >
                {deleting && <LoaderCircle className="size-4 animate-spin" />}
                ลบโปรเจกต์
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ProjectsShell>
    </TooltipProvider>
  );
}
