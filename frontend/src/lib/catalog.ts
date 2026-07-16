/**
 * catalog.ts — ingredient & product-template "database" for RalphGuard.
 *
 * Single source of truth used by:
 *   • assess page  → substance dropdown + product-template picker
 *   • FormulaGraph → node-palette (grouped by category)
 *
 * Kept client-side so the demo never depends on a network call, but the shape
 * mirrors a REST payload (GET /api/catalog/*) so it can be swapped to a real
 * backend/DB endpoint later without touching the UI.
 */
import type { FormulaItem, Region } from "./api";

export type CatalogItem = { name: string; smiles: string; conc: number };
export type CatalogGroup = { category: string; icon: string; items: CatalogItem[] };

// ───────────────────────── Ingredient catalog (grouped) ─────────────────────────
export const SUBSTANCE_LIBRARY: CatalogGroup[] = [
  {
    category: "ตัวทำละลาย / แอลกอฮอล์",
    icon: "💧",
    items: [
      { name: "Ethanol", smiles: "CCO", conc: 40 },
      { name: "Isopropanol", smiles: "CC(C)O", conc: 30 },
      { name: "Propylene Glycol", smiles: "CC(O)CO", conc: 10 },
      { name: "Glycerin", smiles: "OCC(O)CO", conc: 10 },
      { name: "Butylene Glycol", smiles: "CC(O)CCO", conc: 8 },
      { name: "Dipropylene Glycol", smiles: "CC(O)COCC(C)O", conc: 6 },
      { name: "Pentylene Glycol", smiles: "CCCC(O)CO", conc: 4 },
      { name: "Caprylyl Glycol", smiles: "CCCCCCC(O)CO", conc: 1 },
      { name: "Ethylhexylglycerin", smiles: "CCCCC(CC)COCC(O)CO", conc: 1 },
    ],
  },
  {
    category: "กรด (Acids)",
    icon: "🧫",
    items: [
      { name: "Salicylic Acid", smiles: "O=C(O)c1ccccc1O", conc: 2 },
      { name: "Glycolic Acid", smiles: "OCC(=O)O", conc: 5 },
      { name: "Lactic Acid", smiles: "CC(O)C(=O)O", conc: 5 },
      { name: "Citric Acid", smiles: "OC(=O)CC(O)(CC(=O)O)C(=O)O", conc: 1 },
      { name: "Mandelic Acid", smiles: "OC(C(=O)O)c1ccccc1", conc: 5 },
      { name: "Malic Acid", smiles: "OC(CC(=O)O)C(=O)O", conc: 3 },
      { name: "Azelaic Acid", smiles: "OC(=O)CCCCCCCC(=O)O", conc: 10 },
    ],
  },
  {
    category: "สารกันเสีย (Preservatives)",
    icon: "🛡️",
    items: [
      { name: "Phenoxyethanol", smiles: "OCCOc1ccccc1", conc: 1 },
      { name: "Methylparaben", smiles: "O=C(OC)c1ccc(O)cc1", conc: 0.4 },
      { name: "Ethylparaben", smiles: "CCOC(=O)c1ccc(O)cc1", conc: 0.4 },
      { name: "Propylparaben", smiles: "CCCOC(=O)c1ccc(O)cc1", conc: 0.2 },
      { name: "Benzoic Acid", smiles: "O=C(O)c1ccccc1", conc: 0.5 },
      { name: "Sorbic Acid", smiles: "CC=CC=CC(=O)O", conc: 0.2 },
      { name: "Sodium Benzoate", smiles: "O=C([O-])c1ccccc1.[Na+]", conc: 0.5 },
      { name: "Potassium Sorbate", smiles: "CC=CC=CC(=O)[O-].[K+]", conc: 0.3 },
    ],
  },
  {
    category: "น้ำหอม / สารก่อภูมิแพ้",
    icon: "🌸",
    items: [
      { name: "Cinnamaldehyde", smiles: "O=C/C=C/c1ccccc1", conc: 1 },
      { name: "Eugenol", smiles: "C=CCc1ccc(O)c(OC)c1", conc: 1 },
      { name: "Limonene", smiles: "CC(=C)C1CCC(C)=CC1", conc: 1 },
      { name: "Benzyl Alcohol", smiles: "OCc1ccccc1", conc: 1 },
      { name: "Linalool", smiles: "CC(C)=CCCC(C)(O)C=C", conc: 1 },
      { name: "Geraniol", smiles: "CC(C)=CCCC(C)=CCO", conc: 1 },
      { name: "Citral", smiles: "CC(C)=CCCC(C)=CC=O", conc: 1 },
      { name: "Coumarin", smiles: "O=c1ccc2ccccc2o1", conc: 0.5 },
    ],
  },
  {
    category: "สารออกฤทธิ์ (Actives)",
    icon: "✨",
    items: [
      { name: "Niacinamide", smiles: "O=C(N)c1cccnc1", conc: 5 },
      { name: "Caffeine", smiles: "Cn1cnc2c1c(=O)n(C)c(=O)n2C", conc: 3 },
      { name: "Urea", smiles: "NC(N)=O", conc: 5 },
      { name: "Ascorbic Acid (Vit C)", smiles: "OCC(O)C1OC(=O)C(O)=C1O", conc: 10 },
      { name: "Panthenol (Vit B5)", smiles: "OCC(C)(C)C(O)C(=O)NCCCO", conc: 2 },
      { name: "Allantoin", smiles: "NC(=O)NC1NC(=O)NC1=O", conc: 0.5 },
      { name: "Adenosine", smiles: "Nc1ncnc2c1ncn2C1OC(CO)C(O)C1O", conc: 0.1 },
      { name: "Arbutin", smiles: "OCC1OC(Oc2ccc(O)cc2)C(O)C(O)C1O", conc: 2 },
    ],
  },
  {
    category: "สารลดแรงตึงผิว (Surfactants)",
    icon: "🫧",
    items: [
      { name: "Sodium Lauryl Sulfate", smiles: "CCCCCCCCCCCCOS(=O)(=O)[O-].[Na+]", conc: 5 },
      { name: "Cocamidopropyl Betaine", smiles: "CCCCCCCCCCCC(=O)NCCC[N+](C)(C)CC([O-])=O", conc: 5 },
      { name: "Betaine", smiles: "C[N+](C)(C)CC(=O)[O-]", conc: 2 },
    ],
  },
  {
    category: "สารกันแดด (UV Filters)",
    icon: "🌞",
    items: [
      { name: "Oxybenzone (BP-3)", smiles: "COc1ccc(C(=O)c2ccccc2)c(O)c1", conc: 3 },
      { name: "Octinoxate", smiles: "CCCCC(CC)COC(=O)/C=C/c1ccc(OC)cc1", conc: 7 },
      { name: "Avobenzone", smiles: "COc1ccc(C(=O)CC(=O)c2ccc(C(C)(C)C)cc2)cc1", conc: 3 },
      { name: "Zinc Oxide", smiles: "O=[Zn]", conc: 10 },
      { name: "Titanium Dioxide", smiles: "O=[Ti]=O", conc: 5 },
    ],
  },
  {
    category: "อีมอลเลียนต์ / เพิ่มความชุ่มชื้น",
    icon: "🧴",
    items: [
      { name: "Squalane", smiles: "CC(C)CCCC(C)CCCC(C)CCCC(C)CCCC(C)C", conc: 5 },
      { name: "Isopropyl Myristate", smiles: "CCCCCCCCCCCCCC(=O)OC(C)C", conc: 3 },
      { name: "Cetyl Alcohol", smiles: "CCCCCCCCCCCCCCCCO", conc: 3 },
      { name: "Sorbitol", smiles: "OCC(O)C(O)C(O)C(O)CO", conc: 3 },
      { name: "Sodium Lactate", smiles: "CC(O)C(=O)[O-].[Na+]", conc: 2 },
    ],
  },
];

