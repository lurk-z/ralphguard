---
component: BrushToolbar
version: V1
file: frontend/src/components/kit/brush-toolbar.tsx
group: kit
weight: medium
size_gzip_kb: 7.5
lazy: false
pages: [/assess]
tags: [component, V1]
---

# BrushToolbar · V1

> แถบเครื่องมือทาสีใต้ใบหน้า: ขนาดรอย ลบรอย ลบทั้งหมด เริ่มประเมิน (แยกแถวบนมือถือ)

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/brush-toolbar.tsx` | ปานกลาง | 7.5 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/brush-toolbar.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/ui/button.tsx` → [Button](../ui/Button.md)
- `src/components/ui/slider.tsx` → [Slider](../ui/Slider.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-slider@^1.4.3
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `lucide-react`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรสี `--primary-strong` ใน `app/globals.css` (ทุกธีม) และ `primary.strong` ใน `tailwind.config.js` (ใช้กับตัวหนังสือและปุ่มสี teal ให้ contrast ผ่าน)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type BrushToolbarProps = {
  /** Brush size in %. Omit to hide the size control. */
  brushSize?: number;
  onBrushSizeChange?: (value: number) => void;
  minSize?: number;
  maxSize?: number;
  eraseMode?: boolean;
  onToggleErase?: () => void;
  onClearAll?: () => void;
  onAssess?: () => void;
  assessing?: boolean;
  /** Already assessed once: the main button reads "ประเมินใหม่". */
  completed?: boolean;
  /** Nothing painted yet: erase / clear are disabled. */
  hasPaint?: boolean;
  /** Assess button disabled (e.g. no formula selected). */
  assessDisabled?: boolean;
  className?: string;
}
```

## ตัวอย่างการใช้

```tsx
import { BrushToolbar } from "@/components/kit/brush-toolbar";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 3015:

```tsx
              <BrushToolbar
                className="pointer-events-auto w-auto max-w-[calc(100vw-1.5rem)]"
                brushSize={paintReady ? brushSizeControlPct : undefined}
                onBrushSizeChange={setBrushSizeControlPct}
                minSize={PAINT_BRUSH_CONTROL_MIN}
                maxSize={PAINT_BRUSH_CONTROL_MAX}
                eraseMode={eraseMode}
                onToggleErase={() => setEraseMode((value) => !value)}
                onClearAll={() => {
                  if (activeFormula) setPaintPendingClearFormula(activeFormula);
                }}
                hasPaint={Boolean(activeFormula) && hasActivePaint}
```

## โค้ด V1

`frontend/src/components/kit/brush-toolbar.tsx` · 101 บรรทัด

```tsx
"use client";

import { Eraser, Paintbrush, Play, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export type BrushToolbarProps = {
  /** Brush size in %. Omit to hide the size control. */
  brushSize?: number;
  onBrushSizeChange?: (value: number) => void;
  minSize?: number;
  maxSize?: number;
  eraseMode?: boolean;
  onToggleErase?: () => void;
  onClearAll?: () => void;
  onAssess?: () => void;
  assessing?: boolean;
  /** Already assessed once: the main button reads "ประเมินใหม่". */
  completed?: boolean;
  /** Nothing painted yet: erase / clear are disabled. */
  hasPaint?: boolean;
  /** Assess button disabled (e.g. no formula selected). */
  assessDisabled?: boolean;
  className?: string;
};

/** Paint toolbar under the 3D model, all in one pill: brush size slider, erase, clear all, run assessment. */
export function BrushToolbar({
  brushSize,
  onBrushSizeChange,
  minSize = 10,
  maxSize = 100,
  eraseMode = false,
  onToggleErase,
  onClearAll,
  onAssess,
  assessing = false,
  completed = false,
  hasPaint = true,
  assessDisabled = false,
  className,
}: BrushToolbarProps) {
  return (
    <div className={cn("flex w-full max-w-xl flex-wrap items-center justify-end gap-2 rounded-full border bg-card p-1.5 shadow-md max-sm:rounded-3xl sm:flex-nowrap", brushSize !== undefined && "pl-4", className)}>
      {brushSize !== undefined && (
        // On phones the size control takes its own row above the buttons; from 640 px it shares one pill.
        <div className="flex min-w-0 basis-full items-center gap-2 max-sm:pr-3 sm:basis-auto sm:flex-1">
          <Paintbrush className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Slider
            aria-label="ขนาดรอยทา"
            min={minSize}
            max={maxSize}
            step={1}
            value={[brushSize]}
            onValueChange={([value]) => {
              if (typeof value === "number") onBrushSizeChange?.(value);
            }}
            className="min-w-20 flex-1"
          />
          <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-primary-strong">{brushSize}%</span>
          <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border max-sm:hidden" />
        </div>
      )}

      {onToggleErase && (
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={eraseMode}
          aria-label="ลบรอย"
          title="ลบรอย"
          disabled={!hasPaint}
          onClick={onToggleErase}
          className={cn("shrink-0 rounded-full", eraseMode && "bg-foreground text-background hover:bg-foreground/90 hover:text-background")}
        >
          <Eraser />
        </Button>
      )}
      {onClearAll && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="ลบทั้งหมด"
          title="ลบทั้งหมด"
          disabled={!hasPaint}
          onClick={onClearAll}
          className="shrink-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
        </Button>
      )}
      {onAssess && (
        <Button disabled={assessing || assessDisabled} onClick={onAssess} className="shrink-0 rounded-full">
          {completed || assessing ? <RefreshCw className={cn(assessing && "animate-spin motion-reduce:animate-none")} /> : <Play />}
          {assessing ? "กำลังประเมิน" : completed ? "ประเมินใหม่" : "เริ่มประเมิน"}
        </Button>
      )}
    </div>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
