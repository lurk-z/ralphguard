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
import { substanceInfo } from "@/lib/catalog";

export function SubstanceInfoCard({ name, smiles }: { name: string; smiles: string }) {
  const { category, info } = substanceInfo(smiles);
  return (
    <div className="w-60 rounded-xl border border-border bg-card p-3 text-left shadow-lg">
      <div className="flex items-center gap-1.5">
        <span className="text-primary">◇</span>
        <span className="flex-1 truncate text-xs font-semibold text-foreground">
          {name || "สารไม่ระบุชื่อ"}
        </span>
      </div>
      {category && (
        <div className="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {category}
        </div>
      )}
      {info ? (
        <>
          <div className="mt-1.5 text-[11px] leading-snug text-foreground">{info.role}</div>
          <div className="mt-1 flex gap-1 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
            <span>⚠️</span>
            <span>{info.note}</span>
          </div>
        </>
      ) : (
        <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          สารกำหนดเอง (SMILES: <span className="font-mono">{smiles || "-"}</span>) —
          ยังไม่มีข้อมูลรายละเอียดในคลัง
        </div>
      )}
      <div className="mt-1.5 font-mono text-[9px] text-muted-foreground">SMILES: {smiles || "-"}</div>
    </div>
  );
}

type Tip = { x: number; y: number; name: string; smiles: string };

/**
 * Rest-to-reveal behaviour for the card, on the same 2s delay /assess uses.
 *
 * Spread `bind(name, smiles)` onto a row and render `card` once, anywhere —
 * it portals to <body>, so no ancestor's overflow can clip it.
 */
export function useSubstanceHoverCard(delayMs = 2000) {
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

  const bind = (name: string, smiles: string) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      cancel();
      const { clientX, clientY } = e;
      timer.current = setTimeout(() => setTip({ x: clientX, y: clientY, name, smiles }), delayMs);
    },
    onMouseLeave: () => {
      cancel();
      setTip(null);
    },
  });

  // Keep the card on screen: flip it to the other side of the cursor when it
  // would otherwise run past the viewport.
  const CARD_W = 240;
  const CARD_H = 180;
  const card =
    mounted && tip
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[60]"
            style={{
              left: Math.min(tip.x + 14, window.innerWidth - CARD_W - 8),
              top: Math.min(tip.y + 14, window.innerHeight - CARD_H - 8),
            }}
          >
            <SubstanceInfoCard name={tip.name} smiles={tip.smiles} />
          </div>,
          document.body,
        )
      : null;

  return { bind, card };
}
