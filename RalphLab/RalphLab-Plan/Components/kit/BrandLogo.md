---
component: BrandLogo
version: V1
file: frontend/src/components/kit/brand-logo.tsx
group: kit
weight: light
size_gzip_kb: 0.6
lazy: false
pages: [/projects]
tags: [component, V1]
---

# BrandLogo · V1

> โลโก้ RalphGuard (ไอคอน + ชื่อ + คำอธิบายย่อ)

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/kit/brand-logo.tsx` | เบา | 0.6 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/projects` | พร้อมหน้า |

นำเข้าโดย: `components/kit/app-header.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/kit/brand-logo.tsx` จากโค้ดด้านล่าง

ไฟล์ที่ component นี้ import ต่อ (ต้องมีด้วย · ดูโค้ดของ component ได้ในโฟลเดอร์นี้):

- `src/lib/utils.ts` (ไฟล์ฟังก์ชัน ไม่ใช่ component)

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `clsx`, `next`, `tailwind-merge`

ต้องมีในโปรเจกต์:

- ตัวแปรสี `--primary-strong` ใน `app/globals.css` (ทุกธีม) และ `primary.strong` ใน `tailwind.config.js` (ใช้กับตัวหนังสือและปุ่มสี teal ให้ contrast ผ่าน)
- ฟอนต์ `font-display` ใน `tailwind.config.js` (`fontFamily.display`)
- ตัวแปรธีมแบบ shadcn (`--background`, `--primary`, `--accent` ฯลฯ) ใน `app/globals.css`

## Props

```ts
export type BrandLogoProps = {
  /** Where the logo links to. Pass `null` to render it without a link. */
  href?: string | null;
  /** Icon only (the name stays available to screen readers). */
  compact?: boolean;
  /** Small line under the name. */
  tagline?: string;
  className?: string;
  onClick?: () => void;
}
```

## ตัวอย่างการใช้

```tsx
import { BrandLogo } from "@/components/kit/brand-logo";
```

ของจริงใน `components/kit/app-header.tsx` บรรทัด 68:

```tsx
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

## โค้ด V1

`frontend/src/components/kit/brand-logo.tsx` · 64 บรรทัด

```tsx
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type BrandLogoProps = {
  /** Where the logo links to. Pass `null` to render it without a link. */
  href?: string | null;
  /** Icon only (the name stays available to screen readers). */
  compact?: boolean;
  /** Small line under the name. */
  tagline?: string;
  className?: string;
  onClick?: () => void;
};

/** RalphGuard logo: icon + "RalphGuard" wordmark + tagline. */
export function BrandLogo({
  href = "/projects",
  compact = false,
  tagline = "AI Chemical Risk Screening",
  className,
  onClick,
}: BrandLogoProps) {
  const content = (
    <>
      <Image
        unoptimized
        src="/icons/logo-192.webp"
        alt=""
        width={34}
        height={34}
        className="size-[34px] shrink-0 rounded-lg object-contain"
      />
      <span className={compact ? "sr-only" : "min-w-0"}>
        <span className="block truncate font-display text-base font-bold leading-tight text-foreground">
          Ralph<span className="text-primary-strong">Guard</span>
        </span>
        {tagline && (
          <span className="block truncate text-[9px] uppercase leading-tight tracking-[0.11em] text-muted-foreground">
            {tagline}
          </span>
        )}
      </span>
    </>
  );

  const classes = cn("flex min-w-0 items-center gap-2.5 rounded-lg", className);

  if (href === null) return <div className={classes}>{content}</div>;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        classes,
        "outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {content}
    </Link>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
