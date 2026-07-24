import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CSV_FORMULA_ROWS,
  assertNoDuplicateFormulaRows,
  parseFormulaCsv,
} from "../src/lib/formula-csv.ts";

test("parses canonical columns, quoted fields, BOM, and header aliases", () => {
  const rows = parseFormulaCsv(
    '\uFEFFINCI Name;canonical_smiles;percentage\r\n"Ethanol, cosmetic";CCO;40%\r\nGlycerin;;10',
  );
  assert.deepEqual(rows, [
    {
      line: 2,
      name: "Ethanol, cosmetic",
      smiles: "CCO",
      concentration: 40,
    },
    {
      line: 3,
      name: "Glycerin",
      smiles: "",
      concentration: 10,
    },
  ]);
});

test("supports comma, semicolon, and tab delimiters", () => {
  assert.equal(parseFormulaCsv("name,smiles,concentration\nEthanol,CCO,40")[0].smiles, "CCO");
  assert.equal(parseFormulaCsv("name;smiles;concentration\nEthanol;CCO;40")[0].smiles, "CCO");
  assert.equal(parseFormulaCsv("name\tsmiles\tconcentration\nEthanol\tCCO\t40")[0].smiles, "CCO");
});

test("rejects missing headers, malformed quotes, and empty identities", () => {
  assert.throws(
    () => parseFormulaCsv("name,smiles\nEthanol,CCO"),
    /concentration/,
  );
  assert.throws(
    () => parseFormulaCsv('name,smiles,concentration\n"Ethanol,CCO,40'),
    /ปิดไม่ครบ/,
  );
  assert.throws(
    () => parseFormulaCsv("name,smiles,concentration\n,,10"),
    /ชื่อสารหรือ SMILES/,
  );
});

test("rejects invalid concentration and totals above 100 percent", () => {
  assert.throws(
    () => parseFormulaCsv("name,concentration\nEthanol,0"),
    /มากกว่า 0/,
  );
  assert.throws(
    () => parseFormulaCsv("name,concentration\nEthanol,not-a-number"),
    /ต้องเป็นตัวเลข/,
  );
  assert.throws(
    () => parseFormulaCsv("name,concentration\nEthanol,60\nGlycerin,50"),
    /เกิน 100%/,
  );
});

test("rejects duplicate names, duplicate structures, and post-resolution aliases", () => {
  assert.throws(
    () => parseFormulaCsv("name,smiles,concentration\nEthanol,CCO,20\neth anol,CCC,10"),
    /สารซ้ำ/,
  );
  assert.throws(
    () => parseFormulaCsv("name,smiles,concentration\nA,CCO,20\nB,CCO,10"),
    /สารซ้ำ/,
  );
  assert.throws(
    () =>
      assertNoDuplicateFormulaRows([
        { line: 2, name: "Ethanol", smiles: "CCO", concentration: 20 },
        { line: 3, name: "", smiles: "CCO", concentration: 10 },
      ]),
    /สารซ้ำ/,
  );
});

test("enforces the backend formula row limit", () => {
  const rows = Array.from(
    { length: MAX_CSV_FORMULA_ROWS + 1 },
    (_, index) => `Ingredient ${index},C${index + 1},1`,
  );
  assert.throws(
    () => parseFormulaCsv(`name,smiles,concentration\n${rows.join("\n")}`),
    new RegExp(`สูงสุด ${MAX_CSV_FORMULA_ROWS}`),
  );
});
