"use client";

// Project List — the landing page after login. Loads from the API and falls
// back to an empty state when the backend is unreachable, so it works standalone.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";

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
import DashboardShell from "@/components/layout/DashboardShell";
import { listProjects, type LocalProject } from "@/lib/projects";

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
  const [projects, setProjects] = useState<LocalProject[]>([]);

  // localStorage is unavailable while rendering on the server, so the list is
  // read after mount rather than during it.
  useEffect(() => {
    setProjects(listProjects());
  }, []);

  const empty = projects.length === 0;

  return (
    <DashboardShell breadcrumbs={[{ label: "โปรเจกต์" }]}>
      <div className="px-6 py-6 lg:px-8">

        {empty && (
          <Empty className="border border-dashed py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              <EmptyTitle>ยังไม่มีโปรเจกต์</EmptyTitle>
              <EmptyDescription>
                เริ่มต้นการสร้างโปรเจกต์แรกของคุณ
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

        {!empty && (
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
