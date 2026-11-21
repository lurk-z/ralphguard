---
component: ProjectList
version: V1
file: frontend/src/components/kit/project-list.tsx
group: kit
weight: medium
size_gzip_kb: 8.7
lazy: false
pages: [/projects]
tags: [component, V1]
---

# ProjectList · V1

> ตารางโปรเจกต์: ช่องติ๊ก เรียงลำดับ แก้ไข/ลบเมื่อชี้ เปิดได้ทั้งแถว

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/project-list.tsx` | ปานกลาง | 8.7 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/projects/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/project-list.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/ui/button.tsx` → [Button](../ui/Button.md)
- `src/components/ui/checkbox.tsx` → [Checkbox](../ui/Checkbox.md)
- `src/components/ui/table.tsx` → [Table](../ui/Table.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-checkbox@^1.4.1
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `lucide-react`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรสี `--primary-strong` ใน `app/globals.css` (ทุกธีม) และ `primary.strong` ใน `tailwind.config.js` (ใช้กับตัวหนังสือและปุ่มสี teal ให้ contrast ผ่าน)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type ProjectListProps = {
  projects: ProjectListItem[];
  onOpen?: (project: ProjectListItem) => void;
  onEdit?: (project: ProjectListItem) => void;
  onDelete?: (project: ProjectListItem) => void;
  /** Called with the ids of the ticked rows. */
  onSelectionChange?: (ids: string[]) => void;
  /** Shown in the footer as "แสดง N จาก total" (e.g. all projects while searching). */
  total?: number;
  /** Bump to clear the ticks (e.g. after deleting the selected rows). */
  selectionKey?: number;
  className?: string;
}
```

## ตัวอย่างการใช้

```tsx
import { ProjectList } from "@/components/kit/project-list";
```

ของจริงใน `app/(dashboard)/projects/page.tsx` บรรทัด 342:

```tsx
          <ProjectList
            projects={listItems}
            total={projects.length}
            selectionKey={selectionKey}
            onSelectionChange={setSelectedIds}
            onOpen={(item) => openProject(item.id)}
            onEdit={(item) => {
              const p = byId(item.id);
              if (p) openDialog(p);
            }}
            onDelete={(item) => {
              const p = byId(item.id);
```

## โค้ด V1

`frontend/src/components/kit/project-list.tsx` · 211 บรรทัด

```tsx
"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, FlaskConical, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ProjectListItem = {
  id: string;
  name: string;
  /** Already formatted for display, e.g. "13 พ.ย. 2569". */
  createdAt: string;
  updatedAt?: string;
  /** ISO dates used only for sorting (falls back to list order when missing). */
  createdAtISO?: string;
  updatedAtISO?: string;
  icon?: LucideIcon;
  /** Colour of the icon box, e.g. "bg-teal-50 text-teal-700" (project colour). */
  iconClassName?: string;
};

export type ProjectListProps = {
  projects: ProjectListItem[];
  onOpen?: (project: ProjectListItem) => void;
  onEdit?: (project: ProjectListItem) => void;
  onDelete?: (project: ProjectListItem) => void;
  /** Called with the ids of the ticked rows. */
  onSelectionChange?: (ids: string[]) => void;
  /** Shown in the footer as "แสดง N จาก total" (e.g. all projects while searching). */
  total?: number;
  /** Bump to clear the ticks (e.g. after deleting the selected rows). */
  selectionKey?: number;
  className?: string;
};

type SortKey = "name" | "created" | "updated";

function SortHead({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; className?: string }) {
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "-mx-1 inline-flex min-h-9 items-center gap-1 rounded px-1 py-1 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
          active && "text-foreground"
        )}
      >
        {label}
        <Arrow className={cn("size-3.5", !active && "opacity-0 group-hover/head:opacity-40")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

/** Project table: tick box, sortable columns, edit/delete shown on row hover. No cards. */
export function ProjectList({ projects, onOpen, onEdit, onDelete, onSelectionChange, total, selectionKey, className }: ProjectListProps) {
  const hasActions = Boolean(onEdit || onDelete);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updated", dir: "desc" });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Drop ticks for rows that are gone, and clear them when the parent asks.
  React.useEffect(() => {
    setSelected((current) => {
      const ids = new Set(projects.map((p) => p.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [projects]);
  React.useEffect(() => {
    if (selectionKey === undefined) return;
    setSelected(new Set());
  }, [selectionKey]);

  const rows = React.useMemo(() => {
    const val = (p: ProjectListItem) =>
      sort.key === "name" ? p.name : sort.key === "created" ? p.createdAtISO ?? "" : p.updatedAtISO ?? p.createdAtISO ?? "";
    const sorted = [...projects].sort((a, b) => val(a).localeCompare(val(b), "th", { numeric: true }));
    return sort.dir === "asc" ? sorted : sorted.reverse();
  }, [projects, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  // Report every change (ticks, rows hidden by a search, rows deleted, reset) so the parent never keeps a stale selection.
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  React.useEffect(() => {
    onSelectionChangeRef.current?.([...selected]);
  }, [selected]);
  // The list unmounts when nothing matches a search: its ticks are gone, so tell the parent.
  React.useEffect(() => () => onSelectionChangeRef.current?.([]), []);

  const update = (next: Set<string>) => setSelected(next);
  const allChecked = projects.length > 0 && selected.size === projects.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="group/head">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  aria-label="เลือกทั้งหมด"
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={(v) => update(v === true ? new Set(projects.map((p) => p.id)) : new Set())}
                />
              </TableHead>
              <SortHead label="โปรเจกต์" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
              <SortHead label="สร้างเมื่อ" active={sort.key === "created"} dir={sort.dir} onClick={() => toggleSort("created")} className="hidden w-36 whitespace-nowrap sm:table-cell" />
              <SortHead label="แก้ไขล่าสุด" active={sort.key === "updated"} dir={sort.dir} onClick={() => toggleSort("updated")} className="hidden w-36 whitespace-nowrap sm:table-cell" />
              {hasActions && (
                <TableHead className="w-20 text-right">
                  <span className="sr-only">จัดการ</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((project) => {
              const Icon = project.icon ?? FlaskConical;
              const isSelected = selected.has(project.id);
              return (
                <TableRow
                  key={project.id}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn("group min-h-14", onOpen && "cursor-pointer")}
                  // Clicking anywhere on the row opens it; ticks, buttons and links keep their own action.
                  onClick={(event) => {
                    if (!onOpen || (event.target as HTMLElement).closest("button, a, input, [role='checkbox']")) return;
                    onOpen(project);
                  }}
                >
                  <TableCell className="w-10 pl-4">
                    <Checkbox
                      aria-label={`เลือก ${project.name}`}
                      checked={isSelected}
                      onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v === true) next.add(project.id);
                        else next.delete(project.id);
                        update(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="w-full max-w-0 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-primary", project.iconClassName)}>
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        {onOpen ? (
                          <button
                            type="button"
                            onClick={() => onOpen(project)}
                            className="block max-w-full truncate rounded text-left text-base font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
                          >
                            {project.name}
                          </button>
                        ) : (
                          <span className="block truncate text-base font-medium">{project.name}</span>
                        )}
                        <p className="text-xs text-muted-foreground sm:hidden">แก้ไข {project.updatedAt ?? project.createdAt}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{project.createdAt}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{project.updatedAt ?? project.createdAt}</TableCell>
                  {hasActions && (
                    <TableCell className="text-right">
                      {/* Visible on hover/focus; always visible on touch screens (no hover there). */}
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                        {onEdit && (
                          <Button variant="ghost" size="icon" aria-label={`แก้ไขโปรเจกต์ ${project.name}`} title="แก้ไข" onClick={() => onEdit(project)}>
                            <Pencil />
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`ลบโปรเจกต์ ${project.name}`}
                            title="ลบ"
                            onClick={() => onDelete(project)}
                            className="hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {selected.size > 0 ? `เลือกแล้ว ${selected.size} · ` : ""}แสดง {projects.length} จาก {total ?? projects.length} โปรเจกต์
      </p>
    </div>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
