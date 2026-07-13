"use client";

// Project List — the landing page after login. Loads from the API and falls
// back to an empty state when the backend is unreachable, so it works standalone.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DashboardShell from "@/components/layout/DashboardShell";
import { api, type ProjectOut } from "@/lib/api";

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
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listProjects()
      .then((rows) => alive && setProjects(rows))
      .catch(() => alive && setProjects([])); // backend down → empty
    return () => {
      alive = false;
    };
  }, []);

  const loading = projects === null;
  const empty = !loading && projects.length === 0;

  return (
    <DashboardShell
      title="โปรเจกต์"
      subtitle="จัดการและเปิดโปรเจกต์การประเมินความเสี่ยงของคุณ"
      actions={
        <Button className="h-11 gap-2 px-5" onClick={() => router.push("/projects/new")}>
          <Plus className="size-4" />
          สร้างโปรเจกต์
        </Button>
      }
    >
      <div className="px-6 py-6 lg:px-8">
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-muted/50" />
            ))}
          </div>
        )}

        {empty && (
          <div className="grid place-items-center py-20 text-center">
            <span
              aria-hidden
              className="grid size-16 place-items-center rounded-2xl border border-dashed border-border bg-muted/60"
            >
              <FolderOpen className="size-7 text-muted-foreground" />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-foreground">ยังไม่มีโปรเจกต์</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              เริ่มต้นด้วยการสร้างโปรเจกต์แรก เพื่อเพิ่มสูตรและวิเคราะห์ความเสี่ยงด้วย AI
            </p>
            <Button className="mt-5 h-11 gap-2 px-6" onClick={() => router.push("/projects/new")}>
              <Plus className="size-4" />
              สร้างโปรเจกต์แรก
            </Button>
          </div>
        )}

        {!loading && !empty && (
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
                className="cursor-pointer border-border shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
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
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    สร้างเมื่อ {formatDate(p.created_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
