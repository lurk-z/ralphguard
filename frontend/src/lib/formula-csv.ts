import type { FormulaItem } from "@/lib/api";

export const MAX_CSV_FORMULA_ROWS = 20;
export const MAX_CSV_TEXT_LENGTH = 1_000_000;

export type ParsedFormulaCsvRow = FormulaItem & {
  line: number;
};

const HEADER_ALIASES = {
  name: ["name", "ingredient", "inci name", "canonical name", "substance", "สาร", "ชื่อสาร"],
  smiles: ["smiles", "canonical smiles", "structure"],
  concentration: [
    "concentration",
    "percent",
    "percentage",
    "pct",
    "%",
    "ความเข้มข้น",
    "เปอร์เซ็นต์",
  ],
} as const;

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[%]/g, "percent")
    .replace(/[\s_-]+/g, "");

const NORMALIZED_HEADER_ALIASES = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([key, aliases]) => [
    key,
    aliases.map(normalizeHeader),
  ]),
) as Record<keyof typeof HEADER_ALIASES, string[]>;

function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"] as const;
  let quoted = false;
  const counts = new Map(candidates.map((candidate) => [candidate, 0]));
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    if (character === '"') quoted = !quoted;
    if (!quoted && counts.has(character as (typeof candidates)[number])) {
      const delimiter = character as (typeof candidates)[number];
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }
  }
  return candidates.reduce((best, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best,
  );
}

function parseRows(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV มีเครื่องหมายคำพูดที่ปิดไม่ครบ");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function assertNoDuplicateFormulaRows(
  rows: ParsedFormulaCsvRow[],
): void {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const identities = [
      row.smiles.trim() ? `smiles:${row.smiles.trim().toLowerCase()}` : "",
      row.name?.trim()
        ? `name:${row.name.trim().toLowerCase().replace(/[\s_-]+/g, "")}`
        : "",
    ].filter(Boolean);
    for (const identity of identities) {
      const firstLine = seen.get(identity);
      if (firstLine !== undefined) {
        throw new Error(
          `แถว ${row.line}: พบสารซ้ำกับแถว ${firstLine} (${row.name || row.smiles})`,
        );
      }
      seen.set(identity, row.line);
    }
  }
}

export function parseFormulaCsv(text: string): ParsedFormulaCsvRow[] {
  if (!text.trim()) throw new Error("ไฟล์ CSV ว่างเปล่า");
  if (text.length > MAX_CSV_TEXT_LENGTH) {
    throw new Error("ไฟล์ CSV มีขนาดใหญ่เกิน 1 MB");
  }

  const rows = parseRows(text);
  if (rows.length < 2) {
    throw new Error("CSV ต้องมีแถวหัวตารางและข้อมูลอย่างน้อย 1 แถว");
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_CSV_FORMULA_ROWS) {
    throw new Error(`CSV รองรับส่วนผสมสูงสุด ${MAX_CSV_FORMULA_ROWS} แถว`);
  }

  const headers = rows[0].map(normalizeHeader);
  const columnIndex = (key: keyof typeof HEADER_ALIASES) =>
    headers.findIndex((header) => NORMALIZED_HEADER_ALIASES[key].includes(header));
  const nameColumn = columnIndex("name");
  const smilesColumn = columnIndex("smiles");
  const concentrationColumn = columnIndex("concentration");
  if (nameColumn < 0 && smilesColumn < 0) {
    throw new Error("ไม่พบคอลัมน์ name/ingredient หรือ smiles");
  }
  if (concentrationColumn < 0) {
    throw new Error("ไม่พบคอลัมน์ concentration/percent");
  }

  const parsed = dataRows.map((columns, index) => {
    const line = index + 2;
    const name = nameColumn >= 0 ? String(columns[nameColumn] ?? "").trim() : "";
    const smiles = smilesColumn >= 0
      ? String(columns[smilesColumn] ?? "").trim()
      : "";
    if (!name && !smiles) {
      throw new Error(`แถว ${line}: ต้องมีชื่อสารหรือ SMILES`);
    }
    const rawConcentration = String(columns[concentrationColumn] ?? "")
      .trim()
      .replace(/%/g, "")
      .replace(",", ".");
    const concentration = Number(rawConcentration);
    if (!Number.isFinite(concentration) || concentration <= 0 || concentration > 100) {
      throw new Error(`แถว ${line}: concentration ต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน 100`);
    }
    return { line, name, smiles, concentration };
  });

  assertNoDuplicateFormulaRows(parsed);
  const total = parsed.reduce((sum, row) => sum + row.concentration, 0);
  if (total > 100.0001) {
    throw new Error(`ผลรวม concentration เท่ากับ ${total.toFixed(2)}% ซึ่งเกิน 100%`);
  }
  return parsed;
}
