import Link from "next/link";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/assess", label: "ประเมิน" },
  { href: "/how-to", label: "วิธีใช้งาน" },
  { href: "/methodology", label: "วิธีการ & AI" },
  { href: "/models", label: "ความน่าเชื่อถือ" },
  { href: "/history", label: "ประวัติ" },
  { href: "/about", label: "เกี่ยวกับ" },
];

export default function SiteNav({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-ink/90 backdrop-blur print:hidden">
      <nav className="max-w-6xl mx-auto flex items-center gap-1 px-4 h-14">
        <Link href="/" className="flex items-center gap-2 mr-3">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-brand text-white font-display font-bold text-sm">
            R
          </span>
          <span className="font-display font-bold text-ink2">
            Ralph<span className="text-brand">Guard</span>
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-lg transition ${
                active === l.href
                  ? "bg-brand-soft text-brand-dark font-semibold"
                  : "text-ink2/70 hover:text-brand hover:bg-brand-soft/60"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <Link
          href="/assess"
          className="ml-auto px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition"
        >
          เริ่มประเมิน →
        </Link>
      </nav>
    </header>
  );
}
