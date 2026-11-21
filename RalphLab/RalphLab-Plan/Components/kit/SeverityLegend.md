---
component: SeverityLegend
version: V1
file: frontend/src/components/kit/severity-legend.tsx
group: kit
weight: light
size_gzip_kb: 0.5
lazy: false
pages: [/assess]
tags: [component, V1]
---

# SeverityLegend · V1

> คำอธิบายระดับสี ต่ำ ปานกลาง สูง รุนแรง

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/severity-legend.tsx` | เบา | 0.5 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/severity-legend.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/kit/risk-bands.ts` → [RiskBands](../kit/RiskBands.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type SeverityLegendProps = {
  bands?: Band[];
  className?: string;
}
```

## ตัวอย่างการใช้

```tsx
import { SeverityLegend } from "@/components/kit/severity-legend";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 4509:

```tsx
          <SeverityLegend className="absolute bottom-3 left-3 bg-card/90 backdrop-blur" />
        )}
      </div>
    </div>
  );
}

```

## โค้ด V1

`frontend/src/components/kit/severity-legend.tsx` · 25 บรรทัด

```tsx
import { cn } from "@/lib/utils";
import { BANDS, type Band } from "./risk-bands";

export type SeverityLegendProps = {
  bands?: Band[];
  className?: string;
};

/** Colour key for risk bands: ต่ำ · กลาง · สูง · รุนแรง. */
export function SeverityLegend({ bands = ["low", "moderate", "high", "severe"], className }: SeverityLegendProps) {
  return (
    <ul
      aria-label="ระดับความเสี่ยง"
      className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm text-foreground", className)}
    >
      {bands.map((band) => (
        <li key={band} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: BANDS[band].color }} />
          {BANDS[band].label}
        </li>
      ))}
    </ul>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
