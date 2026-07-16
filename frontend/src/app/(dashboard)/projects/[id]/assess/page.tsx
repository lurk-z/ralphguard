import { redirect } from "next/navigation";

/**
 * Project assessments use the canonical Studio workspace.
 * Keeping one implementation prevents the project flow from drifting into the
 * old mock-only assessment UI while preserving project ownership on every run.
 */
export default function ProjectAssessmentPage({ params }: { params: { id: string } }) {
  redirect(`/assess?projectId=${encodeURIComponent(params.id)}`);
}
