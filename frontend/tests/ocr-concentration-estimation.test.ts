import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_SIMULATION_TOTAL_LIMIT,
  detectDeclaredConcentrationsFromOcrText,
  estimateOcrConcentrations,
} from "../src/lib/ocr-concentration-estimation.ts";

const candidates = [
  { name: "Glycerin", smiles: "OCC(O)CO" },
  { name: "Squalane", smiles: "SQUALANE" },
  { name: "Phenoxyethanol", smiles: "PHENOXY" },
  { name: "Linalool", smiles: "LINALOOL" },
];

test("returns a range that contains the simulation midpoint", () => {
  const estimates = estimateOcrConcentrations(candidates);

  assert.equal(estimates.length, candidates.length);
  assert.ok(estimates.every((item) => item.concentration > 0));
  assert.ok(estimates.every((item) => item.minConcentration <= item.concentration));
  assert.ok(estimates.every((item) => item.maxConcentration >= item.concentration));
});

test("enforces descending midpoint before a plausible one-percent tail", () => {
  const references = new Map([
    ["OCC(O)CO", 10],
    ["SQUALANE", 5],
    ["PHENOXY", 1],
    ["LINALOOL", 0.2],
  ]);
  const estimates = estimateOcrConcentrations(candidates, references);

  assert.equal(estimates[0].concentration, 10);
  assert.equal(estimates[1].concentration, 5);
  assert.equal(estimates[0].orderConstraintApplied, true);
  assert.equal(estimates[1].orderConstraintApplied, true);
  assert.equal(estimates[2].inOnePercentTail, true);
  assert.equal(estimates[3].inOnePercentTail, true);
  assert.ok(estimates[2].maxConcentration <= 1);
  assert.ok(estimates[3].maxConcentration <= 1);
});

test("does not force ordering inside the inferred <=1% tail", () => {
  const tailCandidates = [
    { name: "Preservative A", smiles: "A" },
    { name: "Fragrance B", smiles: "B" },
    { name: "Allergen C", smiles: "C" },
  ];
  const references = new Map([
    ["A", 1],
    ["B", 0.2],
    ["C", 0.8],
  ]);
  const estimates = estimateOcrConcentrations(tailCandidates, references);

  assert.ok(estimates.every((item) => item.inOnePercentTail));
  assert.equal(estimates[1].concentration, 0.2);
  assert.equal(estimates[2].concentration, 0.75);
  assert.equal(estimates[2].orderConstraintApplied, false);
});

test("treats a catalog concentration as a soft anchor, not an exact hidden formula", () => {
  const estimates = estimateOcrConcentrations(
    [{ name: "Glycerin", smiles: "OCC(O)CO" }],
    new Map([["OCC(O)CO", 10]]),
  );

  assert.equal(estimates[0].concentration, 10);
  assert.equal(estimates[0].estimateBasis, "catalog-and-order");
  assert.equal(estimates[0].confidence, "medium");
  assert.ok(estimates[0].minConcentration < 10);
  assert.ok(estimates[0].maxConcentration > 10);
});

test("keeps an explicitly declared label percentage exact with high confidence", () => {
  const estimates = estimateOcrConcentrations([
    { name: "Niacinamide", smiles: "NIA", declaredConcentration: 5 },
  ]);

  assert.deepEqual(
    {
      concentration: estimates[0].concentration,
      min: estimates[0].minConcentration,
      max: estimates[0].maxConcentration,
      basis: estimates[0].estimateBasis,
      confidence: estimates[0].confidence,
    },
    {
      concentration: 5,
      min: 5,
      max: 5,
      basis: "label-declared",
      confidence: "high",
    },
  );
});

test("detects a percentage printed immediately after an OCR ingredient name", () => {
  const found = detectDeclaredConcentrationsFromOcrText(
    "Ingredients: Water, Niacinamide 5%, Glycerin, Panthenol 0.5%",
    [
      { name: "Niacinamide", smiles: "NIA" },
      { name: "Panthenol", smiles: "PAN" },
      { name: "Glycerin", smiles: "GLY" },
    ],
  );

  assert.equal(found.get("NIA"), 5);
  assert.equal(found.get("PAN"), 0.5);
  assert.equal(found.has("GLY"), false);
});

test("does not attach an unrelated package percentage to a nearby ingredient", () => {
  const found = detectDeclaredConcentrationsFromOcrText(
    "Ingredients: Niacinamide, Glycerin. Clinically tested 95% satisfaction.",
    [{ name: "Niacinamide", smiles: "NIA" }],
  );

  assert.equal(found.size, 0);
});

test("keeps the provisional simulation total below the safety headroom limit", () => {
  const many = Array.from({ length: 20 }, (_, index) => ({
    name: `Ingredient ${index + 1}`,
    smiles: `S${index + 1}`,
  }));
  const estimates = estimateOcrConcentrations(many);
  const total = estimates.reduce((sum, item) => sum + item.concentration, 0);

  assert.ok(total <= OCR_SIMULATION_TOTAL_LIMIT + 0.1);
});
