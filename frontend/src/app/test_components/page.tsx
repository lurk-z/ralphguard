"use client";

import { useMemo, useState } from "react";
import { Boxes, FileCode2, MapPin, PackageOpen } from "lucide-react";
import { BrandLogo } from "@/components/kit/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/kit/segmented-tabs";
import { cn } from "@/lib/utils";
import { DEMO_FOR_FILE, FOLDER_LABEL, INVENTORY, TIERS, type InventoryItem, type Tier } from "./_catalog";
import { DEMOS } from "./_demos";
import { WhenVisible } from "./_parts";

type Filter = "all" | Tier | "unused";

const folderLabel = (item: InventoryItem) =>
  FOLDER_LABEL[item.file] ?? FOLDER_LABEL[item.folder] ?? (item.folder.startsWith("components/three") ? "3D" : item.folder);

/**
 * Component showcase (dev only, 404 in production).
 * Every file in components/ and hooks/, grouped by size (light / medium / heavy),
 * with the pages that use it and a live example where one exists.
 * Data: ./_inventory.json (`npm run inventory`) + ./_catalog.ts · examples: ./_demos.tsx
 */
export default function TestComponentsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INVENTORY.components.filter((c) => {
      if (filter === "unused" && c.usedBy.length > 0) return false;
      if (filter !== "all" && filter !== "unused" && c.tier !== filter) return false;
      return !q || `${c.file} ${c.name} ${DEMO_FOR_FILE[c.file]?.title ?? ""}`.toLowerCase().includes(q);
    });
  }, [filter, query]);

  const all = INVENTORY.components;
  const unused = all.filter((c) => c.usedBy.length === 0);
  const pages = [...new Set(all.flatMap((c) => c.usedBy))].sort();
  const count = (t: Tier) => all.filter((c) => c.tier === t).length;

  return (
    <div className="app-light min-h-dvh bg-muted/30 text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <BrandLogo href={null} compact />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold">Components ทั้งหมด</h1>
            <p className="text-xs text-muted-foreground">
              {all.length} ไฟล์ · วัดเมื่อ {INVENTORY.generated} · หน้าทดสอบเปิดเฉพาะตอน dev
            </p>
          </div>
          <Input
            search
            value={query}
            placeholder="ค้นหา component"
            aria-label="ค้นหา component"
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            containerClassName="w-full sm:w-64"
          />
        </div>
        <div className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 sm:px-6">
          <SegmentedTabs
            variant="pill"
            label="กรองตามน้ำหนัก"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            items={[
              { value: "all", label: `ทั้งหมด ${all.length}` },
              ...TIERS.map((t) => ({ value: t.id, label: `${t.label} ${count(t.id)}` })),
              { value: "unused", label: `ไม่มีหน้าไหนใช้ ${unused.length}` },
            ]}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:px-6">
        <Summary pages={pages} />

        {filter === "unused" ? (
          <TierSection title="ไม่มีหน้าไหนใช้" hint="ไม่มีหน้าใด import (ไม่นับ /test_components) · ตัวเลือกให้ลบหรือรอใช้" items={items} />
        ) : (
          TIERS.filter((t) => filter === "all" || filter === t.id).map((t) => (
            <TierSection key={t.id} title={t.label} hint={t.hint} tierClassName={t.className} items={items.filter((c) => c.tier === t.id)} />
          ))
        )}
        {items.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">ไม่พบ component ที่ตรงกับ “{query}”</p>}
      </main>
    </div>
  );
}

/** Pages × how many components each one uses. */
function Summary({ pages }: { pages: string[] }) {
  const all = INVENTORY.components;
  return (
    <section aria-labelledby="h-summary" className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="h-summary" className="text-sm font-semibold">ใช้ที่หน้าไหน</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {pages.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-xs">
            <MapPin className="size-3 text-muted-foreground" aria-hidden="true" />
            <code>{p}</code>
            <span className="tabular-nums text-muted-foreground">{all.filter((c) => c.usedBy.includes(p)).length}</span>
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        ขนาด = โค้ดของไฟล์ + แพ็กเกจที่ลากมา (เช่น Radix) หลัง minify + gzip ไม่นับ React, Next, lucide, three.js และตัวช่วย class ที่ทุกหน้าโหลดอยู่แล้ว
        · ชิ้นที่ใช้ Radix ตัวเดียวกันจะดูหนักซ้ำกัน แต่บนหน้าจริงโหลดครั้งเดียว
        · ชิ้นที่หน้าโหลดผ่าน <code>next/dynamic</code> (เปิดคลังสาร, Nodes, กราฟ, Lab ฯลฯ) ไม่อยู่ใน first load จึงนับเป็น “เบา” พร้อมป้ายสีฟ้า และบอกขนาดจริงไว้
      </p>
    </section>
  );
}

function TierSection({ title, hint, tierClassName, items }: { title: string; hint: string; tierClassName?: string; items: InventoryItem[] }) {
  if (items.length === 0) return null;
  const groups = Object.entries(
    items.reduce<Record<string, InventoryItem[]>>((acc, c) => {
      (acc[folderLabel(c)] ??= []).push(c);
      return acc;
    }, {}),
  );
  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {tierClassName && <span className={cn("rounded-full border px-2 py-0.5 text-xs", tierClassName)}>{items.length} ไฟล์</span>}
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {groups.map(([label, list]) => (
        <div key={label} className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Boxes className="size-3.5" aria-hidden="true" /> {label} · {list.length}
          </h3>
          <div className="grid gap-3">
            {list.map((c) => (
              <ComponentCard key={c.file} item={c} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ComponentCard({ item }: { item: InventoryItem }) {
  const demoInfo = DEMO_FOR_FILE[item.file];
  const Demo = demoInfo ? DEMOS[demoInfo.demo] : undefined;
  const tier = TIERS.find((t) => t.id === item.tier)!;
  return (
    <article id={`c-${item.file}`} className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-col gap-2 border-b bg-muted/40 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-semibold">{demoInfo?.title ?? item.name}</h4>
          <p className="flex items-start gap-1.5 break-all text-xs text-muted-foreground">
            <FileCode2 className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <code>{item.file}</code>
            <span className="shrink-0">· {item.lines} บรรทัด</span>
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs">
            <MapPin className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            {item.usedBy.length ? (
              item.usedBy.map((p) => (
                <code key={p} className="rounded bg-background px-1.5 py-0.5 ring-1 ring-border">
                  {p}
                </code>
              ))
            ) : (
              <span className="font-medium text-destructive">ไม่มีหน้าไหนใช้</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", tier.className)}>
            {tier.label} · {item.gzKB ?? "?"} KB
          </span>
          {item.lazy && (
            <span
              title={`ขนาดจริง ${item.gzKB} KB (${TIERS.find((t) => t.id === item.sizeTier)?.label}) แต่โหลดเมื่อเปิดใช้เท่านั้น`}
              className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800"
            >
              โหลดเมื่อเปิดใช้ · ย้ายมาจาก{TIERS.find((t) => t.id === item.sizeTier)?.label}
            </span>
          )}
          {item.libs.map((lib) => (
            <Badge key={lib} variant="outline" className="font-mono text-[10px]">
              {lib}
            </Badge>
          ))}
        </div>
      </header>
      {Demo ? (
        <div className="p-4 sm:p-5">
          <WhenVisible>
            <Demo />
          </WhenVisible>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground">
          <PackageOpen className="size-3.5" aria-hidden="true" />
          ยังไม่มีตัวอย่างในหน้านี้{item.usedBy.length ? ` · ดูของจริงที่ ${item.usedBy[0]}` : ""}
        </p>
      )}
    </article>
  );
}
