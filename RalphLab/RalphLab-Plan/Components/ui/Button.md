---
component: Button
version: V1
file: frontend/src/components/ui/button.tsx
group: ui
weight: light
size_gzip_kb: 1.6
lazy: false
pages: [/, /assess, /projects]
tags: [component, V1]
---

# Button · V1

> ปุ่มพื้นฐาน (shadcn Button) 6 variant 6 ขนาด สีหลักใช้ primary-strong

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/button.tsx` | เบา | 1.6 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/` | พร้อมหน้า |
| `/assess` | พร้อมหน้า |
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`, `app/(dashboard)/projects/page.tsx`, `app/error.tsx`, `components/kit/brush-toolbar.tsx`, `components/kit/formula-card.tsx`, `components/kit/project-list.tsx`, `components/landing/ScrollStory.tsx`, `components/layout/Navbar.tsx`, `components/ui/alert-dialog.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/button.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `react`, `tailwind-merge`

เริ่มต้นมาจาก shadcn (`npx shadcn@latest add button`) แต่แก้ให้เข้ากับธีมของโปรเจกต์ ให้คัดลอกโค้ดด้านล่างแทนการรันคำสั่ง

ต้องมีในโปรเจกต์:

- ตัวแปรสี `--primary-strong` ใน `app/globals.css` (ทุกธีม) และ `primary.strong` ใน `tailwind.config.js` (ใช้กับตัวหนังสือและปุ่มสี teal ให้ contrast ผ่าน)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}
```

## ตัวอย่างการใช้

```tsx
import { Button } from "@/components/ui/button";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 2315:

```tsx
            <Button
              type="button"
              id="substance-library-page-toggle"
              size="sm"
              variant={activeNavigationItem === "substances" ? "default" : "outline"}
              onClick={() =>
                changePrimaryNavigation(
                  activeNavigationItem === "substances" ? "assessment" : "substances",
                )
              }
              aria-pressed={activeNavigationItem === "substances"}
              title={activeNavigationItem === "substances" ? "กลับไปหน้าประเมิน" : "เปิดคลังสารเคมีทั้งหมด"}
```

## โค้ด V1

`frontend/src/components/ui/button.tsx` · 60 บรรทัด

```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary-strong text-primary-foreground shadow hover:bg-primary-strong/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-11 px-6 text-base [&_svg]:size-5",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-11 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
