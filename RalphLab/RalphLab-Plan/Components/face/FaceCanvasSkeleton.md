---
component: FaceCanvasSkeleton
version: V1
file: frontend/src/components/face/FaceCanvasSkeleton.tsx
group: face
weight: light
size_gzip_kb: 0.7
lazy: false
pages: [/assess]
tags: [component, V1]
---

# FaceCanvasSkeleton · V1

> โครงรอ (skeleton) ของช่องใบหน้า 3D ขณะโหลดโค้ด

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/face/FaceCanvasSkeleton.tsx` | เบา | 0.7 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/loading.tsx`, `app/(dashboard)/assess/page.tsx`, `components/face/FaceLoadingOverlay.tsx`, `components/face/SymptomFaceCanvas.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/face/FaceCanvasSkeleton.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/ui/skeleton.tsx` → [Skeleton](../ui/Skeleton.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { FaceCanvasSkeleton } from "@/components/face/FaceCanvasSkeleton";
```

ของจริงใน `app/(dashboard)/assess/loading.tsx` บรรทัด 40:

```tsx
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
```

## โค้ด V1

`frontend/src/components/face/FaceCanvasSkeleton.tsx` · 54 บรรทัด

```tsx
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
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
