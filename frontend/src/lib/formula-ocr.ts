import type { FormulaItem } from "@/lib/api";

export const OCR_IMPORT_POLICY = "replace" as const;
export const MAX_OCR_FORMULA_ITEMS = 20;

export type OcrFormulaCandidate = FormulaItem & {
  score?: number;
  source?: string;
};

export type OcrImportSkipReason =
  | "water"
  | "missing-smiles"
  | "invalid-concentration"
  | "duplicate"
  | "item-limit";

export type OcrImportSkippedItem = {
  name: string;
  smiles: string;
  reason: OcrImportSkipReason;
};

export type PreparedOcrFormulaImport = {
  policy: typeof OCR_IMPORT_POLICY;
  items: FormulaItem[];
  skipped: OcrImportSkippedItem[];
};

const normalizeName = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, "");

const isWater = (item: Pick<FormulaItem, "name" | "smiles">) => {
  const name = normalizeName(item.name || "");
  const smiles = item.smiles.trim().toLowerCase();
  return name === "water" || name === "aqua" || name === "water(aqua)" || smiles === "o";
};

/**
 * OCR import is deliberately a replace operation. Valid non-water rows replace
 * the contents of the formula that owned the scan when it started. Invalid or
 * duplicate rows are skipped and returned so the caller can report partial
 * success without silently losing data.
 */
export function prepareOcrFormulaReplacement(
  candidates: OcrFormulaCandidate[],
): PreparedOcrFormulaImport {
  const items: FormulaItem[] = [];
  const skipped: OcrImportSkippedItem[] = [];
  const seenNames = new Set<string>();
  const seenSmiles = new Set<string>();

  for (const candidate of candidates) {
    const name = String(candidate.name || "").trim();
    const smiles = String(candidate.smiles || "").trim();
    const concentration = Number(candidate.concentration);
    const skippedBase = { name, smiles };

    if (isWater({ name, smiles })) {
      skipped.push({ ...skippedBase, reason: "water" });
      continue;
    }
    if (!smiles) {
      skipped.push({ ...skippedBase, reason: "missing-smiles" });
      continue;
    }
    if (!Number.isFinite(concentration) || concentration <= 0 || concentration > 100) {
      skipped.push({ ...skippedBase, reason: "invalid-concentration" });
      continue;
    }

    const normalizedName = normalizeName(name);
    const normalizedSmiles = smiles.toLowerCase();
    if (
      seenSmiles.has(normalizedSmiles) ||
      (normalizedName.length > 0 && seenNames.has(normalizedName))
    ) {
      skipped.push({ ...skippedBase, reason: "duplicate" });
      continue;
    }
    if (items.length >= MAX_OCR_FORMULA_ITEMS) {
      skipped.push({ ...skippedBase, reason: "item-limit" });
      continue;
    }

    items.push({ name, smiles, concentration });
    seenSmiles.add(normalizedSmiles);
    if (normalizedName) seenNames.add(normalizedName);
  }

  const total = items.reduce((sum, item) => sum + item.concentration, 0);
  if (total > 100.0001) {
    throw new Error(`ผลรวมความเข้มข้นจาก OCR เท่ากับ ${total.toFixed(2)}% ซึ่งเกิน 100%`);
  }

  return { policy: OCR_IMPORT_POLICY, items, skipped };
}

const SKIP_REASON_LABEL: Record<OcrImportSkipReason, string> = {
  water: "น้ำฐาน",
  "missing-smiles": "ไม่มี SMILES",
  "invalid-concentration": "ความเข้มข้นไม่ถูกต้อง",
  duplicate: "สารซ้ำ",
  "item-limit": `เกิน ${MAX_OCR_FORMULA_ITEMS} สาร`,
};

export function describeOcrSkippedItems(skipped: OcrImportSkippedItem[]): string {
  return skipped
    .map((item) => `${item.name || item.smiles || "ไม่ทราบชื่อ"} (${SKIP_REASON_LABEL[item.reason]})`)
    .join(", ");
}
