"use client";

// Product templates — starter formulas the user can browse for this project.
// Mock data for now; "ใช้เทมเพลตนี้" just goes to the assess workspace
// (prefilling a new formula box from a template is a follow-up feature).
import { useRouter } from "next/navigation";
import { Beaker, FlaskConical } from "lucide-react";

type Template = {
  id: string;
  name: string;
  description: string;
  substanceCount: number;
  color: string;
};

const TEMPLATES: Template[] = [
  {
    id: "hand-cream",
    name: "Hand Cream Base",
    description: "สูตรพื้นฐานครีมทามือ เน้นความชุ่มชื้นและเนื้อครีมข้น",
    substanceCount: 6,
    color: "#3B82F6",
  },
  {
    id: "serum",
    name: "Facial Serum Base",
    description: "สูตรพื้นฐานเซรั่มบำรุงผิวหน้า เนื้อเบา ซึมไว",
    substanceCount: 5,
    color: "#22C55E",
  },
  {
    id: "sunscreen",
    name: "Sunscreen Base",
    description: "สูตรพื้นฐานกันแดด เน้นการกระจายตัวและความคงตัว",
    substanceCount: 7,
    color: "#F97316",
  },
  {
    id: "cleanser",
    name: "Facial Cleanser Base",
    description: "สูตรพื้นฐานผลิตภัณฑ์ทำความสะอาดผิวหน้า อ่อนโยน",
    substanceCount: 5,
    color: "#EC4899",
  },
];

export default function TemplatesPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">เทมเพลตผลิตภัณฑ์</h1>
          <p className="text-sm text-muted-foreground">สูตรตั้งต้นสำหรับเริ่มโปรเจ็คใหม่ได้เร็วขึ้น</p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: `${t.color}1A` }}
              >
                <Beaker className="size-5" style={{ color: t.color }} />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">{t.name}</p>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">{t.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t.substanceCount} สาร</p>
              <button
                onClick={() => router.push(`/projects/${params.id}/assess`)}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 py-2 text-xs font-medium text-primary transition-colors hover:bg-accent/40"
              >
                <FlaskConical className="size-3.5" />
                ใช้เทมเพลตนี้
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
