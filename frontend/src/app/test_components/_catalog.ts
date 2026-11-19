/**
 * Showcase data for /test_components.
 *
 * Sizes and "used by" come from `_inventory.json` (generated: `npm run inventory`).
 * This file only adds what the script cannot know: a display name, which live
 * example (in `_demos.tsx`) belongs to which file, and extra files an example covers.
 */
import inventory from "./_inventory.json";

export type Tier = "light" | "medium" | "heavy";

export type InventoryItem = {
  file: string;
  folder: string;
  name: string;
  exports: string[];
  lines: number;
  gzKB: number | null;
  rawKB: number | null;
  libs: string[];
  /** Tier shown in the showcase: lazily loaded components count as light. */
  tier: Tier;
  /** Tier by size alone (before lazy loading is taken into account). */
  sizeTier: Tier;
  /** Used by a page only through next/dynamic: not part of the first load. */
  lazy: boolean;
  usedBy: string[];
};

export const INVENTORY = inventory as { generated: string; thresholdsKB: { light: number; heavy: number }; components: InventoryItem[] };

export const TIERS: { id: Tier; label: string; hint: string; className: string }[] = [
  { id: "light", label: "เบา", hint: `น้อยกว่า ${INVENTORY.thresholdsKB.light} KB หรือโหลดเมื่อเปิดใช้ (ไม่อยู่ใน first load)`, className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { id: "medium", label: "ปานกลาง", hint: `${INVENTORY.thresholdsKB.light}–${INVENTORY.thresholdsKB.heavy} KB`, className: "border-amber-200 bg-amber-50 text-amber-800" },
  { id: "heavy", label: "หนัก", hint: `มากกว่า ${INVENTORY.thresholdsKB.heavy} KB หรือใช้ three.js / recharts / reactflow / gsap`, className: "border-rose-200 bg-rose-50 text-rose-800" },
];

/** Live example id (key of DEMOS in _demos.tsx) → component file and display name. */
export const DEMO_FOR_FILE: Record<string, { demo: string; title: string }> = {
  "components/ui/button.tsx": { demo: "button", title: "Button" },
  "components/ui/input.tsx": { demo: "input", title: "Input" },
  "components/ui/select.tsx": { demo: "select", title: "Select" },
  "components/ui/slider.tsx": { demo: "slider", title: "Slider" },
  "components/kit/brand-logo.tsx": { demo: "brand-logo", title: "BrandLogo" },
  "components/kit/segmented-tabs.tsx": { demo: "segmented-tabs", title: "SegmentedTabs" },
  "components/ui/tabs.tsx": { demo: "tabs", title: "Tabs" },
  "components/kit/page-header.tsx": { demo: "page-header", title: "PageHeader" },
  "components/ui/dialog.tsx": { demo: "dialog", title: "Dialog" },
  "components/ui/alert-dialog.tsx": { demo: "alert-dialog", title: "AlertDialog" },
  "components/ui/sheet.tsx": { demo: "sheet", title: "Sheet (แผงข้างในหน้า /assess)" },
  "components/ui/dropdown-menu.tsx": { demo: "dropdown-menu", title: "DropdownMenu" },
  "components/ui/popover.tsx": { demo: "popover", title: "Popover" },
  "components/ui/tooltip.tsx": { demo: "tooltip", title: "Tooltip" },
  "components/ui/sonner.tsx": { demo: "sonner", title: "Toast (sonner)" },
  "components/ui/card.tsx": { demo: "card", title: "Card" },
  "components/ui/badge.tsx": { demo: "badge", title: "Badge" },
  "components/ui/alert.tsx": { demo: "alert", title: "Alert" },
  "components/ui/avatar.tsx": { demo: "avatar", title: "Avatar" },
  "components/ui/table.tsx": { demo: "table", title: "Table" },
  "components/ui/progress.tsx": { demo: "progress", title: "Progress" },
  "components/ui/skeleton.tsx": { demo: "progress", title: "Skeleton" },
  "components/ui/empty.tsx": { demo: "empty", title: "Empty" },
  "components/kit/project-list.tsx": { demo: "project-list", title: "ProjectList" },
  "components/kit/formula-card.tsx": { demo: "formula-card", title: "FormulaCard" },
  "components/kit/score-card.tsx": { demo: "score-card", title: "ScoreList · ScoreRow" },
  "components/kit/severity-legend.tsx": { demo: "severity-legend", title: "SeverityLegend" },
  "components/kit/brush-toolbar.tsx": { demo: "brush-toolbar", title: "BrushToolbar" },
  "components/shared/BrandedProgressLoader.tsx": { demo: "branded-progress-loader", title: "BrandedProgressLoader" },
};

/** Folder → short label shown on each card. */
export const FOLDER_LABEL: Record<string, string> = {
  "components/ui": "ui (shadcn)",
  "components/kit": "kit (ชิ้นของแอป)",
  "components/ai": "ai (แชท)",
  "components/three": "3D",
  "components/face": "ใบหน้า 3D",
  "components/formula": "สูตร",
  "components/substances": "คลังสาร",
  "components/assistant": "ผู้ช่วยเสียง",
  "components/charts": "กราฟ",
  "components/landing": "หน้าแรก",
  "components/layout": "โครงหน้า",
  "components/shared": "ใช้ร่วม",
  "components/auth": "ล็อกอิน",
  "hooks/use-idle-frameloop.ts": "hook",
};
