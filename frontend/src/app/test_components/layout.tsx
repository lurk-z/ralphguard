import type { ReactNode } from "react";
import { notFound } from "next/navigation";

// Component showcase is a development tool: hidden (404) in production builds.
export default function TestComponentsLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
