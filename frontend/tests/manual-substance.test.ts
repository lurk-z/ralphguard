import assert from "node:assert/strict";
import test from "node:test";

import type { SubstanceProfile } from "../src/lib/api.ts";
import {
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
  const registryItem = (
    id: number,
    canonicalName: string,
    smiles: string,
    synonyms: string[] = [],
  ) => ({
    id,
    inci_name: null,
    canonical_name: canonicalName,
    thai_names: [],
    synonyms,
    cas_number: null,
    pubchem_cid: null,
    canonical_smiles: smiles,
    molecular_formula: null,
    molecular_weight: null,
    substance_type: "defined_single_substance",
    structure_status: "resolved",
    qsar_eligible: true,
    assessment_method: "qsar",
    verification_status: "verified",
  });
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
