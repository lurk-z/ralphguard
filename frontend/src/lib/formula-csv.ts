export type FormulaCsvItem = {
  line: number;
  name: string;
  smiles: string;
  concentration: number;
};

export type FormulaCsvResult = {
  items: FormulaCsvItem[];
  delimiter: "," | ";" | "\t";
};

const HEADER_ALIASES = {
  name: ["name", "ingredient", "inciname", "canonicalname", "substance", "สาร", "ชื่อสาร"],
  smiles: ["smiles", "canonicalsmiles", "structure", "โครงสร้าง"],
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

const MAX_CSV_CHARACTERS = 2_000_000;
const MAX_DATA_ROWS = 200;

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/%/g, "percent")
    .replace(/[\s_-]+/g, "");

export const normalizeFormulaIdentity = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

type RawRow = { line: number; cells: string[] };
type CsvDelimiter = FormulaCsvResult["delimiter"];

const detectDelimiter = (text: string): CsvDelimiter => {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates: CsvDelimiter[] = [",", ";", "\t"];
  const counts = new Map<CsvDelimiter, number>(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;

  for (let index = 0; index < firstLine.length; index += 1) {
    const char = firstLine[index];
    if (char === '"') quoted = !quoted;
    if (!quoted && counts.has(char as CsvDelimiter)) {
      const delimiter = char as CsvDelimiter;
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }
  }

  const delimiter = candidates.sort(
    (left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0),
  )[0];
  if ((counts.get(delimiter) ?? 0) === 0) {
    throw new Error("รูปแบบ CSV ไม่ถูกต้อง: ไม่พบตัวคั่นคอลัมน์");
  }
  return delimiter;
};

const parseRows = (text: string, delimiter: CsvDelimiter): RawRow[] => {
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const finishRow = () => {
    cells.push(field.trim());
    if (cells.some(Boolean)) rows.push({ line: rowLine, cells });
    cells = [];
    field = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      finishRow();
      line += 1;
      rowLine = line;
      continue;
    }

    if (char === "\n") line += 1;
    field += char;
  }

  if (quoted) throw new Error(`รูปแบบ CSV ไม่ถูกต้อง: เครื่องหมายคำพูดในแถว ${rowLine} ปิดไม่ครบ`);
  finishRow();
  return rows;
};

const findHeader = (
  headers: string[],
  key: keyof typeof HEADER_ALIASES,
): number => {
  const aliases = new Set<string>(HEADER_ALIASES[key]);
  const matches = headers
    .map((header, index) => (aliases.has(header) ? index : -1))
    .filter((index) => index >= 0);
  if (matches.length > 1) throw new Error(`พบคอลัมน์ ${key} ซ้ำในหัวตาราง`);
  return matches[0] ?? -1;
};

export function parseFormulaCsv(text: string): FormulaCsvResult {
  if (!text.trim()) throw new Error("ไฟล์ CSV ว่างเปล่า");
  if (text.length > MAX_CSV_CHARACTERS) throw new Error("ไฟล์ CSV มีขนาดใหญ่เกิน 2 MB");

  const delimiter = detectDelimiter(text);
  const rows = parseRows(text, delimiter);
  if (rows.length < 2) throw new Error("CSV ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว");

  const headers = rows[0].cells.map(normalizeHeader);
  const nameColumn = findHeader(headers, "name");
  const smilesColumn = findHeader(headers, "smiles");
  const concentrationColumn = findHeader(headers, "concentration");

  if (nameColumn < 0 && smilesColumn < 0) {
    throw new Error("ไม่พบคอลัมน์ name หรือ smiles");
  }
  if (concentrationColumn < 0) {
    throw new Error("ไม่พบคอลัมน์ concentration");
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_DATA_ROWS) {
    throw new Error(`CSV รองรับข้อมูลได้สูงสุด ${MAX_DATA_ROWS} แถว`);
  }

  const seenNames = new Map<string, number>();
  const seenSmiles = new Map<string, number>();
  const items = dataRows.map(({ cells, line }) => {
    const name = nameColumn >= 0 ? String(cells[nameColumn] ?? "").trim() : "";
    const smiles = smilesColumn >= 0 ? String(cells[smilesColumn] ?? "").trim() : "";
    if (!name && !smiles) throw new Error(`แถว ${line}: ต้องมี name หรือ smiles`);

    const rawConcentration = String(cells[concentrationColumn] ?? "")
      .trim()
      .replace(/%/g, "")
      .replace(",", ".");
    const concentration = Number(rawConcentration);
    if (!Number.isFinite(concentration) || concentration <= 0 || concentration > 100) {
      throw new Error(`แถว ${line}: concentration ต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน 100`);
    }

    const nameKey = normalizeFormulaIdentity(name);
    if (nameKey) {
      const duplicateLine = seenNames.get(nameKey);
      if (duplicateLine) {
        throw new Error(`แถว ${line}: สาร “${name}” ซ้ำกับแถว ${duplicateLine}`);
      }
      seenNames.set(nameKey, line);
    }

    if (smiles) {
      const duplicateLine = seenSmiles.get(smiles);
      if (duplicateLine) {
        throw new Error(`แถว ${line}: SMILES ซ้ำกับแถว ${duplicateLine}`);
      }
      seenSmiles.set(smiles, line);
    }

    return { line, name, smiles, concentration };
  });

  const total = items.reduce((sum, item) => sum + item.concentration, 0);
  if (total > 100.0001) {
    throw new Error(`ผลรวม concentration ในไฟล์เท่ากับ ${total.toFixed(2)}% ซึ่งเกิน 100%`);
  }

  return { items, delimiter };
}
