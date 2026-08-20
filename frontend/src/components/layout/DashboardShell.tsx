"use client";

// Shared dashboard shell using the Sidebar UI component.
// Wraps all standard app pages: project list, results, and report.
// The /assess workspace has its own full-bleed chrome and does NOT use this.
import { Fragment } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Folder } from "lucide-react";
import { AuthUserMenu } from "@/components/auth/AuthUserMenu";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const NAV = [
  { label: "โปรเจกต์", icon: Folder, href: "/projects" },
];

/** A single crumb — if `href` is omitted it renders as the current page. */
export type BreadcrumbCrumb = {
  label: string;
  href?: string;
};

export default function DashboardShell({
  breadcrumbs,
  actions,
  children,
}: {
  /** Ordered list of crumbs. Last item = current page (no link). */
  breadcrumbs: BreadcrumbCrumb[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="app-light">
      <SidebarProvider>
        {/* ── Sidebar ── */}
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
          <SidebarHeader className="pb-2 pt-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  onClick={() => router.push("/projects")}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Image
                    src="/icons/logo.png"
                    alt="RalphGuard"
                    width={32}
                    height={32}
                    priority
                    className="size-8 shrink-0 rounded-xl object-contain shadow-sm"
                  />
                  <span className="leading-tight">
                    <span className="block font-display text-sm font-bold text-sidebar-foreground">
                      RalphGuard
                    </span>
                    <span className="block text-[10px] text-sidebar-foreground/60">
                      AI Chemical Risk Screening
                    </span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarMenu className="px-2 gap-1">
              {NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => router.push(item.href)}
                      aria-current={active ? "page" : undefined}
                      tooltip={item.label}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

        </Sidebar>

        {/* ── Main column ── */}
        <SidebarInset>
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card/95 px-4 py-4 shadow-sm backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1 shrink-0" />

              {/* Breadcrumb */}
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, i) => {
                    const isLast = i === breadcrumbs.length - 1;
                    return (
                      <Fragment key={i}>
                        <BreadcrumbItem>
                          {!isLast ? (
                            <BreadcrumbLink
                              href={crumb.href}
                              onClick={(e) => {
                                if (crumb.href) {
                                  e.preventDefault();
                                  router.push(crumb.href);
                                }
                              }}
                              className="cursor-pointer font-medium"
                            >
                              {crumb.label}
                            </BreadcrumbLink>
                          ) : (
                            <BreadcrumbPage className="font-semibold text-foreground">
                              {crumb.label}
                            </BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                        {!isLast && <BreadcrumbSeparator />}
                      </Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <AuthUserMenu />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)]">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
