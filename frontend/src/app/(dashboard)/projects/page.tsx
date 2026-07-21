"use client";

// Project List — the shared project workspace backed by the project API.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarDays,
  FlaskConical,
  FolderOpen,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DashboardShell from "@/components/layout/DashboardShell";
import { api, apiErrorMessage, type ProjectOut } from "@/lib/api";
import { deleteProjectWorkspace } from "@/lib/project-workspace";

const PROJECT_ROUTE_ERRORS: Record<string, string> = {
  "invalid-project": "รหัสโปรเจกต์ไม่ถูกต้อง",
  "project-not-found": "ไม่พบโปรเจกต์นี้ หรือโปรเจกต์อาจถูกลบแล้ว",
  "project-load-failed": "เปิดโปรเจกต์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์",
};

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

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectOut | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectOut | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

    let alive = true;
    api
      .listProjects()
      .then((rows) => {
        if (!alive) return;
        setProjects(rows);
        setLoadError(null);
      })
      .catch((cause) => {
        if (!alive) return;
        const message = apiErrorMessage(cause, "โหลดรายการโปรเจกต์ไม่สำเร็จ");
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const empty = !loadError && projects.length === 0;

  const startEditing = (project: ProjectOut) => {
    setEditingProject(project);
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setActionError(null);
  };

  const saveProject = async () => {
    if (!editingProject || saving) return;
    const name = editName.trim();
    if (!name) {
      setActionError("กรุณากรอกชื่อโปรเจกต์");
      return;
    }

    setSaving(true);
    setActionError(null);
    try {
      const updated = await api.updateProject(editingProject.id, name, editDescription);
      setProjects((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setEditingProject(null);
    } catch (cause) {
      setActionError(`แก้ไขโปรเจกต์ไม่สำเร็จ: ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async () => {
    if (!deletingProject || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api.deleteProject(deletingProject.id);
      deleteProjectWorkspace(deletingProject.id);
      setProjects((rows) => rows.filter((row) => row.id !== deletingProject.id));
      setDeletingProject(null);
    } catch (cause) {
      setActionError(`ลบโปรเจกต์ไม่สำเร็จ: ${String(cause)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardShell breadcrumbs={[{ label: "โปรเจกต์" }]}>
      <div className="px-6 py-7 lg:px-8 lg:py-9">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
              <span className="grid size-7 place-items-center rounded-lg bg-accent">
                <FolderOpen className="size-4" />
              </span>
              PROJECT WORKSPACE
            </div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">โปรเจกต์ทั้งหมด</h1>
              {!loading && (
                <span className="rounded-full border bg-card px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                  {projects.length} โปรเจกต์
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              จัดการสูตร ผลการประเมิน และรายงานของแต่ละงานไว้ในพื้นที่เดียว
            </p>
          </div>

          <Button className="h-11 gap-2 px-5 shadow-sm" onClick={() => router.push("/projects/new")}>
            <Plus className="size-4" />
            สร้างโปรเจกต์
          </Button>
        </div>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-xl border bg-card p-5">
                <div className="size-10 rounded-xl bg-muted" />
                <div className="mt-4 h-3 w-2/3 rounded bg-muted" />
                <div className="mt-2 h-2.5 w-full rounded bg-muted/70" />
              </div>
            ))}
          </div>
        )}

        {!loading && empty && (
          <Empty className="border border-dashed bg-card/60 py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FlaskConical />
              </EmptyMedia>
              <EmptyTitle>ยังไม่มีโปรเจกต์</EmptyTitle>
              <EmptyDescription>
                เริ่มต้นด้วยการสร้างโปรเจกต์สำหรับเก็บสูตรและผลการประเมิน
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button className="h-11 gap-2 px-6" onClick={() => router.push("/projects/new")}>
                <Plus className="size-4" />
                สร้างโปรเจกต์
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!loading && !loadError && !empty && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/projects/${p.id}/assess`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/projects/${p.id}/assess`);
                  }
                }}
                className="group cursor-pointer overflow-hidden border-border shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="h-1 bg-gradient-to-r from-primary via-teal-400 to-transparent opacity-70" />
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <FolderOpen className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-foreground">{p.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {p.description || "ไม่มีคำอธิบาย"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="แก้ไขโปรเจกต์"
                        aria-label={`แก้ไขโปรเจกต์ ${p.name}`}
                        className="size-8 text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditing(p);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="ลบโปรเจกต์"
                        aria-label={`ลบโปรเจกต์ ${p.name}`}
                        className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActionError(null);
                          setDeletingProject(p);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    <span>สร้างเมื่อ {formatDate(p.created_at)}</span>
                    <ArrowRight className="ml-auto size-4 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={editingProject !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditingProject(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขโปรเจกต์</DialogTitle>
            <DialogDescription>ปรับชื่อและคำอธิบายของโปรเจกต์นี้</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-project-name">ชื่อโปรเจกต์</Label>
              <Input
                id="edit-project-name"
                value={editName}
                maxLength={200}
                autoFocus
                onChange={(event) => setEditName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveProject();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-project-description">คำอธิบาย</Label>
              <Textarea
                id="edit-project-description"
                value={editDescription}
                maxLength={2000}
                rows={4}
                placeholder="อธิบายวัตถุประสงค์หรือรายละเอียดของโปรเจกต์"
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </div>
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditingProject(null)}
            >
              ยกเลิก
            </Button>
            <Button type="button" disabled={saving || !editName.trim()} onClick={() => void saveProject()}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              บันทึกการแก้ไข
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingProject !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeletingProject(null);
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบโปรเจกต์นี้หรือไม่?</AlertDialogTitle>
            <AlertDialogDescription>
              โปรเจกต์ “{deletingProject?.name}” และผลการประเมินภายในโปรเจกต์จะถูกลบถาวร
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
    </DashboardShell>
  );
}
