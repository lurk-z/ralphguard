import { cn } from "@/lib/utils";
import { BANDS, type Band } from "./risk-bands";

export type SeverityLegendProps = {
  bands?: Band[];
  className?: string;
};

/** Colour key for risk bands: ต่ำ · กลาง · สูง · รุนแรง. */
export function SeverityLegend({ bands = ["low", "moderate", "high", "severe"], className }: SeverityLegendProps) {
  return (
    <ul
      aria-label="ระดับความเสี่ยง"
      className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm text-foreground", className)}
    >
      {bands.map((band) => (
        <li key={band} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: BANDS[band].color }} />
          {BANDS[band].label}
        </li>
      ))}
    </ul>
  );
}
