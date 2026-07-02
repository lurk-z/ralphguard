"use client";

import dynamic from "next/dynamic";

// WebGL + shader — client-only (no SSR).
const FaceIrritationModel = dynamic(
  () => import("../../components/FaceIrritationModel"),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[70vh] min-h-[420px] w-full place-items-center rounded-lg border border-border bg-[#141414] text-sm text-gray-400">
        กำลังโหลดโมเดล 3 มิติ…
      </div>
    ),
  },
);

export default function SkinViewerPage() {
  return (
    <main className="min-h-screen max-w-5xl mx-auto p-6">
      <nav className="flex gap-4 text-sm mb-3">
        <a href="/" className="text-ink2/65 hover:text-brand">หน้าแรก</a>
        <a href="/assess" className="text-ink2/65 hover:text-brand">ประเมิน</a>
        <a href="/skin-viewer" className="text-brand">โมเดลผิว 3 มิติ</a>
        <a href="/history" className="text-ink2/65 hover:text-brand">ประวัติ</a>
        <a href="/models" className="text-ink2/65 hover:text-brand">โมเดล &amp; ความน่าเชื่อถือ</a>
      </nav>

      <header className="mb-5">
        <h1 className="text-2xl font-display font-semibold">โมเดลผิว 3 มิติ — จำลองการระคายเคือง</h1>
        <p className="text-xs text-ink2/55 mt-1">
          จำลองรอยแดง (erythema) และตุ่มผื่นบนผิวจริงตามระดับความรุนแรง · ลากเพื่อหมุน
        </p>
      </header>

      <FaceIrritationModel />

      <p className="text-xs text-ink2/55 mt-4 pt-4 border-t border-border">
        ⚠️ ภาพจำลองเชิงทัศน์จากคะแนนความเสี่ยง (in-silico) ไม่ใช่ภาพทางการแพทย์จริง
      </p>
    </main>
  );
}
