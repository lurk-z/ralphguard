---
component: OCRLabelShowcase
version: V1
file: frontend/src/components/landing/OCRLabelShowcase.tsx
group: landing
weight: light
size_gzip_kb: 2.1
lazy: false
pages: [/]
tags: [component, V1]
---

# OCRLabelShowcase · V1

> ภาพประกอบการสแกนฉลาก OCR ในเนื้อเรื่องหน้าแรก

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/landing/OCRLabelShowcase.tsx` | เบา | 2.1 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/` | พร้อมหน้า |

นำเข้าโดย: `components/landing/ScrollStory.tsx`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/landing/OCRLabelShowcase.tsx` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `lucide-react`, `next`

ต้องมีในโปรเจกต์:

- สี `brand`, `brand-dark`, `brand-soft` ใน `tailwind.config.js` (`colors.brand`)

## ตัวอย่างการใช้

```tsx
import OCRLabelShowcase from "@/components/landing/OCRLabelShowcase";
```

ของจริงใน `components/landing/ScrollStory.tsx` บรรทัด 438:

```tsx
                <OCRLabelShowcase />
              </div>
            </div>
          )
        } else if (i === 5) {
          return (
            <div
              key={i}
              ref={(el) => { chapterRefs.current[i] = el }}
              className="absolute inset-0"
              style={{ opacity: 0, willChange: 'opacity, transform', textShadow: '0 1px 14px rgba(8,20,24,0.6), 0 1px 3px rgba(8,20,24,0.55)' }}
            >
```

## โค้ด V1

`frontend/src/components/landing/OCRLabelShowcase.tsx` · 127 บรรทัด

```tsx
import Image from 'next/image'
import { Camera, Check, ChevronRight, ShieldCheck, X } from 'lucide-react'

const INGREDIENTS = [
  ['Sas', 'O=C(O)c1cc(N=Nc2ccc(S(=O)(=O)N)cc2)cc1O'],
  ['Vat', 'O=C(NC(CO)1(O)CCCN(C2CC(NCc3ccccc3)nn2)C1)'],
  ['Cyr', 'NC(N)=NCCCC(NC(=O)C(Cc1ccc(O)cc1)NC(=O)C(N)CS)C(=O)O'],
]

function Header() {
  return (
    <div className="flex items-center border-b border-slate-100 px-2.5 py-2 sm:px-4 sm:py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[7px] font-semibold text-slate-700 sm:text-[10px]">
          <Camera className="size-2.5 sm:size-3.5" />
          อ่านรายการส่วนผสมจากฉลาก
        </div>
        <div className="mt-0.5 truncate text-[5px] text-slate-400 sm:text-[7px]">OCR → ตรวจชื่อสาร → ยืนยันความเข้มข้นก่อนประเมิน</div>
      </div>
      <X className="ml-auto size-3 text-slate-400 sm:size-4" />
    </div>
  )
}

function LabelImage({ scanning = false }: { scanning?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-slate-950 sm:rounded-xl">
      <div className="relative aspect-[2.15/1]">
        <Image
          src="/landing/label-ocr-source.png"
          alt="ภาพฉลากผลิตภัณฑ์สำหรับอ่านรายชื่อส่วนผสมด้วย OCR"
          fill
          sizes="(max-width: 640px) 45vw, 420px"
          className="object-contain"
        />
        {scanning && (
          <>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(45,212,191,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,.22) 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            />
            <div className="ocr-showcase-laser absolute inset-x-0 h-px bg-cyan-300 shadow-[0_0_12px_3px_rgba(34,211,238,.75)]" />
            <div className="absolute inset-x-0 bottom-0 bg-slate-950/75 py-1 text-center text-[5px] text-teal-200 backdrop-blur sm:py-1.5 sm:text-[7px]">
              กำลังปรับภาพ อ่านตัวอักษร และจับคู่โครงสร้างสาร…
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function OCRLabelShowcase() {
  return (
    <div className="relative grid h-[min(52svh,470px)] min-h-[350px] w-[min(96vw,880px)] grid-cols-[1.03fr_.97fr] items-center gap-2 sm:h-[min(58svh,590px)] sm:min-h-[470px] sm:w-[min(92vw,880px)] sm:gap-4 xl:h-[min(72vh,650px)] xl:min-h-0 xl:w-[min(58vw,880px)]">
      <article
        data-ocr-card
        className="overflow-hidden rounded-xl border border-white/60 bg-white/95 text-slate-800 shadow-[0_22px_65px_rgba(2,20,24,.26)] ring-1 ring-slate-950/10 backdrop-blur sm:rounded-2xl"
      >
        <Header />
        <div className="p-2.5 sm:p-4">
          <LabelImage scanning />
        </div>
      </article>

      <article
        data-ocr-card
        className="overflow-hidden rounded-xl border border-white/60 bg-white/95 text-slate-800 shadow-[0_24px_70px_rgba(2,20,24,.3)] ring-1 ring-slate-950/10 backdrop-blur sm:rounded-2xl"
      >
        <Header />
        <div className="space-y-1.5 p-2 sm:space-y-2.5 sm:p-3.5">
          <LabelImage />

          <div className="flex flex-wrap gap-1">
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[5px] font-semibold text-emerald-700 sm:px-2 sm:text-[7px]">พบ 3 สารที่ประเมินได้</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[5px] text-slate-500 sm:px-2 sm:text-[7px]">OCR confidence 48%</span>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-[5px] leading-relaxed text-amber-800 sm:rounded-xl sm:p-2.5 sm:text-[7px]">
            <span className="font-semibold">ต้องยืนยันความเข้มข้น:</span> ระบบอ่านชื่อสารได้ แต่ไม่สร้างเปอร์เซ็นต์ขึ้นเอง
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 sm:rounded-xl">
            <div className="grid grid-cols-[1fr_28%] bg-slate-50 px-2 py-1 text-[5px] font-semibold text-slate-500 sm:px-3 sm:py-1.5 sm:text-[7px]">
              <span>สารที่ตรวจพบ</span><span className="text-right">ความเข้มข้น</span>
            </div>
            {INGREDIENTS.map(([name, smiles]) => (
              <div key={name} className="grid grid-cols-[1fr_28%] items-center gap-1 border-t border-slate-100 px-2 py-1 sm:px-3 sm:py-1.5">
                <div className="flex min-w-0 items-start gap-1">
                  <span className="mt-0.5 grid size-2.5 shrink-0 place-items-center rounded-sm bg-brand-dark text-white sm:size-3.5"><Check className="size-2 sm:size-2.5" /></span>
                  <div className="min-w-0">
                    <div className="text-[6px] font-semibold text-slate-700 sm:text-[8px]">{name} <span className="ml-0.5 text-[4px] font-normal text-amber-600 sm:text-[6px]">PubChem</span></div>
                    <div className="truncate font-mono text-[4px] text-slate-400 sm:text-[5px]">{smiles}</div>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 px-1 py-1 text-right text-[5px] text-slate-400 sm:px-2 sm:text-[7px]">ระบุ　%</div>
              </div>
            ))}
          </div>

          <div className="flex items-center rounded-md bg-slate-50 px-2 py-1 text-[5px] text-slate-500 sm:text-[7px]">
            <ShieldCheck className="mr-1 size-2.5 text-brand sm:size-3" />
            ตรวจสอบก่อนนำเข้าสูตร
            <ChevronRight className="ml-auto size-2.5" />
          </div>

          <div className="flex justify-end gap-1 pt-0.5">
            <span className="rounded-md border border-slate-200 px-2 py-1 text-[5px] text-slate-500 sm:text-[7px]">เลือกรูปใหม่</span>
            <span className="rounded-md bg-brand-dark px-2 py-1 text-[5px] font-semibold text-white sm:text-[7px]">ยืนยันและนำเข้าสูตร</span>
          </div>
        </div>
      </article>

      <style>{`
        @keyframes ocr-showcase-scan { 0% { top: 8%; } 50% { top: 82%; } 100% { top: 8%; } }
        .ocr-showcase-laser { animation: ocr-showcase-scan 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .ocr-showcase-laser { animation: none; top: 50%; } }
      `}</style>
    </div>
  )
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
