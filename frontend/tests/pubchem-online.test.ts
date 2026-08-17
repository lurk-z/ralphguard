import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../src/lib/api.ts";
import { lookupIngredientInPubChemBySmiles } from "../src/lib/pubchem-online.ts";

const candidate = {
  id: 999,
  inci_name: "Azelaic acid",
  canonical_name: "Azelaic acid",
  thai_names: [],
  synonyms: ["Nonanedioic acid"],
  cas_number: "123-99-9",
  pubchem_cid: 2266,
  canonical_smiles: "O=C(O)CCCCCCCC(=O)O",
  inchi: null,
  inchikey: "BDJRBEYXGGNYIS-UHFFFAOYSA-N",
  molecular_formula: "C9H16O4",
  molecular_weight: 188.22,
  substance_type: "defined_single_substance",
  structure_status: "resolved",
  qsar_eligible: false,
  assessment_method: "pending_verification",
  provenance: { pubchem: { proposed_qsar_eligible: true } },
  verification_status: "pending",
};

test("SMILES client posts structure to the backend resolver", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  try {
    globalThis.fetch = async (_input, init) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify(candidate), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await lookupIngredientInPubChemBySmiles("O=C(O)CCCCCCCC(=O)O");
    assert.equal(result.pubchem_cid, 2266);
    assert.equal(result.verification_status, "pending");
    assert.deepEqual(JSON.parse(requestBody), {
      smiles: "O=C(O)CCCCCCCC(=O)O",
      refresh: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SMILES client preserves backend identity-mismatch errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "PubChem identity mismatch" }), {
        status: 409,
        statusText: "Conflict",
        headers: { "Content-Type": "application/json" },
      });

    await assert.rejects(
      () => lookupIngredientInPubChemBySmiles("CCO"),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 409 &&
        error.detail === "PubChem identity mismatch",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
