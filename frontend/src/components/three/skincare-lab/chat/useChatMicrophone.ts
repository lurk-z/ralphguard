'use client'

import { useEffect, useRef, useState } from 'react'

type Recognition = {
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
}

export function useChatMicrophone(scope: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')
  const active = useRef<Recognition | null>(null)

  useEffect(() => {
    setListening(false)
    setSpeaking(false)
    setError('')
    return () => {
      const recognition = active.current
      active.current = null
      recognition?.abort()
    }
  }, [scope])

  function toggle() {
    if (active.current) {
      active.current.stop()
      return
    }
    const browser = window as Window & {
      SpeechRecognition?: new () => Recognition
      webkitSpeechRecognition?: new () => Recognition
    }
    const SpeechRecognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('เบราว์เซอร์นี้ไม่รองรับการพิมพ์ด้วยเสียง')
      return
    }
    const recognition = new SpeechRecognition()
    const finish = () => {
      if (active.current !== recognition) return
      active.current = null
      setListening(false)
      setSpeaking(false)
    }
    recognition.lang = 'th-TH'
    recognition.onend = finish
    recognition.onspeechstart = () => {
      if (active.current === recognition) setSpeaking(true)
    }
    recognition.onspeechend = () => {
      if (active.current === recognition) setSpeaking(false)
    }
    recognition.onerror = ({ error: reason }) => {
      if (active.current !== recognition) return
      setError(reason === 'not-allowed' ? 'อนุญาตให้เบราว์เซอร์เข้าถึงไมค์ก่อนใช้งาน' : 'รับเสียงไม่สำเร็จ ลองใหม่หรือพิมพ์ข้อความได้เลย')
      finish()
    }
    recognition.onresult = ({ results }) => {
      const text = results[0]?.[0]?.transcript.trim()
      if (active.current === recognition && text) onText(text)
    }
    try {
      active.current = recognition
      setError('')
      recognition.start()
      setListening(true)
    } catch {
      finish()
      setError('เปิดไมค์ไม่ได้ ลองใหม่หรือพิมพ์ข้อความได้เลย')
    }
  }

  return { listening, speaking, error, toggle }
}
