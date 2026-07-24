import { ArrowUp, Bot, Check, FlaskConical, Mic, ShieldCheck, Volume2 } from 'lucide-react'
import { SemanticIcon } from '@/components/SemanticIcon'

function Composer() {
  return (
    <div className="flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 shadow-sm sm:h-9 sm:gap-2 sm:px-3">
      <Mic className="size-3 text-slate-500 sm:size-3.5" />
      <span className="min-w-0 flex-1 truncate text-[9px] text-slate-400">พิมพ์ข้อความ…</span>
      <span className="grid size-5 place-items-center rounded-full bg-brand text-white sm:size-6">
        <ArrowUp className="size-3 sm:size-3.5" />
      </span>
    </div>
  )
}

function AssistantHeader({ step }: { step: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
      <span className="grid size-4 place-items-center rounded-md bg-teal-50 text-[8px] font-bold text-brand sm:size-5 sm:text-[9px]">{step}</span>
      <span className="text-[9px] font-semibold text-slate-600 sm:text-[10px]">ผู้ช่วย AI</span>
      <Volume2 className="ml-auto size-3 text-slate-500" />
    </div>
  )
}

export default function AIAssistantShowcase() {
  return (
    <div className="relative h-[min(52svh,470px)] min-h-[360px] w-[min(96vw,780px)] sm:h-[min(58svh,560px)] sm:min-h-[430px] sm:w-[min(94vw,780px)] xl:h-[min(70vh,650px)] xl:min-h-0 xl:w-[min(52vw,780px)]">
      <div className="pointer-events-none absolute left-[28%] top-[25%] hidden h-px w-[35%] origin-left bg-gradient-to-r from-brand/10 via-brand/60 to-brand/10 sm:block" data-ai-flow />
      <div className="pointer-events-none absolute left-[48%] top-[48%] hidden h-[26%] w-px origin-top bg-gradient-to-b from-brand/60 to-brand/10 sm:block" data-ai-flow />

      <section
        data-ai-card
        className="absolute left-0 top-0 z-10 flex h-[60%] w-[48%] flex-col overflow-hidden rounded-xl border border-white/55 bg-white/95 text-slate-800 shadow-[0_22px_60px_rgba(2,20,24,.24)] ring-1 ring-slate-950/10 backdrop-blur sm:h-[46%] sm:w-[43%] sm:rounded-2xl"
      >
        <AssistantHeader step="1" />
        <div className="flex flex-1 flex-col items-center justify-center px-2 text-center sm:px-4">
          <span className="grid size-8 place-items-center rounded-xl bg-slate-100 text-slate-500 sm:size-10 sm:rounded-2xl">
            <Bot className="size-3.5 sm:size-4" />
          </span>
          <div className="mt-2 text-[11px] font-semibold sm:mt-3 sm:text-sm">ฉันคือ AI ผู้ช่วยคุณ</div>
          <div className="mt-0.5 text-[8px] text-slate-400 sm:mt-1 sm:text-[10px]">วันนี้จะให้ช่วยอะไรดี?</div>
          <div className="mt-2 flex flex-wrap justify-center gap-1 sm:mt-3 sm:gap-1.5">
            {['สรุปผล', 'เสี่ยงสุด', 'คำแนะนำ'].map((label) => (
              <span key={label} className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[7px] text-slate-500 sm:px-2.5 sm:py-1 sm:text-[8px]">{label}</span>
            ))}
          </div>
        </div>
        <div className="p-2 sm:p-3"><Composer /></div>
      </section>

      <section
        data-ai-card
        className="absolute right-0 top-0 z-20 flex h-[60%] w-[49%] flex-col overflow-hidden rounded-xl border border-white/55 bg-white/95 text-slate-800 shadow-[0_22px_60px_rgba(2,20,24,.28)] ring-1 ring-slate-950/10 backdrop-blur sm:top-[7%] sm:h-[49%] sm:w-[44%] sm:rounded-2xl"
      >
        <AssistantHeader step="2" />
        <div className="flex-1 space-y-1 overflow-hidden px-2 py-1.5 sm:space-y-2 sm:px-3 sm:py-2.5">
          <div className="ml-auto w-fit max-w-[94%] rounded-xl rounded-tr-sm bg-brand px-2 py-1.5 text-[7px] font-medium text-white sm:max-w-[90%] sm:rounded-2xl sm:px-3 sm:py-2 sm:text-[9px]">
            สร้างสูตรเจลล้างมือแบบฆ่าเชื้อ
          </div>
          <div className="rounded-xl rounded-tl-sm bg-slate-100 p-2 text-[7px] leading-relaxed text-slate-600 sm:rounded-2xl sm:p-3 sm:text-[9px]">
            จัดให้แล้วค่ะ สูตรเจลล้างมือมี Glycerin 10% เพื่อความชุ่มชื้น และ Ethanol 60% เพื่อความสะอาด กด Run ประเมินดูได้เลยค่ะ
            <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 p-1.5 sm:mt-2 sm:rounded-xl sm:p-2.5">
              <div className="flex items-center gap-1 text-[7px] font-semibold text-amber-800 sm:gap-1.5 sm:text-[9px]">
                <ShieldCheck className="size-3 sm:size-3.5" />
                ตรวจสอบก่อนให้ AI แก้ workspace
              </div>
              <div className="mt-0.5 text-[7px] text-amber-700 sm:mt-1 sm:text-[8px]">1. สร้างสูตร “เจลล้างมือ”</div>
              <div className="mt-1 flex gap-1 sm:mt-2 sm:gap-1.5">
                <span data-ai-confirm className="flex flex-1 items-center justify-center rounded-md bg-brand px-1.5 py-1 text-[7px] font-semibold text-white sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-[8px]">
                  ยืนยันการเปลี่ยนแปลง
                </span>
                <span className="rounded-md border border-amber-300 bg-white px-1.5 py-1 text-[7px] text-amber-700 sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-[8px]">ยกเลิก</span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-2 pt-0 sm:p-3 sm:pt-0"><Composer /></div>
      </section>

      <section
        data-ai-card
        className="absolute left-[6%] top-[63%] z-30 h-[37%] w-[88%] overflow-hidden rounded-xl border border-white/55 bg-white/95 text-slate-800 shadow-[0_24px_70px_rgba(2,20,24,.3)] ring-1 ring-slate-950/10 backdrop-blur sm:left-[14%] sm:top-[59%] sm:h-[41%] sm:w-[58%] sm:rounded-2xl"
      >
        <div className="grid h-full grid-cols-[38%_62%]">
          <div className="border-r border-slate-200">
            <div className="border-b border-slate-100 px-2 py-1.5 text-[8px] font-semibold sm:px-3 sm:py-2 sm:text-[10px]">การประเมินสารเคมี</div>
            <div className="px-2 pt-1.5 text-[7px] text-slate-400 sm:px-3 sm:pt-3 sm:text-[8px]">สูตรที่สร้าง</div>
            <div className="m-1 rounded-lg border border-slate-200 p-1.5 sm:m-2 sm:rounded-xl sm:p-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="size-3 text-brand sm:size-3.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[8px] font-semibold sm:text-[9px]">สูตร A</div>
                  <div className="text-[7px] text-slate-400">ครีม / โลชั่น</div>
                </div>
                <span className="hidden text-[7px] text-slate-400 sm:inline">2 สาร</span>
              </div>
            </div>
            <div className="m-1 rounded-lg border border-brand bg-teal-50 p-1.5 shadow-sm sm:m-2 sm:rounded-xl sm:p-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="size-3 text-brand sm:size-3.5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[8px] font-semibold text-brand-dark sm:text-[9px]">เจลล้างมือ</div>
                  <div className="text-[7px] text-slate-400">สร้างโดย AI</div>
                </div>
                <Check className="size-3 text-brand" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
              <span className="grid size-4 place-items-center rounded-md bg-teal-50 text-[8px] font-bold text-brand sm:size-5 sm:text-[9px]">3</span>
              <div>
                <div className="text-[8px] font-semibold sm:text-[10px]">ส่วนผสมของสูตร</div>
                <div className="text-[7px] text-slate-400">เจลล้างมือ · 2 สาร</div>
              </div>
            </div>
            <div className="space-y-1 p-1.5 sm:space-y-1.5 sm:p-3">
              {[
                ['Water (Aqua)', 'สมดุลสูตรอัตโนมัติ', '30%'],
                ['Ethanol', 'CCO', '60%'],
                ['Glycerin', 'OCC(O)CO', '10%'],
              ].map(([name, smiles, amount], index) => (
                <div key={name} className={`rounded-lg border p-1 sm:rounded-xl sm:p-2 ${index === 0 ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center gap-1 text-[8px] sm:gap-1.5 sm:text-[9px]">
                    <SemanticIcon name="circle" className="size-2.5 text-brand" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                    <span className="font-mono tabular-nums text-slate-600">{amount}</span>
                  </div>
                  <div className="truncate font-mono text-[6px] text-slate-400 sm:mt-0.5 sm:text-[7px]">{smiles}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
