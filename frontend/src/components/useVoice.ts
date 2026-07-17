"use client";

// Speaking and listening for the assistant, lifted from /assess's
// VoiceAssistant so both share the same behaviour:
//
//   speak  — neural TTS from the backend (Edge voices), falling back to the
//            browser's speechSynthesis when the backend is down
//   listen — Web Speech API dictation (Chrome; absent elsewhere)
//
// Kept as a hook rather than a component so the workspace can wear its own chat
// UI while using GOD's voice logic underneath.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/** Prefer natural / neural / online Thai voices over the local robotic one. */
function rankVoice(v: SpeechSynthesisVoice) {
  const n = (v.name || "").toLowerCase();
  let s = 0;
  if (v.lang?.toLowerCase().startsWith("th")) s += 100;
  else if (v.lang?.toLowerCase().startsWith("en")) s += 8;
  if (n.includes("google")) s += 45;
  if (n.includes("natural") || n.includes("neural")) s += 40;
  if (n.includes("enhanced") || n.includes("premium") || n.includes("online")) s += 20;
  if (v.localService === false) s += 15; // cloud voices are usually higher quality
  return s;
}

export function useVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [canListen, setCanListen] = useState(false);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recogRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const SR =
      (window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown })
        .webkitSpeechRecognition ??
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    setCanListen(!!SR);

    if (!window.speechSynthesis) return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length) voiceRef.current = vs.slice().sort((a, b) => rankVoice(b) - rankVoice(a))[0] ?? null;
    };
    pick();
    // Voices load asynchronously in most browsers.
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const browserSpeak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) {
      u.voice = voiceRef.current;
      u.lang = voiceRef.current.lang;
    } else {
      u.lang = "th-TH";
    }
    u.rate = 0.97;
    u.pitch = 1.03;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const stopSpeak = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setSpeaking(false);
  };

  const speak = async (text: string) => {
    if (!voiceOn || !text.trim()) return;
    const clean = text.replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
    try {
      const blob = await api.tts(clean);
      const url = URL.createObjectURL(blob);
      stopSpeak();
      const a = new Audio(url);
      audioRef.current = a;
      a.onplay = () => setSpeaking(true);
      a.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      await a.play();
      return;
    } catch {
      // Backend down, edge-tts missing, or autoplay refused — use the browser.
    }
    browserSpeak(clean);
  };

  /** Dictate one utterance. Resolves through onResult; no-op without support. */
  const listen = (onResult: (text: string) => void) => {
    const SR = (window as unknown as { webkitSpeechRecognition?: any; SpeechRecognition?: any })
      .webkitSpeechRecognition ??
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition;
    if (!SR) return;
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const r = new SR();
    recogRef.current = r;
    r.lang = "th-TH";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.onresult = (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => {
      onResult(e.results[0][0].transcript);
    };
    r.start();
  };

  // Never leave audio playing behind a closed panel.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
      audioRef.current?.pause();
      recogRef.current?.stop();
    };
  }, []);

  return { speaking, listening, voiceOn, setVoiceOn, canListen, speak, stopSpeak, listen };
}
