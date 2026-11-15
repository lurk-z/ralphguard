/*
 * Risk band and model-reliability colours shared by ScoreList, SeverityLegend and the assess page.
 * Kept in its own tiny file so a colour strip does not pull in ScoreList's Tooltip and icons (~17 KB).
 */

export type Band = "low" | "moderate" | "high" | "severe";

/** Risk band colours and Thai labels. */
export const BANDS: Record<Band, { label: string; color: string }> = {
  low: { label: "ต่ำ", color: "#16A34A" },
  moderate: { label: "กลาง", color: "#CA8A04" },
  high: { label: "สูง", color: "#DC2626" },
  severe: { label: "รุนแรง", color: "#B91C1C" },
};

export type Confidence = "high" | "medium" | "low";

/** Model reliability: high = green, medium = yellow, low = red. */
export const CONFIDENCE: Record<Confidence, { label: string; color: string }> = {
  high: { label: "สูง", color: "#16A34A" },
  medium: { label: "กลาง", color: "#CA8A04" },
  low: { label: "ต่ำ", color: "#DC2626" },
};
