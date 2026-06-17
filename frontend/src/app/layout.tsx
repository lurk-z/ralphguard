import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RalphGuard",
  description:
    "In-silico Irritation & Toxicity Risk Screening Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
