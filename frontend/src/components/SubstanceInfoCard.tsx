"use client";

// The substance info card /assess shows when you rest the pointer on a node in
// FormulaGraph: what the substance is for, and what to watch out for. Both are
// read from catalog.ts's SUBSTANCE_INFO, keyed by SMILES.
//
// FormulaGraph positions its own copy against the node with `absolute`. The
// workspace can't: its rows live inside scrolling containers (the formula
// panel, the picker sheet) that would clip the card. So the hook below portals
// a fixed-position copy to the cursor instead.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, Info, TriangleAlert } from "lucide-react";
import { substanceInfo } from "@/lib/catalog";

export function SubstanceInfoCard({ name, smiles }: { name: string; smiles: string }) {
  const { category, info } = substanceInfo(smiles);
  return (
    <div className="w-72 overflow-hidden rounded-xl border border-border/80 bg-popover text-left shadow-[0_12px_36px_rgba(15,23,42,0.16)]">
      <div className="flex items-start gap-2.5 border-b border-border/70 px-3.5 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FlaskConical className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-foreground">
            {name || "สารไม่ระบุชื่อ"}
          </p>
          {category && (
            <span className="mt-1.5 inline-flex rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {category}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        {info ? (
          <>
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <p>{info.role}</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <p>{info.note}</p>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>สารกำหนดเองและยังไม่มีข้อมูลรายละเอียดในคลังสารเคมี</p>
          </div>
        )}
      </div>

      <div className="border-t border-border/70 bg-secondary/30 px-3.5 py-2">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          โครงสร้าง SMILES
        </p>
        <p className="truncate font-mono text-[10px] text-foreground" title={smiles || "-"}>
          {smiles || "-"}
        </p>
      </div>
    </div>
  );
}

type Tip = { x: number; y: number; name: string; smiles: string; anchor: HTMLElement };

/**
 * Rest-to-reveal behaviour for the card, delayed long enough to avoid showing
 * while the pointer is only passing through a dense ingredient list.
 *
 * Spread `bind(name, smiles)` onto a row and render `card` once, anywhere —
 * it portals to <body>, so no ancestor's overflow can clip it.
 */
export function useSubstanceHoverCard(delayMs = 1000) {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const dismiss = () => {
    cancel();
    setTip(null);
  };

  // Removing a hovered ingredient does not reliably emit mouseleave because
  // its DOM node disappears underneath a stationary pointer. Observe only
  // while the card is visible and dismiss it as soon as its source is gone.
  useEffect(() => {
    if (!tip) return;
    const observer = new MutationObserver(() => {
      if (!tip.anchor.isConnected) setTip(null);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tip]);

  const bind = (name: string, smiles: string) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      cancel();
      const { clientX, clientY } = e;
      const anchor = e.currentTarget as HTMLElement;
      timer.current = setTimeout(() => {
        if (anchor.isConnected && anchor.matches(":hover")) {
          setTip({ x: clientX, y: clientY, name, smiles, anchor });
        }
      }, delayMs);
    },
    onMouseLeave: dismiss,
  });

  // Keep the card on screen: flip it to the other side of the cursor when it
  // would otherwise run past the viewport.
  const CARD_W = 288;
  const CARD_H = 220;
  const card =
    mounted && tip
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[60] animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              left: Math.max(
                8,
                Math.min(
                  tip.x + 16 + CARD_W <= window.innerWidth - 8 ? tip.x + 16 : tip.x - CARD_W - 16,
                  window.innerWidth - CARD_W - 8,
                ),
              ),
              top: Math.max(8, Math.min(tip.y + 14, window.innerHeight - CARD_H - 8)),
            }}
          >
            <SubstanceInfoCard name={tip.name} smiles={tip.smiles} />
          </div>,
          document.body,
        )
      : null;

  return { bind, card, dismiss };
}
