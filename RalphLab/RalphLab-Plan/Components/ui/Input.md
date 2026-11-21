---
component: Input
version: V1
file: frontend/src/components/ui/input.tsx
group: ui
weight: light
size_gzip_kb: 0.9
lazy: false
pages: [/assess, /projects]
tags: [component, V1]
---

# Input · V1

> ช่องกรอก (shadcn Input) มีโหมดค้นหา ไอคอนนำหน้า และหน่วยต่อท้าย

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/input.tsx` | เบา | 0.9 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/projects/page.tsx`, `components/kit/formula-card.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/input.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `lucide-react`, `react`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add input`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { Input } from "@/components/ui/input";
```

ของจริงใน `app/(dashboard)/projects/page.tsx` บรรทัด 249:

```tsx
                <Input
                  search
                  value={query}
                  placeholder="ค้นหาโปรเจกต์"
                  aria-label="ค้นหาโปรเจกต์"
                  onChange={(e) => setQuery(e.target.value)}
                  onClear={() => setQuery("")}
                  containerClassName="flex-1 sm:w-72 sm:flex-none"
                />
              )}
              <Button onClick={() => openDialog(null)} className="shrink-0">
                <Plus /> สร้างโปรเจกต์
```

## โค้ด V1

`frontend/src/components/ui/input.tsx` · 71 บรรทัด

```tsx
import * as React from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"

const inputClass =
  "flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base shadow-sm outline-none transition-[color,box-shadow] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20"

type InputProps = React.ComponentProps<"input"> & {
  /** Search box: leading magnifier icon, and a clear button once something is typed. */
  search?: boolean
  /** Called by the clear button (search mode). Without it, the clear button is hidden. */
  onClear?: () => void
  /** Icon or text before the value (e.g. an icon). Replaces the search icon. */
  start?: React.ReactNode
  /** Icon or text after the value (e.g. a unit like "%"). */
  end?: React.ReactNode
  /** Class for the wrapper when `search`, `start` or `end` is used (e.g. its width). */
  containerClassName?: string
}

/**
 * shadcn Input. One component covers the plain field, the search box and the
 * field with an icon or unit: use `search`, `start` and `end` instead of separate components.
 * Colours come from theme tokens (border-input; focus ring = brand teal).
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, search, onClear, start, end, containerClassName, value, ...props }, ref) => {
    const leading = start ?? (search ? <Search /> : null)
    const showClear = Boolean(search && onClear && value !== undefined && String(value).length > 0)

    if (!leading && !end && !search) {
      return <input type={type} data-slot="input" className={cn(inputClass, className)} ref={ref} value={value} {...props} />
    }

    return (
      <div data-slot="input-wrapper" className={cn("relative flex w-full min-w-0 items-center", containerClassName)}>
        {leading && (
          <span aria-hidden="true" className="pointer-events-none absolute left-2.5 flex items-center text-sm text-muted-foreground [&_svg]:size-4">
            {leading}
          </span>
        )}
        <input
          type={search ? "search" : type}
          data-slot="input"
          ref={ref}
          value={value}
          className={cn(inputClass, leading && "pl-8", (end || showClear) && "pr-8", search && "[&::-webkit-search-cancel-button]:hidden", className)}
          {...props}
        />
        {showClear && (
          <button
            type="button"
            aria-label="ล้าง"
            onClick={onClear}
            className="absolute right-1 grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        )}
        {end && !showClear && (
          <span className="pointer-events-none absolute right-2.5 flex items-center text-sm text-muted-foreground [&_svg]:size-4">{end}</span>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
