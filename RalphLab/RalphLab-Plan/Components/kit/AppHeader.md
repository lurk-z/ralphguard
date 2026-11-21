---
component: AppHeader
version: V1
file: frontend/src/components/kit/app-header.tsx
group: kit
weight: heavy
size_gzip_kb: 29.6
lazy: false
pages: [/projects]
tags: [component, V1]
---

# AppHeader · V1

> แถบบนแบบไม่มี sidebar: โลโก้ซ้าย ปุ่มและเมนูผู้ใช้ขวา

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/app-header.tsx` | หนัก | 29.6 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/projects/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/app-header.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/components/kit/brand-logo.tsx` → [BrandLogo](../kit/BrandLogo.md)
- `src/components/ui/avatar.tsx` → [Avatar](../ui/Avatar.md)
- `src/components/ui/dropdown-menu.tsx` → [DropdownMenu](../ui/DropdownMenu.md)
- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

```bash
npm install @radix-ui/react-avatar@^1.2.0 @radix-ui/react-dropdown-menu@^2.1.18 next-auth@^4.24.15
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `lucide-react`, `next`, `react`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรสี `--primary-strong` ใน `app/globals.css` (ทุกธีม) และ `primary.strong` ใน `tailwind.config.js` (ใช้กับตัวหนังสือและปุ่มสี teal ให้ contrast ผ่าน)
- ปลั๊กอิน `tailwindcss-animate` (มีใน `tailwind.config.js` อยู่แล้ว)
- ฟอนต์ `font-display` ใน `tailwind.config.js` (`fontFamily.display`)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type AppHeaderProps = {
  /** Extra items before the user menu (e.g. a help button). */
  actions?: ReactNode;
  className?: string;
}
```

## ตัวอย่างการใช้

```tsx
import { UserMenu, AppHeader } from "@/components/kit/app-header";
```

ของจริงใน `app/(dashboard)/projects/page.tsx` บรรทัด 240:

```tsx
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="โปรเจกต์ทั้งหมด"
          description="เลือกโปรเจกต์เพื่อจัดการสูตรและดูผลประเมิน"
          actions={
            <>
              {hasProjects && (
                <Input
                  search
                  value={query}
```

## โค้ด V1

`frontend/src/components/kit/app-header.tsx` · 77 บรรทัด

```tsx
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
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
