import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_ESTIMATED_NON_WATER_LIMIT,
  estimateOcrConcentrations,
} from "../src/lib/ocr-concentration-estimation.ts";

const candidates = [
  { name: "Glycerin", smiles: "OCC(O)CO" },
  { name: "Squalane", smiles: "SQUALANE" },
  { name: "Phenoxyethanol", smiles: "PHENOXY" },
  { name: "Linalool", smiles: "LINALOOL" },
];

test("estimates positive concentrations in descending label order", () => {
  const estimates = estimateOcrConcentrations(candidates);

  assert.equal(estimates.length, candidates.length);
  assert.ok(estimates.every((item) => item.concentration > 0));
  for (let index = 1; index < estimates.length; index += 1) {
    assert.ok(estimates[index - 1].concentration >= estimates[index].concentration);
  }
});

test("uses catalog references but keeps the non-water total conservative", () => {
  const references = new Map([
    ["OCC(O)CO", 10],
    ["SQUALANE", 5],
    ["PHENOXY", 1],
    ["LINALOOL", 1],
  ]);
  const estimates = estimateOcrConcentrations(candidates, references);
  const total = estimates.reduce((sum, item) => sum + item.concentration, 0);

  assert.deepEqual(estimates.map((item) => item.concentration), [10, 5, 1, 1]);
  assert.ok(total <= OCR_ESTIMATED_NON_WATER_LIMIT);
  assert.ok(estimates.every((item) => item.estimateBasis === "catalog-and-order"));
});

test("caps a high reference and leaves room for the Water/Base remainder", () => {
  const estimates = estimateOcrConcentrations(
    [{ name: "Ethanol", smiles: "CCO" }],
    new Map([["CCO", 40]]),
  );

  assert.equal(estimates[0].concentration, OCR_ESTIMATED_NON_WATER_LIMIT);
});
