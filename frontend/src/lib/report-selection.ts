import type { AssessmentSummary } from "@/lib/api";

export function latestCompletedAssessment(
  assessments: AssessmentSummary[],
): AssessmentSummary | null {
  const completed = assessments.filter(
    (assessment) => assessment.status === "completed",
  );
  if (completed.length === 0) return null;
  return completed.sort((left, right) => {
    const leftTime = Date.parse(left.completed_at || left.created_at);
    const rightTime = Date.parse(right.completed_at || right.created_at);
    return rightTime - leftTime;
  })[0];
}
