---
component: NodeWorkspaceShowcase
version: V1
file: frontend/src/components/landing/NodeWorkspaceShowcase.tsx
group: landing
weight: light
size_gzip_kb: 0.6
lazy: false
pages: [/]
tags: [component, V1]
---

# NodeWorkspaceShowcase · V1

> ภาพประกอบพื้นที่ Node ในเนื้อเรื่องหน้าแรก

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/landing/NodeWorkspaceShowcase.tsx` | เบา | 0.6 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/` | พร้อมหน้า |

นำเข้าโดย: `components/landing/ScrollStory.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/landing/NodeWorkspaceShowcase.tsx` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `next`

## ตัวอย่างการใช้

```tsx
import NodeWorkspaceShowcase from "@/components/landing/NodeWorkspaceShowcase";
```

ของจริงใน `components/landing/ScrollStory.tsx` บรรทัด 422:

```tsx
                <NodeWorkspaceShowcase />
              </div>
            </div>
          )
        } else if (i === 4) {
          return (
            <div
              key={i}
              ref={(el) => { chapterRefs.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'opacity, transform', textShadow: '0 1px 14px rgba(8,20,24,0.6), 0 1px 3px rgba(8,20,24,0.55)' }}
            >
```

## โค้ด V1

`frontend/src/components/landing/NodeWorkspaceShowcase.tsx` · 27 บรรทัด

```tsx
import Image from 'next/image'

export default function NodeWorkspaceShowcase() {
  return (
    <div
      data-node-workspace
      className="relative aspect-[2.055/1] w-[min(94vw,58rem)] min-w-0 overflow-hidden rounded-lg border border-white/90 bg-white shadow-[0_24px_70px_rgba(7,31,38,0.32)] sm:w-[min(88vw,58rem)] sm:rounded-xl xl:w-[min(62vw,58rem)]"
    >
      <Image
        src="/landing/node-workspace.png"
        alt="หน้า Node workspace สำหรับเลือกสาร เชื่อมสูตร และประเมินความเสี่ยง"
        width={1535}
        height={747}
        priority
        unoptimized
        data-node-screenshot
        className="pointer-events-none absolute left-0 top-[-10%] h-[133.5%] w-[126.5%] max-w-none select-none"
      />
      <div
        aria-hidden
        data-node-scan
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-0 shadow-[0_0_12px_rgba(103,232,249,0.85)]"
      />
    </div>
  )
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
