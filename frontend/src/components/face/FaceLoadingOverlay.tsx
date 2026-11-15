"use client";

import { useProgress } from "@react-three/drei";
import { FaceCanvasSkeleton } from "./FaceCanvasSkeleton";

/**
 * Sits over a face <Canvas> until the model has mounted, showing the GLB
 * download percentage (head.glb is ~4 MB and is intentionally not compressed).
 * Render it outside the Canvas, inside the canvas's `relative` wrapper.
 */
export function FaceLoadingOverlay({ show, dark = false }: { show: boolean; dark?: boolean }) {
  const { progress, active } = useProgress();
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <FaceCanvasSkeleton progress={active ? progress : undefined} dark={dark} />
    </div>
  );
}
