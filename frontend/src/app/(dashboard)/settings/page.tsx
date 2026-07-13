"use client";

// Account Settings — profile, security, and account actions. UI only (local
// state); no backend wiring yet. Uses the shared white DashboardShell.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import DashboardShell from "@/components/layout/DashboardShell";

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-5">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState("Thanakhon O.");
  const [email, setEmail] = useState("thanakhon@example.com");
  const [org, setOrg] = useState("RalphGuard Team");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <DashboardShell title="ตั้งค่าบัญชี" subtitle="จัดการโปรไฟล์และความปลอดภัยของบัญชีคุณ">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6 lg:px-8">
        {/* Profile */}
        <SettingsCard title="โปรไฟล์" description="ข้อมูลนี้จะแสดงในรายงานและทั่วทั้งแอป">
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              TS
            </span>
            <Button variant="outline" className="h-10">
              เปลี่ยนรูปโปรไฟล์
            </Button>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="s-name" className="text-sm font-medium text-foreground">
                ชื่อ-นามสกุล
              </Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 bg-background" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-email" className="text-sm font-medium text-foreground">
                อีเมล
              </Label>
              <Input
                id="s-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-background"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="s-org" className="text-sm font-medium text-foreground">
                องค์กร / ทีม
              </Label>
              <Input id="s-org" value={org} onChange={(e) => setOrg(e.target.value)} className="h-11 bg-background" />
            </div>
          </div>

          <Separator className="my-6" />
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-primary">บันทึกแล้ว</span>}
            <Button className="h-11 px-6" onClick={save}>
              บันทึกการเปลี่ยนแปลง
            </Button>
          </div>
        </SettingsCard>

        {/* Security */}
        <SettingsCard title="ความปลอดภัย" description="จัดการรหัสผ่านและการเข้าสู่ระบบ">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-secondary text-foreground">
                <KeyRound className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">รหัสผ่าน</p>
                <p className="text-xs text-muted-foreground">เปลี่ยนรหัสผ่านของบัญชีคุณ</p>
              </div>
            </div>
            <Button variant="outline" className="h-10 shrink-0">
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </SettingsCard>

        {/* Danger zone — visually separated */}
        <SettingsCard title="โซนอันตราย" description="การกระทำเหล่านี้ไม่สามารถย้อนกลับได้">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-secondary text-foreground">
                  <LogOut className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">ออกจากระบบ</p>
                  <p className="text-xs text-muted-foreground">ออกจากบัญชีในอุปกรณ์นี้</p>
                </div>
              </div>
              <Button variant="outline" className="h-10 shrink-0" onClick={() => router.push("/login")}>
                ออกจากระบบ
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
                  <Trash2 className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">ลบบัญชี</p>
                  <p className="text-xs text-muted-foreground">ลบบัญชีและข้อมูลทั้งหมดอย่างถาวร</p>
                </div>
              </div>
              <Button
                className="h-10 shrink-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                ลบบัญชี
              </Button>
            </div>
          </div>
        </SettingsCard>
      </div>
    </DashboardShell>
  );
}
