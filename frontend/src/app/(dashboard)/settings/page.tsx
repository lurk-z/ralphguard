"use client";

// Account Settings — profile only: avatar, full name, and sign out.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import DashboardShell from "@/components/layout/DashboardShell";

export default function SettingsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("Thanakhon O.");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
  };

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <DashboardShell breadcrumbs={[{ label: "ตั้งค่าบัญชี" }]}>
      <div className="flex min-h-full items-start justify-center px-6 py-10 lg:px-8">
        <div className="w-full max-w-md space-y-8">

          {/* ── Avatar ── */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="size-24 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <span className="grid size-24 place-items-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground ring-2 ring-border">
                  {initials || <UserRound className="size-8" />}
                </span>
              )}
              {/* Camera overlay button */}
              <button
                type="button"
                aria-label="เปลี่ยนรูปโปรไฟล์"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-secondary"
              >
                <Camera className="size-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">คลิกที่ไอคอนกล้องเพื่อเปลี่ยนรูป</p>
          </div>

          {/* ── Name field ── */}
          <div className="space-y-1.5">
            <Label htmlFor="s-name" className="text-sm font-medium">
              ชื่อ-นามสกุล
            </Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="กรอกชื่อ-นามสกุล"
              className="h-11 bg-background"
            />
          </div>

          {/* ── Save button ── */}
          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="text-sm text-primary">บันทึกแล้ว ✓</span>
            )}
            <Button className="h-11 px-6" onClick={save}>
              บันทึกการเปลี่ยนแปลง
            </Button>
          </div>

          <Separator />

          {/* ── Sign out ── */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-secondary text-foreground">
                <LogOut className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">ออกจากระบบ</p>
                <p className="text-xs text-muted-foreground">ออกจากบัญชีในอุปกรณ์นี้</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => router.push("/login")}
            >
              ออกจากระบบ
            </Button>
          </div>

        </div>
      </div>
    </DashboardShell>
  );
}
