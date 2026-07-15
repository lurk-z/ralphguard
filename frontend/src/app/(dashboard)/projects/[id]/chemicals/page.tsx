"use client";

// Chemical library — browse the full substance list available to this
// project's formula boxes. Same data source as the assess workspace's
// substance picker (src/lib/chemicals.ts), just as a full page instead of a sheet.
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  FlaskConical,
  Search,
  Plus,
  FileSpreadsheet,
  Download,
  Check,
  List,
  LayoutGrid,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

import { CHEMICALS } from "@/lib/chemicals";

export default function ChemicalsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const categories = useMemo(() => Array.from(new Set(CHEMICALS.map((c) => c.role))), []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHEMICALS.filter((c) => {
      const matchesCategory = category === "all" || c.role === category;
      const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.cas.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [query, category]);

  // Reset page when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query, category]);

  const totalPages = Math.ceil(results.length / itemsPerPage);
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return results.slice(startIndex, startIndex + itemsPerPage);
  }, [results, currentPage]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">คลังสารเคมี</h1>
          <p className="text-sm text-muted-foreground">สารเคมีทั้งหมดที่ใช้ในการสร้างสูตรของโปรเจ็คนี้</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-9 gap-1.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              <Plus className="size-4" />
              <span>เพิ่มสาร</span>
              <ChevronDown className="size-3.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="gap-2 cursor-pointer">
              <Plus className="size-4 text-muted-foreground" />
              <span>เพิ่มสารด้วยตนเอง</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer">
              <FileSpreadsheet className="size-4 text-muted-foreground" />
              <span>นำเข้าจากไฟล์ CSV</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer">
              <Download className="size-4 text-muted-foreground" />
              <span>ดาวน์โหลดตัวอย่าง CSV</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

        {/* View mode toggle pill */}
        <div className="ml-auto flex items-center border border-border rounded-full p-0.5 bg-secondary/30 select-none h-8">
          <button
            onClick={() => setViewMode("list")}
            className={`flex h-7 items-center gap-1.5 px-3 rounded-l-full transition-all duration-150 ${
              viewMode === "list"
                ? "bg-[#D6EDFF] text-[#004085] shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {viewMode === "list" && <Check className="size-3" />}
            <List className="size-3.5" />
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => setViewMode("grid")}
            className={`flex h-7 items-center gap-1.5 px-3 rounded-r-full transition-all duration-150 ${
              viewMode === "grid"
                ? "bg-[#D6EDFF] text-[#004085] shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {viewMode === "grid" && <Check className="size-3" />}
            <LayoutGrid className="size-3.5" />
          </button>
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {results.length > 0 ? (
          viewMode === "list" ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">ชื่อสารเคมี</th>
                    <th className="px-4 py-3 font-semibold">CAS Number</th>
                    <th className="px-4 py-3 font-semibold">บทบาท / หน้าที่</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-foreground flex items-center gap-2.5">
                        <span
                          className="grid size-7 shrink-0 place-items-center rounded-md"
                          style={{ backgroundColor: `${c.color}1A` }}
                        >
                          <FlaskConical className="size-4" style={{ color: c.color }} />
                        </span>
                        <span className="truncate">{c.name}</span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{c.cas}</td>
                      <td className="px-4 py-3.5 text-xs text-primary font-semibold">{c.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedResults.map((c) => (
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
          )
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">ไม่พบสารเคมีที่ตรงกับคำค้นหา</p>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    text="ก่อนหน้า"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) setCurrentPage(currentPage - 1);
                    }}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>

                {Array.from({ length: totalPages }).map((_, i) => {
                  const page = i + 1;
                  return (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        isActive={currentPage === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page);
                        }}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                <PaginationItem>
                  <PaginationNext
                    href="#"
                    text="ถัดไป"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                    }}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}</main>
    </div>
  );
}
