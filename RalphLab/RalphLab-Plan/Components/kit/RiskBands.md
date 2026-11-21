---
component: RiskBands
version: V1
file: frontend/src/components/kit/risk-bands.ts
group: kit
weight: light
size_gzip_kb: 0.2
lazy: false
pages: [/assess]
tags: [component, V1]
---

# RiskBands · V1

> ค่าคงที่ระดับความเสี่ยงและความเชื่อมั่น (สี ชื่อ) ไฟล์เล็กเพื่อไม่ลาก Tooltip

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/risk-bands.ts` | เบา | 0.2 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `components/kit/score-card.tsx`, `components/kit/severity-legend.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/risk-bands.ts` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

## ตัวอย่างการใช้

## โค้ด V1

`frontend/src/components/kit/risk-bands.ts` · 24 บรรทัด

```ts
/*
 * Risk band and model-reliability colours shared by ScoreList, SeverityLegend and the assess page.
 * Kept in its own tiny file so a colour strip does not pull in ScoreList's Tooltip and icons (~17 KB).
 */

export type Band = "low" | "moderate" | "high" | "severe";

/** Risk band colours and Thai labels. */
export const BANDS: Record<Band, { label: string; color: string }> = {
  low: { label: "ต่ำ", color: "#16A34A" },
  moderate: { label: "กลาง", color: "#CA8A04" },
  high: { label: "สูง", color: "#DC2626" },
  severe: { label: "รุนแรง", color: "#B91C1C" },
};

export type Confidence = "high" | "medium" | "low";

/** Model reliability: high = green, medium = yellow, low = red. */
export const CONFIDENCE: Record<Confidence, { label: string; color: string }> = {
  high: { label: "สูง", color: "#16A34A" },
  medium: { label: "กลาง", color: "#CA8A04" },
  low: { label: "ต่ำ", color: "#DC2626" },
};
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
