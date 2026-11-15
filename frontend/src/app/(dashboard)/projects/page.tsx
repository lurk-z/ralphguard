"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, FolderOpen, Plus, RefreshCw, SearchX, Trash2 } from "lucide-react";

import BrandedProgressLoader from "@/components/shared/BrandedProgressLoader";
import { AppHeader } from "@/components/kit/app-header";
import { PageHeader } from "@/components/kit/page-header";
import { ProjectList, type ProjectListItem } from "@/components/kit/project-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiErrorMessage, type ProjectOut } from "@/lib/api";
import { projectColor, projectIcon } from "@/lib/project-appearance";
import { isAbortError, logRequestFailure } from "@/lib/request-reliability";
import { cn } from "@/lib/utils";

const PROJECT_ROUTE_ERRORS: Record<string, string> = {
  "invalid-project": "รหัสโปรเจกต์ไม่ถูกต้อง",
  "project-not-found": "ไม่พบโปรเจกต์นี้ หรือโปรเจกต์อาจถูกลบแล้ว",
  "project-load-failed": "เปิดโปรเจกต์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์",
};

const LAST_OPENED_PROJECT_STORAGE_KEY = "ralphguard:projects:last-opened-id";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openingProject, setOpeningProject] = useState(false);

  // Create / rename dialog (name only)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectOut | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete (one project or the ticked rows)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionKey, setSelectionKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ProjectOut[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadControllerRef = useRef<AbortController | null>(null);
  const formControllerRef = useRef<AbortController | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setLoadError(apiErrorMessage(cause, "โหลดรายการโปรเจกต์ไม่สำเร็จ"));
    } finally {
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const routeError = url.searchParams.get("projectError");
    if (routeError && PROJECT_ROUTE_ERRORS[routeError]) {
      toast.error(PROJECT_ROUTE_ERRORS[routeError]);
      url.searchParams.delete("projectError");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    void loadProjects();
    // Coming back with the browser Back button restores the page from cache: the loader must not still be on.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setOpeningProject(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      loadControllerRef.current?.abort();
      formControllerRef.current?.abort();
    };
  }, [loadProjects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("th-TH");
    if (!q) return projects;
    return projects.filter((p) => p.name.toLocaleLowerCase("th-TH").includes(q));
  }, [projects, query]);

  const listItems: ProjectListItem[] = useMemo(
    () =>
      filtered.map((p) => {
        const color = projectColor(p.color_key);
        return {
          id: String(p.id),
          name: p.name,
          createdAt: formatDate(p.created_at),
          updatedAt: formatDate(p.updated_at || p.created_at),
          createdAtISO: p.created_at,
          updatedAtISO: p.updated_at || p.created_at,
          icon: projectIcon(p.icon_key).icon,
          iconClassName: cn(color.soft, color.text),
        };
      }),
    [filtered],
  );

  const byId = (id: string) => projects.find((p) => String(p.id) === id);

  /* ---------------- open ---------------- */
  const openProject = (id: string) => {
    if (openingProject) return;
    window.localStorage.setItem(LAST_OPENED_PROJECT_STORAGE_KEY, id);
    setOpeningProject(true);
    // Go straight to the workspace (no /projects/[id]/assess redirect hop).
    router.push(`/assess?projectId=${id}`);
    // If the page never changes (server down, blocked navigation) drop the full-screen loader.
    openTimerRef.current = setTimeout(() => {
      setOpeningProject(false);
      toast.error("เปิดโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }, 20000);
  };

  /* ---------------- create / edit ---------------- */
  const openDialog = (project: ProjectOut | null) => {
    setEditing(project);
    setName(project?.name ?? "");
    setDialogOpen(true);
  };

  const saveProject = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    formControllerRef.current?.abort();
    const controller = new AbortController();
    formControllerRef.current = controller;
    try {
      if (editing) {
        // Rename only: keep the existing description, colour and icon.
        const updated = await api.updateProject(editing.id, trimmed, editing.description ?? "", editing.color_key, editing.icon_key, controller.signal);
        setProjects((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
        toast.success(`เปลี่ยนชื่อเป็น “${updated.name}” แล้ว`);
      } else {
        const created = await api.createProject(trimmed, undefined, "teal", "flask", controller.signal);
        setProjects((rows) => [created, ...rows]);
        toast.success(`สร้างโปรเจกต์ “${created.name}” แล้ว`);
      }
      setDialogOpen(false);
    } catch (cause) {
      if (isAbortError(cause)) return;
      logRequestFailure(editing ? "update project" : "create project", cause);
      toast.error(apiErrorMessage(cause, editing ? "เปลี่ยนชื่อไม่สำเร็จ กรุณาลองอีกครั้ง" : "สร้างโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      if (formControllerRef.current === controller) formControllerRef.current = null;
      setSaving(false);
    }
  };

  /* ---------------- delete + undo ---------------- */
  const restore = async (removed: ProjectOut[]) => {
    const results = await Promise.allSettled(removed.map((p) => api.restoreProject(p.id)));
    const restored = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (restored.length > 0) {
      setProjects((rows) => [...restored.filter((r) => !rows.some((row) => row.id === r.id)), ...rows]);
      toast.success(restored.length === 1 ? `กู้คืน “${restored[0].name}” แล้ว` : `กู้คืน ${restored.length} โปรเจกต์แล้ว`);
    }
    if (restored.length < removed.length) toast.error("กู้คืนบางโปรเจกต์ไม่สำเร็จ");
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const results = await Promise.allSettled(pendingDelete.map((p) => api.deleteProject(p.id)));
    const removed = pendingDelete.filter((_, i) => results[i].status === "fulfilled");
    setDeleting(false);
    if (removed.length > 0) {
      setProjects((rows) => rows.filter((row) => !removed.some((r) => r.id === row.id)));
      setSelectionKey((k) => k + 1);
      toast(removed.length === 1 ? `ลบโปรเจกต์ “${removed[0].name}” แล้ว` : `ลบ ${removed.length} โปรเจกต์แล้ว`, {
        duration: 8000,
        action: { label: "เลิกทำ", onClick: () => void restore(removed) },
      });
    }
    if (removed.length < pendingDelete.length) {
      setDeleteError("ลบบางโปรเจกต์ไม่สำเร็จ กรุณาลองอีกครั้ง");
      setPendingDelete(pendingDelete.filter((p) => !removed.includes(p)));
      return;
    }
    setPendingDelete(null);
  };

  const askDelete = (rows: ProjectOut[]) => {
    if (rows.length === 0) return;
    setDeleteError(null);
    setPendingDelete(rows);
  };

  /* ---------------- render ---------------- */
  const hasProjects = projects.length > 0;

  return (
    <div className="min-h-dvh bg-muted/30">
      {openingProject && <BrandedProgressLoader fullScreen label="กำลังเปิดโปรเจกต์" />}
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="โปรเจกต์ทั้งหมด"
          description="เลือกโปรเจกต์เพื่อจัดการสูตรและดูผลประเมิน"
          actions={
            <>
              {hasProjects && (
                <Input
                  search
                  value={query}
                  placeholder="ค้นหาโปรเจกต์"
                  aria-label="ค้นหาโปรเจกต์"
                  onChange={(e) => setQuery(e.target.value)}
                  onClear={() => setQuery("")}
                  containerClassName="flex-1 sm:w-72 sm:flex-none"
                />
              )}
              <Button onClick={() => openDialog(null)} className="shrink-0">
                <Plus /> สร้างโปรเจกต์
              </Button>
            </>
          }
        />

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2 text-sm">
            <span>เลือกแล้ว {selectedIds.length} โปรเจกต์</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => askDelete(selectedIds.map(byId).filter((p): p is ProjectOut => Boolean(p)))}
            >
              <Trash2 /> ลบที่เลือก
            </Button>
          </div>
        )}

        {loading && (
          <div className="space-y-2 rounded-xl border bg-card p-4" aria-label="กำลังโหลดโปรเจกต์">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && loadError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>โหลดโปรเจกต์ไม่สำเร็จ</AlertTitle>
            <AlertDescription>
              <p>{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void loadProjects()} className="mt-1">
                <RefreshCw /> ลองใหม่
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!loading && !loadError && !hasProjects && (
          <Empty className="border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              <EmptyTitle>ยังไม่มีโปรเจกต์</EmptyTitle>
              <EmptyDescription>สร้างโปรเจกต์แรกเพื่อเริ่มประเมินสูตรผลิตภัณฑ์</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="lg" onClick={() => openDialog(null)}>
                <Plus /> สร้างโปรเจกต์
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!loading && !loadError && hasProjects && filtered.length === 0 && (
          <Empty className="border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>ไม่พบโปรเจกต์ที่ตรงกับ “{query}”</EmptyTitle>
              <EmptyDescription>ลองค้นด้วยคำอื่น หรือล้างคำค้นหา</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => setQuery("")}>
                ล้างคำค้นหา
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!loading && !loadError && filtered.length > 0 && (
          <ProjectList
            projects={listItems}
            total={projects.length}
            selectionKey={selectionKey}
            onSelectionChange={setSelectedIds}
            onOpen={(item) => openProject(item.id)}
            onEdit={(item) => {
              const p = byId(item.id);
              if (p) openDialog(p);
            }}
            onDelete={(item) => {
              const p = byId(item.id);
              if (p) askDelete([p]);
            }}
          />
        )}
      </main>

      {/* Create / rename: name only */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent aria-describedby={undefined}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveProject();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "เปลี่ยนชื่อโปรเจกต์" : "สร้างโปรเจกต์ใหม่"}</DialogTitle>
            </DialogHeader>

            <Input
              id="project-name"
              aria-label="ชื่อโปรเจกต์"
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "กำลังบันทึก…" : editing ? "บันทึก" : "สร้างโปรเจกต์"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.length === 1 ? `ลบโปรเจกต์ “${pendingDelete[0].name}”?` : `ลบ ${pendingDelete?.length ?? 0} โปรเจกต์?`}
            </AlertDialogTitle>
            <AlertDialogDescription>สูตรและผลประเมินในโปรเจกต์จะถูกลบด้วย กด “เลิกทำ” ได้ภายใน 8 วินาทีหลังลบ</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "กำลังลบ…" : "ลบ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
