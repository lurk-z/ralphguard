import Image from "next/image";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { authOptions } from "@/lib/auth";

export default async function LoginPage() {
  if (await getServerSession(authOptions)) redirect("/projects");
  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,hsl(174_70%_93%),white_55%)] px-4"><section className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-teal-950/10"><div className="mb-7 text-center"><Image src="/icons/logo.png" alt="RalphGuard" width={64} height={64} priority className="mx-auto mb-4 size-16 object-contain"/><h1 className="font-display text-2xl font-bold text-slate-900">เข้าสู่ระบบ RalphGuard</h1><p className="mt-2 text-sm leading-6 text-slate-500">เก็บโปรเจกต์ สูตร และผลประเมินแยกตามบัญชีของคุณ</p></div><GoogleSignInButton/><p className="mt-5 text-center text-xs leading-5 text-slate-400">ใช้บัญชี Google เพื่อยืนยันตัวตนอย่างปลอดภัย</p></section></main>;
}
