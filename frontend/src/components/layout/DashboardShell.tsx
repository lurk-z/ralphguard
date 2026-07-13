"use client";

// Shared white dashboard shell (sidebar + top bar) for the standard app pages:
// project list, results, report, settings. The /assess workspace has its own
// full-bleed chrome and does NOT use this.
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Folder, Settings } from "lucide-react";

const NAV = [
  { label: "Projects", icon: Folder, href: "/projects" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export default function DashboardShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="app-light h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        {/* ── Sidebar ── */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
          <button
            onClick={() => router.push("/projects")}
            className="flex items-center gap-3 px-5 py-5 text-left"
          >
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-xl border border-dashed border-border bg-muted/60"
            />
            <span className="leading-tight">
              <span className="block font-display text-lg font-bold text-foreground">
                RalphGuard
              </span>
              <span className="block text-[11px] text-muted-foreground">
                AI Chemical Risk Screening
              </span>
            </span>
          </button>

          <nav className="flex flex-col gap-1 px-3 py-2">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto p-3">
            <button className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:bg-secondary">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                TS
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  Thanakhon O.
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  thanakhon@example.com
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 py-5 lg:px-8">
            <div className="min-w-0">
              <h1 className="truncate font-sans text-2xl font-bold tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
