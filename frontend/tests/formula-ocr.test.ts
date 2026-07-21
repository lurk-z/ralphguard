import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_IMPORT_POLICY,
  describeOcrSkippedItems,
  prepareOcrFormulaReplacement,
} from "../src/lib/formula-ocr.ts";

test("OCR import explicitly replaces with valid non-water items", () => {
  const result = prepareOcrFormulaReplacement([
    { name: "Water (Aqua)", smiles: "O", concentration: 60 },
    { name: "Ethanol", smiles: "CCO", concentration: 40 },
  ]);

  assert.equal(result.policy, OCR_IMPORT_POLICY);
  assert.deepEqual(result.items, [
    { name: "Ethanol", smiles: "CCO", concentration: 40 },
  ]);
  assert.equal(result.skipped[0]?.reason, "water");
});

test("OCR import skips duplicate name or SMILES and reports the item", () => {
  const result = prepareOcrFormulaReplacement([
    { name: "Ethanol", smiles: "CCO", concentration: 20 },
    { name: "ethyl alcohol", smiles: "CCO", concentration: 10 },
    { name: "Ethanol", smiles: "OCC", concentration: 5 },
  ]);

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.skipped.map((item) => item.reason), ["duplicate", "duplicate"]);
  assert.match(describeOcrSkippedItems(result.skipped), /สารซ้ำ/);
});

test("OCR import keeps partial success and exposes unresolved rows", () => {
  const result = prepareOcrFormulaReplacement([
    { name: "Glycerin", smiles: "OCC(O)CO", concentration: 5 },
    { name: "Unknown extract", smiles: "", concentration: 1 },
    { name: "Broken dose", smiles: "CC", concentration: 0 },
  ]);

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.skipped.map((item) => item.reason), [
    "missing-smiles",
    "invalid-concentration",
  ]);
});

test("OCR import rejects a valid-row total over 100 percent", () => {
  assert.throws(
    () =>
      prepareOcrFormulaReplacement([
        { name: "A", smiles: "CC", concentration: 60 },
        { name: "B", smiles: "CCC", concentration: 50 },
      ]),
    /เกิน 100%/,
  );
});
