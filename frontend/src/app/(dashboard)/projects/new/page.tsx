"use client";

// Create Project — form only; the sidebar/top bar come from DashboardShell.
// On submit it creates the project via the API and routes into its workspace.
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Info,
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
  ArrowRight,
  Sparkles,
  Atom,
  Dna,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import DashboardShell from "@/components/layout/DashboardShell";
import ProjectCreationProgress from "@/components/ProjectCreationProgress";
import { createProject, isProjectNameExists } from "@/lib/projects";
import { cn } from "@/lib/utils";

const NAME_MAX = 100;
const DESC_MAX = 500;

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

// ─── Icon catalogue ──────────────────────────────────────────────────────────
type IconEntry = { key: string; icon: LucideIcon; label: string };
const ICONS: IconEntry[] = [
  { key: "folder-open", icon: FolderOpen, label: "โฟลเดอร์เปิด" },
  { key: "folder", icon: Folder, label: "โฟลเดอร์" },
  { key: "flask", icon: FlaskConical, label: "ฟลาสก์" },
  { key: "beaker", icon: Beaker, label: "บีกเกอร์" },
  { key: "test-tube", icon: TestTube2, label: "หลอดทดลอง" },
  { key: "microscope", icon: Microscope, label: "กล้องจุลทรรศน์" },
  { key: "leaf", icon: Leaf, label: "ใบไม้" },
  { key: "droplets", icon: Droplets, label: "หยดน้ำ" },
  { key: "star", icon: Star, label: "ดาว" },
  { key: "zap", icon: Zap, label: "สายฟ้า" },
  { key: "shield", icon: Shield, label: "โล่" },
  { key: "heart", icon: Heart, label: "หัวใจ" },
  { key: "sparkles", icon: Sparkles, label: "เปล่งประกาย" },
  { key: "atom", icon: Atom, label: "อะตอม" },
  { key: "dna", icon: Dna, label: "ดีเอ็นเอ" },
  { key: "sun", icon: Sun, label: "แสงแดด" },
];

// ─── Colour palette ───────────────────────────────────────────────────────────
type ColorEntry = { hex: string; label: string };
const COLORS: ColorEntry[] = [
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

// ─── Icon picker item (Subtle and small) ──────────────────────────────────────
function IconButton({
  entry,
  selected,
  onClick,
}: {
  entry: IconEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      title={entry.label}
      aria-label={entry.label}
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "grid size-8 place-items-center rounded-lg border transition-all duration-150",
        selected
          ? "border-2 border-brand bg-brand/10 text-brand-dark scale-105"
          : "border-border bg-muted/40 text-muted-foreground hover:border-border/80 hover:bg-accent hover:text-accent-foreground",
      ].join(" ")}
    >
      <Icon className="size-4" />
    </button>
  );
}

// ─── Colour swatch item (Subtle and small) ────────────────────────────────────
function ColorSwatch({
  entry,
  selected,
  onClick,
}: {
  entry: ColorEntry;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={entry.label}
      aria-label={entry.label}
      aria-pressed={selected}
      onClick={onClick}
      style={{ backgroundColor: entry.hex }}
      className={[
        "size-6 rounded-full border transition-all duration-150",
        selected ? "scale-110 border-white shadow-md ring-2 ring-offset-1" : "border-transparent hover:scale-105",
      ].join(" ")}
      data-ring-color={entry.hex}
    />
  );
}

