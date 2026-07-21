"use client";

// Create Project — focused two-step entry into the assessment workspace.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  FlaskConical,
  FolderPlus,
  Info,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DashboardShell from "@/components/layout/DashboardShell";
import { api, apiErrorMessage } from "@/lib/api";
import { isAbortError, logRequestFailure } from "@/lib/request-reliability";

const NAME_MAX = 100;
const DESC_MAX = 500;

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const createControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => createControllerRef.current?.abort(), []);

  const canCreate = name.trim().length > 0 && !creating;

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    createControllerRef.current?.abort();
    const controller = new AbortController();
    createControllerRef.current = controller;
    try {
      const project = await api.createProject(
        name.trim(),
        desc.trim() || undefined,
        controller.signal,
      );
      if (createControllerRef.current !== controller) return;
      router.push(`/projects/${project.id}/assess`);
    } catch (cause) {
      if (!isAbortError(cause) && createControllerRef.current === controller) {
        logRequestFailure("create project", cause);
        toast.error(apiErrorMessage(cause, "สร้างโปรเจกต์ไม่สำเร็จ"));
      }
    } finally {
      if (createControllerRef.current === controller) {
        createControllerRef.current = null;
        setCreating(false);
      }
    }
  };

  return (
    <DashboardShell
      breadcrumbs={[
        { label: "โปรเจกต์", href: "/projects" },
        { label: "สร้างโปรเจกต์ใหม่" },
      ]}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-7 lg:px-8 lg:py-10">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          กลับไปยังโปรเจกต์
        </button>

        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
              <span className="grid size-7 place-items-center rounded-lg bg-accent">
                <FolderPlus className="size-4" />
              </span>
              NEW PROJECT
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              เริ่มโปรเจกต์ประเมินสูตร
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              ตั้งชื่อพื้นที่ทำงานของคุณก่อน จากนั้นจึงเพิ่มสูตร สแกนฉลาก และประเมินความเสี่ยงทั้ง 4 ด้านใน Assessment Studio
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-semibold text-primary-foreground">
              <span className="grid size-4 place-items-center rounded-full bg-white/20 text-[9px]">1</span>
              รายละเอียดโปรเจกต์
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/50" />
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-muted-foreground">
              <span className="grid size-4 place-items-center rounded-full border text-[9px]">2</span>
              เพิ่มและประเมินสูตร
            </span>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <Card className="overflow-hidden border-border shadow-sm">
              <div className="border-b bg-gradient-to-r from-accent/80 via-card to-card px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <FlaskConical className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-foreground">ข้อมูลพื้นฐาน</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">ใช้สำหรับค้นหาและแยกผลการประเมินของแต่ละงาน</p>
                  </div>
                </div>
              </div>

              <CardContent className="p-6 sm:p-7">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="project-name" className="text-sm font-semibold text-foreground">
                      ชื่อโปรเจกต์ <span className="text-destructive">*</span>
                    </Label>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {name.length}/{NAME_MAX}
                    </span>
                  </div>
                  <div className="relative">
                    <FlaskConical className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="project-name"
                      autoFocus
                      value={name}
                      maxLength={NAME_MAX}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="เช่น Moisturizer Safety Screening"
                      className="h-12 bg-background pl-10 text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">ตั้งชื่อให้สื่อถึงผลิตภัณฑ์ รุ่นสูตร หรือรอบการทดลอง</p>
                </div>

                <div className="mt-6 grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="project-desc" className="text-sm font-semibold text-foreground">
                      คำอธิบาย <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
                    </Label>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {desc.length}/{DESC_MAX}
                    </span>
                  </div>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                    <Textarea
                      id="project-desc"
                      value={desc}
                      maxLength={DESC_MAX}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="วัตถุประสงค์ ขอบเขต หรือสิ่งที่ต้องการเปรียบเทียบในโปรเจกต์นี้"
                      className="min-h-[132px] resize-y bg-background pl-10 text-sm leading-relaxed"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3 rounded-xl border border-primary/15 bg-accent/45 p-4">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-foreground">ยังไม่ต้องกรอกส่วนผสมในขั้นตอนนี้</p>
                    <p className="mt-0.5">หลังสร้างโปรเจกต์ ระบบจะพาไปยัง Assessment Studio เพื่อเลือกเทมเพลต เพิ่มสาร หรืออ่านฉลากด้วย OCR</p>
                  </div>
                </div>

                <div className="mt-7 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" className="h-11 px-6" onClick={() => router.push("/projects") }>
                    ยกเลิก
                  </Button>
                  <Button type="submit" className="h-11 gap-2 px-6" disabled={!canCreate}>
                    {creating ? (
                      "กำลังสร้าง…"
                    ) : (
                      <>
                        สร้างและไปหน้าประเมิน
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <Card className="overflow-hidden border-primary/20 shadow-sm">
              <div className="h-1 bg-primary" />
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Project preview</span>
                  <span className={`size-2 rounded-full ${name.trim() ? "bg-emerald-500" : "bg-muted-foreground/25"}`} />
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                    <FlaskConical className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className={`truncate font-semibold ${name.trim() ? "text-foreground" : "text-muted-foreground"}`}>
                      {name.trim() || "ชื่อโปรเจกต์ของคุณ"}
                    </h3>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {desc.trim() || "คำอธิบายจะแสดงตรงนี้ เพื่อช่วยให้ทีมเข้าใจวัตถุประสงค์ของงาน"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-2 text-[11px] text-muted-foreground">
                  {name.trim() ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Sparkles className="size-3.5" />}
                  {name.trim() ? "พร้อมสร้างโปรเจกต์" : "กรอกชื่อโปรเจกต์เพื่อดำเนินการต่อ"}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground">ขั้นตอนถัดไป</h3>
                <div className="mt-4 space-y-4">
                  {[
                    { icon: FlaskConical, title: "เพิ่มหรือสแกนสูตร", text: "กรอกสาร เลือกจากคลัง หรือใช้ OCR อ่านฉลาก" },
                    { icon: Sparkles, title: "ประเมินด้วย AI/QSAR", text: "ดูผลผิว ตา การแพ้ และพิษเฉียบพลัน" },
                    { icon: ShieldCheck, title: "ตรวจความน่าเชื่อถือ", text: "ดู coverage, confidence และสารที่ยังประเมินไม่ได้" },
                  ].map((item, index) => (
                    <div key={item.title} className="flex gap-3">
                      <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                        <item.icon className="size-4" />
                        <span className="absolute -left-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                          {index + 1}
                        </span>
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}
