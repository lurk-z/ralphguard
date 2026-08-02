import assert from "node:assert/strict";
import test from "node:test";

import {
  assessmentStartProblem,
  formulaReadinessProblem,
} from "../src/lib/assessment-preconditions.ts";

const validSubstance = {
  name: "Ethanol",
  smiles: "CCO",
  concentration: 10,
};

const validInput = () => ({
  projectStatus: "ready" as const,
  hasProjectId: true,
  hasSelectedFormula: true,
  substances: [validSubstance],
  hasPaint: true,
  isSubmitting: false,
  hasPendingJob: false,
});

test("accepts a complete assessment start state", () => {
  assert.equal(assessmentStartProblem(validInput()), null);
});

test("uses one ordered formula-readiness contract before painting or assessment", () => {
  assert.equal(formulaReadinessProblem(validInput()), null);
  assert.match(
    formulaReadinessProblem({
      ...validInput(),
      projectStatus: "standalone",
      hasProjectId: false,
      hasSelectedFormula: false,
      substances: [],
    }) ?? "",
    /เปิดโปรเจกต์/,
  );
  assert.match(
    formulaReadinessProblem({ ...validInput(), hasSelectedFormula: false }) ?? "",
    /เลือกกล่องสูตร/,
  );
  assert.match(
    formulaReadinessProblem({ ...validInput(), substances: [] }) ?? "",
    /เพิ่มสาร/,
  );
});

test("returns the first actionable missing precondition", () => {
  assert.match(
    assessmentStartProblem({
      ...validInput(),
      projectStatus: "standalone",
      hasProjectId: false,
      substances: [],
    }) ?? "",
    /เปิดโปรเจกต์/,
  );
  assert.match(
    assessmentStartProblem({ ...validInput(), hasSelectedFormula: false }) ?? "",
    /เลือกกล่องสูตร/,
  );
  assert.match(
    assessmentStartProblem({ ...validInput(), substances: [] }) ?? "",
    /เพิ่มสาร/,
  );
});

test("rejects missing structures and invalid concentrations", () => {
  assert.match(
    assessmentStartProblem({
      ...validInput(),
      substances: [{ name: "Unknown", smiles: "", concentration: 10 }],
    }) ?? "",
    /SMILES/,
  );
  assert.match(
    assessmentStartProblem({
      ...validInput(),
      substances: [{ ...validSubstance, concentration: 0 }],
    }) ?? "",
    /มากกว่า 0/,
  );
  assert.match(
    assessmentStartProblem({
      ...validInput(),
      substances: [
        { ...validSubstance, concentration: 60 },
        { name: "Glycerin", smiles: "OCC(O)CO", concentration: 50 },
      ],
    }) ?? "",
    /เกิน 100%/,
  );
});

test("rejects duplicate assessment work after formula validation", () => {
  assert.match(
    assessmentStartProblem({ ...validInput(), isSubmitting: true }) ?? "",
    /กำลังวิเคราะห์/,
  );
  assert.match(
    assessmentStartProblem({ ...validInput(), hasPendingJob: true }) ?? "",
    /กำลังวิเคราะห์/,
  );
});

test("requires paint from the selected formula before assessment", () => {
  assert.match(
    assessmentStartProblem({ ...validInput(), hasPaint: false }) ?? "",
    /ทาครีมลงบนผิวโมเดล/,
  );
});
