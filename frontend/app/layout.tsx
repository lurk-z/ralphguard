import type { Metadata, Viewport } from "next";
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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const TITLE = "RalphGuard — In-silico Irritation & Toxicity Screening";
const DESCRIPTION =
  "ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลองคอมพิวเตอร์ (QSAR) เพื่อลดการพึ่งพาการทดลองในสัตว์";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · RalphGuard",
  },
  description: DESCRIPTION,
  applicationName: "RalphGuard",
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    siteName: "RalphGuard",
    url: SITE_URL,
    locale: "th_TH",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#08100F",
  colorScheme: "dark",
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
      <body className="min-h-dvh flex flex-col antialiased">
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
