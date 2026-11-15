import { Skeleton } from "@/components/ui/skeleton";
import { FaceCanvasSkeleton } from "@/components/face/FaceCanvasSkeleton";

/**
 * Route skeleton for /assess. Mirrors the workspace grid in assess/page.tsx
 * (56 px header row; formula panel 324 px · viewport · results 324 px from
 * 1400 px wide, viewport only below that) so the page does not jump on load.
 */
export default function AssessLoading() {
  return (
    <div className="grid h-screen grid-rows-[3.5rem_minmax(0,1fr)] overflow-hidden bg-background min-[1400px]:grid-cols-[324px_minmax(0,1fr)_324px]">
      {/* Formula panel */}
      <div className="hidden items-center gap-2 border-b border-r border-border bg-card px-3 min-[1400px]:flex">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Main header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-4">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      {/* Results header */}
      <div className="hidden items-center border-b border-l border-border bg-card px-4 min-[1400px]:flex">
        <Skeleton className="h-4 w-32" />
      </div>

      <aside className="hidden flex-col gap-3 border-r border-border bg-card p-3 min-[1400px]:flex">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </aside>

      <main className="min-h-0">
        <FaceCanvasSkeleton />
      </main>

      <aside className="hidden flex-col gap-4 border-l border-border bg-card p-4 min-[1400px]:flex">
        <Skeleton className="h-24 w-full rounded-xl" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </aside>
    </div>
  );
}
