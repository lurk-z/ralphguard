"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/kit/brand-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name?: string | null) {
  if (!name) return "RG";
  return name.trim().slice(0, 2).toUpperCase();
}

/** Signed-in user: avatar button with a menu (name, email, sign out). Renders nothing when signed out. */
export function UserMenu() {
  const { data } = useSession();
  const user = data?.user;
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="เมนูผู้ใช้"
          className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <Avatar size="lg">
            {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback>{initials(user.name ?? user.email)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name ?? "ผู้ใช้"}</div>
          {user.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: "/login" })}>
          <LogOut />
          ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type AppHeaderProps = {
  /** Extra items before the user menu (e.g. a help button). */
  actions?: ReactNode;
  className?: string;
};

/** Top bar without a sidebar: logo on the left, actions and the user menu on the right. */
export function AppHeader({ actions, className }: AppHeaderProps) {
  return (
    <header className={cn("sticky top-0 z-40 border-b bg-background/90 backdrop-blur", className)}>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <BrandLogo />
        <div className="flex items-center gap-2">
          {actions}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
