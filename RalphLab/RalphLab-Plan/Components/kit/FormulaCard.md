---
component: FormulaCard
version: V1
file: frontend/src/components/kit/formula-card.tsx
group: kit
weight: light
size_gzip_kb: 4.4
lazy: false
pages: [/assess]
tags: [component, V1]
---

# FormulaCard · V1

> กล่องสูตร: แถบสัดส่วนสี รายการสาร ช่อง % ปุ่มเอาสารออก และปุ่มเพิ่มสาร

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/formula-card.tsx` | เบา | 4.4 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/formula-card.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/ui/alert.tsx` → [Alert](../ui/Alert.md)
- `src/components/ui/badge.tsx` → [Badge](../ui/Badge.md)
- `src/components/ui/button.tsx` → [Button](../ui/Button.md)
- `src/components/ui/card.tsx` → [Card](../ui/Card.md)
- `src/components/ui/input.tsx` → [Input](../ui/Input.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `lucide-react`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรสี `--primary-strong` ใน `app/globals.css` (ทุกธีม) และ `primary.strong` ใน `tailwind.config.js` (ใช้กับตัวหนังสือและปุ่มสี teal ให้ contrast ผ่าน)
- ปลั๊กอิน `tailwindcss-animate` (มีใน `tailwind.config.js` อยู่แล้ว)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type FormulaCardProps = {
  name: string;
  /** e.g. "ครีม / โลชั่น". */
  productType?: string;
  ingredients: FormulaIngredient[];
  /** Base water (fills the formula to 100%). Omit to hide the water end of the bar. */
  basePercent?: number;
  /** Shown above the ingredients, e.g. "สารรวมเต็ม 100% แล้ว". */
  warning?: string;
  active?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSettings?: () => void;
  onPercentChange?: (index: number, percent: number) => void;
  onRemove?: (index: number) => void;
  onAdd?: () => void;
  /** Live pages can keep selection, inline renaming and their own action menus. */
  onSelect?: () => void;
  selectLabel?: string;
  headerIcon?: React.ReactNode;
  nameContent?: React.ReactNode;
  headerActions?: React.ReactNode;
  addContent?: React.ReactNode;
  wrapIngredient?: (item: FormulaIngredient, index: number, row: React.ReactNode) => React.ReactNode;
  className?: string;
}
```

## ตัวอย่างการใช้

```tsx
import { FormulaCard } from "@/components/kit/formula-card";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 2552:

```tsx
                      <FormulaCard
                        key={f.id} name={f.name} productType={f.type} active={selected} expanded={expanded}
                        basePercent={formulaWaterPct}
                        ingredients={f.items.map((item) => ({ name: item.name || "", smiles: item.smiles, percent: item.concentration, property: item.smiles }))}
                        warning={formulaWaterMissing ? (formulaExcessPct > 0 ? "สารรวม " + formulaTotalPct + "% — เกิน " + formulaExcessPct + "% กรุณาลดสัดส่วนสาร" : "สารรวมเต็ม 100% แล้ว กรุณาลดสัดส่วนสาร") : undefined}
                        className={f.id === recentlyCreatedFormulaId ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none" : undefined}
                        onSelect={() => selectFormula(f.id)}
                        selectLabel={"เลือก " + f.name + " · ทดสอบบริเวณ" + formulaRegionMeta.label}
                        headerIcon={<SemanticIcon name={formulaRegionMeta.icon} className="size-5" />}
                        nameContent={<>
                          {editingFormulaId === f.id ? (
                            <input
```

## โค้ด V1

`frontend/src/components/kit/formula-card.tsx` · 214 บรรทัด

```tsx
"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, Plus, ScanLine, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type FormulaIngredient = {
  name: string;
  smiles?: string;
  /** 0–100 */
  percent: number;
  /** What the substance does, e.g. "ให้ความชุ่มชื้น". Shown under the name. */
  property?: string;
};

export type FormulaCardProps = {
  name: string;
  /** e.g. "ครีม / โลชั่น". */
  productType?: string;
  ingredients: FormulaIngredient[];
  /** Base water (fills the formula to 100%). Omit to hide the water end of the bar. */
  basePercent?: number;
  /** Shown above the ingredients, e.g. "สารรวมเต็ม 100% แล้ว". */
  warning?: string;
  active?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSettings?: () => void;
  onPercentChange?: (index: number, percent: number) => void;
  onRemove?: (index: number) => void;
  onAdd?: () => void;
  /** Live pages can keep selection, inline renaming and their own action menus. */
  onSelect?: () => void;
  selectLabel?: string;
  headerIcon?: React.ReactNode;
  nameContent?: React.ReactNode;
  headerActions?: React.ReactNode;
  addContent?: React.ReactNode;
  wrapIngredient?: (item: FormulaIngredient, index: number, row: React.ReactNode) => React.ReactNode;
  className?: string;
};

/** One colour per ingredient: the same colour is used in the bar and next to the name. */
const COLORS = ["bg-teal-600", "bg-cyan-500", "bg-emerald-400", "bg-teal-300", "bg-sky-400", "bg-cyan-300"];

/** Formula box: header (name, count, settings, collapse), proportion bar, ingredient rows with %, dashed add button. */
/** Bar segment: grows from 0 when it appears and slides when its % changes. */
function BarSegment({ percent, className }: { percent: number; className: string }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return <span className={cn("h-full transition-[width] duration-300 ease-out motion-reduce:transition-none", className)} style={{ width: shown ? `${percent}%` : 0 }} />;
}

export function FormulaCard({
  name,
  productType,
  ingredients,
  basePercent,
  warning,
  active = false,
  expanded = true,
  onToggle,
  onSettings,
  onPercentChange,
  onRemove,
  onAdd,
  onSelect,
  selectLabel,
  headerIcon,
  nameContent,
  headerActions,
  addContent,
  wrapIngredient,
  className,
}: FormulaCardProps) {
  // Row being removed: fades out first, then the parent is told.
  const [removing, setRemoving] = React.useState<number | null>(null);
  const remove = (index: number) => {
    if (!onRemove) return;
    setRemoving(index);
    window.setTimeout(() => {
      setRemoving(null);
      onRemove(index);
    }, 180);
  };
  return (
    <Card aria-label={name} className={cn("overflow-hidden", active && "border-primary ring-1 ring-primary/20", className)}>
      <div className="flex items-center gap-2 px-4 py-3">
        {onSelect ? (
          <Button variant="ghost" size="icon-lg" aria-label={selectLabel ?? `เลือก ${name}`} aria-pressed={active} onClick={onSelect} className="shrink-0 bg-accent text-primary-strong">
            {headerIcon ?? <ScanLine aria-hidden="true" />}
          </Button>
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-primary">
            {headerIcon ?? <ScanLine className="size-[18px]" aria-hidden="true" />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {nameContent ?? <>
          <h3 className="truncate text-base font-semibold leading-tight">{name}</h3>
          {productType && <p className="truncate text-sm text-muted-foreground">{productType}</p>}
          </>}
        </div>
        <Badge variant="muted" className="shrink-0">{ingredients.length} สาร</Badge>
        {headerActions ?? (onSettings && (
          <Button variant="ghost" size="icon" aria-label={`ตั้งค่า ${name}`} onClick={onSettings}>
            <Settings />
          </Button>
        ))}
        {onToggle && (
          <Button variant="ghost" size="icon" aria-expanded={expanded} aria-label={expanded ? `ย่อ ${name}` : `กาง ${name}`} onClick={onToggle}>
            <ChevronDown className={cn("transition-transform motion-reduce:transition-none", expanded && "rotate-180")} />
          </Button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 border-t p-4">
          <div>
            <div className="flex h-3 overflow-hidden rounded-full bg-sky-100" role="img" aria-label="สัดส่วนสารในสูตร">
              {ingredients.map((item, index) => (
                <BarSegment key={index} percent={item.percent} className={COLORS[index % COLORS.length]} />
              ))}
            </div>
            {basePercent !== undefined && (
              <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                <span>สาร {Math.round(ingredients.reduce((sum, item) => sum + item.percent, 0) * 10) / 10}%</span>
                <span>Water {basePercent}% · เติมให้ครบ 100%</span>
              </div>
            )}
          </div>

          {warning && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}

          <ul className="space-y-1">
            {ingredients.map((item, index) => {
              const row = (
                <div className="flex min-h-11 items-center gap-2.5">
                <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-sm", COLORS[index % COLORS.length])} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base">{item.name || "ยังไม่มีชื่อสาร"}</div>
                  {item.property && <div className="truncate text-xs text-muted-foreground">{item.property}</div>}
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.1}
                  end="%"
                  value={item.percent}
                  readOnly={!onPercentChange}
                  aria-label={`สัดส่วน ${item.name} (%)`}
                  className="h-9 w-[5.5rem] text-right tabular-nums"
                  containerClassName="w-auto shrink-0"
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) onPercentChange?.(index, value);
                  }}
                  onBlur={(event) => {
                    const value = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0));
                    if (value !== item.percent) onPercentChange?.(index, value);
                  }}
                />
                {onRemove && (
                  <Button variant="ghost" size="icon" aria-label={`เอา ${item.name} ออก`} onClick={() => remove(index)} className="shrink-0 text-muted-foreground hover:text-destructive">
                    <X />
                  </Button>
                )}
                </div>
              );
              return (
              <li
                key={`${item.name}-${index}`}
                className={cn(
                  "min-w-0 duration-200 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none",
                  removing === index && "pointer-events-none -translate-x-2 opacity-0 transition-all duration-150"
                )}
              >
                {wrapIngredient ? wrapIngredient(item, index, row) : row}
              </li>
            ); })}
          </ul>

          {addContent ?? (onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 text-sm font-medium text-primary-strong transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <Plus className="size-4" aria-hidden="true" />
              เพิ่มสาร
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