// ─── Project preview card ─────────────────────────────────────────────────────
function PreviewCard({
  name,
  desc,
  iconKey,
  color,
}: {
  name: string;
  desc: string;
  iconKey: string;
  color: string;
}) {
  const entry = ICONS.find((i) => i.key === iconKey) ?? ICONS[0];
  const Icon = entry.icon;
  const today = new Date().toISOString();

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
      {/* accent bar */}
      <div className="h-1 w-full" style={{ backgroundColor: color }} />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: color + "22", color }}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">
              {name || "ชื่อโปรเจกต์"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {desc || "ไม่มีคำอธิบาย"}
            </p>
          </div>

          {/* Dummy edit/delete to match ProjectCard */}
          <div className="flex shrink-0 items-center gap-1">
            <div className="grid size-7 place-items-center rounded-md text-muted-foreground/60">
              <Pencil className="size-3.5" />
            </div>
            <div className="grid size-7 place-items-center rounded-md text-muted-foreground/60">
              <Trash2 className="size-3.5" />
            </div>
          </div>
        </div>

        <div className="my-4 border-t border-border" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5 text-muted-foreground/70" />
            <span>สร้างเมื่อ {formatDate(today)}</span>
          </div>
          <ArrowRight className="size-4 text-muted-foreground/75" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string>(ICONS[0].key);
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0].hex);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDuplicate = useMemo(() => {
    return isProjectNameExists(name.trim());
  }, [name]);

  const canCreate = name.trim().length > 0 && !isDuplicate && !creating;

  const create = () => {
    if (!canCreate) return;
    setCreating(true);
    setProgress(0);

    const project = createProject(
      name.trim(),
      desc.trim() || undefined,
      selectedIcon,
      selectedColor,
    );
    let pct = 0;
    progressTimer.current = setInterval(() => {
      pct += 20;
      setProgress(pct);
      if (pct >= 100) {
        if (progressTimer.current) clearInterval(progressTimer.current);
        router.push(`/projects/${project.id}/assess`);
      }
    }, 60);
  };

  return (
    <DashboardShell
      breadcrumbs={[
        { label: "โปรเจกต์", href: "/projects" },
        { label: "สร้างโปรเจกต์ใหม่" },
      ]}
    >
      <div className="px-6 py-6 lg:px-8">


        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-stretch">
          {/* ── Left — Form (Name & Description only) ────────────────── */}
          <section
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationFillMode: "backwards" }}
          >
            <Card className="border-border shadow-sm h-full">
              <CardContent className="p-6 flex flex-col justify-between h-full min-h-[460px]">
                <div className="space-y-6">
                  {/* 1. Name */}
                  <div className="grid gap-2">
                    <Label htmlFor="project-name" className="text-sm font-semibold text-foreground">
                      1. ชื่อโปรเจกต์
                    </Label>
                    <div className="relative">
                      <Input
                        id="project-name"
                        value={name}
                        maxLength={NAME_MAX}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && create()}
                        placeholder="Skin Care Test Project"
                        className={cn(
                          "h-12 bg-background pr-16",
                          isDuplicate && "border-destructive focus-visible:ring-destructive"
                        )}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs tabular-nums text-muted-foreground">
                        {name.length} / {NAME_MAX}
                      </span>
                    </div>
                    {isDuplicate && (
                      <p className="text-xs font-medium text-destructive animate-in fade-in slide-in-from-top-1 duration-150">
                        * ชื่อโปรเจกต์นี้ถูกใช้งานไปแล้ว กรุณาใช้ชื่ออื่น
                      </p>
                    )}
                  </div>

                  {/* 2. Description */}
                  <div className="grid gap-2">
                    <Label htmlFor="project-desc" className="text-sm font-semibold text-foreground">
                      2. คำอธิบายสั้น ๆ{" "}
                      <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
                    </Label>
                    <Textarea
                      id="project-desc"
                      value={desc}
                      maxLength={DESC_MAX}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="อธิบายวัตถุประสงค์หรือขอบเขตของโปรเจกต์โดยสั้น ๆ"
                      className="min-h-[100px] resize-none bg-background"
                    />
                    <span className="justify-self-end font-mono text-xs tabular-nums text-muted-foreground">
                      {desc.length} / {DESC_MAX}
                    </span>
                  </div>

                  {/* Info callout */}
                  <div className="flex gap-3 rounded-xl bg-accent/60 p-4">
                    <Info className="mt-0.5 size-5 shrink-0 text-accent-foreground" />
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">หลังจากสร้างโปรเจกต์แล้ว</p>
                      <p className="mt-0.5 text-muted-foreground">
                        คุณจะไปยังหน้าการทดลอง เพื่อเพิ่มข้อมูลสารเคมีหรือสูตร และเริ่มการวิเคราะห์ต่อได้ทันที
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    className="h-11 px-6"
                    onClick={() => router.push("/projects")}
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    className="h-11 px-6"
                    disabled={!canCreate}
                    onClick={create}
                  >
                    {creating ? "กำลังสร้าง…" : "สร้างโปรเจกต์"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Right — Aside (Preview, Icon, Color Picker) ──────────── */}
          <aside
            className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full"
            style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
          >
            <Card className="border-border shadow-sm h-full">
              <CardContent className="p-5 flex flex-col justify-between h-full min-h-[460px] gap-4">
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">ตัวอย่างการ์ด</h2>
                  <PreviewCard
                    name={name}
                    desc={desc}
                    iconKey={selectedIcon}
                    color={selectedColor}
                  />
                </div>

                <div className="space-y-4">
                  <Separator />
                  {/* 3. Icon */}
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      ไอคอนโปรเจกต์
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {ICONS.map((entry) => (
                        <IconButton
                          key={entry.key}
                          entry={entry}
                          selected={selectedIcon === entry.key}
                          onClick={() => setSelectedIcon(entry.key)}
                        />
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* 4. Color */}
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      สีประจำโปรเจกต์
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {COLORS.map((entry) => (
                        <ColorSwatch
                          key={entry.hex}
                          entry={entry}
                          selected={selectedColor === entry.hex}
                          onClick={() => setSelectedColor(entry.hex)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {creating && <ProjectCreationProgress progress={progress} />}
    </DashboardShell>
  );
}
