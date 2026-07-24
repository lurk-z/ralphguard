import { redirect } from "next/navigation";

import { parseProjectRouteId } from "@/lib/project-routing";

/**
 * Project assessments use the canonical Studio workspace.
 * Keeping one implementation prevents the project flow from drifting into the
 * old mock-only assessment UI while preserving project ownership on every run.
 */
export default function ProjectAssessmentPage({ params }: { params: { id: string } }) {
  const projectId = parseProjectRouteId(params.id);
  if (projectId === null) {
    redirect("/projects?projectError=invalid-project");
  }

  redirect(`/assess?projectId=${projectId}`);
}
