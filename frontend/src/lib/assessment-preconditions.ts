import type { FormulaItem } from "@/lib/api";

export type ProjectContextStatus = "loading" | "ready" | "standalone";

export type AssessmentPreconditionInput = {
  projectStatus: ProjectContextStatus;
  hasProjectId: boolean;
  hasSelectedFormula: boolean;
  substances: FormulaItem[];
  hasPaint: boolean;
  isSubmitting: boolean;
  hasPendingJob: boolean;
};

export function assessmentStartProblem({
  projectStatus,
  hasProjectId,
  hasSelectedFormula,
  substances,
  hasPaint,
  isSubmitting,
  hasPendingJob,
}: AssessmentPreconditionInput): string | null {
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
  if (!hasPaint) {
    return "กรุณาทาสูตรลงบนผิวโมเดลก่อนเริ่มทดสอบ";
  }
  if (isSubmitting || hasPendingJob) {
    return "กล่องสูตรนี้กำลังวิเคราะห์อยู่ กรุณารอผลก่อน";
  }
  return null;
}
