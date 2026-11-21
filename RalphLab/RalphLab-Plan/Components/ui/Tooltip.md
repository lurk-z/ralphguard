---
component: Tooltip
version: V1
file: frontend/src/components/ui/tooltip.tsx
group: ui
weight: heavy
size_gzip_kb: 17.4
lazy: false
pages: [/assess]
tags: [component, V1]
---

# Tooltip · V1

> คำอธิบายสั้นเมื่อชี้หรือโฟกัส (shadcn Tooltip)

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/tooltip.tsx` | หนัก | 17.4 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`, `components/formula/FormulaGraph.tsx`, `components/kit/score-card.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/tooltip.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-tooltip@^1.2.10
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `react`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add tooltip`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ปลั๊กอิน `tailwindcss-animate` (มีใน `tailwind.config.js` อยู่แล้ว)

## ตัวอย่างการใช้

```tsx
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 3341:

```tsx
                            <Tooltip key={option.value}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={`${option.label} · ${option.description}`}
                                  onClick={() => setDraft((current) => ({ ...current, region: option.value }))}
                                  className={`flex h-10 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 ${selected
                                    ? "border-primary/40 bg-accent text-primary-strong"
                                    : "border-border bg-card text-muted-foreground hover:border-border hover:bg-accent"
                                    }`}
                                >
```

## โค้ด V1

`frontend/src/components/ui/tooltip.tsx` · 33 บรรทัด

```tsx
"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
