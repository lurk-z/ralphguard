import { redirect } from "next/navigation";

// The experiment workspace moved under a project: /projects/[id]/assess.
// Keep this path working by sending old links to the project list.
export default function LegacyAssessRedirect() {
  redirect("/projects");
}
