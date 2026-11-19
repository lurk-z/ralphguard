"use client";

import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type SegmentedTabItem<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

export type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** "line": underline on the active tab (switching views). "pill": grey track with a white pill that slides (switching modes). */
  variant?: "line" | "pill";
  /** Stretch tabs to fill the width (good on mobile). */
  fullWidth?: boolean;
  /** Phones (below 640 px): show only the icons; the labels stay for screen readers. Needs an icon on every item. */
  collapseLabels?: boolean;
  label?: string;
  className?: string;
};

/**
 * Switch between a few views with shadcn Tabs (keyboard arrows work).
 * `line`: ประเมิน / Nodes, ผลทดสอบ / ผู้ช่วย AI · `pill`: สลับโหมด, Day 1 / 3 / 7.
 * Content is rendered by the caller based on `value`, so the tabs do not point at a panel (`aria-controls`
 * is cleared: Radix would otherwise reference a TabsContent that does not exist, an ARIA error in Lighthouse).
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  variant = "line",
  fullWidth = false,
  collapseLabels = false,
  label,
  className,
}: SegmentedTabsProps<T>) {
  const index = Math.max(0, items.findIndex((item) => item.value === value));
  const pill = variant === "pill";

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      {pill ? (
        <TabsList
          aria-label={label}
          className={cn("relative grid h-11 grid-flow-col auto-cols-fr rounded-xl p-1", fullWidth ? "w-full" : "w-fit")}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 rounded-lg bg-background shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `calc((100% - 0.5rem) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
          />
          {items.map(({ value: itemValue, label: itemLabel, icon: Icon }) => (
            <TabsTrigger
              key={itemValue}
              value={itemValue}
              aria-controls={undefined}
              className={cn("relative z-10 h-full rounded-lg px-4 data-[state=active]:bg-transparent data-[state=active]:shadow-none", collapseLabels && Icon && "max-sm:px-3.5")}
            >
              {Icon && <Icon aria-hidden="true" />}
              <span className={cn("truncate", collapseLabels && Icon && "max-sm:sr-only")}>{itemLabel}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      ) : (
        <TabsList variant="line" aria-label={label} className={cn("border-b", fullWidth ? "w-full" : "w-fit")}>
          {items.map(({ value: itemValue, label: itemLabel, icon: Icon }) => (
            <TabsTrigger key={itemValue} value={itemValue} aria-controls={undefined} className={cn("px-3", !fullWidth && "flex-none")}>
              {Icon && <Icon aria-hidden="true" />}
              <span className="truncate">{itemLabel}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      )}
    </Tabs>
  );
}
