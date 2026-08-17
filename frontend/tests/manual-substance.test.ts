import assert from "node:assert/strict";
import test from "node:test";

import type { IngredientRegistryItem, SubstanceProfile } from "../src/lib/api.ts";
import {
  manualOnlineSubstanceProblem,
  rememberManualOnlineSubstance,
  resolveManualSubstanceMatch,
  resolveManualSubstanceRegistryMatch,
  searchManualSubstanceSuggestions,
} from "../src/lib/manual-substance.ts";

const profile = (name: string, smiles: string): SubstanceProfile => ({
  found_in_registry: true,
  canonical_name: name,
  canonical_smiles: smiles,
  substance_type: "defined_single_substance",
  structure_status: "resolved",
  assessment_method: "qsar",
  verification_status: "verified",
  hazards: [],
});

const registryItem = (
  id: number,
  canonicalName: string,
  smiles: string,
  synonyms: string[] = [],
  overrides: Partial<IngredientRegistryItem> = {},
): IngredientRegistryItem => ({
  id,
  inci_name: null,
  canonical_name: canonicalName,
  thai_names: [],
  synonyms,
  cas_number: null,
  pubchem_cid: null,
  canonical_smiles: smiles,
  inchi: null,
  inchikey: null,
  molecular_formula: null,
  molecular_weight: null,
  substance_type: "defined_single_substance",
  structure_status: "resolved",
  qsar_eligible: true,
  assessment_method: "qsar",
  provenance: {},
  verification_status: "verified",
  ...overrides,
});

test("accepts a registry match from either a name or a SMILES input", () => {
  const ethanol = profile("Ethanol", "CCO");

  assert.equal(resolveManualSubstanceMatch({
    hasName: true,
    hasSmiles: false,
    nameProfile: ethanol,
    smilesProfile: null,
  }).profile, ethanol);
  assert.equal(resolveManualSubstanceMatch({
    hasName: false,
    hasSmiles: true,
    nameProfile: null,
    smilesProfile: ethanol,
  }).profile, ethanol);
});

test("accepts name and SMILES only when both resolve to the same substance", () => {
  const ethanolByName = profile("Ethanol", "CCO");
  const ethanolBySmiles = profile("Ethyl alcohol", "CCO");
  const result = resolveManualSubstanceMatch({
    hasName: true,
    hasSmiles: true,
    nameProfile: ethanolByName,
    smilesProfile: ethanolBySmiles,
  });

  assert.equal(result.error, null);
  assert.equal(result.profile, ethanolByName);
});

test("rejects conflicting name and SMILES identities", () => {
  const result = resolveManualSubstanceMatch({
    hasName: true,
    hasSmiles: true,
    nameProfile: profile("Ethanol", "CCO"),
    smilesProfile: profile("Isopropanol", "CC(C)O"),
  });

  assert.equal(result.profile, null);
  assert.match(result.error ?? "", /ไม่ตรงกัน/);
});

test("rejects a substance that is absent from the registry", () => {
  const result = resolveManualSubstanceMatch({
    hasName: true,
    hasSmiles: false,
    nameProfile: {
      ...profile("Unknown", "CCC"),
      found_in_registry: false,
    },
    smilesProfile: null,
  });

  assert.equal(result.profile, null);
  assert.match(result.error ?? "", /ไม่พบสารนี้ในฐานข้อมูล/);
});

test("suggests only displayed registry names that start with the query", () => {
  const glycerin = registryItem(1, "Glycerin", "OCC(O)CO", ["Glycerol"]);
  const propyleneGlycol = registryItem(2, "Propylene Glycol", "CC(O)CO");
  const ethanol = registryItem(3, "Ethanol", "CCO");

  assert.deepEqual(
    searchManualSubstanceSuggestions([propyleneGlycol, ethanol, glycerin], "g"),
    [glycerin],
  );
  assert.deepEqual(
    searchManualSubstanceSuggestions([propyleneGlycol, ethanol, glycerin], "i"),
    [],
  );

  assert.equal(resolveManualSubstanceRegistryMatch({
    items: [glycerin, propyleneGlycol],
    name: "Glycerol",
    smiles: "OCC(O)CO",
  }).item, glycerin);
  assert.equal(resolveManualSubstanceRegistryMatch({
    items: [glycerin, propyleneGlycol],
    name: "Glycerin",
    smiles: "CC(O)CO",
  }).item, null);
});

