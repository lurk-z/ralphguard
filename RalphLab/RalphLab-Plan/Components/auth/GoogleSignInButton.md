---
component: GoogleSignInButton
version: V1
file: frontend/src/components/auth/GoogleSignInButton.tsx
group: auth
weight: light
size_gzip_kb: 0.8
lazy: false
pages: [/login]
tags: [component, V1]
---

# GoogleSignInButton · V1

> ปุ่มเข้าสู่ระบบด้วย Google

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/auth/GoogleSignInButton.tsx` | เบา | 0.8 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/login` | พร้อมหน้า |

นำเข้าโดย: `app/(auth)/login/page.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/auth/GoogleSignInButton.tsx` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

```bash
npm install next-auth@^4.24.15
```

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `react`

## ตัวอย่างการใช้

```tsx
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
```

ของจริงใน `app/(auth)/login/page.tsx` บรรทัด 9:

```tsx
  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,hsl(174_70%_93%),white_55%)] px-4"><section className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-teal-950/10"><div className="mb-7 text-center"><Image unoptimized src="/icons/logo-192.webp" alt="RalphGuard" width={64} height={64} priority className="mx-auto mb-4 size-16 object-contain"/><h1 className="font-display text-2xl font-bold text-slate-900">เข้าสู่ระบบ RalphGuard</h1><p className="mt-2 text-sm leading-6 text-slate-500">เก็บโปรเจกต์ สูตร และผลประเมินแยกตามบัญชีของคุณ</p></div><GoogleSignInButton/><p className="mt-5 text-center text-xs leading-5 text-slate-400">ใช้บัญชี Google เพื่อยืนยันตัวตนอย่างปลอดภัย</p></section></main>;
}

```

## โค้ด V1

`frontend/src/components/auth/GoogleSignInButton.tsx` · 15 บรรทัด

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function GoogleSignInButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={() => { setBusy(true); void signIn("google", { callbackUrl: "/projects" }); }} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-60">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>
      {busy ? "กำลังเชื่อมต่อ Google…" : "เข้าสู่ระบบด้วย Google"}
    </button>
  );
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
