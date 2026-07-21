import { redirect } from "next/navigation";

/**
 * Project assessments use the canonical Studio workspace.
 * Keeping one implementation prevents the project flow from drifting into the
 * old mock-only assessment UI while preserving project ownership on every run.
 */
export default function ProjectAssessmentPage({ params }: { params: { id: string } }) {
  if (!/^\d+$/.test(params.id)) {
    redirect("/projects?projectError=invalid-project");
  }

  const projectId = Number(params.id);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    redirect("/projects?projectError=invalid-project");
  }

  redirect(`/assess?projectId=${projectId}`);
}
