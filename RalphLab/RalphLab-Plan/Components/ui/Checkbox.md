---
component: Checkbox
version: V1
file: frontend/src/components/ui/checkbox.tsx
group: ui
weight: medium
size_gzip_kb: 6.2
lazy: false
pages: [/projects]
tags: [component, V1]
---

# Checkbox · V1

> ช่องติ๊ก (shadcn Checkbox) รองรับสถานะ indeterminate และพื้นที่แตะ 44px

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/checkbox.tsx` | ปานกลาง | 6.2 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `components/kit/project-list.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/checkbox.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-checkbox@^1.4.1
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `lucide-react`, `react`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add checkbox`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { Checkbox } from "@/components/ui/checkbox";
```

ของจริงใน `components/kit/project-list.tsx` บรรทัด 109:

```tsx
                <Checkbox
                  aria-label="เลือกทั้งหมด"
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={(v) => update(v === true ? new Set(projects.map((p) => p.id)) : new Set())}
                />
              </TableHead>
              <SortHead label="โปรเจกต์" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
              <SortHead label="สร้างเมื่อ" active={sort.key === "created"} dir={sort.dir} onClick={() => toggleSort("created")} className="hidden w-36 whitespace-nowrap sm:table-cell" />
              <SortHead label="แก้ไขล่าสุด" active={sort.key === "updated"} dir={sort.dir} onClick={() => toggleSort("updated")} className="hidden w-36 whitespace-nowrap sm:table-cell" />
              {hasActions && (
                <TableHead className="w-20 text-right">
                  <span className="sr-only">จัดการ</span>
```

## โค้ด V1

`frontend/src/components/ui/checkbox.tsx` · 30 บรรทัด

```tsx
"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

/** shadcn Checkbox; supports checked="indeterminate" (shows a dash). */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative size-4 shrink-0 rounded-[4px] after:absolute after:-inset-3.5 after:content-[''] border border-input bg-background shadow-sm outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? <Minus className="size-3.5" /> : <Check className="size-3.5" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
