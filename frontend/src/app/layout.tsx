import type { Metadata } from "next";
import localFont from "next/font/local";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// LINE Seed Sans TH — Thai + Latin body text
const lineSeedTH = localFont({
  src: [
    { path: "../../public/fonts/LINESeedSansTH_W_Th.woff", weight: "100", style: "normal" },
    { path: "../../public/fonts/LINESeedSansTH_W_Rg.woff", weight: "400", style: "normal" },
    { path: "../../public/fonts/LINESeedSansTH_W_Bd.woff", weight: "700", style: "normal" },
    { path: "../../public/fonts/LINESeedSansTH_W_He.woff", weight: "800", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

// LINE Seed Sans (EN) — Latin brand/display headings
const lineSeedEN = localFont({
  src: [
    { path: "../../public/fonts/LINESeedSans_W_Th.woff", weight: "100", style: "normal" },
    { path: "../../public/fonts/LINESeedSans_W_Rg.woff", weight: "400", style: "normal" },
    { path: "../../public/fonts/LINESeedSans_W_Bd.woff", weight: "700", style: "normal" },
    { path: "../../public/fonts/LINESeedSans_W_He.woff", weight: "800", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

// IBM Plex Mono — code / mono (LINE Seed has no mono variant)
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RalphGuard — In-silico Irritation & Toxicity Risk Screening",
  description:
    "In-silico Irritation & Toxicity Risk Screening Platform for cosmetic formulations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      className={`${lineSeedTH.variable} ${lineSeedEN.variable} ${ibmPlexMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
