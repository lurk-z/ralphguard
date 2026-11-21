---
component: TrendChart
version: V1
file: frontend/src/components/charts/TrendChart.tsx
group: charts
weight: light
size_gzip_kb: 108.2
lazy: true
pages: [/assess]
tags: [component, V1]
---

# TrendChart · V1

> กราฟเส้นแนวโน้มการอักเสบของผลประเมินแต่ละ Day (recharts)

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/charts/TrendChart.tsx` | เบา | 108.2 KB | เปิดใช้ (next/dynamic) |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | เมื่อเปิดใช้ (lazy) |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/charts/TrendChart.tsx` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

```bash
npm install recharts@^2.12.7
```

## ตัวอย่างการใช้

```tsx
import TrendChart from "@/components/charts/TrendChart";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 2891:

```tsx
                        <TrendChart data={trendData} lines={trendLines} compact={isMobileWorkspace} />
                      </div>

                      <div className="assess-trend-legend mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {trendLines.map((l) => (
                          <span key={l.key} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="h-0.5 w-4 rounded" style={{ background: l.color }} />
                            {l.label}
                          </span>
                        ))}
                      </div>

```

## โค้ด V1

`frontend/src/components/charts/TrendChart.tsx` · 88 บรรทัด

```tsx
"use client";

/**
 * TrendChart — line chart of the irritation/toxicity time-course (Day 1/3/7)
 * for each endpoint. Client-only (recharts needs the DOM).
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = { day: string } & Record<string, number | string>;
type Series = { key: string; label: string; color: string };

export default function TrendChart({
  data,
  lines,
  dark = false,
  compact = false,
}: {
  data: Row[];
  lines: Series[];
  dark?: boolean;
  compact?: boolean;
}) {
  const grid = dark ? "#3a3a3a" : "#eef2f5";
  const axis = dark ? "#777" : "#94a3b8";
  const tickFill = dark ? "#cbd5e1" : "#64748b";
  return (
    <ResponsiveContainer width="100%" height={compact ? 150 : 230}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 4 }}>
        <ReferenceArea y1={0} y2={25} fill="#16A34A" fillOpacity={0.045} />
        <ReferenceArea y1={25} y2={50} fill="#E08A00" fillOpacity={0.045} />
        <ReferenceArea y1={50} y2={75} fill="#DC2626" fillOpacity={0.035} />
        <ReferenceArea y1={75} y2={100} fill="#B91C1C" fillOpacity={0.055} />
        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke={grid} />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fontWeight: 600, fill: tickFill }}
          dy={8}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          axisLine={false}
          tickLine={false}
          width={34}
          tick={{ fontSize: 10, fill: tickFill }}
        />
        <Tooltip
          formatter={(value, name) => [`${Math.round(Number(value ?? 0))}/100`, String(name)]}
          cursor={{ stroke: dark ? "#64748b" : "#cbd5e1", strokeDasharray: "3 3" }}
          contentStyle={{
            fontSize: 11,
            borderRadius: 12,
            border: dark ? "1px solid #3a3a3a" : "1px solid #e2e8f0",
            background: dark ? "#2b2b2b" : "#fff",
            color: dark ? "#e5e7eb" : "#334155",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
          }}
          labelStyle={{ fontWeight: 600, color: dark ? "#e5e7eb" : "#334155" }}
        />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={l.color}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: dark ? "#1f2937" : "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: l.color, stroke: dark ? "#1f2937" : "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
