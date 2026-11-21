---
component: Tabs
version: V1
file: frontend/src/components/ui/tabs.tsx
group: ui
weight: medium
size_gzip_kb: 6.3
lazy: false
pages: [/assess]
tags: [component, V1]
---

# Tabs · V1

> แท็บ (shadcn Tabs) เป็นฐานของ SegmentedTabs

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/tabs.tsx` | ปานกลาง | 6.3 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `components/kit/segmented-tabs.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/tabs.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-tabs@^1.1.17
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `class-variance-authority`, `clsx`, `react`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add tabs`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
```

ของจริงใน `components/kit/segmented-tabs.tsx` บรรทัด 47:

```tsx
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
```

## โค้ด V1

`frontend/src/components/ui/tabs.tsx` · 63 บรรทัด

```tsx
"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva("group/tabs-list inline-flex h-9 w-fit items-center justify-center text-muted-foreground", {
  variants: {
    variant: {
      default: "rounded-lg bg-muted p-[3px]",
      // Line style: no background, an underline marks the active tab.
      line: "h-9 gap-1 rounded-none bg-transparent p-0",
    },
  },
  defaultVariants: { variant: "default" },
})

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.List ref={ref} data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 text-sm font-medium outline-none transition-[color,box-shadow] hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      // default (pill) style
      "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      // line style: transparent tab + 2px brand underline
      "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:shadow-none group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
      "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary after:opacity-0 after:transition-opacity group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100 group-data-[variant=default]/tabs-list:after:hidden",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-2 flex-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
