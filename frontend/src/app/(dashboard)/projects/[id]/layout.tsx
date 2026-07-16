"use client";

// Shared shell for every project-scoped workspace page (assess, results,
// chemicals, templates, …) — keeps the icon rail on screen while the page
// content next to it swaps on navigation.
import { SidebarProvider } from "@/components/ui/sidebar";
import ProjectIconRail from "@/components/layout/ProjectIconRail";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <SidebarProvider>
      <div className="app-light flex h-screen w-full overflow-hidden bg-card text-foreground">
        <ProjectIconRail projectId={params.id} />
        <div className="relative flex min-w-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </SidebarProvider>
  );
}
