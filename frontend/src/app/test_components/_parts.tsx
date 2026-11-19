"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Padding wrapper for one live example. */
export function DemoBody({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

/** A labelled row of variants inside an example. */
export function Row({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>}
      <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
    </div>
  );
}

/**
 * Mounts its children only once scrolled near the viewport, so the page does not
 * start every example (3D, charts, animations) at load.
 */
export function WhenVisible({ children, minHeight = 120 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setShown(true), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return (
    <div ref={ref} style={shown ? undefined : { minHeight }}>
      {shown ? children : null}
    </div>
  );
}
