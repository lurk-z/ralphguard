import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

/** User-facing operations and their timing. The answer stays outside the disclosure. */
export default function ChatActivity({ label, children }: { label: string; children: ReactNode }) {
  return <details className="group/activity my-1 text-xs text-slate-500">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1.5 hover:text-slate-800 focus-visible:outline-teal-600 [&::-webkit-details-marker]:hidden">
      {label}<ChevronRight aria-hidden="true" className="size-3.5 transition-transform group-open/activity:rotate-90 motion-reduce:transition-none" />
    </summary>
    <div className="pb-2 pl-1 leading-6">{children}</div>
  </details>
}

export function elapsedLabel(start?: number, end?: number) {
  if (start == null || end == null) return 'ดูขั้นตอนการทำงาน'
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return seconds < 1 ? 'ใช้เวลาน้อยกว่า 1 วินาที' : `ใช้เวลา ${seconds} วินาที`
}
