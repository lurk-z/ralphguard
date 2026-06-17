import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai, Space_Grotesk } from "next/font/google";
import "./globals.css";

import NavBar from "../components/NavBar";
import Footer from "../components/Footer";

// Display / headings (Latin)
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Monospace — SMILES, scores, codes
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

// Body — Thai + Latin
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RalphGuard — In-silico Irritation & Toxicity Screening",
  description:
    "ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลองคอมพิวเตอร์ (QSAR) เพื่อลดการพึ่งพาการทดลองในสัตว์",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      className={`${spaceGrotesk.variable} ${plexMono.variable} ${plexThai.variable}`}
    >
      <body className="min-h-screen flex flex-col antialiased">
        {/* Ambient background glow — fixed, behind everything */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
          <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand/15 blur-[120px]" />
          <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-[120px]" />
          <div className="absolute inset-0 bg-grid opacity-[0.4]" />
        </div>

        <NavBar />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
