---
component: Navbar
version: V1
file: frontend/src/components/layout/Navbar.tsx
group: layout
weight: light
size_gzip_kb: 2.2
lazy: false
pages: [/]
tags: [component, V1]
---

# Navbar · V1

> แถบเมนูหน้าแรก

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/layout/Navbar.tsx` | เบา | 2.2 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/` | พร้อมหน้า |

นำเข้าโดย: `app/(site)/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/layout/Navbar.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/ui/button.tsx` → [Button](../ui/Button.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `lucide-react`, `next`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรสี `--primary-strong` ใน `app/globals.css` (ทุกธีม) และ `primary.strong` ใน `tailwind.config.js` (ใช้กับตัวหนังสือและปุ่มสี teal ให้ contrast ผ่าน)
- สี `brand`, `brand-dark`, `brand-soft` ใน `tailwind.config.js` (`colors.brand`)
- ฟอนต์ `font-display` ใน `tailwind.config.js` (`fontFamily.display`)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## ตัวอย่างการใช้

```tsx
import Navbar from "@/components/layout/Navbar";
```

ของจริงใน `app/(site)/page.tsx` บรรทัด 10:

```tsx
      <Navbar />

      {/* Solid white backdrop behind the (transparent) 3D canvas so the dark
          body never shows through — keeps the whole stage on white. */}
      <div aria-hidden className="fixed inset-0 z-[1] bg-white" />

      {/* Pinned 3D stage — stays put while the page scrolls. */}
      <div className="fixed inset-0 z-[2]">
        <LabScene scrollSequence={CAMERA_SEQUENCE} />
      </div>


```

## โค้ด V1

`frontend/src/components/layout/Navbar.tsx` · 57 บรรทัด

```tsx
'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'bg-transparent backdrop-blur-md' : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6">
        {/* Logo */}
        <a href="#hero" className="flex items-center gap-2.5 group">
          <Image
            unoptimized
            src="/icons/logo-192.webp"
            alt=""
            width={36}
            height={36}
            priority
            className="size-8 shrink-0 object-contain sm:size-9"
          />
          <span className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
            RalphGuard
          </span>
        </a>

        {/* Authentication entry point */}
        <Button
          asChild
          variant="outline"
          className="h-9 rounded-full border-brand/40 bg-transparent px-3 text-xs text-foreground hover:border-brand/70 hover:bg-brand/10 sm:h-10 sm:px-4 sm:text-sm"
        >
          <a href="/login">
            เข้าสู่ระบบ
            <ArrowRight className="text-brand" />
          </a>
        </Button>
      </div>
    </nav>
  )
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
