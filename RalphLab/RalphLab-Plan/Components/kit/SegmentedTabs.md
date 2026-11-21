---
component: SegmentedTabs
version: V1
file: frontend/src/components/kit/segmented-tabs.tsx
group: kit
weight: medium
size_gzip_kb: 6.6
lazy: false
pages: [/assess]
tags: [component, V1]
---

# SegmentedTabs · V1

> แท็บสลับมุมมอง 2 แบบ: line (เส้นใต้) และ pill (แคปซูลเลื่อน) ซ่อนชื่อบนมือถือได้

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/segmented-tabs.tsx` | ปานกลาง | 6.6 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/segmented-tabs.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/ui/tabs.tsx` → [Tabs](../ui/Tabs.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-tabs@^1.1.17
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `class-variance-authority`, `clsx`, `lucide-react`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** "line": underline on the active tab (switching views). "pill": grey track with a white pill that slides (switching modes). */
  variant?: "line" | "pill";
  /** Stretch tabs to fill the width (good on mobile). */
  fullWidth?: boolean;
  /** Phones (below 640 px): show only the icons; the labels stay for screen readers. Needs an icon on every item. */
  collapseLabels?: boolean;
  label?: string;
  className?: string;
}
```

## ตัวอย่างการใช้

```tsx
import { SegmentedTabs } from "@/components/kit/segmented-tabs";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 2402:

```tsx
          <SegmentedTabs
            variant="pill"
            collapseLabels
            label="โหมดทำงาน"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            value={mode}
            onChange={(m) => {
              changePrimaryNavigation("assessment");
              setMode(m);
            }}
            items={[
              { value: "assess" as Mode, label: "Assessment", icon: ScanFace },
```

## โค้ด V1

`frontend/src/components/kit/segmented-tabs.tsx` · 80 บรรทัด

```tsx
"use client";

import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type SegmentedTabItem<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

export type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** "line": underline on the active tab (switching views). "pill": grey track with a white pill that slides (switching modes). */
  variant?: "line" | "pill";
  /** Stretch tabs to fill the width (good on mobile). */
  fullWidth?: boolean;
  /** Phones (below 640 px): show only the icons; the labels stay for screen readers. Needs an icon on every item. */
  collapseLabels?: boolean;
  label?: string;
  className?: string;
};

/**
 * Switch between a few views with shadcn Tabs (keyboard arrows work).
 * `line`: ประเมิน / Nodes, ผลทดสอบ / ผู้ช่วย AI · `pill`: สลับโหมด, Day 1 / 3 / 7.
 * Content is rendered by the caller based on `value`, so the tabs do not point at a panel (`aria-controls`
 * is cleared: Radix would otherwise reference a TabsContent that does not exist, an ARIA error in Lighthouse).
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  variant = "line",
  fullWidth = false,
  collapseLabels = false,
  label,
  className,
}: SegmentedTabsProps<T>) {
  const index = Math.max(0, items.findIndex((item) => item.value === value));
  const pill = variant === "pill";

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      {pill ? (
        <TabsList
          aria-label={label}
          className={cn("relative grid h-11 grid-flow-col auto-cols-fr rounded-xl p-1", fullWidth ? "w-full" : "w-fit")}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 rounded-lg bg-background shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `calc((100% - 0.5rem) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
          />
          {items.map(({ value: itemValue, label: itemLabel, icon: Icon }) => (
            <TabsTrigger
              key={itemValue}
              value={itemValue}
              aria-controls={undefined}
              className={cn("relative z-10 h-full rounded-lg px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none", collapseLabels && Icon && "max-sm:px-3.5")}
            >
              {Icon && <Icon aria-hidden="true" />}
              <span className={cn("truncate", collapseLabels && Icon && "max-sm:sr-only")}>{itemLabel}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      ) : (
        <TabsList variant="line" aria-label={label} className={cn("border-b", fullWidth ? "w-full" : "w-fit")}>
          {items.map(({ value: itemValue, label: itemLabel, icon: Icon }) => (
            <TabsTrigger key={itemValue} value={itemValue} aria-controls={undefined} className={cn("px-3", !fullWidth && "flex-none")}>
              {Icon && <Icon aria-hidden="true" />}
              <span className="truncate">{itemLabel}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      )}
    </Tabs>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
