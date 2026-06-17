"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/assess", label: "ประเมิน" },
  { href: "/history", label: "ประวัติ" },
  { href: "/models", label: "โมเดล & ความน่าเชื่อถือ" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavBar() {
  const pathname = usePathname() || "/";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-ink/70 backdrop-blur-md print:hidden">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/15 ring-1 ring-brand/40 transition group-hover:bg-brand/25">
            <span className="text-sm">🛡️</span>
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Ralph<span className="text-brand">Guard</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? "text-brand"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
                }`}
              >
                <span className="hidden sm:inline">{l.label}</span>
                <span className="sm:hidden">{l.label.split(" ")[0]}</span>
                {active && (
                  <span className="absolute inset-x-2 -bottom-[1px] h-px bg-gradient-to-r from-transparent via-brand to-transparent" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
