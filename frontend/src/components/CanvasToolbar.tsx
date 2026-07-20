"use client";

import React from "react";
import { ChevronDown, Eraser, Paintbrush, Play, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface CanvasToolbarProps {
  /** Brush size in percent (e.g. 50 = 50%) */
  brushSizePct: number;
  /** Called when the user clicks เริ่มทดสอบ */
  onRun?: () => void;
  /** Called when user clicks ล้างรอย */
  onClear?: () => void;
  /** Clears paint owned by every formula box. */
  onClearAll?: () => void;
  /** Called when brush-size reset is clicked */
  onBrushSizeReset?: () => void;
  /** Called when the brush size is changed via the slider */
  onBrushSizeChange?: (size: number) => void;
  /** Whether the Run button should show a loading spinner */
  running?: boolean;
  /** Prevent running until the current experiment is ready. */
  runDisabled?: boolean;
  /** Explains why Run is unavailable. */
  runDisabledReason?: string;
  /** Minimum brush size percent (default 10) */
  minBrushSize?: number;
  /** Maximum brush size percent (default 100) */
  maxBrushSize?: number;
}

export default function CanvasToolbar({
  brushSizePct,
  onRun,
  onClear,
  onClearAll,
  onBrushSizeReset,
  onBrushSizeChange,
  running = false,
  runDisabled = false,
  runDisabledReason,
  minBrushSize = 10,
  maxBrushSize = 100,
}: CanvasToolbarProps) {
  return (
    /* Absolute-centred at the bottom — wrap the parent in position:relative */
    <div
      aria-label="Canvas toolbar"
      className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center"
    >
      <div
        className={[
          "pointer-events-auto",
          "flex items-center gap-1.5",
          "rounded-2xl border border-border bg-card/95 px-2 py-1.5",
          "shadow-[0_4px_24px_rgba(0,0,0,0.12)]",
          "backdrop-blur-md",
        ].join(" ")}
      >
        {/* ── Brush size Popover (triggered by Paintbrush icon) ── */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  id="canvas-toolbar-brush-trigger"
                  aria-label="ปรับขนาดพู่กัน"
                  disabled={running}
                  className={[
                    "grid size-9 place-items-center rounded-xl",
                    "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    "transition-colors duration-150",
                    "active:scale-90 disabled:pointer-events-none disabled:opacity-45",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  ].join(" ")}
                >
                  <Paintbrush className="size-4" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-3" side="top" align="center">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Paintbrush className="size-3" />
                      <span>ขนาดพู่กัน</span>
                    </span>
                    <span className="font-mono font-bold text-foreground">{brushSizePct}%</span>
                  </div>
                  <CustomSlider
                    value={brushSizePct}
                    min={minBrushSize}
                    max={maxBrushSize}
                    onChange={onBrushSizeChange}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={onBrushSizeReset}
                      className="text-[10px] text-primary hover:underline"
                    >
                      รีเซ็ต (10%)
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <TooltipContent side="top">คลิกเพื่อปรับขนาดพู่กัน</TooltipContent>
          </Tooltip>

          {/* Static Size Percent Text next to it */}
          <span className="font-mono text-xs font-semibold text-foreground select-none pr-1.5">
            {brushSizePct}%
          </span>
        </div>

        {/* ── Divider ── */}
        <div
          aria-hidden
          className="mx-1 h-5 w-px shrink-0 rounded-full bg-border"
        />

        {/* ── Clear button ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              id="canvas-toolbar-clear"
              aria-label="ล้างรอยที่เลือก"
              onClick={onClear}
              disabled={running}
              className={[
                "flex h-9 items-center gap-1.5 rounded-xl px-3",
                "text-muted-foreground hover:bg-secondary hover:text-foreground text-sm font-medium",
                "transition-colors duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-45",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              ].join(" ")}
            >
              <Eraser className="size-4" aria-hidden />
              <span>ล้างรอยที่เลือก</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">ลบรอยทาของกล่องสูตรที่เลือก</TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <button
              aria-label="ตัวเลือกล้างรอย"
              disabled={running}
              className="grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1.5" side="top" align="center">
            <button
              type="button"
              onClick={onClearAll}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-4" aria-hidden />
              <span>ล้างรอยทั้งหมด</span>
            </button>
          </PopoverContent>
        </Popover>

        {/* ── เริ่มทดสอบ button (far right) ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              id="canvas-toolbar-run"
              aria-label="เริ่มทดสอบ"
              title={runDisabled && !running ? runDisabledReason : undefined}
              onClick={onRun}
              disabled={running || runDisabled}
              className={[
                "flex h-9 items-center gap-2 rounded-xl px-4",
                "bg-primary text-primary-foreground text-sm font-semibold",
                "transition-all duration-150",
                "hover:bg-primary/90 active:scale-[0.97]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              ].join(" ")}
            >
              {running ? (
                <svg
                  className="size-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              ) : (
                <Play className="size-4 fill-current" aria-hidden />
              )}
              <span>{running ? "กำลังทดสอบ…" : "เริ่มทดสอบ"}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {runDisabled && !running
              ? runDisabledReason || "ยังไม่พร้อมเริ่มทดสอบ"
              : "เริ่มประเมินและจำลองผลลัพธ์"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

const CustomSlider = ({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange?: (val: number) => void;
}) => {
  const trackRef = React.useRef<HTMLDivElement>(null);

  const updateValue = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const width = rect.width;
    const x = Math.max(0, Math.min(width, clientX - rect.left));
    const percentage = x / width;
    const val = Math.round(min + percentage * (max - min));
    onChange?.(val);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    updateValue(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateValue(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    updateValue(e.touches[0].clientX);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      updateValue(moveEvent.touches[0].clientX);
    };

    const handleTouchEnd = () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };

    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);
  };

  const pct = ((value - min) / (max - min)) * 100;
  const thumbSize = (value / 100) * 16 + 8; // min 9.6px, max 24px

  return (
    <div
      ref={trackRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className="relative my-3.5 h-6 w-full cursor-pointer flex items-center select-none"
    >
      {/* Track Background */}
      <div className="absolute left-0 right-0 h-1.5 rounded-lg bg-secondary" />

      {/* Active Track Fill */}
      <div
        className="absolute left-0 h-1.5 rounded-lg bg-primary"
        style={{ width: `${pct}%` }}
      />

      {/* Thumb */}
      <div
        className="absolute rounded-full bg-primary shadow-md -translate-x-1/2 flex items-center justify-center transition-[width,height] duration-75"
        style={{
          left: `${pct}%`,
          width: `${thumbSize}px`,
          height: `${thumbSize}px`,
        }}
      />
    </div>
  );
};
