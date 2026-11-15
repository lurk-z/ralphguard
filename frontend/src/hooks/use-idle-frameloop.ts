"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Render-loop policy for 3D canvases that animate on their own (assess face:
 * eye-dart clips, scan band · landing lab: character and liquid clips), where a plain `frameloop="demand"` would freeze them. Instead:
 *
 *   - "always" while the viewer is in use, and for `idleMs` after the last
 *     pointer/wheel/touch on the canvas (or page scroll / pointer anywhere
 *     with `wakeOnWindow`, for a full-screen background canvas) or the last
 *     change in `deps`
 *     (Day, scores, brush …) so eased transitions finish;
 *   - "demand" once idle: the last frame stays on screen and OrbitControls /
 *     scene changes still trigger single redraws;
 *   - "never" while the canvas is scrolled off screen or `paused`.
 *
 * Measured reason: an always-on loop kept three.js busy for 5–8 s of main-thread
 * time per Lighthouse run on / and /assess.
 *
 * Usage:
 *   const { canvasRef, frameloop, wake } = useIdleFrameloop({ deps: [day, sev] });
 *   <Canvas ref={canvasRef} frameloop={frameloop}> … <WakeOnMount wake={wake} /> …
 */
export function useIdleFrameloop({
  paused = false,
  idleMs = 8000,
  deps = [],
  wakeOnWindow = false,
}: {
  paused?: boolean;
  idleMs?: number;
  deps?: unknown[];
  wakeOnWindow?: boolean;
} = {}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(true);
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    setActive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), idleMs);
  }, [idleMs]);

  // Start awake so the model can load, fit the camera and settle.
  useEffect(() => {
    wake();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [wake]);

  // Any change the caller cares about (Day, scores, brush …) wakes the loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(wake, deps);

  useEffect(() => {
    if (!canvas) return;
    const events = ["pointerdown", "pointermove", "wheel", "touchstart"] as const;
    events.forEach((e) => canvas.addEventListener(e, wake, { passive: true }));
    const windowEvents = wakeOnWindow ? (["scroll", "pointermove", "wheel", "touchstart"] as const) : [];
    windowEvents.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(canvas);
    return () => {
      events.forEach((e) => canvas.removeEventListener(e, wake));
      windowEvents.forEach((e) => window.removeEventListener(e, wake));
      io.disconnect();
    };
  }, [canvas, wake, wakeOnWindow]);

  const frameloop: "always" | "demand" | "never" =
    paused || !visible ? "never" : active ? "always" : "demand";

  return { canvasRef: setCanvas, frameloop, wake };
}

/** Place inside <Suspense> after the model: wakes the loop once it has loaded. */
export function WakeOnMount({ wake }: { wake: () => void }) {
  useEffect(() => {
    wake();
  }, [wake]);
  return null;
}
