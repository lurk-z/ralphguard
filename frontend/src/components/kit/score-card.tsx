"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AssessmentIcon, isAssessmentEndpoint, type AssessmentEndpoint } from "./assessment-icon";

import { BANDS, CONFIDENCE, type Band, type Confidence } from "./risk-bands";

// Re-exported so existing imports from score-card keep working.
export { BANDS, CONFIDENCE, type Band, type Confidence };

/** Counts from the previous value to `target` (respects reduced motion). */
function useCountTo(target: number, duration = 500) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return Math.round(value);
}

/** Ring that fills to the score; the number inside counts up or down. */
function ScoreRing({ score, color }: { score: number | null; color: string }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const target = score === null ? 0 : Math.max(0, Math.min(100, score));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  const number = useCountTo(target);
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
          style={{ stroke: color }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-base font-semibold tabular-nums">{score === null ? "—" : number}</span>
    </div>
  );
}

export type ScoreItem = {
  key: string;
  label: string;
  /** Optional override when the list key is not a standard assessment endpoint. */
  endpoint?: AssessmentEndpoint;
  /** 0–100, or null when no score is available. */
  score: number | null;
  band?: Band;
  /** How far the model can be trusted for this endpoint. */
  confidence?: Confidence;
  /** Long caveat (e.g. research-model warning). Shown in a tooltip, not on the card. */
  note?: ReactNode;
  /** Shown instead of the risk level when there is no score yet, e.g. "รอประเมิน". */
  pendingLabel?: string;
};

/** One assessment endpoint: category icon, score, risk level, reliability and optional caveat. */
export function ScoreRow({ label, endpoint, score, band = "low", confidence, note, pendingLabel }: Omit<ScoreItem, "key">) {
  const meta = BANDS[band];
  const conf = confidence ? CONFIDENCE[confidence] : null;
  return (
    <div className="flex gap-3 px-4 py-3">
      <ScoreRing score={score} color={score === null ? "transparent" : meta.color} />
      <div className="min-w-0 flex-1 self-center">
        <div className="flex items-center gap-1.5">
          {endpoint && <AssessmentIcon endpoint={endpoint} className="size-5 shrink-0 text-primary-strong" />}
          <span className="min-w-0 text-base font-medium leading-snug">{label}</span>
          {note && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="หมายเหตุ"
                  className="relative grid size-6 shrink-0 place-items-center rounded-md text-amber-600 after:absolute after:-inset-2 after:content-[''] outline-none hover:bg-amber-50 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <AlertTriangle className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[16rem] text-sm leading-snug">
                {note}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {score !== null ? (
            <span className="font-semibold" style={{ color: meta.color }}>
              ระดับ{meta.label}
            </span>
          ) : (
            <span className="text-muted-foreground">{pendingLabel ?? "ยังไม่มีผล"}</span>
          )}
          {conf && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: conf.color }}>
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  {conf.label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">ความน่าเชื่อถือของโมเดล: {conf.label}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

export type ScoreListProps = {
  title?: ReactNode;
  /** Shown at the right of the title, e.g. the painted region. */
  caption?: ReactNode;
  items: ScoreItem[];
  className?: string;
};

/** Titled list of endpoint scores in one card. */
export function ScoreList({ title = "ผลประเมิน", caption, items, className }: ScoreListProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Card className={cn("overflow-hidden", className)}>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          {caption && <Badge variant="muted">{caption}</Badge>}
        </div>
        <div className="divide-y border-t">
          {items.map(({ key, ...item }) => (
            <ScoreRow key={key} {...item} endpoint={item.endpoint ?? (isAssessmentEndpoint(key) ? key : undefined)} />
          ))}
        </div>
      </Card>
    </TooltipProvider>
  );
}

export type ScoreStatProps = {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
};

/** Small summary box under the score list, e.g. "ความน่าเชื่อถือ สูง" or "ครอบคลุมสูตร 80%". */
export function ScoreStat({ icon, label, value, hint, className }: ScoreStatProps) {
  return (
    <Card className={cn("p-3.5", className)}>
      <div className="flex items-center gap-1.5 truncate text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-base font-semibold">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
