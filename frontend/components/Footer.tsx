export default function Footer() {
  return (
    <footer className="border-t border-border/60 print:hidden">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="font-display font-semibold">
              Ralph<span className="text-brand">Guard</span>
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-xs">In-silico Irritation &amp; Toxicity Screening</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="badge border-brand/30 bg-brand/10 text-brand">
              NSC 2026 · หมวด 14
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-600">
          ⚠️ ผลทั้งหมดมาจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เพื่อการคัดกรองเบื้องต้นเท่านั้น
          ไม่ใช่การทดสอบทางคลินิกหรือทดแทนการประเมินโดยผู้เชี่ยวชาญ
        </p>
      </div>
    </footer>
  );
}
