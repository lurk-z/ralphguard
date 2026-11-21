---
component: SessionProvider
version: V1
file: frontend/src/components/auth/SessionProvider.tsx
group: auth
weight: light
size_gzip_kb: 0.1
lazy: false
pages: ['ทุกหน้า (layout)']
tags: [component, V1]
---

# SessionProvider · V1

> ตัวห่อ next-auth SessionProvider วางที่ layout ราก

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/auth/SessionProvider.tsx` | เบา | 0.1 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `ทุกหน้า (layout)` | พร้อมหน้า |

นำเข้าโดย: `app/layout.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/auth/SessionProvider.tsx` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

```bash
npm install next-auth@^4.24.15
```

## ตัวอย่างการใช้

```tsx
import { SessionProvider } from "@/components/auth/SessionProvider";
```

ของจริงใน `app/layout.tsx` บรรทัด 57:

```tsx
        <SessionProvider>{children}</SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}

```

## โค้ด V1

`frontend/src/components/auth/SessionProvider.tsx` · 5 บรรทัด

```tsx
"use client";

import { SessionProvider as Provider } from "next-auth/react";
export function SessionProvider({ children }: { children: React.ReactNode }) { return <Provider>{children}</Provider>; }
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
