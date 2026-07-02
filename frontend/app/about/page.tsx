import SiteNav from "../../components/SiteNav";
import SiteFooter from "../../components/SiteFooter";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-ink text-ink2">
      <SiteNav active="/about" />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-display font-bold">เกี่ยวกับโครงการ</h1>
        <p className="mt-3 text-ink2/70 leading-relaxed">
          <strong className="text-brand">RalphGuard</strong> คือระบบประเมินความเสี่ยงการระคายเคืองและความเป็นพิษของสารเคมี
          ด้วยแบบจำลองคอมพิวเตอร์ (in-silico) เพื่อช่วยคัดกรองสารที่มีความเสี่ยงสูงก่อนเข้าสู่การทดสอบจริง
          และสนับสนุนแนวคิดการลดการพึ่งพาการทดลองในสัตว์โดยไม่จำเป็น
        </p>

        <section className="mt-8 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-panel p-5 shadow-card">
            <div className="font-semibold mb-1">วัตถุประสงค์</div>
            <ul className="text-sm text-ink2/70 list-disc list-inside space-y-1">
              <li>คัดกรองความเสี่ยงเบื้องต้นจากโครงสร้างโมเลกุล</li>
              <li>สื่อสารผลเชิงภาพที่เข้าใจง่าย (3D + แดชบอร์ด)</li>
              <li>ลดการพึ่งพาการทดลองในสัตว์</li>
              <li>เป็นสื่อการเรียนรู้ด้าน chemical safety &amp; QSAR</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-panel p-5 shadow-card">
            <div className="font-semibold mb-1">ขอบเขต 4 endpoint</div>
            <ul className="text-sm text-ink2/70 list-disc list-inside space-y-1">
              <li>Skin Irritation — การระคายเคืองผิวหนัง</li>
              <li>Eye Irritation — การระคายเคืองดวงตา</li>
              <li>Skin Sensitization — การแพ้สัมผัส</li>
              <li>Acute Toxicity — ความเป็นพิษเฉียบพลัน</li>
            </ul>
          </div>
        </section>

        <h2 className="mt-10 text-xl font-display font-bold">ทีมผู้พัฒนา</h2>
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-panel p-5 shadow-card">
            <div className="w-12 h-12 grid place-items-center rounded-full bg-brand text-white font-display font-bold text-lg">
              ส
            </div>
            <div className="mt-3 font-semibold">นายสุรวิทย์ สุขเจริญ</div>
            <div className="text-sm text-brand">หัวหน้าโครงการ</div>
            <div className="mt-1 text-sm text-ink2/60">
              สาขาวิชาเทคโนโลยีสารสนเทศ · พัฒนาเว็บแอป, ออกแบบแดชบอร์ด, ฐานข้อมูล, API, data visualization
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-panel p-5 shadow-card">
            <div className="w-12 h-12 grid place-items-center rounded-full bg-accent text-white font-display font-bold text-lg">
              ธ
            </div>
            <div className="mt-3 font-semibold">นายธนกรณ์ อ่อนกลั่น</div>
            <div className="text-sm text-brand">ผู้ร่วมพัฒนา</div>
            <div className="mt-1 text-sm text-ink2/60">
              สนับสนุนการออกแบบระบบ, การทดสอบ, การจัดเตรียมข้อมูลตัวอย่าง และเอกสารประกอบโครงการ
            </div>
          </div>
        </div>

        <h2 className="mt-10 text-xl font-display font-bold">สังกัด &amp; ทุนสนับสนุน</h2>
        <div className="mt-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-5">
          <p className="text-sm text-ink2/80 leading-relaxed">
            ภาควิชาเทคโนโลยีสารสนเทศ คณะเทคโนโลยีและการจัดการอุตสาหกรรม
            <strong> มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ (KMUTNB)</strong> · ปีการศึกษา 2568
          </p>
          <p className="mt-2 text-sm text-ink2/80 leading-relaxed">
            โครงการนี้ได้รับทุนอุดหนุนการทำกิจกรรมส่งเสริมและสนับสนุนการวิจัยและนวัตกรรมจาก
            <strong> สำนักงานการวิจัยแห่งชาติ (NRCT)</strong> และ
            <strong> สำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ (NSTDA)</strong>
          </p>
          <p className="mt-2 text-xs text-ink2/50 italic">
            “This research and innovation activity is funded by National Research Council of Thailand (NRCT)
            and National Science and Technology Development Agency (NSTDA).”
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
