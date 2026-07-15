"use client";

// Chemical library — browse the full substance list available to this
// project's formula boxes. Same data source as the assess workspace's
// substance picker (src/lib/chemicals.ts), just as a full page instead of a sheet.
import { useMemo, useState } from "react";
import { ChevronDown, FlaskConical, Search } from "lucide-react";

import { CHEMICALS } from "@/lib/chemicals";

export default function ChemicalsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => Array.from(new Set(CHEMICALS.map((c) => c.role))), []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHEMICALS.filter((c) => {
      const matchesCategory = category === "all" || c.role === category;
      const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.cas.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query, category]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">คลังสารเคมี</h1>
          <p className="text-sm text-muted-foreground">สารเคมีทั้งหมดที่ใช้ในการสร้างสูตรของโปรเจ็คนี้</p>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-6 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาสารเคมี หรือ INCI"
            className="h-9 w-full rounded-lg border border-border bg-secondary/50 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <div className="relative shrink-0">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-border bg-card py-0 pl-3 pr-8 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="all">หมวดหมู่ทั้งหมด</option>
            {categories.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: `${c.color}1A` }}
              >
                <FlaskConical className="size-5" style={{ color: c.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">CAS {c.cas}</p>
                <p className="truncate text-xs text-primary">{c.role}</p>
              </div>
            </div>
          ))}
        </div>

        {results.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">ไม่พบสารเคมีที่ตรงกับคำค้นหา</p>
        )}
      </main>
    </div>
  );
}
