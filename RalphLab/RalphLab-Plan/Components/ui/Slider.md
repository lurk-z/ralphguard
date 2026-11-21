---
component: Slider
version: V1
file: frontend/src/components/ui/slider.tsx
group: ui
weight: medium
size_gzip_kb: 6.4
lazy: false
pages: [/assess]
tags: [component, V1]
---

# Slider · V1

> แถบเลื่อนค่า (shadcn Slider)

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/slider.tsx` | ปานกลาง | 6.4 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `components/kit/brush-toolbar.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/slider.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-slider@^1.4.3
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `react`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add slider`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { Slider } from "@/components/ui/slider";
```

ของจริงใน `components/kit/brush-toolbar.tsx` บรรทัด 50:

```tsx
          <Slider
            aria-label="ขนาดรอยทา"
            min={minSize}
            max={maxSize}
            step={1}
            value={[brushSize]}
            onValueChange={([value]) => {
              if (typeof value === "number") onBrushSizeChange?.(value);
            }}
            className="min-w-20 flex-1"
          />
          <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-primary-strong">{brushSize}%</span>
```

## โค้ด V1

`frontend/src/components/ui/slider.tsx` · 29 บรรทัด

```tsx
"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block size-5 rounded-full border-2 border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
