"use client";

// Substance-experiment page ("ทดลองสาร"). White dashboard shell with a chemical
// library (left), the live head.glb viewport (center), and formula/experiment
// settings (right). Chemical list is mock data; controls drive local state.
import React, { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Beaker,
  ChevronDown,
  Download,
  FileText,
  FlaskConical,
  Grid2x2,
  HelpCircle,
  Info,
  LayoutGrid,
  LineChart,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// 3D head (client-only WebGL). This is the head.glb set up in FaceIrritationModel.
const FaceView = dynamic(
  () => import("@/components/FaceIrritationModel").then((m) => m.FaceIrritationCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

type Chemical = {
  id: string;
  name: string;
  cas: string;
  role: string;
  color: string; // flask icon tint
};

const CHEMICALS: Chemical[] = [
  { id: "water", name: "Water (Aqua)", cas: "7732-18-5", role: "ตัวทำละลายหลัก", color: "#3B82F6" },
  { id: "glycerin", name: "Glycerin", cas: "56-81-5", role: "สารให้ความชุ่มชื้น", color: "#0EA5E9" },
  { id: "cetearyl", name: "Cetearyl Alcohol", cas: "67762-27-0", role: "สารเพิ่มความข้น", color: "#EC4899" },
  { id: "cct", name: "Caprylic/Capric Triglyceride", cas: "73398-61-5", role: "สารให้ความลื่น", color: "#F97316" },
  { id: "dimethicone", name: "Dimethicone", cas: "63148-62-9", role: "สารเคลือบผิว", color: "#22C55E" },
  { id: "niacinamide", name: "Niacinamide", cas: "98-92-0", role: "สารออกฤทธิ์", color: "#22C55E" },
  { id: "phenoxyethanol", name: "Phenoxyethanol", cas: "122-99-6", role: "สารกันเสีย", color: "#EC4899" },
  { id: "carbomer", name: "Carbomer", cas: "9007-20-9", role: "สารเพิ่มความหนืด", color: "#3B82F6" },
  { id: "tea", name: "Triethanolamine", cas: "102-71-6", role: "สารปรับค่า pH", color: "#3B82F6" },
  { id: "allantoin", name: "Allantoin", cas: "97-59-6", role: "สารปลอบผิว", color: "#22C55E" },
];

const TABS = [
  { key: "experiment", label: "การทดลอง" },
  { key: "chemicals", label: "สารเคมี" },
  { key: "results", label: "ผลลัพธ์" },
  { key: "notes", label: "บันทึก" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const RAIL_ICONS: { icon: React.ElementType; label: string; href?: string }[] = [
  { icon: FlaskConical, label: "ทดลอง" },
  { icon: Beaker, label: "สูตร" },
  { icon: Grid2x2, label: "สารเคมี" },
  { icon: LayoutGrid, label: "เทมเพลต" },
  { icon: LineChart, label: "ผลลัพธ์" },
  { icon: SlidersHorizontal, label: "เปรียบเทียบ" },
  { icon: Settings, label: "ตั้งค่า" },
  { icon: HelpCircle, label: "ช่วยเหลือ" },
];

export default function ExperimentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("water");
  const [concentration, setConcentration] = useState(65);
  const [rounds, setRounds] = useState(3);
  const [tab, setTab] = useState<TabKey>("experiment");
  const [displayMode, setDisplayMode] = useState<"normal" | "compare">("normal");
  const [skinTexture, setSkinTexture] = useState(true);
  const [standardLight, setStandardLight] = useState(true);
  const [projectName, setProjectName] = useState("Hand Cream Formula Test");
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHEMICALS;
    return CHEMICALS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.cas.includes(q),
    );
  }, [query]);

  const selected = CHEMICALS.find((c) => c.id === selectedId) ?? CHEMICALS[0];
  const conc = concentration.toFixed(2);

  return (
    <div data-project-id={params.id} className="app-light flex h-screen overflow-hidden bg-card text-foreground">
      {/* ── Icon rail ── */}
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3">
        {RAIL_ICONS.map(({ icon: Icon, label, href }, i) => (
          <button
            key={label}
            aria-label={label}
            aria-current={i === 0 ? "page" : undefined}
            onClick={() => {
              if (label === "ผลลัพธ์") router.push(`/projects/${params.id}/results`);
              else if (href) router.push(href);
            }}
            className={`grid size-10 place-items-center rounded-lg transition-colors ${i === 0
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
          >
            <Icon className="size-[18px]" />
          </button>
        ))}
        <span className="mt-auto grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
          A
        </span>
      </nav>

      {/* ── Chemical library ── */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 px-4 py-4">
          {editingName ? (
            <input
              ref={nameInputRef}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  setEditingName(false);
                }
              }}
              autoFocus
              className="min-w-0 flex-1 rounded border border-primary bg-transparent px-2 py-0.5 text-sm font-semibold text-foreground outline-none ring-1 ring-primary"
            />
          ) : (
            <>
              <span className="truncate text-sm font-semibold text-foreground">
                {projectName}
              </span>
              <button
                aria-label="แก้ไขชื่อโปรเจ็ค"
                onClick={() => {
                  setEditingName(true);
                  setTimeout(() => nameInputRef.current?.select(), 0);
                }}
                className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
            </>
          )}
        </div>

        <div className="px-4">
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาสารเคมี หรือ INCI"
                className="h-10 bg-background pl-9 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {filtered.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active
                  ? "border-primary/40 bg-accent/60"
                  : "border-border bg-card hover:bg-secondary"
                  }`}
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg"
                  style={{ backgroundColor: `${c.color}1A` }}
                >
                  <FlaskConical className="size-4" style={{ color: c.color }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {c.name}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    CAS {c.cas}
                  </span>
                </span>
                <MoreVertical className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              ไม่พบสารเคมีที่ค้นหา
            </p>
          )}
        </div>

        <div className="border-t border-border p-3">
          <Button variant="outline" className="h-11 w-full gap-2 border-primary/40 text-primary">
            <Plus className="size-4" />
            เพิ่มสารเคมี / สูตรใหม่
          </Button>
        </div>
      </aside>

      {/* ── Center: tabs + 3D head ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-6 border-b border-border px-6">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`relative py-4 text-sm font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {t.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        <div className="relative min-h-0 flex-1">
          {tab === "experiment" ? (
            <FaceView intensity={0} zone="all" background="#F7F5F4" />
          ) : (
            <div className="grid h-full w-full place-items-center px-6 text-center text-sm text-muted-foreground">
              {tab === "chemicals" && "รายการสารเคมีในสูตร — เลือกสารจากคลังด้านซ้าย"}
              {tab === "results" && "ผลการวิเคราะห์จะแสดงที่นี่หลังกดรันการทดลอง"}
              {tab === "notes" && "บันทึกของโปรเจ็ค"}
            </div>
          )}
        </div>
      </main>

      {/* ── Right: selected formula + settings ── */}
      <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border">
        <div className="flex items-center justify-between px-5 py-4">

        </div>

        <div className="flex items-center gap-2 px-5">
          <Button className="h-10 flex-1 gap-2 text-sm font-semibold">
            <FlaskConical className="size-4" />
            เริ่มการทดลอง
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Export PDF"
            className="size-10 shrink-0"
          >
            <Download className="size-4" />
          </Button>
        </div>

        <button
          onClick={() => router.push(`/projects/${params.id}/results`)}
          className="mx-5 mt-2 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-primary transition-colors hover:bg-accent/60"
        >
          <LineChart className="size-4" />
          ดูผลลัพธ์
        </button>

        {/* Selected substance */}
        <div className="mx-5 mt-4 rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: `${selected.color}1A` }}
            >
              <FlaskConical className="size-4" style={{ color: selected.color }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {selected.name}
                </span>
                <Badge className="shrink-0 px-1.5 py-0 text-[10px]">หลัก</Badge>
              </div>
              <span className="block font-mono text-xs text-muted-foreground">
                CAS {selected.cas}
              </span>
            </div>
          </div>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">หน้าที่:</dt>
              <dd className="text-right font-medium text-foreground">{selected.role}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">สัดส่วนในสูตร:</dt>
              <dd className="text-right font-medium text-foreground">{conc}%</dd>
            </div>
          </dl>
        </div>






      </aside>
    </div>
  );
}

function Section({
  title,
  children,
  last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`px-5 py-4 ${last ? "" : "border-b border-border"} mt-1`}>
      <h3 className="mb-3 text-sm font-bold text-foreground">{title}</h3>
      {children}
    </section>
  );
}
