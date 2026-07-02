import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-panel2 print:hidden">
      <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-ink2/70">
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="font-display font-bold text-ink2 mb-1">
              Ralph<span className="text-brand">Guard</span>
            </div>
            <p className="text-xs leading-relaxed">
              ระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมีด้วยแบบจำลองคอมพิวเตอร์
              เพื่อลดการพึ่งพาการทดลองในสัตว์
            </p>
          </div>
          <div>
            <div className="font-semibold text-ink2 mb-1">เมนู</div>
            <ul className="space-y-1 text-xs">
              <li><Link href="/assess" className="hover:text-brand">ประเมินความเสี่ยง</Link></li>
              <li><Link href="/how-to" className="hover:text-brand">วิธีใช้งาน</Link></li>
              <li><Link href="/methodology" className="hover:text-brand">วิธีการ & AI</Link></li>
              <li><Link href="/about" className="hover:text-brand">เกี่ยวกับโครงการ</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-ink2 mb-1">ทุนสนับสนุน</div>
            <p className="text-xs leading-relaxed">
              ได้รับทุนอุดหนุนการทำกิจกรรมส่งเสริมและสนับสนุนการวิจัยและนวัตกรรมจาก
              สำนักงานการวิจัยแห่งชาติ (NRCT) และสำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ (NSTDA)
            </p>
            <p className="text-[11px] mt-2 text-ink2/50">
              มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ (KMUTNB) · NSC 2026
            </p>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-border text-[11px] text-ink2/50">
          ⚠️ ผลจากแบบจำลองคอมพิวเตอร์ (in-silico screening) เท่านั้น — ไม่ใช่การทดสอบทางคลินิก
          หรือทดแทนการประเมินโดยผู้เชี่ยวชาญ
        </div>
      </div>
    </footer>
  );
}
