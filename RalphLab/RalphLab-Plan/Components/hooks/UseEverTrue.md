---
component: UseEverTrue
version: V1
file: frontend/src/hooks/use-ever-true.ts
group: hooks
weight: light
size_gzip_kb: 0.1
lazy: false
pages: [/assess]
tags: [component, V1]
---

# UseEverTrue · V1

> Hook: เป็น true เมื่อค่าเคยเป็น true แล้วค้างไว้ ใช้ mount แผงหนักเมื่อเปิดครั้งแรก

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/hooks/use-ever-true.ts` | เบา | 0.1 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/hooks/use-ever-true.ts` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `react`

## ตัวอย่างการใช้

```tsx
import { useEverTrue } from "@/hooks/use-ever-true";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 1708:

```tsx
  const libraryMounted = useEverTrue(activeNavigationItem === "substances");
  const assistantMounted = useEverTrue(rightInspectorTab === "assistant");
  const scanMounted = useEverTrue(scanOpen);
  const csvMounted = useEverTrue(csvOpen);
  const [csvTargetFormulaId, setCsvTargetFormulaId] = useState<string | null>(null);
  const [csvTargetProjectId, setCsvTargetProjectId] = useState<number | null>(null);
  const openLabelScan = (formulaId: string) => {
    setScanTargetFormulaId(formulaId);
    setScanTargetProjectId(projectId);
    setScanOpen(true);
  };
  const closeLabelScan = () => {
```

## โค้ด V1

`frontend/src/hooks/use-ever-true.ts` · 17 บรรทัด

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Turns true the first time `value` is true and stays true.
 * Used to mount a heavy, lazily loaded panel (library, modal, assistant) only
 * once it is first opened, then keep it mounted so its state survives.
 */
export function useEverTrue(value: boolean) {
  const [ever, setEver] = useState(value);
  useEffect(() => {
    if (value) setEver(true);
  }, [value]);
  return ever || value;
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
