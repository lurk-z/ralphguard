"use client";

import { signOut, useSession } from "next-auth/react";

export function AuthUserMenu() {
  const { data } = useSession();
  if (!data?.user) return null;
  return <div className="flex items-center gap-2">{data.user.image ? <img src={data.user.image} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" /> : null}<button type="button" onClick={() => void signOut({ callbackUrl: "/login" })} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">ออกระบบ</button></div>;
}
