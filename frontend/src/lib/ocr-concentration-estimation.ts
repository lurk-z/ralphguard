export type OcrConcentrationConfidence = "high" | "medium" | "low";
export type OcrConcentrationBasis =
  | "label-declared"
  | "catalog-and-order"
  | "order-only"
  | "one-percent-tail";

export type OcrConcentrationCandidate = {
  name: string;
  smiles: string;
  /** Percentage explicitly printed on the label, when OCR can recover it. */
  declaredConcentration?: number | null;
};

export type OcrConcentrationEstimate = OcrConcentrationCandidate & {
  /** Midpoint used only as a provisional formula value for screening. */
  concentration: number;
  minConcentration: number;
  maxConcentration: number;
  confidence: OcrConcentrationConfidence;
  estimateBasis: OcrConcentrationBasis;
  /**
   * Heuristic tail in which ingredients may be at or below 1%. Ordering is
   * deliberately not enforced inside this tail because some cosmetic-label
   * regimes allow <=1% ingredients to appear in any order.
   */
  inOnePercentTail: boolean;
  orderConstraintApplied: boolean;
};

/**
 * Leave a small amount of headroom for unresolved/non-QSAR ingredients and
 * rounding. This replaces the old arbitrary 35% non-water cap.
 */
export const OCR_SIMULATION_TOTAL_LIMIT = 99;

/** @deprecated Kept for compatibility with older imports. */
export const OCR_ESTIMATED_NON_WATER_LIMIT = OCR_SIMULATION_TOTAL_LIMIT;

const roundEstimate = (value: number) => {
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.max(0.01, Math.round(value * 100) / 100);
};

const finitePositive = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 100 ? number : null;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Recover percentages that are actually printed next to an ingredient name.
 * This is intentionally strict: a percentage elsewhere on the package must not
 * be attached to an ingredient just because it appears in the same OCR block.
 */
export function detectDeclaredConcentrationsFromOcrText(
  rawText: string,
  candidates: OcrConcentrationCandidate[],
): Map<string, number> {
  const detected = new Map<string, number>();
  if (!rawText.trim()) return detected;

  const normalizedText = rawText
    .normalize("NFKC")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ");

  for (const candidate of candidates) {
    const cleanName = candidate.name.trim();
    if (!cleanName) continue;
    const namePattern = escapeRegExp(cleanName).replace(/\\\s+/g, "\\s+");
    const afterName = new RegExp(
      `\\b${namePattern}\\b\\s*(?:[:=\\-–—]|at)?\\s*(\\d{1,3}(?:\\.\\d{1,3})?)\\s*%`,
      "i",
    );
    const beforeName = new RegExp(
      `(\\d{1,3}(?:\\.\\d{1,3})?)\\s*%\\s*(?:of\\s+)?\\b${namePattern}\\b`,
      "i",
    );
    const match = normalizedText.match(afterName) ?? normalizedText.match(beforeName);
    if (!match) continue;
    const value = finitePositive(match[1]);
    if (value != null) detected.set(candidate.smiles.trim(), value);
  }
  return detected;
}

const fallbackMidpointForOrder = (index: number) =>
  Math.max(0.2, 16 * Math.pow(0.68, index));

function initialRange(
  candidate: OcrConcentrationCandidate,
  index: number,
  referenceBySmiles: ReadonlyMap<string, number>,
) {
  const declared = finitePositive(candidate.declaredConcentration);
  if (declared != null) {
    return {
      min: declared,
      midpoint: declared,
      max: declared,
      confidence: "high" as const,
      basis: "label-declared" as const,
      reference: declared,
      declared: true,
    };
  }

  const reference = finitePositive(referenceBySmiles.get(candidate.smiles.trim()));
  if (reference != null) {
    // Catalog concentrations are only anchors from known/example formulations,
    // never treated as the manufacturer's hidden concentration.
    return {
      min: Math.max(0.01, reference * 0.5),
      midpoint: reference,
      max: Math.min(80, Math.max(reference * 2, reference + 0.5)),
      confidence: "medium" as const,
      basis: "catalog-and-order" as const,
      reference,
      declared: false,
    };
  }

  const midpoint = fallbackMidpointForOrder(index);
  return {
    min: Math.max(0.05, midpoint * 0.25),
    midpoint,
    max: Math.min(80, Math.max(midpoint * 2.5, midpoint + 1)),
    confidence: "low" as const,
    basis: "order-only" as const,
    reference: null,
    declared: false,
  };
}

