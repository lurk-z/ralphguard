---
component: Sonner
version: V1
file: frontend/src/components/ui/sonner.tsx
group: ui
weight: light
size_gzip_kb: 1
lazy: false
pages: ['ทุกหน้า (layout)']
tags: [component, V1]
---

# Sonner · V1

> ตัวแสดง toast (sonner) วางที่ layout ราก

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/ui/sonner.tsx` | เบา | 1 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `ทุกหน้า (layout)` | พร้อมหน้า |

นำเข้าโดย: `app/layout.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/ui/sonner.tsx` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

```bash
npm install next-themes@^0.4.6 sonner@^2.0.7
```

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import { Toaster } from "@/components/ui/sonner";
```

ของจริงใน `app/layout.tsx` บรรทัด 58:

```tsx
        <Toaster />
      </body>
    </html>
  );
}

```

## โค้ด V1

`frontend/src/components/ui/sonner.tsx` · 42 บรรทัด

```tsx
"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      richColors
      closeButton
      visibleToasts={3}
      className="toaster group"
      toastOptions={{
        duration: 4500,
        classNames: {
          toast:
            "group toast font-sans !border-border !bg-popover !text-popover-foreground group-[.toaster]:rounded-xl group-[.toaster]:shadow-lg",
          icon:
            "group-data-[type=success]:!text-emerald-600 group-data-[type=warning]:!text-amber-500 group-data-[type=error]:!text-red-600 group-data-[type=info]:!text-primary",
          title: "group-[.toast]:font-sans group-[.toast]:font-semibold group-[.toast]:!text-foreground",
          description: "group-[.toast]:font-sans group-[.toast]:text-sm group-[.toast]:!text-muted-foreground",
          actionButton:
            "group-[.toast]:border group-[.toast]:border-border group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground hover:!bg-accent",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground",
          closeButton:
            "group-[.toast]:!border-border group-[.toast]:!bg-popover group-[.toast]:!text-muted-foreground hover:group-[.toast]:!bg-muted hover:group-[.toast]:!text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