test("pending PubChem single-molecule candidate can be used for provisional runtime screening", () => {
  const azelaicAcid = registryItem(
    90001,
    "Azelaic acid",
    "O=C(O)CCCCCCCC(=O)O",
    ["Nonanedioic acid"],
    {
      pubchem_cid: 2266,
      inchikey: "BDJRBEYXGGNYIS-UHFFFAOYSA-N",
      qsar_eligible: false,
      assessment_method: "pending_verification",
      verification_status: "pending",
      provenance: {
        pubchem: {
          cid: 2266,
          proposed_qsar_eligible: true,
        },
      },
    },
  );

  assert.equal(rememberManualOnlineSubstance(azelaicAcid), null);

  const byName = resolveManualSubstanceRegistryMatch({
    items: [],
    name: "Azelaic acid",
    smiles: "",
  });
  assert.equal(byName.item?.pubchem_cid, 2266);
  assert.equal(byName.item?.verification_status, "pending");
  assert.equal(byName.item?.qsar_eligible, false);
  assert.equal(byName.item?.canonical_smiles, "O=C(O)CCCCCCCC(=O)O");

  const suggestions = searchManualSubstanceSuggestions([], "azel");
  assert.equal(suggestions[0]?.pubchem_cid, 2266);
});

test("pending candidate without backend proposed-eligibility provenance is rejected", () => {
  const unreviewedWithoutGuard = registryItem(
    90004,
    "Unqualified candidate",
    "CCC",
    [],
    {
      qsar_eligible: false,
      assessment_method: "pending_verification",
      verification_status: "pending",
      provenance: { pubchem: { proposed_qsar_eligible: false } },
    },
  );

  assert.match(manualOnlineSubstanceProblem(unreviewedWithoutGuard) ?? "", /ไม่ผ่านเกณฑ์/);
  assert.notEqual(rememberManualOnlineSubstance(unreviewedWithoutGuard), null);
});

test("online fallback rejects mixtures and non-QSAR structures before caching", () => {
  const mixture = registryItem(
    90002,
    "Botanical Extract",
    "CCO",
    [],
    {
      substance_type: "mixture",
      qsar_eligible: false,
      assessment_method: "knowledge_base",
      verification_status: "pending",
      provenance: { pubchem: { proposed_qsar_eligible: false } },
    },
  );
  const inorganic = registryItem(
    90003,
    "Unsupported salt",
    "[Na+].[Cl-]",
    [],
    {
      substance_type: "defined_single_substance",
      qsar_eligible: false,
      assessment_method: "knowledge_base",
      verification_status: "pending",
      provenance: { pubchem: { proposed_qsar_eligible: false } },
    },
  );

  assert.match(manualOnlineSubstanceProblem(mixture) ?? "", /สารผสม/);
  assert.match(manualOnlineSubstanceProblem(inorganic) ?? "", /ไม่ผ่านเกณฑ์/);
  assert.notEqual(rememberManualOnlineSubstance(mixture), null);
  assert.notEqual(rememberManualOnlineSubstance(inorganic), null);

  assert.equal(resolveManualSubstanceRegistryMatch({
    items: [],
    name: "Botanical Extract",
    smiles: "",
  }).item, null);
  assert.equal(resolveManualSubstanceRegistryMatch({
    items: [],
    name: "Unsupported salt",
    smiles: "",
  }).item, null);
});
