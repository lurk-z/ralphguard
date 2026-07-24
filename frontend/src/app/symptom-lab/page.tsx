"use client";

import dynamic from "next/dynamic";

// WebGL + shader — client-only (no SSR).
const SymptomLabModel = dynamic(
  () => import("../../components/SymptomLabModel"),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 grid place-items-center bg-[#f6f6f6] text-sm text-gray-400">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

export default function SymptomLabPage() {
  return (
    <main className="fixed inset-0 overflow-hidden">
      <SymptomLabModel />
    </main>
  );
}
