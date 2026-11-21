---
component: Skeleton
version: V1
file: frontend/src/components/ui/skeleton.tsx
group: ui
weight: light
size_gzip_kb: 0.2
lazy: false
pages: [/assess, /projects]
tags: [component, V1]
---

# Skeleton · V1

> บล็อกกระพริบรอข้อมูล (shadcn Skeleton)

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/skeleton.tsx` | เบา | 0.2 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/loading.tsx`, `app/(dashboard)/projects/page.tsx`, `components/face/FaceCanvasSkeleton.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/skeleton.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add skeleton`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { Skeleton } from "@/components/ui/skeleton";
```

ของจริงใน `app/(dashboard)/assess/loading.tsx` บรรทัด 14:

```tsx
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
```

## โค้ด V1

`frontend/src/components/ui/skeleton.tsx` · 16 บรรทัด

```tsx
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
