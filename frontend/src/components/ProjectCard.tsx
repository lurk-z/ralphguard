"use client";

// Redesigned project card — shared by the Overview and Projects pages.
// Adds a permanently visible edit/delete affordance.
// Clicking edit opens a modal to edit name, description, icon, and color.
import { useRef, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Folder,
  FolderOpen,
  FlaskConical,
  Beaker,
  TestTube2,
  Microscope,
  Leaf,
  Droplets,
  Star,
  Zap,
  Shield,
  Heart,
  Pencil,
  Trash2,
  Calendar,
  Sparkles,
  Atom,
  Dna,
  Sun,
  type LucideIcon,
} from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { deleteProject, updateProject, isProjectNameExists, type LocalProject } from "@/lib/projects";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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

type IconEntry = { key: string; icon: LucideIcon; label: string };
const ICONS: IconEntry[] = [
  { key: "folder-open",   icon: FolderOpen,    label: "โฟลเดอร์เปิด" },
  { key: "folder",        icon: Folder,         label: "โฟลเดอร์" },
  { key: "flask",         icon: FlaskConical,   label: "ฟลาสก์" },
  { key: "beaker",        icon: Beaker,         label: "บีกเกอร์" },
  { key: "test-tube",     icon: TestTube2,      label: "หลอดทดลอง" },
  { key: "microscope",    icon: Microscope,     label: "กล้องจุลทรรศน์" },
  { key: "leaf",          icon: Leaf,           label: "ใบไม้" },
  { key: "droplets",      icon: Droplets,       label: "หยดน้ำ" },
  { key: "star",          icon: Star,           label: "ดาว" },
  { key: "zap",           icon: Zap,            label: "สายฟ้า" },
  { key: "shield",        icon: Shield,         label: "โล่" },
  { key: "heart",         icon: Heart,          label: "หัวใจ" },
  { key: "sparkles",      icon: Sparkles,       label: "เปล่งประกาย" },
  { key: "atom",          icon: Atom,           label: "อะตอม" },
  { key: "dna",           icon: Dna,            label: "ดีเอ็นเอ" },
  { key: "sun",           icon: Sun,            label: "แสงแดด" },
];

const COLORS = [
  { hex: "#06b6d4", label: "ฟ้าเขียว (Cyan)" },
  { hex: "#3b82f6", label: "น้ำเงิน (Blue)" },
  { hex: "#8b5cf6", label: "ม่วง (Violet)" },
  { hex: "#ec4899", label: "ชมพู (Pink)" },
  { hex: "#f97316", label: "ส้ม (Orange)" },
  { hex: "#eab308", label: "เหลือง (Yellow)" },
  { hex: "#22c55e", label: "เขียว (Green)" },
  { hex: "#14b8a6", label: "เขียวมรกต (Teal)" },
  { hex: "#ef4444", label: "แดง (Red)" },
  { hex: "#6b7280", label: "เทา (Gray)" },
];

// Fallback palette cycled by index when project has no stored color
const FALLBACK_COLORS = ["#06b6d4", "#3b82f6", "#8b5cf6", "#f97316"];

