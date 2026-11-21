---
component: UseIdleFrameloop
version: V1
file: frontend/src/hooks/use-idle-frameloop.ts
group: hooks
weight: light
size_gzip_kb: 0.5
lazy: false
pages: [/, /assess]
tags: [component, V1]
---

# UseIdleFrameloop · V1

> Hook ควบคุมการวาด 3D: วาดตลอดตอนใช้งาน → วาดเมื่อจำเป็นตอนว่าง → หยุดเมื่อพ้นจอ

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/hooks/use-idle-frameloop.ts` | เบา | 0.5 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/` | พร้อมหน้า |
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `components/face/SymptomFaceCanvas.tsx`, `components/landing/LabScene.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/hooks/use-idle-frameloop.ts` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `react`

## ตัวอย่างการใช้

```tsx
import { useIdleFrameloop, WakeOnMount } from "@/hooks/use-idle-frameloop";
```

ของจริงใน `components/face/SymptomFaceCanvas.tsx` บรรทัด 215:

```tsx
  const { canvasRef, frameloop, wake } = useIdleFrameloop({
    paused,
    deps: [revealResults, skin, eye, sens, acute, skinDryness, armed, eraseMode, brushSizePct, clearPaintRequest, background],
  });
  const [modelReady, setModelReady] = useState(false);
  const onModelMount = useCallback(() => {
    setModelReady(true);
    wake();
  }, [wake]);

  return (
    <div className="relative h-full w-full">
```

## โค้ด V1

`frontend/src/hooks/use-idle-frameloop.ts` · 87 บรรทัด

```ts
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
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
