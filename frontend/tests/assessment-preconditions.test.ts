import assert from "node:assert/strict";
import test from "node:test";

import { assessmentStartProblem } from "../src/lib/assessment-preconditions.ts";

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
  isSubmitting: false,
  hasPendingJob: false,
});

test("accepts a complete assessment start state", () => {
  assert.equal(assessmentStartProblem(validInput()), null);
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

test("allows assessment before painting and rejects duplicate work", () => {
  assert.equal(assessmentStartProblem(validInput()), null);
  assert.match(
    assessmentStartProblem({ ...validInput(), isSubmitting: true }) ?? "",
    /กำลังวิเคราะห์/,
  );
  assert.match(
    assessmentStartProblem({ ...validInput(), hasPendingJob: true }) ?? "",
    /กำลังวิเคราะห์/,
  );
});
