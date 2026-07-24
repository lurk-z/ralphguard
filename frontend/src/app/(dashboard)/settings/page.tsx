import { redirect } from "next/navigation";

// User accounts have been retired. Keep legacy bookmarks inside the app.
export default function SettingsPage() {
  redirect("/projects");
}