export default function ProjectCard({
  project,
  index = 0,
  onChanged,
}: {
  project: LocalProject;
  /** Position in the grid — drives the fallback accent and stagger delay. */
  index?: number;
  /** Called after a rename or delete so the parent can reload its list. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [navProgress, setNavProgress] = useState(0);
  const navTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // States for modal editing
  const accentColor = project.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description ?? "");
  const [editIcon, setEditIcon] = useState(project.icon ?? "folder-open");
  const [editColor, setEditColor] = useState(accentColor);

  const isDuplicate = useMemo(() => {
    return isProjectNameExists(editName.trim(), project.id);
  }, [editName, project.id]);

  const handleNavigate = useCallback(() => {
    if (isNavigating) return;
    setIsNavigating(true);
    setNavProgress(0);
    let pct = 0;
    navTimer.current = setInterval(() => {
      pct += 25;
      setNavProgress(pct);
      if (pct >= 100) {
        if (navTimer.current) clearInterval(navTimer.current);
        router.push(`/projects/${project.id}/assess`);
      }
    }, 60);
  }, [isNavigating, project.id, router]);

  const IconComp: LucideIcon = (ICONS.find((i) => i.key === (project.icon ?? "folder-open")) ?? ICONS[0]).icon;

  const handleSave = () => {
    if (!editName.trim() || isDuplicate) return;
    updateProject(project.id, {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
      icon: editIcon,
      color: editColor,
    });
    setIsEditOpen(false);
    onChanged();
  };

  const handleOpenEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Reset inputs to current project values on open
    setEditName(project.name);
    setEditDesc(project.description ?? "");
    setEditIcon(project.icon ?? "folder-open");
    setEditColor(accentColor);
    setIsEditOpen(true);
  };

  return (
    <>
      {isNavigating && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-md"
        >
          <div className="w-full max-w-xs text-center flex flex-col items-center px-4 gap-4">
            <img src="/icons/logo.svg" alt="RalphGuard" className="size-20 animate-logo-breathe" />
            <div className="w-full flex flex-col items-center gap-2">
              <Progress value={navProgress} className="h-1.5 w-full bg-muted" />
              <p className="text-sm font-medium text-muted-foreground">กำลังเข้าสู่โปรเจกต์…</p>
            </div>
          </div>
        </div>
      )}
      <Card
        role="button"
        tabIndex={0}
        onClick={handleNavigate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleNavigate();
          }
        }}
        style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
        className={cn(
          "group relative animate-in fade-in slide-in-from-bottom-2 overflow-hidden border-border py-0 shadow-sm duration-300",
          "cursor-pointer transition-shadow hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {/* Accent bar — uses the project's saved colour */}
        <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />

        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            {/* Icon badge — tinted with the project colour */}
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl transition-colors"
              style={{ backgroundColor: accentColor + "22", color: accentColor }}
            >
              <IconComp className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-foreground">{project.name}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {project.description || "ไม่มีคำอธิบาย"}
              </p>
            </div>

            {/* Edit/delete — permanently visible */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="แก้ไขโปรเจกต์"
                onClick={handleOpenEdit}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="ลบโปรเจกต์"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="my-4 border-t border-border" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3.5 text-muted-foreground/70" />
              <span>สร้างเมื่อ {formatDate(project.created_at)}</span>
            </div>
            <ArrowRight className="size-4 text-muted-foreground/75 transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation Dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบโปรเจกต์ "{project.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              สูตรและประวัติการประเมินของโปรเจกต์นี้จะหายไปจากเครื่องนี้ถาวร กู้คืนไม่ได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.stopPropagation();
                deleteProject(project.id);
                onChanged();
              }}
            >
              ลบโปรเจกต์
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit modal Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent
          className="sm:max-w-[480px]"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>แก้ไขโปรเจกต์</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 1. Name */}
            <div className="grid gap-2">
              <Label htmlFor="edit-name" className="text-sm font-semibold text-foreground">
                ชื่อโปรเจกต์
              </Label>
              <Input
                id="edit-name"
                value={editName}
                maxLength={100}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="เช่น Hand Cream Formula Test"
                className={cn(
                  "h-10 bg-background",
                  isDuplicate && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {isDuplicate && (
                <p className="text-xs font-medium text-destructive animate-in fade-in slide-in-from-top-1 duration-150">
                  * ชื่อโปรเจกต์นี้ถูกใช้งานไปแล้ว กรุณาใช้ชื่ออื่น
                </p>
              )}
            </div>

            {/* 2. Description */}
            <div className="grid gap-2">
              <Label htmlFor="edit-desc" className="text-sm font-semibold text-foreground">
                คำอธิบายสั้น ๆ <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
              </Label>
              <Textarea
                id="edit-desc"
                value={editDesc}
                maxLength={500}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="อธิบายวัตถุประสงค์หรือขอบเขตของโปรเจกต์โดยสั้น ๆ"
                className="min-h-[80px] resize-none bg-background"
              />
            </div>

            {/* 3. Icon */}
            <div className="grid gap-2">
              <Label className="text-sm font-semibold text-foreground">
                ไอคอนโปรเจกต์
              </Label>
              <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto p-0.5">
                {ICONS.map((entry) => {
                  const Icon = entry.icon;
                  const isSelected = editIcon === entry.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      title={entry.label}
                      onClick={() => setEditIcon(entry.key)}
                      style={isSelected ? { backgroundColor: editColor + "22", borderColor: editColor, color: editColor } : {}}
                      className={[
                        "grid size-9 place-items-center rounded-lg border transition-all duration-150",
                        isSelected
                          ? "border-2 scale-105"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      ].join(" ")}
                    >
                      <Icon className="size-4.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Color */}
            <div className="grid gap-2">
              <Label className="text-sm font-semibold text-foreground">
                สีประจำโปรเจกต์
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((entry) => {
                  const isSelected = editColor === entry.hex;
                  return (
                    <button
                      key={entry.hex}
                      type="button"
                      title={entry.label}
                      onClick={() => setEditColor(entry.hex)}
                      style={{ backgroundColor: entry.hex }}
                      className={[
                        "size-7 rounded-full border-2 transition-all duration-150",
                        isSelected ? "scale-110 border-white shadow-md ring-2 ring-offset-1" : "border-transparent hover:scale-105",
                      ].join(" ")}
                      data-ring-color={entry.hex}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditOpen(false);
              }}
            >
              ยกเลิก
            </Button>
            <Button
              disabled={!editName.trim() || isDuplicate}
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              style={(editName.trim() && !isDuplicate) ? { backgroundColor: editColor, borderColor: editColor } : {}}
            >
              บันทึกการเปลี่ยนแปลง
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
