---
component: SmoothScroll
version: V1
file: frontend/src/components/landing/SmoothScroll.tsx
group: landing
weight: heavy
size_gzip_kb: 49.2
lazy: false
pages: [/]
tags: [component, V1]
---

# SmoothScroll · V1

> ตัวเลื่อนหน้าแบบนุ่ม (gsap ScrollSmoother) ส่งค่าความคืบหน้าให้ฉาก 3D หน้าแรก

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/landing/SmoothScroll.tsx` | หนัก | 49.2 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/` | พร้อมหน้า |

นำเข้าโดย: `app/(site)/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/landing/SmoothScroll.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/landing/scroll.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install gsap@^3.15.0
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `react`

## ตัวอย่างการใช้

```tsx
import SmoothScroll from "@/components/landing/SmoothScroll";
```

ของจริงใน `app/(site)/page.tsx` บรรทัด 27:

```tsx
      <SmoothScroll>
        {CHAPTERS.map((c, i) => (
          <section
            key={c.cam + i}
            id={i === 0 ? 'hero' : `section-${i}`}
            className="relative z-0 h-[150vh] pointer-events-none"
          />
        ))}
      </SmoothScroll>
    </main>
  )
}
```

## โค้ด V1

`frontend/src/components/landing/SmoothScroll.tsx` · 55 บรรทัด

```tsx
'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { scrollState } from '@/lib/landing/scroll'

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother)

    // Always land on the hero on (re)load instead of restoring a mid-tour
    // scroll position.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    const ctx = gsap.context(() => {
      // Inertial smooth scroll — higher `smooth` = slower / less rushed
      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current!,
        content: contentRef.current!,
        smooth: 1.6,
        effects: false,
        smoothTouch: 0.1,
      })
      // Expose for debugging / programmatic scroll (e.g. nav anchors, tests).
      ;(window as unknown as { __smoother?: unknown }).__smoother = smoother

      // Feed the smoothed scroll progress to the 3D camera rig
      ScrollTrigger.create({
        trigger: contentRef.current!,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          scrollState.progress = self.progress
        },
      })
    })

    return () => ctx.revert()
  }, [])

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  )
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
