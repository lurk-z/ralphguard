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
    ],
  },
  {
    category: "สารกันเสีย (Preservatives)",
    icon: "🛡️",
    items: [
      { name: "Phenoxyethanol", smiles: "OCCOc1ccccc1", conc: 1 },
      { name: "Methylparaben", smiles: "O=C(OC)c1ccc(O)cc1", conc: 0.4 },
      { name: "Benzoic Acid", smiles: "O=C(O)c1ccccc1", conc: 0.5 },
      { name: "Sorbic Acid", smiles: "CC=CC=CC(=O)O", conc: 0.2 },
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
    ],
  },
];

/** Flat lookup list (handy for a single dropdown / search). */
export const SUBSTANCE_FLAT: (CatalogItem & { category: string })[] =
  SUBSTANCE_LIBRARY.flatMap((g) => g.items.map((it) => ({ ...it, category: g.category })));

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
