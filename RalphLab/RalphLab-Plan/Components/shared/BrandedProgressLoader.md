---
component: BrandedProgressLoader
version: V1
file: frontend/src/components/shared/BrandedProgressLoader.tsx
group: shared
weight: light
size_gzip_kb: 3
lazy: false
pages: [/projects]
tags: [component, V1]
---

# BrandedProgressLoader · V1

> หน้าจอโหลดมีโลโก้และแถบความคืบหน้า

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/shared/BrandedProgressLoader.tsx` | เบา | 3 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/projects/[id]/loading.tsx`, `app/(dashboard)/projects/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/shared/BrandedProgressLoader.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/ui/progress.tsx` → [Progress](../ui/Progress.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-progress@^1.1.12
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `next`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- คลาส CSS ใน `app/globals.css`: `.app-light`
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import BrandedProgressLoader from "@/components/shared/BrandedProgressLoader";
```

ของจริงใน `app/(dashboard)/projects/[id]/loading.tsx` บรรทัด 4:

```tsx
  return <BrandedProgressLoader />;
}

```

## โค้ด V1

`frontend/src/components/shared/BrandedProgressLoader.tsx` · 66 บรรทัด

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type BrandedProgressLoaderProps = {
  label?: string;
  fullScreen?: boolean;
  className?: string;
};

export default function BrandedProgressLoader({
  label = "กำลังโหลดข้อมูลล่าสุด",
  fullScreen = true,
  className,
}: BrandedProgressLoaderProps) {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        if (current < 48) return Math.min(92, current + 8);
        if (current < 76) return Math.min(92, current + 5);
        return Math.min(92, current + 2);
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "app-light grid place-items-center bg-background/95 p-6 backdrop-blur-sm",
        fullScreen ? "fixed inset-0 z-[100]" : "min-h-80 w-full",
        className,
      )}
    >
      <div className="w-full max-w-sm text-center">
        <Image
          unoptimized
          src="/icons/logo-192.webp"
          alt="RalphGuard"
          width={96}
          height={96}
          priority
          className="mx-auto size-24 object-contain"
        />
        <Progress
          value={progress}
          aria-label="ความคืบหน้าการโหลดโปรเจกต์"
          className="mx-auto mt-6 h-1.5 w-56"
        />
        <p className="mt-3 text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