/** Flat lookup list (handy for a single dropdown / search). */
export const SUBSTANCE_FLAT: (CatalogItem & { category: string })[] =
  SUBSTANCE_LIBRARY.flatMap((g) => g.items.map((it) => ({ ...it, category: g.category })));

/**
 * Normalize an ingredient label for assistant/OCR lookups. Product-facing
 * qualifiers such as "(Vit B5)" are intentionally ignored, so an assistant
 * action that says "Panthenol" still resolves to the curated catalog entry
 * "Panthenol (Vit B5)".
 */
export function normalizeSubstanceName(name: string): string {
  const normalized = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9ก-๙]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return SUBSTANCE_NAME_ALIASES[normalized] || normalized;
}

const SUBSTANCE_NAME_ALIASES: Record<string, string> = {
  "d panthenol": "panthenol",
  "pro vitamin b5": "panthenol",
  "provitamin b5": "panthenol",
  "vit b5": "panthenol",
  "vitamin b5": "panthenol",
  glycerol: "glycerin",
};

/** Resolve a model-provided name to the trusted local ingredient catalog. */
export function resolveCatalogSubstance(name: string): (CatalogItem & { category: string }) | undefined {
  const normalized = normalizeSubstanceName(name);
  if (!normalized) return undefined;
  return SUBSTANCE_FLAT.find((item) => normalizeSubstanceName(item.name) === normalized);
}

