import Link from "next/link";

const FEATURES = [
  { icon: "🧪", title: "ผสมสูตร", body: "กรอกสาร, SMILES หรือสุ่มจากคลังตัวอย่าง" },
  { icon: "🎯", title: "เลือกบริเวณ", body: "ทดสอบบนกายวิภาค 3 มิติ แบบโต้ตอบ" },
  { icon: "⏱️", title: "Day 1 / 3 / 7", body: "แนวโน้มความเสี่ยงเชิงเวลา" },
  { icon: "🛡️", title: "Confidence", body: "ความน่าเชื่อถือ 3 ชั้นตาม OECD" },
];

const ENDPOINTS = [
  { label: "ระคายเคืองผิว", tg: "OECD TG 404/439" },
  { label: "ระคายเคืองตา", tg: "OECD TG 405/492" },
  { label: "แพ้สัมผัส", tg: "OECD TG 429/442" },
  { label: "พิษเฉียบพลัน", tg: "OECD TG 420" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="flex flex-col items-center pt-16 pb-12 text-center sm:pt-24">
        <div className="animate-fade-in badge mb-6 border-brand/40 bg-brand/10 text-brand">
          NSC 2026 · CATEGORY 14
        </div>

        <h1 className="animate-fade-up font-display text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
          Ralph<span className="gradient-text">Guard</span>
        </h1>

        <p className="animate-fade-up mt-4 max-w-2xl text-lg text-gray-300 [animation-delay:60ms]">
          In-silico Irritation &amp; Toxicity Risk Screening
        </p>
        <p className="animate-fade-up mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-gray-500 [animation-delay:120ms]">
          ประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลอง QSAR
          เพื่อลดการพึ่งพาการทดลองในสัตว์
        </p>

        <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
          <Link href="/assess" className="btn-primary text-base">
            เริ่มประเมิน →
          </Link>
          <Link href="/models" className="btn-ghost">
            ดูความน่าเชื่อถือของโมเดล
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="card card-hover animate-fade-up p-5 text-left"
            style={{ animationDelay: `${220 + i * 60}ms` }}
          >
            <div className="text-3xl">{f.icon}</div>
            <div className="mt-3 font-semibold">{f.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-500">{f.body}</div>
          </div>
        ))}
      </section>

      {/* Endpoints strip */}
      <section className="card mt-6 animate-fade-up p-6 [animation-delay:480ms]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">4 Endpoints ที่ทำนาย</h2>
          <span className="text-xs text-gray-500">Random Forest · Morgan FP 2048-bit</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ENDPOINTS.map((e) => (
            <div
              key={e.label}
              className="rounded-lg border border-border/70 bg-elevated/50 p-4"
            >
              <div className="font-medium">{e.label}</div>
              <div className="mt-1 font-mono text-[11px] text-brand/80">{e.tg}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 mb-4 text-center text-xs text-gray-600">
        ⚠️ ผลจากแบบจำลองคอมพิวเตอร์ · ไม่ใช่การทดสอบทางคลินิก
      </p>
    </main>
  );
}
