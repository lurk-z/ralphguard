---
component: FaceLoadingOverlay
version: V1
file: frontend/src/components/face/FaceLoadingOverlay.tsx
group: face
weight: light
size_gzip_kb: 0.7
lazy: true
pages: [/assess]
tags: [component, V1]
---

# FaceLoadingOverlay · V1

> แผ่นซ้อนแสดง % ดาวน์โหลด head.glb จนโมเดลขึ้น

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/face/FaceLoadingOverlay.tsx` | เบา | 0.7 KB | เปิดใช้ (next/dynamic) |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | เมื่อเปิดใช้ (lazy) |

นำเข้าโดย: `components/face/SymptomFaceCanvas.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/face/FaceLoadingOverlay.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/face/FaceCanvasSkeleton.tsx` → [FaceCanvasSkeleton](../face/FaceCanvasSkeleton.md)
- `src/components/ui/skeleton.tsx` → [Skeleton](../ui/Skeleton.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @react-three/drei@^9.114.3
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { FaceLoadingOverlay } from "@/components/face/FaceLoadingOverlay";
```

ของจริงใน `components/face/SymptomFaceCanvas.tsx` บรรทัด 277:

```tsx
      <FaceLoadingOverlay show={!modelReady} dark={isDarkBackground(background)} />
      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-60 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 text-slate-800 shadow-lg backdrop-blur"
          style={{
            left: `min(calc(100% - 15rem - 8px), ${tip.x + 14}px)`,
            top: `min(calc(100% - 11.5rem - 8px), ${tip.y + 14}px)`,
          }}
        >
          <div className="p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-brand">
```

## โค้ด V1

`frontend/src/components/face/FaceLoadingOverlay.tsx` · 20 บรรทัด

```tsx
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
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
