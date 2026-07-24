import Image from 'next/image'

const VIEWS = [
  {
    src: '/landing/grid-scan-angle.png',
    alt: 'ผล Grid Scan บนโมเดลผิวมุมหันซ้าย',
    title: 'หันซ้าย',
    detail: 'ตรวจขอบเขตด้านซ้าย',
    mirror: true,
  },
  {
    src: '/landing/grid-scan-front.png',
    alt: 'ผล Grid Scan บนโมเดลผิวในมุมตรง',
    title: 'หน้าตรง',
    detail: 'เทียบตำแหน่งสองด้าน',
    mirror: false,
  },
  {
    src: '/landing/grid-scan-angle.png',
    alt: 'ผล Grid Scan บนโมเดลผิวมุมหันขวา',
    title: 'หันขวา',
    detail: 'ตรวจขอบเขตด้านขวา',
    mirror: false,
  },
]

export default function GridScanShowcase() {
  return (
    <div className="relative h-[min(45vh,430px)] w-[min(96vw,1080px)]">
      <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-full border border-brand/25 bg-slate-950/70 px-3 py-1 font-mono text-[9px] font-semibold tracking-[0.14em] text-teal-100 shadow-[0_0_24px_rgba(0,159,165,.2)] backdrop-blur-md sm:text-[10px]">
        GRID SCAN · MULTI-ANGLE VIEW
      </div>

      <div className="absolute inset-x-0 top-9 grid grid-cols-3 items-start gap-1.5 sm:gap-3">
      {VIEWS.map((view, index) => (
        <figure
          key={`${view.title}-${view.src}`}
          data-scan-card
          className={`min-w-0 will-change-transform ${index === 1 ? 'z-10 pt-3 sm:pt-5' : 'z-0'}`}
        >
          <div className="relative overflow-hidden rounded-[1.15rem] border border-white/45 bg-white/95 p-1.5 shadow-[0_22px_60px_rgba(2,20,24,.28)] ring-1 ring-slate-950/10 backdrop-blur sm:rounded-[1.4rem] sm:p-2">
            <div className="relative overflow-hidden rounded-[0.85rem] bg-[#f4f1ee] sm:rounded-[1rem]">
              <div className="overflow-hidden">
                <Image
                  src={view.src}
                  alt={view.alt}
                  width={1033}
                  height={940}
                  sizes="(max-width: 640px) 32vw, 350px"
                  className={`h-auto w-full scale-[1.015] ${view.mirror ? '-scale-x-[1.015]' : ''}`}
                />
              </div>
              <div
                data-scan-beam
                aria-hidden
                className="absolute inset-x-[4%] top-[8%] h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent opacity-0 shadow-[0_0_14px_3px_rgba(34,211,238,.4)] will-change-[top,opacity]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />

              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5 text-left sm:p-4">
                <div className="min-w-0 text-white">
                  <div className="text-[10px] font-semibold sm:text-xs">{view.title}</div>
                  <div className="truncate text-[8px] text-white/70 sm:text-[10px]">{view.detail}</div>
                </div>
                <span className="shrink-0 rounded-full border border-white/20 bg-slate-950/45 px-2 py-1 font-mono text-[7px] text-teal-100 backdrop-blur sm:text-[8px]">
                  0{index + 1} / VIEW
                </span>
              </figcaption>
            </div>
          </div>
        </figure>
      ))}
      </div>

    </div>
  )
}
