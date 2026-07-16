"use client";

// Product templates — the starter formulas from catalog.ts, the same list
// /assess offers in its "create formula" modal. Picking one hands its id to the
// assess workspace, which builds the formula box from it.
import { useRouter } from "next/navigation";
import { PRODUCT_TEMPLATES, type RiskLevel } from "@/lib/catalog";

const RISK_LABEL: Record<RiskLevel, string> = {
  low: "ความเสี่ยงต่ำ",
  mid: "ความเสี่ยงกลาง",
  high: "ความเสี่ยงสูง",
};

const RISK_CLASS: Record<RiskLevel, string> = {
  low: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  mid: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  high: "border-rose-500/40 text-rose-600 dark:text-rose-400",
};

const REGION_LABEL: Record<string, string> = {
  face: "ใบหน้า",
  eye: "รอบดวงตา",
  hand: "มือ",
  forearm: "ท่อนแขน",
};

export default function TemplatesPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">เทมเพลตผลิตภัณฑ์</h1>
          <p className="text-sm text-muted-foreground">สูตรตั้งต้นสำหรับเริ่มโปรเจ็คใหม่ได้เร็วขึ้น</p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                {t.risk && (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${RISK_CLASS[t.risk]}`}
                  >
                    {RISK_LABEL[t.risk]}
                  </span>
                )}
              </div>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">{t.desc}</p>

              <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
                {t.formula.map((f) => (
                  <div key={f.smiles} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-muted-foreground">{f.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {f.concentration}%
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">
                {t.formula.length} สาร · ทดสอบที่{REGION_LABEL[t.region] ?? t.region}
              </p>
              <button
                onClick={() => router.push(`/projects/${params.id}/assess?template=${t.id}`)}
                className="mt-3 rounded-lg border border-primary/40 py-2 text-xs font-medium text-primary transition-colors hover:bg-accent/40"
              >
                ใช้เทมเพลตนี้
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