function inferOnePercentTailStart(
  rows: ReturnType<typeof initialRange>[],
): number | null {
  for (let index = 0; index < rows.length; index += 1) {
    const anchor = rows[index].reference;
    if (anchor == null || anchor > 1) continue;

    // Do not infer a <=1% tail if a later known/declarative anchor clearly
    // exceeds 1%; that would contradict the proposed breakpoint.
    const laterKnownAboveOne = rows
      .slice(index + 1)
      .some((row) => row.reference != null && row.reference > 1);
    if (!laterKnownAboveOne) return index;
  }
  return null;
}

/**
 * Estimate a *range* from an ingredient list. The function intentionally does
 * not reconstruct a manufacturer's formula. It combines:
 *
 * - an explicitly printed percentage when available;
 * - a catalog/example concentration only as a soft anchor;
 * - ingredient-list order before a plausible <=1% tail; and
 * - a broad order-only fallback when no concentration evidence exists.
 *
 * The returned `concentration` is the midpoint used for provisional screening;
 * callers should display min/max + confidence and let the user edit it.
 */
export function estimateOcrConcentrations(
  candidates: OcrConcentrationCandidate[],
  referenceBySmiles: ReadonlyMap<string, number> = new Map(),
): OcrConcentrationEstimate[] {
  if (candidates.length === 0) return [];

  const initial = candidates.map((candidate, index) =>
    initialRange(candidate, index, referenceBySmiles),
  );
  const onePercentTailStart = inferOnePercentTailStart(initial);

  let previousMidpoint = Number.POSITIVE_INFINITY;
  let previousMax = Number.POSITIVE_INFINITY;

  const constrained = candidates.map((candidate, index) => {
    const row = initial[index];
    const inOnePercentTail =
      onePercentTailStart != null && index >= onePercentTailStart;
    const orderConstraintApplied = !row.declared && !inOnePercentTail;

    let min = row.min;
    let midpoint = row.midpoint;
    let max = row.max;
    let basis: OcrConcentrationBasis = row.basis;
    let confidence: OcrConcentrationConfidence = row.confidence;

    if (inOnePercentTail && !row.declared) {
      min = Math.min(min, 1);
      midpoint = Math.min(midpoint, 0.75);
      max = Math.min(max, 1);
      basis = "one-percent-tail";
      confidence = row.reference != null ? "medium" : "low";
    } else if (orderConstraintApplied) {
      midpoint = Math.min(previousMidpoint, midpoint);
      max = Math.min(previousMax, max);
      min = Math.min(min, midpoint);
    }

    if (!inOnePercentTail) {
      previousMidpoint = midpoint;
      previousMax = max;
    }

    return {
      ...candidate,
      concentration: midpoint,
      minConcentration: Math.min(min, midpoint),
      maxConcentration: Math.max(max, midpoint),
      confidence,
      estimateBasis: basis,
      inOnePercentTail,
      orderConstraintApplied,
      declared: row.declared,
    };
  });

  const declaredTotal = constrained
    .filter((row) => row.declared)
    .reduce((sum, row) => sum + row.concentration, 0);
  const estimatedTotal = constrained
    .filter((row) => !row.declared)
    .reduce((sum, row) => sum + row.concentration, 0);
  const availableForEstimates = Math.max(
    0,
    OCR_SIMULATION_TOTAL_LIMIT - declaredTotal,
  );
  const scale =
    estimatedTotal > availableForEstimates && estimatedTotal > 0
      ? availableForEstimates / estimatedTotal
      : 1;

  return constrained.map(({ declared, ...row }) => {
    const factor = declared ? 1 : scale;
    const concentration = roundEstimate(row.concentration * factor);
    const minConcentration = roundEstimate(
      Math.min(concentration, row.minConcentration * factor),
    );
    const maxConcentration = roundEstimate(
      Math.max(concentration, row.maxConcentration * factor),
    );
    return {
      ...row,
      concentration,
      minConcentration,
      maxConcentration: row.inOnePercentTail
        ? Math.min(1, maxConcentration)
        : maxConcentration,
    };
  });
}

export function concentrationConfidenceLabelTh(
  confidence: OcrConcentrationConfidence,
): string {
  if (confidence === "high") return "สูง";
  if (confidence === "medium") return "กลาง";
  return "ต่ำ";
}

export function concentrationBasisLabelTh(
  basis: OcrConcentrationBasis,
): string {
  if (basis === "label-declared") return "ระบุบนฉลาก";
  if (basis === "catalog-and-order") return "ฐานข้อมูล + ลำดับฉลาก";
  if (basis === "one-percent-tail") return "ช่วงปลาย ≤1% โดยประมาณ";
  return "ลำดับฉลากเท่านั้น";
}