// ───────────────────────── Substance info (for hover tooltips) ─────────────────────────
export type SubstanceInfo = { role: string; note: string };

/** Short "what is it / what it does / caution" per substance, keyed by SMILES. */
export const SUBSTANCE_INFO: Record<string, SubstanceInfo> = {
  O: { role: "น้ำ — เบสหลักของสูตร (ตัวทำละลาย)", note: "ไม่ระคายเคือง เติมให้สูตรครบ 100%" },
  CCO: { role: "เอทานอล — ตัวทำละลาย/ฆ่าเชื้อ ระเหยเร็ว", note: "เข้มข้นสูงทำผิวแห้ง/ระคายเคือง ระคายตาชัด" },
  "CC(C)O": { role: "ไอโซโพรพานอล — แอลกอฮอล์ทำความสะอาด/ฆ่าเชื้อ", note: "ระคายเคืองตาและผิว ทำผิวแห้ง" },
  "CC(O)CO": { role: "โพรพิลีนไกลคอล — ให้ความชุ่มชื้น/ตัวทำละลาย", note: "อ่อนโยน แต่บางคนแพ้/ระคายอ่อน" },
  "OCC(O)CO": { role: "กลีเซอรีน — สารดูดความชุ่มชื้น (humectant)", note: "อ่อนโยนมาก แทบไม่ระคายเคือง ช่วยปลอบผิว" },
  "O=C(O)c1ccccc1O": { role: "กรดซาลิไซลิก (BHA) — ผลัดเซลล์/ลดสิว", note: "เป็นกรด ระคายเคือง ห้ามใช้เข้มข้นสูง" },
  "OCC(=O)O": { role: "กรดไกลโคลิก (AHA) — ผลัดเซลล์ผิว", note: "แสบ/ระคายขึ้นกับ pH และความเข้มข้น" },
  "CC(O)C(=O)O": { role: "กรดแลกติก (AHA) — ผลัดผิว + เพิ่มความชุ่มชื้น", note: "อ่อนโยนกว่ากรดตัวอื่น ระคายเล็กน้อย" },
  "OC(=O)CC(O)(CC(=O)O)C(=O)O": { role: "กรดซิตริก — ปรับ pH/สารต้านอนุมูลอิสระ", note: "ระคายตาถ้าเข้มข้นสูง" },
  "OCCOc1ccccc1": { role: "ฟีน็อกซีเอทานอล — สารกันเสีย", note: "ระคายอ่อนที่ความเข้มข้นสูง โดยทั่วไปปลอดภัย" },
  "O=C(OC)c1ccc(O)cc1": { role: "เมทิลพาราเบน — สารกันเสีย", note: "ค่อนข้างอ่อนโยน" },
  "O=C(O)c1ccccc1": { role: "กรดเบนโซอิก — สารกันเสีย", note: "ระคายผิว/ตาได้" },
  "CC=CC=CC(=O)O": { role: "กรดซอร์บิก — สารกันเสีย", note: "ระคายอ่อน" },
  "O=C/C=C/c1ccccc1": { role: "ซินนามัลดีไฮด์ — น้ำหอมกลิ่นอบเชย", note: "สารก่อภูมิแพ้เด่น เสี่ยงแพ้ผิวหนัง/ระคายสูง" },
  "C=CCc1ccc(O)c(OC)c1": { role: "ยูจีนอล — น้ำหอมกลิ่นกานพลู", note: "สารก่อภูมิแพ้ เสี่ยงแพ้ผิวหนัง" },
  "CC(=C)C1CCC(C)=CC1": { role: "ลิโมนีน — น้ำหอมกลิ่นส้ม", note: "เมื่อออกซิไดซ์กลายเป็นสารก่อภูมิแพ้" },
  "OCc1ccccc1": { role: "เบนซิลแอลกอฮอล์ — น้ำหอม/สารกันเสีย", note: "ระคายอ่อน อาจก่อภูมิแพ้ในบางคน" },
  "O=C(N)c1cccnc1": { role: "ไนอาซินาไมด์ (Vit B3) — ลดเลือนริ้วรอย/กระชับรูขุมขน", note: "อ่อนโยนมาก" },
  "Cn1cnc2c1c(=O)n(C)c(=O)n2C": { role: "คาเฟอีน — ลดบวม/กระชับผิว", note: "อ่อนโยน" },
  "NC(N)=O": { role: "ยูเรีย — ให้ความชุ่มชื้น + ผลัดผิวอ่อนๆ", note: "อ่อนโยน (เข้มข้นสูงอาจแสบ)" },
  "OCC(O)C1OC(=O)C(O)=C1O": { role: "กรดแอสคอร์บิก (Vit C) — ต้านอนุมูลอิสระ/กระจ่างใส", note: "เป็นกรด อาจระคายผิว" },
  "CC(O)CCO": { role: "บิวทิลีนไกลคอล — ให้ความชุ่มชื้น/ตัวทำละลาย", note: "อ่อนโยน ระคายน้อย" },
  "CC(O)COCC(C)O": { role: "ไดโพรพิลีนไกลคอล — ตัวทำละลาย/เพิ่มเนื้อสัมผัส", note: "อ่อนโยน" },
  "CCCC(O)CO": { role: "เพนทิลีนไกลคอล — ให้ความชุ่มชื้น + กันเสียอ่อนๆ", note: "อ่อนโยน" },
  "CCCCCCC(O)CO": { role: "คาปริลิลไกลคอล — เพิ่มความชุ่มชื้น + ช่วยกันเสีย", note: "อ่อนโยน" },
  "CCCCC(CC)COCC(O)CO": { role: "เอทิลเฮกซิลกลีเซอริน — ปรับผิวสัมผัส + เสริมกันเสีย", note: "อ่อนโยน" },
  "OC(C(=O)O)c1ccccc1": { role: "กรดแมนเดลิก (AHA) — ผลัดผิวโมเลกุลใหญ่ อ่อนโยน", note: "ระคายน้อยกว่ากรด AHA ตัวอื่น" },
  "OC(CC(=O)O)C(=O)O": { role: "กรดมาลิก (AHA) — ผลัดผิว + ปรับ pH", note: "ระคายปานกลางขึ้นกับความเข้มข้น" },
  "OC(=O)CCCCCCCC(=O)O": { role: "กรดอะเซลาอิก — ลดสิว/รอยแดง/จุดด่างดำ", note: "อาจแสบ/คันช่วงแรก" },
  "CCOC(=O)c1ccc(O)cc1": { role: "เอทิลพาราเบน — สารกันเสีย", note: "ค่อนข้างอ่อนโยน" },
  "CCCOC(=O)c1ccc(O)cc1": { role: "โพรพิลพาราเบน — สารกันเสีย", note: "ค่อนข้างอ่อนโยน" },
  "O=C([O-])c1ccccc1.[Na+]": { role: "โซเดียมเบนโซเอต — สารกันเสีย (เกลือของกรดเบนโซอิก)", note: "อ่อนโยนกว่ากรดเบนโซอิก" },
  "CC=CC=CC(=O)[O-].[K+]": { role: "โพแทสเซียมซอร์เบต — สารกันเสีย", note: "อ่อนโยน ระคายน้อย" },
  "CC(C)=CCCC(C)(O)C=C": { role: "ลินาลูล — น้ำหอมกลิ่นดอกไม้", note: "ออกซิไดซ์แล้วก่อภูมิแพ้ผิวหนัง" },
  "CC(C)=CCCC(C)=CCO": { role: "เจอรานิออล — น้ำหอมกลิ่นกุหลาบ", note: "สารก่อภูมิแพ้ในน้ำหอม" },
  "CC(C)=CCCC(C)=CC=O": { role: "ซิทรัล — น้ำหอมกลิ่นมะนาว/ตะไคร้", note: "สารก่อภูมิแพ้/ระคายเคือง" },
  "O=c1ccc2ccccc2o1": { role: "คูมาริน — น้ำหอมกลิ่นหญ้าหวาน", note: "สารก่อภูมิแพ้ในน้ำหอม" },
  "OCC(C)(C)C(O)C(=O)NCCCO": { role: "แพนทีนอล (Vit B5) — ปลอบผิว/เพิ่มความชุ่มชื้น", note: "อ่อนโยนมาก ช่วยลดการระคาย" },
  "NC(=O)NC1NC(=O)NC1=O": { role: "อัลลันโทอิน — ปลอบผิว/สมานผิว", note: "อ่อนโยนมาก" },
  "Nc1ncnc2c1ncn2C1OC(CO)C(O)C1O": { role: "อะดีโนซีน — ลดเลือนริ้วรอย", note: "อ่อนโยน" },
  "OCC1OC(Oc2ccc(O)cc2)C(O)C(O)C1O": { role: "อาร์บูติน — ลดจุดด่างดำ/กระจ่างใส", note: "อ่อนโยน" },
  "CCCCCCCCCCCCOS(=O)(=O)[O-].[Na+]": { role: "โซเดียมลอริลซัลเฟต (SLS) — สารทำความสะอาด/สร้างฟอง", note: "ระคายเคืองผิว/ตาชัดเจน ทำผิวแห้ง" },
  "CCCCCCCCCCCC(=O)NCCC[N+](C)(C)CC([O-])=O": { role: "โคคามิโดโพรพิลบีเทน — สารทำความสะอาดอ่อนโยน", note: "อ่อนโยนกว่า SLS แต่บางคนแพ้" },
  "C[N+](C)(C)CC(=O)[O-]": { role: "บีเทน — เพิ่มความชุ่มชื้น/ลดการระคายของสารทำความสะอาด", note: "อ่อนโยน" },
  "COc1ccc(C(=O)c2ccccc2)c(O)c1": { role: "ออกซีเบนโซน (BP-3) — สารกันแดดเคมี ดูดยูวี", note: "อาจก่อภูมิแพ้/ระคายเคือง" },
  "CCCCC(CC)COC(=O)/C=C/c1ccc(OC)cc1": { role: "ออกทิน็อกเซต — สารกันแดดเคมี (UVB)", note: "อาจระคาย/ก่อภูมิแพ้ในบางคน" },
  "COc1ccc(C(=O)CC(=O)c2ccc(C(C)(C)C)cc2)cc1": { role: "อะโวเบนโซน — สารกันแดดเคมี (UVA)", note: "อาจระคายในบางคน" },
  "O=[Zn]": { role: "ซิงก์ออกไซด์ — สารกันแดดกายภาพ (สะท้อนยูวี)", note: "อ่อนโยน เหมาะผิวแพ้ง่าย" },
  "O=[Ti]=O": { role: "ไทเทเนียมไดออกไซด์ — สารกันแดดกายภาพ", note: "อ่อนโยน เหมาะผิวแพ้ง่าย" },
  "CC(C)CCCC(C)CCCC(C)CCCC(C)CCCC(C)C": { role: "สความเลน — อีมอลเลียนต์ให้ความนุ่มลื่น", note: "อ่อนโยนมาก ไม่อุดตัน" },
  "CCCCCCCCCCCCCC(=O)OC(C)C": { role: "ไอโซโพรพิลไมริสเตต — อีมอลเลียนต์/เพิ่มการซึมซาบ", note: "อาจอุดตันรูขุมขนในบางคน" },
  "CCCCCCCCCCCCCCCCO": { role: "ซีทิลแอลกอฮอล์ — สารเพิ่มความข้น/ปรับเนื้อครีม", note: "อ่อนโยน (แอลกอฮอล์สายยาว ไม่ทำผิวแห้ง)" },
  "OCC(O)C(O)C(O)C(O)CO": { role: "ซอร์บิทอล — สารดูดความชุ่มชื้น (humectant)", note: "อ่อนโยนมาก" },
  "CC(O)C(=O)[O-].[Na+]": { role: "โซเดียมแลกเตต — เพิ่มความชุ่มชื้น (NMF)", note: "อ่อนโยน" },
};

