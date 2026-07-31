import type { LucideIcon } from "lucide-react";
import {
  Atom,
  Beaker,
  ClipboardCheck,
  Droplets,
  FlaskConical,
  HeartPulse,
  Leaf,
  Microscope,
  ShieldCheck,
  TestTube2,
} from "lucide-react";

import type { ProjectColorKey, ProjectIconKey } from "@/lib/api";

export type ProjectColorOption = {
  key: ProjectColorKey;
  label: string;
  swatch: string;
  soft: string;
  text: string;
  border: string;
  bar: string;
  glow: string;
};

export const PROJECT_COLORS: ProjectColorOption[] = [
  {
    key: "teal",
    label: "เขียวอมฟ้า",
    swatch: "bg-teal-600",
    soft: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
    bar: "bg-teal-500",
    glow: "hover:shadow-[0_0_16px_rgba(20,184,166,0.16)]",
  },
  {
    key: "cyan",
    label: "ฟ้า",
    swatch: "bg-cyan-600",
    soft: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
    bar: "bg-cyan-500",
    glow: "hover:shadow-[0_0_16px_rgba(6,182,212,0.16)]",
  },
  {
    key: "blue",
    label: "น้ำเงิน",
    swatch: "bg-blue-600",
    soft: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    bar: "bg-blue-500",
    glow: "hover:shadow-[0_0_16px_rgba(59,130,246,0.16)]",
  },
  {
    key: "indigo",
    label: "คราม",
    swatch: "bg-indigo-600",
    soft: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
    bar: "bg-indigo-500",
    glow: "hover:shadow-[0_0_16px_rgba(99,102,241,0.16)]",
  },
  {
    key: "violet",
    label: "ม่วง",
    swatch: "bg-violet-600",
    soft: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
    bar: "bg-violet-500",
    glow: "hover:shadow-[0_0_16px_rgba(139,92,246,0.16)]",
  },
  {
    key: "emerald",
    label: "เขียว",
    swatch: "bg-emerald-600",
    soft: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
    glow: "hover:shadow-[0_0_16px_rgba(16,185,129,0.16)]",
  },
  {
    key: "amber",
    label: "อำพัน",
    swatch: "bg-amber-500",
    soft: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    bar: "bg-amber-500",
    glow: "hover:shadow-[0_0_16px_rgba(245,158,11,0.16)]",
  },
  {
    key: "slate",
    label: "เทา",
    swatch: "bg-slate-600",
    soft: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
    bar: "bg-slate-500",
    glow: "hover:shadow-[0_0_16px_rgba(100,116,139,0.14)]",
  },
  {
    key: "rose",
    label: "กุหลาบ",
    swatch: "bg-rose-600",
    soft: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    bar: "bg-rose-500",
    glow: "hover:shadow-[0_0_16px_rgba(244,63,94,0.15)]",
  },
  {
    key: "orange",
    label: "ส้ม",
    swatch: "bg-orange-500",
    soft: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    bar: "bg-orange-500",
    glow: "hover:shadow-[0_0_16px_rgba(249,115,22,0.15)]",
  },
];

export const PROJECT_ICONS: Array<{
  key: ProjectIconKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "flask", label: "ขวดทดลอง", icon: FlaskConical },
  { key: "beaker", label: "บีกเกอร์", icon: Beaker },
  { key: "test-tube", label: "หลอดทดลอง", icon: TestTube2 },
  { key: "microscope", label: "กล้องจุลทรรศน์", icon: Microscope },
  { key: "shield", label: "ความปลอดภัย", icon: ShieldCheck },
  { key: "droplets", label: "ของเหลว", icon: Droplets },
  { key: "atom", label: "อะตอม", icon: Atom },
  { key: "leaf", label: "สารสกัดธรรมชาติ", icon: Leaf },
  { key: "heart-pulse", label: "ชีวสัญญาณ", icon: HeartPulse },
  { key: "clipboard-check", label: "ตรวจสอบ", icon: ClipboardCheck },
];

export function projectColor(key: ProjectColorKey | null | undefined) {
  return PROJECT_COLORS.find((item) => item.key === key) ?? PROJECT_COLORS[0];
}

export function projectIcon(key: ProjectIconKey | null | undefined) {
  return PROJECT_ICONS.find((item) => item.key === key) ?? PROJECT_ICONS[0];
}
