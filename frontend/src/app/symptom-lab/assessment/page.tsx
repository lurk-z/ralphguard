"use client";

import dynamic from "next/dynamic";

const SymptomFaceCanvas = dynamic(
  () => import("../../../components/SymptomFaceCanvas").then((module) => module.SymptomFaceCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 grid place-items-center bg-[#f4f1ee] text-sm text-slate-400">
        กำลังโหลดระบบจำลองอาการ…
      </div>
    ),
  },
);

const TEST_LAYERS = [
  { key: "skin", label: "ระคายเคืองผิว", score: 68, color: "#ef4444", band: "high" },
  { key: "eye", label: "ระคายเคืองตา", score: 42, color: "#f59e0b", band: "moderate" },
  { key: "sens", label: "แพ้ผิวหนัง", score: 58, color: "#ec4899", band: "high" },
  { key: "acute", label: "พิษเฉียบพลัน", score: 20, color: "#8b5cf6", band: "low" },
];

export default function AssessmentSymptomHarnessPage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#f4f1ee]">
      <SymptomFaceCanvas
        layers={TEST_LAYERS}
        armed
        productName="สูตรทดสอบระบบอาการ"
        background="#f4f1ee"
      />
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
        Test harness: skin 68 · eye 42 · sensitization 58 · acute 20
      </div>
    </main>
  );
}
