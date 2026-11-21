import type { Metadata } from "next";
import NodesPreview from "./NodesPreview";
import "reactflow/dist/style.css";
import "./preview.css";

export const metadata: Metadata = { title: "ผังสูตรตัวอย่าง · Ralph Lab", robots: { index: false } };

export default function NodesPreviewPage() {
  return <NodesPreview />;
}
