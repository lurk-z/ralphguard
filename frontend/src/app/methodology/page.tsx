import Link from "next/link";
import SiteNav from "../../components/SiteNav";
import SiteFooter from "../../components/SiteFooter";

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-ink text-ink2">
      <SiteNav active="/methodology" />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-display font-bold">วิธีการ &amp; โมเดล AI</h1>
        <p className="mt-3 text-ink2/70 leading-relaxed">
          RalphGuard ใช้แนวทาง QSAR (Quantitative Structure–Activity Relationship) ผสานกับกฎเชิงโครงสร้าง
          และระบบประเมินความน่าเชื่อถือ ตามหลักการ OECD QSAR 5 ข้อ
        </p>

        {/* pipeline */}
        <h2 className="mt-8 text-xl font-display font-bold">ขั้นตอนการประมวลผล</h2>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {[
            ["1. เตรียมข้อมูล", "canonicalize SMILES (RDKit), strip-salt, ลบ duplicate"],
            ["2. Featurization", "Morgan/ECFP (2048) + MACCS (167) + descriptors (10) — เลือกชุดต่อ endpoint"],
            ["3. โมเดล Ensemble v2", "soft-voting: RandomForest + ExtraTrees + LogReg + HistGB (balanced)"],
            ["4. Operating threshold", "เลือกจุดตัดด้วย Youden's J (nested CV) เพื่อเน้นจับ hazard"],
            ["5. Mixture & timecourse", "รวมความเสี่ยงระดับสูตร + กาง Day 1/3/7 ตามบริเวณ"],
            ["6. Confidence", "Applicability Domain + ensemble uncertainty + structural alerts"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-border bg-panel p-4 shadow-card">
              <div className="font-semibold text-sm">{t}</div>
              <div className="mt-1 text-sm text-ink2/60">{d}</div>
            </div>
          ))}
        </div>

        {/* OECD */}
        <h2 className="mt-10 text-xl font-display font-bold">หลักการ OECD QSAR 5 ข้อ</h2>
        <ol className="mt-3 space-y-2 text-sm text-ink2/75">
          {[
            "Defined endpoint — ระบุปลายทางที่ทำนายชัดเจน (4 endpoint)",
            "Unambiguous algorithm — อัลกอริทึมชัดเจน (RF/ensemble บน fingerprint)",
            "Defined applicability domain — k-NN Tanimoto บอกขอบเขตที่เชื่อถือได้",
            "Goodness-of-fit / robustness / predictivity — 5-fold CV + held-out + external set",
            "Mechanistic interpretation — structural alerts (SMARTS) ที่ตีความได้",
          ].map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-brand font-bold">{i + 1}.</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>

        {/* uncertainty */}
        <h2 className="mt-10 text-xl font-display font-bold">การประเมินความไม่แน่นอน (3 ชั้น)</h2>
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          {[
            ["Layer 1 — Applicability Domain", "สารอยู่ในขอบเขตของข้อมูลที่เรียนรู้หรือไม่ (in/out of domain)"],
            ["Layer 2 — Probability & disagreement", "ความชัดของค่าทำนาย + ความไม่เห็นพ้องของโมเดลในชุด (ensemble std)"],
            ["Layer 3 — Structural alerts", "กฎเชิงโครงสร้าง (SMARTS) สอดคล้องกับผลโมเดลไหม"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-border bg-panel2 p-4">
              <div className="font-semibold text-sm text-brand-dark">{t}</div>
              <div className="mt-1 text-sm text-ink2/65">{d}</div>
            </div>
          ))}
        </div>

        {/* honesty */}
        <div className="mt-10 rounded-2xl border border-border bg-panel p-5 shadow-card">
          <div className="font-semibold">ความซื่อสัตย์ของผล &amp; ข้อจำกัด</div>
          <p className="mt-2 text-sm text-ink2/70 leading-relaxed">
            ชุดข้อมูลมีขนาดเล็ก (~144 สาร/endpoint) และไม่สมดุล (positive ~20–24%)
            จึงรายงานผลด้วย Balanced Accuracy / Sensitivity / MCC / ROC-AUC ไม่ใช่ Accuracy ตัวเดียว
            ผลทั้งหมดเป็นการคัดกรองเชิง in-silico — ไม่ใช่การทดสอบในห้องปฏิบัติการ
            ดูตัวเลขจริงได้ที่หน้า{" "}
            <Link href="/models" className="text-brand font-semibold hover:underline">
              ความน่าเชื่อถือ
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
