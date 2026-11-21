---
component: Alert
version: V1
file: frontend/src/components/ui/alert.tsx
group: ui
weight: light
size_gzip_kb: 0.6
lazy: false
pages: [/assess, /projects]
tags: [component, V1]
---

# Alert · V1

> กล่องแจ้งเตือนในหน้า (shadcn Alert) แบบปกติ เตือน และ destructive

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/alert.tsx` | เบา | 0.6 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`, `app/(dashboard)/projects/page.tsx`, `components/kit/formula-card.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/alert.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `class-variance-authority`, `clsx`, `react`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add alert`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 3067:

```tsx
                      <Alert variant="destructive">
                        <AlertCircle />
                        <AlertTitle>ประเมินไม่สำเร็จ</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {(!completed || !endpoints) && (
                      <AssessmentResultsPlaceholder
                        regionLabel={activeRegionLabel}
                        assessing={assessing || Boolean(jobId)}
                      />
```

## โค้ด V1

`frontend/src/components/ui/alert.tsx` · 41 บรรทัด

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        // Tinted fill + border, same colours as the risk bands (amber / green / red)
        warning: "border-amber-400 bg-amber-100 text-amber-950 *:data-[slot=alert-description]:text-amber-900",
        success: "border-emerald-400 bg-emerald-100 text-emerald-950 *:data-[slot=alert-description]:text-emerald-900",
        destructive: "border-red-400 bg-red-100 text-red-950 *:data-[slot=alert-description]:text-red-900",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
