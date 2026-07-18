"use client";

// Project List — the landing page after login. Loads from localStorage and
// falls back to an empty state when there are no projects. Now includes:
//   • Search bar (filter by name or description)
//   • View toggle (grid / list)
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Plus,
  Search,
  LayoutGrid,
  LayoutList,
  X,
} from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DashboardShell from "@/components/layout/DashboardShell";

import ProjectCard from "@/components/ProjectCard";
import { listProjects, type LocalProject } from "@/lib/projects";

// ─── List-view row ────────────────────────────────────────────────────────────
// (re-uses the same card in a full-width single-column layout)

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  // Tracks whether the localStorage read has happened yet, separately from
  // "projects is empty" — otherwise the empty state flashes before load.
  const [loaded, setLoaded] = useState(false);

  // localStorage is unavailable during SSR — read after mount.
  const reload = () => setProjects(listProjects());
  useEffect(() => {
    reload();
  }, []);

  // Derived: filtered list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q),
      )
      : projects;
  }, [projects, search]);

  const empty = projects.length === 0;
  const noResults = !empty && filtered.length === 0;



  return (
    <DashboardShell breadcrumbs={[{ label: "โปรเจกต์" }]}>
      <div className="px-6 py-6 lg:px-8">

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {empty && (
          <Empty className="border border-dashed py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              <EmptyTitle>ยังไม่มีโปรเจกต์</EmptyTitle>
              <EmptyDescription>เริ่มต้นการสร้างโปรเจกต์แรกของคุณ</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button className="h-11 gap-2 px-6" onClick={() => router.push("/projects/new")}>
                <Plus className="size-4" />
                สร้างโปรเจกต์
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {/* ── Header + toolbar (only when there are projects) ─────────── */}
        {!empty && (
          <>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>

                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-display font-bold text-foreground">
                    โปรเจกต์ทั้งหมด
                  </h1>
                  <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground font-medium">
                    {projects.length} โปรเจกต์
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  จัดการสูตร ผลการประเมิน และรายงานของแต่ละงานไว้ในพื้นที่เดียว
                </p>
              </div>
              <Button
                className="h-10 shrink-0 gap-2 px-5"
                onClick={() => router.push("/projects/new")}
              >
                <Plus className="size-4" />
                สร้างโปรเจกต์
              </Button>
            </div>

            {/* ── Search + view ─────────────────────────────────── */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1" style={{ minWidth: "200px", maxWidth: "360px" }}>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="project-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาโปรเจกต์…"
                  className="h-9 bg-background pl-9 pr-9"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="ล้างการค้นหา"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* View toggle */}
              <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                <button
                  id="view-grid"
                  type="button"
                  aria-label="แสดงเป็นกริด"
                  aria-pressed={view === "grid"}
                  onClick={() => setView("grid")}
                  className={[
                    "grid size-8 place-items-center rounded-md transition",
                    view === "grid"
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <LayoutGrid className="size-4" />
                </button>
                <button
                  id="view-list"
                  type="button"
                  aria-label="แสดงเป็นรายการ"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                  className={[
                    "grid size-8 place-items-center rounded-md transition",
                    view === "list"
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <LayoutList className="size-4" />
                </button>
              </div>
            </div>

            {/* ── No search results ────────────────────────────────────── */}
            {noResults && (
              <div className="py-16 text-center">
                <p className="text-sm font-semibold text-foreground">
                  ไม่พบโปรเจกต์ที่ตรงกับ "{search}"
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ลองค้นหาด้วยคำอื่น หรือ{" "}
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="underline hover:text-foreground"
                  >
                    ล้างการค้นหา
                  </button>
                </p>
              </div>
            )}

            {/* ── Project grid / list ──────────────────────────────────── */}
            {!noResults && (
              <div
                className={
                  view === "grid"
                    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    : "flex flex-col gap-3"
                }
              >
                {filtered.map((p, i) => (
                  <ProjectCard key={p.id} project={p} index={i} onChanged={reload} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
