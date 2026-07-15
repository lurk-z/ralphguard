"use client";

import { Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";

const STAGES = [
  { at: 0, label: "กำลังเตรียมข้อมูลโปรเจกต์…" },
  { at: 35, label: "กำลังสร้างโปรเจกต์บนระบบ…" },
  { at: 70, label: "กำลังตั้งค่าพื้นที่ทำงาน…" },
  { at: 95, label: "ใกล้เสร็จแล้ว…" },
] as const;

function currentStageLabel(progress: number) {
  let label: string = STAGES[0].label;
  for (const stage of STAGES) {
    if (progress >= stage.at) label = stage.label;
  }
  return label;
}

/** Full-screen overlay shown while a project is being created. */
export default function ProjectCreationProgress({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-md"
    >
      <div className="w-full max-w-xs text-center flex flex-col items-center px-4">

        <Progress value={pct} className="mt-6 h-1 w-full" />

        <p className="mt-4 text-sm font-medium text-muted-foreground">{currentStageLabel(pct)}</p>
      </div>
    </div>
  );
}
