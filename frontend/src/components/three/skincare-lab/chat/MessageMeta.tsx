'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Copy } from 'lucide-react'

const clock = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' })

export default function MessageMeta({ text, time, outgoing = false }: { text: string; time?: number; outgoing?: boolean }) {
  const [notice, setNotice] = useState('')
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setNotice('คัดลอกแล้ว')
    } catch {
      setNotice('คัดลอกไม่ได้')
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(''), 2000)
  }
  return <div className={`lab-chat-message-meta flex items-center gap-1 text-[11px] text-slate-500 ${outgoing ? 'justify-end' : ''}`}>
    {time != null && <time dateTime={new Date(time).toISOString()}>{clock.format(time)}</time>}
    <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-600 [&>svg]:size-3.5"
      onClick={() => void copy()} title={notice || 'คัดลอกข้อความ'} aria-label="คัดลอกข้อความ">
      {notice === 'คัดลอกแล้ว' ? <Check /> : notice ? <CircleAlert /> : <Copy />}
    </button>
    <span role="status" className="sr-only">{notice}</span>
  </div>
}
