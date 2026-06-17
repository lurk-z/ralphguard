import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="inline-block mb-6 px-3 py-1 rounded-full text-xs font-mono text-brand border border-brand/40 bg-brand/10">
          NSC 2026 · CATEGORY 14 · DEMO
        </div>
        <h1 className="text-5xl font-display font-bold mb-3">
          Ralph<span className="text-brand">Guard</span>
        </h1>
        <p className="text-lg mb-2 text-gray-300">
          In-silico Irritation &amp; Toxicity Risk Screening
        </p>
        <p className="text-sm text-gray-500 mb-10">
          ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลอง
          คอมพิวเตอร์ เพื่อลดการพึ่งพาการทดลองในสัตว์
        </p>

        <div className="grid grid-cols-2 gap-4 mb-8 text-left">
          <Feature icon="🧪" title="ผสมสูตร" body="กรอกสาร, SMILES หรือ CSV" />
          <Feature icon="🎯" title="เลือกบริเวณ" body="ทดสอบบนกายวิภาค 3 มิติ" />
          <Feature icon="⏱️" title="Day 1 / 3 / 7" body="แนวโน้มเชิงเวลา" />
          <Feature icon="🛡️" title="Confidence" body="ความน่าเชื่อถือ 3 ชั้น" />
        </div>

        <Link
          href="/assess"
          className="inline-block px-6 py-3 rounded-lg bg-brand text-black font-semibold hover:bg-brand/90 transition"
        >
          เริ่มใช้งาน →
        </Link>

        <div className="flex justify-center gap-6 mt-6 text-sm">
          <Link href="/history" className="text-gray-400 hover:text-brand">
            ประวัติการประเมิน
          </Link>
          <Link href="/models" className="text-gray-400 hover:text-brand">
            โมเดล &amp; ความน่าเชื่อถือ
          </Link>
        </div>

        <p className="text-xs text-gray-600 mt-8">
          ⚠️ ผลจากแบบจำลองคอมพิวเตอร์ · ไม่ใช่การทดสอบทางคลินิก
        </p>
      </div>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="p-4 rounded-lg bg-panel border border-border">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-gray-500 mt-1">{body}</div>
    </div>
  );
}
