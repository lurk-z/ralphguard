---
component: PageHeader
version: V1
file: frontend/src/components/kit/page-header.tsx
group: kit
weight: light
size_gzip_kb: 0.4
lazy: false
pages: [/projects]
tags: [component, V1]
---

# PageHeader · V1

> หัวหน้า: ชื่อ คำอธิบาย และปุ่มด้านขวา

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/page-header.tsx` | เบา | 0.4 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/projects/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/page-header.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ฟอนต์ `font-display` ใน `tailwind.config.js` (`fontFamily.display`)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, search, toggles: stack under the title on small screens. */
  actions?: ReactNode;
  className?: string;
}
```

## ตัวอย่างการใช้

```tsx
import { PageHeader } from "@/components/kit/page-header";
```

ของจริงใน `app/(dashboard)/projects/page.tsx` บรรทัด 243:

```tsx
        <PageHeader
          title="โปรเจกต์ทั้งหมด"
          description="เลือกโปรเจกต์เพื่อจัดการสูตรและดูผลประเมิน"
          actions={
            <>
              {hasProjects && (
                <Input
                  search
                  value={query}
                  placeholder="ค้นหาโปรเจกต์"
                  aria-label="ค้นหาโปรเจกต์"
                  onChange={(e) => setQuery(e.target.value)}
```

## โค้ด V1

`frontend/src/components/kit/page-header.tsx` · 24 บรรทัด

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, search, toggles: stack under the title on small screens. */
  actions?: ReactNode;
  className?: string;
};

/** Page title + short description, with actions on the right (below on mobile). */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">{actions}</div>}
    </div>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
