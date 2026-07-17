import { ArrowUp, Bot, Check, FlaskConical, Mic, ShieldCheck, Volume2 } from 'lucide-react'

function Composer() {
  return (
    <div className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 shadow-sm">
      <Mic className="size-3.5 text-slate-500" />
      <span className="min-w-0 flex-1 truncate text-[9px] text-slate-400">พิมพ์ข้อความ…</span>
      <span className="grid size-6 place-items-center rounded-full bg-brand text-white">
        <ArrowUp className="size-3.5" />
      </span>
    </div>
  )
}

function AssistantHeader({ step }: { step: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
      <span className="grid size-5 place-items-center rounded-md bg-teal-50 text-[9px] font-bold text-brand">{step}</span>
      <span className="text-[10px] font-semibold text-slate-600">ผู้ช่วย AI</span>
      <Volume2 className="ml-auto size-3 text-slate-500" />
    </div>
  )
}

export default function AIAssistantShowcase() {
  return (
    <div className="relative h-[min(70vh,650px)] w-[min(92vw,780px)]">
      <div className="pointer-events-none absolute left-[28%] top-[25%] h-px w-[35%] origin-left bg-gradient-to-r from-brand/10 via-brand/60 to-brand/10" data-ai-flow />
      <div className="pointer-events-none absolute left-[48%] top-[48%] h-[26%] w-px origin-top bg-gradient-to-b from-brand/60 to-brand/10" data-ai-flow />

      <section
        data-ai-card
        className="absolute left-0 top-0 z-10 flex h-[300px] w-[43%] flex-col overflow-hidden rounded-2xl border border-white/55 bg-white/95 text-slate-800 shadow-[0_22px_60px_rgba(2,20,24,.24)] ring-1 ring-slate-950/10 backdrop-blur"
      >
        <AssistantHeader step="1" />
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <span className="grid size-10 place-items-center rounded-2xl bg-slate-100 text-slate-500">
            <Bot className="size-4" />
          </span>
          <div className="mt-3 text-sm font-semibold">ฉันคือ AI ผู้ช่วยคุณ</div>
          <div className="mt-1 text-[10px] text-slate-400">วันนี้จะให้ช่วยอะไรดี?</div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {['สรุปผล', 'เสี่ยงสุด', 'คำแนะนำ'].map((label) => (
              <span key={label} className="rounded-full border border-slate-200 px-2.5 py-1 text-[8px] text-slate-500">{label}</span>
            ))}
          </div>
        </div>
        <div className="p-3"><Composer /></div>
      </section>

      <section
        data-ai-card
        className="absolute right-0 top-12 z-20 flex h-[320px] w-[44%] flex-col overflow-hidden rounded-2xl border border-white/55 bg-white/95 text-slate-800 shadow-[0_22px_60px_rgba(2,20,24,.28)] ring-1 ring-slate-950/10 backdrop-blur"
      >
        <AssistantHeader step="2" />
        <div className="flex-1 space-y-2 overflow-hidden px-3 py-2.5">
          <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-sm bg-brand px-3 py-2 text-[9px] font-medium text-white">
            สร้างสูตรเจลล้างมือแบบฆ่าเชื้อ
          </div>
          <div className="rounded-2xl rounded-tl-sm bg-slate-100 p-3 text-[9px] leading-relaxed text-slate-600">
            จัดให้แล้วค่ะ สูตรเจลล้างมือมี Glycerin 10% เพื่อความชุ่มชื้น และ Ethanol 60% เพื่อความสะอาด กด Run ประเมินดูได้เลยค่ะ
            <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold text-amber-800">
                <ShieldCheck className="size-3.5" />
                ตรวจสอบก่อนให้ AI แก้ workspace
              </div>
              <div className="mt-1 text-[8px] text-amber-700">1. สร้างสูตร “เจลล้างมือ”</div>
              <div className="mt-2 flex gap-1.5">
                <span data-ai-confirm className="flex flex-1 items-center justify-center rounded-lg bg-brand px-2 py-1.5 text-[8px] font-semibold text-white">
                  ยืนยันการเปลี่ยนแปลง
                </span>
                <span className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-[8px] text-amber-700">ยกเลิก</span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-3 pt-0"><Composer /></div>
      </section>

      <section
        data-ai-card
        className="absolute bottom-0 left-[14%] z-30 h-[270px] w-[58%] overflow-hidden rounded-2xl border border-white/55 bg-white/95 text-slate-800 shadow-[0_24px_70px_rgba(2,20,24,.3)] ring-1 ring-slate-950/10 backdrop-blur"
      >
        <div className="grid h-full grid-cols-[38%_62%]">
          <div className="border-r border-slate-200">
            <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold">การประเมินสารเคมี</div>
            <div className="px-3 pt-3 text-[8px] text-slate-400">สูตรที่สร้าง</div>
            <div className="m-2 rounded-xl border border-slate-200 p-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="size-3.5 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-semibold">สูตร A</div>
                  <div className="text-[7px] text-slate-400">ครีม / โลชั่น</div>
                </div>
                <span className="text-[7px] text-slate-400">2 สาร</span>
              </div>
            </div>
            <div className="m-2 rounded-xl border border-brand bg-teal-50 p-2 shadow-sm">
              <div className="flex items-center gap-2">
                <FlaskConical className="size-3.5 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[9px] font-semibold text-brand-dark">เจลล้างมือ</div>
                  <div className="text-[7px] text-slate-400">สร้างโดย AI</div>
                </div>
                <Check className="size-3 text-brand" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <span className="grid size-5 place-items-center rounded-md bg-teal-50 text-[9px] font-bold text-brand">3</span>
              <div>
                <div className="text-[10px] font-semibold">ส่วนผสมของสูตร</div>
                <div className="text-[7px] text-slate-400">เจลล้างมือ · 2 สาร</div>
              </div>
            </div>
            <div className="space-y-1.5 p-3">
              {[
                ['Water (Aqua)', 'สมดุลสูตรอัตโนมัติ', '30%'],
                ['Ethanol', 'CCO', '60%'],
                ['Glycerin', 'OCC(O)CO', '10%'],
              ].map(([name, smiles, amount], index) => (
                <div key={name} className={`rounded-xl border p-2 ${index === 0 ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <span className="text-brand">◇</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                    <span className="font-mono tabular-nums text-slate-600">{amount}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[7px] text-slate-400">{smiles}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
