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
