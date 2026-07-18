"use client";

// หน้าแรก — quick stats + a shortcut into the most recent work, so the
// sidebar has a real landing page instead of dropping straight into the
// project list every time.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, FolderKanban, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DashboardShell from "@/components/layout/DashboardShell";
import ProjectCard from "@/components/ProjectCard";
import { listProjects, type LocalProject } from "@/lib/projects";

function StatCard({
  icon: Icon,
  label,
  value,
  index,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  index: number;
}) {
  return (
    <Card
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
      className="animate-in fade-in slide-in-from-bottom-2 border-border duration-300"
    >
      <CardContent className="flex items-center gap-3 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-2xl font-display font-bold text-foreground">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[]>([]);

  const reload = () => setProjects(listProjects());
  useEffect(reload, []);

  const totalRuns = projects.reduce((sum, p) => sum + p.jobs.length, 0);
  const recent = projects.slice(0, 3);

  return (
    <DashboardShell breadcrumbs={[{ label: "หน้าแรก" }]}>
      <div className="px-6 py-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              ยินดีต้อนรับกลับมา
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ภาพรวมงานประเมินความเสี่ยงสารเคมีทั้งหมดของคุณ
            </p>
          </div>
          <Button className="h-10 shrink-0 gap-2 px-5" onClick={() => router.push("/projects/new")}>
            <Plus className="size-4" />
            สร้างโปรเจกต์
          </Button>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={FolderKanban}
            label="โปรเจกต์ทั้งหมด"
            value={String(projects.length)}
            index={0}
          />
          <StatCard
            icon={FlaskConical}
            label="การประเมินที่รันไปแล้ว"
            value={String(totalRuns)}
            index={1}
          />
          <StatCard
            icon={FolderKanban}
            label="โปรเจกต์ล่าสุด"
            value={recent[0]?.name ?? "—"}
            index={2}
          />
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">
            โปรเจกต์ล่าสุด
          </h2>
          {projects.length > 3 && (
            <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
              ดูทั้งหมด →
            </Button>
          )}
        </div>

        {recent.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              ยังไม่มีโปรเจกต์ — เริ่มต้นด้วยการสร้างโปรเจกต์แรกของคุณ
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} onChanged={reload} />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
