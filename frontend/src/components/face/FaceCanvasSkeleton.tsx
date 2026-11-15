import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Placeholder for a face 3D viewport, the same size as the canvas it replaces
 * (fills its parent) so nothing shifts when the model appears.
 *
 * No three.js imports: it is used as the `next/dynamic` loading fallback,
 * shown while the 3D chunk itself is still downloading. Pass `progress`
 * (0–100) once the GLB download can be tracked (see FaceLoadingOverlay).
 */
export function FaceCanvasSkeleton({
  progress,
  dark = false,
  className,
}: {
  progress?: number;
  dark?: boolean;
  className?: string;
}) {
  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("relative grid h-full w-full place-items-center overflow-hidden", className)}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Head silhouette */}
        <Skeleton className={cn("h-40 w-32 rounded-[45%]", dark && "bg-white/10")} />
        <div className="flex w-40 flex-col items-center gap-2">
          <div className={cn("h-1 w-full overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-primary/10")}>
            {pct != null && (
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
            )}
          </div>
          <p className={cn("text-xs", dark ? "text-gray-300" : "text-slate-600")}>
            กำลังโหลดโมเดล 3 มิติ{pct != null ? ` ${pct}%` : "…"}
          </p>
        </div>
      </div>
    </div>
  );
}

/** True for dark canvas backgrounds such as "#141414". */
export function isDarkBackground(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}
