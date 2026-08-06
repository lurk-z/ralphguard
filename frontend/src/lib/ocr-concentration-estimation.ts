export type OcrConcentrationCandidate = {
  name: string;
  smiles: string;
};

export type OcrConcentrationEstimate = OcrConcentrationCandidate & {
  concentration: number;
  estimateBasis: "catalog-and-order" | "order-only";
};

export const OCR_ESTIMATED_NON_WATER_LIMIT = 35;

const roundEstimate = (value: number) => {
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.max(0.05, Math.round(value * 100) / 100);
};

/**
 * Produces a conservative simulation starting point, not a reconstruction of
 * the manufacturer's formula. Catalog defaults anchor known substances while
 * label order constrains every following estimate to be no higher than the
 * previous one. The non-water total is capped so Water/Base can fill the rest.
 */
export function estimateOcrConcentrations(
  candidates: OcrConcentrationCandidate[],
  referenceBySmiles: ReadonlyMap<string, number> = new Map(),
): OcrConcentrationEstimate[] {
  if (candidates.length === 0) return [];

  let previous = Number.POSITIVE_INFINITY;
  const raw = candidates.map((candidate, index) => {
    const reference = referenceBySmiles.get(candidate.smiles.trim());
    const orderFallback = Math.max(0.1, 8 * Math.pow(0.7, index));
    const requested = Number.isFinite(reference) && Number(reference) > 0
      ? Number(reference)
      : orderFallback;
    const concentration = Math.min(previous, requested);
    previous = concentration;
    return {
      ...candidate,
      concentration,
      estimateBasis: reference != null ? "catalog-and-order" as const : "order-only" as const,
    };
  });

  const rawTotal = raw.reduce((sum, item) => sum + item.concentration, 0);
  const roundingSafeLimit = Math.max(
    candidates.length * 0.05,
    OCR_ESTIMATED_NON_WATER_LIMIT - candidates.length * 0.05,
  );
  const scale = rawTotal > roundingSafeLimit
    ? roundingSafeLimit / rawTotal
    : 1;
  let previousRounded = Number.POSITIVE_INFINITY;
  const estimates = raw.map((item) => {
    const concentration = Math.min(
      previousRounded,
      roundEstimate(item.concentration * scale),
    );
    previousRounded = concentration;
    return { ...item, concentration };
  });

  return estimates;
}