/** Look up category (from library) + info for a SMILES. */
export function substanceInfo(smiles: string): { category?: string; info?: SubstanceInfo } {
  const s = (smiles || "").trim();
  const grp = SUBSTANCE_LIBRARY.find((g) => g.items.some((it) => it.smiles === s));
  return { category: grp?.category, info: SUBSTANCE_INFO[s] };
}

// ───────────────────────── Product templates (starter formulas) ─────────────────────────
export type RiskLevel = "low" | "mid" | "high";

export type ProductTemplate = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  region: Region;
  formula: FormulaItem[];
  risk?: RiskLevel; // expected risk band — for the test-by-level dropdown
};

/** True if an item is the water/aqua base. */
export function isWaterItem(it: { name?: string; smiles?: string }): boolean {
  return (it.smiles || "").trim() === "O" || /\b(water|aqua|น้ำ)\b/i.test(it.name || "");
}

/**
 * Prepend a Water (Aqua) base whose % auto-balances to make the formula total
 * ~100% w/w. Any existing water item is dropped and recomputed.
 */
export function withWaterBase(items: FormulaItem[]): FormulaItem[] {
  const actives = items.filter((it) => !isWaterItem(it));
  const sum = actives.reduce((s, it) => s + (Number(it.concentration) || 0), 0);
  const water = Math.max(0, Math.round((100 - sum) * 100) / 100);
  return water > 0 ? [{ name: "Water (Aqua)", smiles: "O", concentration: water }, ...actives] : actives;
}

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: "toner",
    risk: "mid",
    name: "โทนเนอร์เช็ดหน้า",
    icon: "🧴",
    desc: "แอลกอฮอล์อ่อน + ให้ความชุ่มชื้น (ทดสอบที่ใบหน้า)",
    region: "face",
    formula: [
      { name: "Ethanol", smiles: "CCO", concentration: 15 },
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 5 },
      { name: "Phenoxyethanol", smiles: "OCCOc1ccccc1", concentration: 1 },
    ],
  },
  {
    id: "aha-serum",
    risk: "high",
    name: "เซรั่มผลัดเซลล์ AHA",
    icon: "💉",
    desc: "กรด AHA + Niacinamide สูตรผลัดผิว (ทดสอบที่ใบหน้า)",
    region: "face",
    formula: [
      { name: "Glycolic Acid", smiles: "OCC(=O)O", concentration: 5 },
      { name: "Niacinamide", smiles: "O=C(N)c1cccnc1", concentration: 4 },
      { name: "Phenoxyethanol", smiles: "OCCOc1ccccc1", concentration: 1 },
    ],
  },
  {
    id: "hand-gel",
    risk: "high",
    name: "เจลล้างมือแอลกอฮอล์",
    icon: "🖐️",
    desc: "แอลกอฮอล์เข้มข้นสูง (ทดสอบที่มือ)",
    region: "hand",
    formula: [
      { name: "Ethanol", smiles: "CCO", concentration: 70 },
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 2 },
    ],
  },
  {
    id: "moisturizer",
    risk: "low",
    name: "ครีมบำรุงผิว (มอยส์เจอร์)",
    icon: "🧕",
    desc: "ให้ความชุ่มชื้น อ่อนโยน (ทดสอบที่ท่อนแขน)",
    region: "forearm",
    formula: [
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 8 },
      { name: "Propylene Glycol", smiles: "CC(O)CO", concentration: 5 },
      { name: "Urea", smiles: "NC(N)=O", concentration: 3 },
      { name: "Phenoxyethanol", smiles: "OCCOc1ccccc1", concentration: 1 },
    ],
  },
  {
    id: "fragrance-mist",
    risk: "high",
    name: "สเปรย์น้ำหอม (Body Mist)",
    icon: "🌸",
    desc: "มีสารก่อภูมิแพ้ในน้ำหอม — ดูความเสี่ยงแพ้ผิวหนัง (ท่อนแขน)",
    region: "forearm",
    formula: [
      { name: "Ethanol", smiles: "CCO", concentration: 60 },
      { name: "Limonene", smiles: "CC(=C)C1CCC(C)=CC1", concentration: 2 },
      { name: "Cinnamaldehyde", smiles: "O=C/C=C/c1ccccc1", concentration: 1 },
    ],
  },

  // ── Test templates (for validating the visualization across score ranges) ──
  {
    id: "test-low",
    risk: "low",
    name: "ทดสอบ: ความเสี่ยงต่ำ",
    icon: "🟢",
    desc: "สารอ่อนโยน ควรได้คะแนนต่ำทุกด้าน",
    region: "face",
    formula: [
      { name: "Glycerin", smiles: "OCC(O)CO", concentration: 5 },
      { name: "Niacinamide", smiles: "O=C(N)c1cccnc1", concentration: 3 },
      { name: "Urea", smiles: "NC(N)=O", concentration: 2 },
    ],
  },
  {
    id: "test-mid",
    risk: "mid",
    name: "ทดสอบ: ความเสี่ยงกลาง",
    icon: "🟡",
    desc: "กรดอ่อน + แอลกอฮอล์ปานกลาง",
    region: "face",
    formula: [
      { name: "Salicylic Acid", smiles: "O=C(O)c1ccccc1O", concentration: 2 },
      { name: "Ethanol", smiles: "CCO", concentration: 20 },
      { name: "Phenoxyethanol", smiles: "OCCOc1ccccc1", concentration: 1 },
    ],
  },
  {
    id: "test-high",
    risk: "high",
    name: "ทดสอบ: ความเสี่ยงสูง",
    icon: "🔴",
    desc: "สารระคาย/ก่อภูมิแพ้เข้มข้น ควรได้คะแนนสูง",
    region: "face",
    formula: [
      { name: "Ethanol", smiles: "CCO", concentration: 70 },
      { name: "Glycolic Acid", smiles: "OCC(=O)O", concentration: 10 },
      { name: "Cinnamaldehyde", smiles: "O=C/C=C/c1ccccc1", concentration: 5 },
    ],
  },
];
