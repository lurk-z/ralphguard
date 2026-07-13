"use client";

// Create Project — form only; the sidebar/top bar come from DashboardShell.
// On submit it creates the project via the API and routes into its workspace.
// Card illustrations are intentionally left as empty placeholders.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import DashboardShell from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";

const NAME_MAX = 100;
const DESC_MAX = 500;

/** Empty box reserving space where an illustration will go. */
function ImagePlaceholder({ className = "", label }: { className?: string; label?: string }) {
  return (
    <div
      aria-hidden
      className={`grid place-items-center rounded-xl border border-dashed border-border bg-muted/60 text-[11px] text-muted-foreground/70 ${className}`}
    >
      {label}
    </div>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = name.trim().length > 0 && !creating;

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const project = await api.createProject(name.trim(), desc.trim() || undefined);
      router.push(`/projects/${project.id}/assess`);
    } catch {
      // Backend unreachable — continue the flow with a local id so the
      // workspace is still reachable for demos.
      router.push(`/projects/local-${Date.now()}/assess`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardShell
      title="สร้างโปรเจกต์ใหม่"
      subtitle="เพียงกรอกข้อมูลพื้นฐาน ตอนนี้ และเพิ่มข้อมูลสารเคมีหรือสูตรได้ในหน้าการทดลอง"
    >
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        {/* Left — form */}
        <section>
          <Card className="border-border shadow-sm">
            <CardContent className="p-6">
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
                    placeholder="เช่น Hand Cream Formula Test"
                    className="h-12 bg-background pr-16"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs tabular-nums text-muted-foreground">
                    {name.length} / {NAME_MAX}
                  </span>
                </div>
              </div>

              {/* 2. Description */}
              <div className="mt-6 grid gap-2">
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
                  className="min-h-[116px] resize-y bg-background"
                />
                <span className="justify-self-end font-mono text-xs tabular-nums text-muted-foreground">
                  {desc.length} / {DESC_MAX}
                </span>
              </div>

              {/* Info callout */}
              <div className="mt-2 flex gap-3 rounded-xl bg-accent/60 p-4">
                <Info className="mt-0.5 size-5 shrink-0 text-accent-foreground" />
                <div className="text-sm">
                  <p className="font-semibold text-foreground">หลังจากสร้างโปรเจกต์แล้ว</p>
                  <p className="mt-0.5 text-muted-foreground">
                    คุณจะไปยังหน้าการทดลอง เพื่อเพิ่มข้อมูลสารเคมีหรือสูตร และเริ่มการวิเคราะห์ต่อได้ทันที
                  </p>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="flex justify-end gap-3">
                <Button variant="outline" className="h-11 px-6" onClick={() => router.push("/projects")}>
                  ยกเลิก
                </Button>
                <Button className="h-11 px-6" disabled={!canCreate} onClick={create}>
                  {creating ? "กำลังสร้าง…" : "สร้างโปรเจกต์"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Right — aside cards */}
        <aside className="flex flex-col gap-6">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold text-foreground">โปรเจกต์ล่าสุด</h2>
              <ImagePlaceholder className="mt-4 h-32 w-full" label="ภาพประกอบ" />
              <p className="mt-4 text-center text-sm font-semibold text-foreground">
                ยังไม่มีโปรเจกต์ล่าสุด
              </p>
              <p className="mt-1 text-center text-xs leading-relaxed text-muted-foreground">
                เมื่อคุณสร้างโปรเจกต์ใหม่ รายการล่าสุดจะแสดงในส่วนนี้
              </p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold text-foreground">สิ่งที่จะเกิดขึ้นถัดไป</h2>
              <div className="mt-4 flex gap-4">
                <ImagePlaceholder className="size-16 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">หน้าการทดลอง</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    คุณจะเพิ่มสารเคมีหรือสูตรของคุณ ตรวจสอบความปลอดภัย และเริ่มต้นการวิเคราะห์ด้วย AI
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </DashboardShell>
  );
}
