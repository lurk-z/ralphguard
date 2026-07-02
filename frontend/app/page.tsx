import Link from "next/link";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";

export default function Home() {
  return (
    <div className="min-h-screen bg-ink text-ink2">
      <SiteNav active="/" />

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-mono text-brand-dark bg-brand-soft border border-brand/30">
              NSC 2026 · หมวด 14 · KMUTNB
            </span>
            <h1 className="mt-4 text-4xl md:text-5xl font-display font-bold leading-tight">
              ประเมินความเสี่ยงสารเคมี<br />
              <span className="text-brand">ด้วย AI</span> โดยไม่ต้องทดลองในสัตว์
            </h1>
            <p className="mt-4 text-base text-ink2/70 leading-relaxed">
              RalphGuard คัดกรองความเสี่ยงการระคายเคืองผิวหนัง/ดวงตา การแพ้สัมผัส และความเป็นพิษเฉียบพลัน
              จากโครงสร้างโมเลกุล แสดงผลบนแบบจำลองกายวิภาค 3 มิติ พร้อมแนวโน้ม Day 1/3/7
              และระดับความน่าเชื่อถือ
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/assess"
                className="px-6 py-3 rounded-xl bg-brand text-white font-semibold shadow-soft hover:bg-brand-dark transition"
              >
                เริ่มประเมิน →
              </Link>
              <Link
                href="/how-to"
                className="px-6 py-3 rounded-xl border border-border bg-panel text-ink2 font-semibold hover:border-brand hover:text-brand transition"
              >
                ดูวิธีใช้งาน
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink2/50">
              ⚠️ เครื่องมือคัดกรองเบื้องต้น — ไม่ใช่การทดสอบทางคลินิก
            </p>
          </div>

          {/* hero card preview */}
          <div className="relative">
            <div className="rounded-2xl border border-border bg-panel shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-display font-semibold">ตัวอย่างผลการประเมิน</span>
                <span className="text-xs font-mono text-ink2/50">Day 3</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: "ระคายผิว", v: 62, c: "bg-risk-mod" },
                  { l: "ระคายตา", v: 28, c: "bg-risk-low" },
                  { l: "แพ้สัมผัส", v: 81, c: "bg-risk-high" },
                  { l: "พิษเฉียบพลัน", v: 15, c: "bg-risk-low" },
                ].map((e) => (
                  <div key={e.l} className="rounded-xl bg-panel2 p-3">
                    <div className="text-xs text-ink2/60">{e.l}</div>
                    <div className="text-2xl font-display font-bold">
                      {e.v}
                      <span className="text-sm text-ink2/40">/100</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-elevated overflow-hidden">
                      <div className={`h-full ${e.c}`} style={{ width: `${e.v}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand-dark border border-brand/30">
                  Confidence: Medium
                </span>
                <span className="text-ink2/50">k-NN AD + ensemble</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-center text-2xl font-display font-bold mb-2">ทำอะไรได้บ้าง</h2>
        <p className="text-center text-sm text-ink2/60 mb-8">ครบตั้งแต่กรอกสาร จนถึงผลเชิงภาพที่เข้าใจง่าย</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { i: "🧪", t: "ผสมสูตร", d: "กรอกชื่อสาร / SMILES / CSV พร้อม % ความเข้มข้น" },
            { i: "🧍", t: "กายวิภาค 3 มิติ", d: "เลือกบริเวณทดสอบ + ดูความเสี่ยงเชิงภาพ Day 1/3/7" },
            { i: "📊", t: "4 endpoint", d: "ระคายผิว/ตา · แพ้สัมผัส · พิษเฉียบพลัน + กราฟแนวโน้ม" },
            { i: "🛡️", t: "ความน่าเชื่อถือ", d: "Applicability Domain + uncertainty 3 ชั้น + structural alerts" },
          ].map((f) => (
            <div
              key={f.t}
              className="rounded-2xl border border-border bg-panel p-5 shadow-card hover:border-brand/40 transition"
            >
              <div className="text-3xl">{f.i}</div>
              <div className="mt-2 font-semibold">{f.t}</div>
              <div className="mt-1 text-sm text-ink2/60 leading-relaxed">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="bg-panel2 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-center text-2xl font-display font-bold mb-8">ทำงานอย่างไร</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { n: 1, t: "กรอกสาร", d: "ใส่ SMILES หรือสุ่มจากคลัง + เลือกบริเวณ" },
              { n: 2, t: "วิเคราะห์โมเลกุล", d: "RDKit + Morgan/MACCS + descriptors" },
              { n: 3, t: "ประเมินด้วย QSAR", d: "Ensemble v2 + applicability domain" },
              { n: 4, t: "แสดงผล 3 มิติ", d: "ระดับเสี่ยง + Day 1/3/7 + รายงาน PDF" },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl bg-panel border border-border p-5 shadow-card">
                <div className="w-9 h-9 grid place-items-center rounded-full bg-brand text-white font-display font-bold">
                  {s.n}
                </div>
                <div className="mt-3 font-semibold">{s.t}</div>
                <div className="mt-1 text-sm text-ink2/60">{s.d}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/methodology" className="text-brand font-semibold hover:underline">
              ดูรายละเอียดวิธีการ &amp; โมเดล AI →
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-display font-bold">พร้อมคัดกรองสารของคุณแล้วหรือยัง?</h2>
        <p className="mt-2 text-ink2/60">ลดการทดลองในสัตว์ ด้วยการคัดกรองด้วยคอมพิวเตอร์ในขั้นต้น</p>
        <Link
          href="/assess"
          className="inline-block mt-6 px-8 py-3.5 rounded-xl bg-brand text-white font-semibold shadow-soft hover:bg-brand-dark transition"
        >
          เริ่มประเมินเลย →
        </Link>
      </section>

      <SiteFooter />
    </div>
  );
}
