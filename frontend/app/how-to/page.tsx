import Link from "next/link";
import SiteNav from "../../components/SiteNav";
import SiteFooter from "../../components/SiteFooter";

const STEPS = [
  {
    n: 1,
    t: "กรอกสาร / สูตรผลิตภัณฑ์",
    d: "พิมพ์ชื่อสาร + SMILES และ % ความเข้มข้น ในหน้า “ประเมิน” สามารถกด 🎲 สุ่มสารจากคลัง หรือเพิ่มหลายสารเพื่อจำลองสูตรผสมได้ ระบบจะตรวจ SMILES ด้วย RDKit ทันที (✓ canonical + MW)",
  },
  {
    n: 2,
    t: "เลือกบริเวณทดสอบบนโมเดล 3 มิติ",
    d: "คลิกบริเวณบนหุ่น (ใบหน้า / ดวงตา / ท่อนแขน / มือ) หรือเลือกจากปุ่ม — บริเวณที่เลือกจะถูกใช้ปรับค่าความไวเชิงพื้นที่",
  },
  {
    n: 3,
    t: "กดประเมิน",
    d: "ระบบส่งงานเข้า worker คำนวณ QSAR ทั้ง 4 endpoint แล้วรวมเป็นความเสี่ยงระดับสูตร พร้อมกาง Day 1 / 3 / 7",
  },
  {
    n: 4,
    t: "อ่านผล + เลือกช่วงเวลา",
    d: "ดูการ์ดคะแนน 4 endpoint + กราฟแนวโน้ม กดปุ่ม Day 1/3/7 เพื่อให้หุ่น 3 มิติเปลี่ยนสีตามความเสี่ยงของแต่ละวัน",
  },
  {
    n: 5,
    t: "ตรวจความน่าเชื่อถือ",
    d: "ดู badge Confidence (High/Medium/Low) + ตาราง uncertainty (ความไม่เห็นพ้องของโมเดล) + Applicability Domain ว่าสารอยู่ในขอบเขตที่เชื่อถือได้ไหม + structural alerts",
  },
  {
    n: 6,
    t: "บันทึก / พิมพ์รายงาน",
    d: "กด “พิมพ์ / บันทึก PDF” เพื่อออกรายงานสรุป — งานจะถูกเก็บในหน้า “ประวัติ” ให้เปิดดูย้อนหลังได้",
  },
];

export default function HowToPage() {
  return (
    <div className="min-h-screen bg-ink text-ink2">
      <SiteNav active="/how-to" />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-display font-bold">วิธีใช้งาน</h1>
        <p className="mt-3 text-ink2/70">ทำตาม 6 ขั้นตอน ตั้งแต่กรอกสารจนถึงออกรายงาน</p>

        <ol className="mt-8 space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4 rounded-2xl border border-border bg-panel p-5 shadow-card">
              <div className="shrink-0 w-9 h-9 grid place-items-center rounded-full bg-brand text-white font-display font-bold">
                {s.n}
              </div>
              <div>
                <div className="font-semibold">{s.t}</div>
                <div className="mt-1 text-sm text-ink2/70 leading-relaxed">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-2xl border border-brand/30 bg-brand-soft/60 p-5 text-sm text-ink2/80">
          💡 <strong>เคล็ดลับ:</strong> ถ้า Confidence ขึ้น “Low” หรือ AD บอก out-of-domain
          แปลว่าสารอยู่นอกขอบเขตข้อมูลที่โมเดลเรียนรู้ — ผลทำนายมีความไม่แน่นอนสูง ควรตีความอย่างระมัดระวัง
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/assess"
            className="inline-block px-6 py-3 rounded-xl bg-brand text-white font-semibold shadow-soft hover:bg-brand-dark transition"
          >
            ลองใช้งานเลย →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
