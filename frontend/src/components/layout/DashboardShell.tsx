"use client";

// Shared dashboard shell using the Sidebar UI component.
// Wraps all standard app pages: project list, results, report, settings.
// The /assess workspace has its own full-bleed chrome and does NOT use this.
import { Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Folder, LogOut, Settings } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const NAV = [
  { label: "Projects", icon: Folder, href: "/projects" },
  { label: "Settings", icon: Settings, href: "/settings" },
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
        <Sidebar collapsible="icon">
          <SidebarHeader className="pb-2 pt-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  onClick={() => router.push("/projects")}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <img
                    src="/icons/logo.png"
                    alt="RalphGuard Logo"
                    className="size-8 shrink-0 rounded-lg object-contain overflow-hidden"
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

          <SidebarSeparator />

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        TS
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm font-medium text-sidebar-foreground">
                          Thanakhon O.
                        </span>
                        <span className="block truncate text-xs text-sidebar-foreground/60">
                          thanakhon@example.com
                        </span>
                      </span>
                      <ChevronDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/50" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    side="top"
                    align="start"
                    sideOffset={8}
                    className="w-56"
                  >
                    {/* User info header */}
                    <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        TS
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-sm font-medium">
                          Thanakhon O.
                        </span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          thanakhon@example.com
                        </span>
                      </span>
                    </DropdownMenuLabel>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() => router.push("/settings")}
                      className="gap-2"
                    >
                      <Settings className="size-4 text-muted-foreground" />
                      ตั้งค่า
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="gap-2 text-destructive focus:text-destructive"
                      onClick={() => router.push("/login")}
                    >
                      <LogOut className="size-4" />
                      ออกจากระบบ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* ── Main column ── */}
        <SidebarInset>
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4 py-4 lg:px-6">
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

            {actions && (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
