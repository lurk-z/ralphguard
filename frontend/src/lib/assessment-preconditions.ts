import type { FormulaItem } from "@/lib/api";

export type ProjectContextStatus = "loading" | "ready" | "standalone";

export type FormulaReadinessInput = {
  projectStatus: ProjectContextStatus;
  hasProjectId: boolean;
  hasSelectedFormula: boolean;
  substances: FormulaItem[];
};

export type AssessmentPreconditionInput = FormulaReadinessInput & {
  hasPaint: boolean;
  isSubmitting: boolean;
  hasPendingJob: boolean;
};

/**
 * Shared scientific input gate for both painting and assessment.
 *
 * Painting will use this contract before it is unlocked in the new workflow;
 * assessment adds paint ownership and duplicate-job checks on top in A1.
 */
export function formulaReadinessProblem({
  projectStatus,
  hasProjectId,
  hasSelectedFormula,
  substances,
}: FormulaReadinessInput): string | null {
  if (projectStatus === "loading") {
    return "กำลังตรวจสอบข้อมูลโปรเจกต์ กรุณารอสักครู่";
  }
  if (projectStatus !== "ready" || !hasProjectId) {
    return "กรุณาเปิดโปรเจกต์ก่อนเริ่มทดสอบ";
  }
  if (!hasSelectedFormula) {
    return "กรุณาเลือกกล่องสูตรก่อนเริ่มทดสอบ";
  }
  if (substances.length === 0) {
    return "กรุณาเพิ่มสารอย่างน้อย 1 รายการ";
  }

  const missingSmiles = substances.find((item) => !item.smiles.trim());
  if (missingSmiles) {
    return `${missingSmiles.name?.trim() || "สารในสูตร"} ยังไม่มีข้อมูล SMILES`;
  }

  const invalidConcentration = substances.find(
    (item) =>
      !Number.isFinite(Number(item.concentration)) ||
      Number(item.concentration) <= 0 ||
      Number(item.concentration) > 100,
  );
  if (invalidConcentration) {
    return `${invalidConcentration.name?.trim() || "สารในสูตร"} ต้องมีความเข้มข้นมากกว่า 0 และไม่เกิน 100%`;
  }

  const total = substances.reduce(
    (sum, item) => sum + Number(item.concentration),
    0,
  );
  if (total > 100.0001) {
    return `ผลรวมความเข้มข้นเกิน 100% (${total.toFixed(2)}%)`;
  }
  return null;
}

export function assessmentStartProblem(input: AssessmentPreconditionInput): string | null {
  const formulaProblem = formulaReadinessProblem(input);
  if (formulaProblem) return formulaProblem;

  const { hasPaint, isSubmitting, hasPendingJob } = input;
  if (!hasPaint) {
    return "กรุณาทาครีมลงบนผิวโมเดลก่อนเริ่มประเมิน";
  }
  if (isSubmitting || hasPendingJob) {
    return "กล่องสูตรนี้กำลังวิเคราะห์อยู่ กรุณารอผลก่อน";
  }
  return null;
}
