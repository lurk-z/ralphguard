"use client";

/**
 * VoiceAssistant — a lightweight, fully client-side helper that answers questions
 * about the current assessment and speaks the reply out loud (Thai) via the
 * browser Web Speech API. Also accepts voice input (SpeechRecognition, Chrome).
 * No external API/keys — reliable for offline demos.
 */
import { useEffect, useRef, useState } from "react";

type Layer = { key: string; label: string; score: number; band: string };

const BAND_TH: Record<string, string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  severe: "รุนแรง",
};

type FormulaItem = { name: string; smiles: string; concentration: number };

export default function VoiceAssistant({
  productName,
  layers,
  ready,
  onImportFormula,
}: {
  productName: string;
  layers: Layer[];
  ready: boolean;
  onImportFormula?: (items: FormulaItem[]) => void;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string; formula?: FormulaItem[] }[]>([]);
  const [input, setInput] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [thinking, setThinking] = useState(false);
  const recogRef = useRef<any>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load & rank available voices — prefer natural / neural / online Thai voices,
  // which sound far smoother than the default local robotic one.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const rank = (v: SpeechSynthesisVoice) => {
      const n = (v.name || "").toLowerCase();
      let s = 0;
      if (v.lang?.toLowerCase().startsWith("th")) s += 100;
      else if (v.lang?.toLowerCase().startsWith("en")) s += 8;
      if (n.includes("google")) s += 45;
      if (n.includes("natural") || n.includes("neural")) s += 40;
      if (n.includes("enhanced") || n.includes("premium") || n.includes("online")) s += 20;
      if (v.localService === false) s += 15; // cloud voices are usually higher quality
      return s;
    };
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length) voiceRef.current = vs.slice().sort((a, b) => rank(b) - rank(a))[0] ?? null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Fallback: browser speechSynthesis (used if the neural TTS backend is down).
  const browserSpeak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
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

  const speak = async (text: string) => {
    if (!voiceOn) return;
    const clean = text.replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
    // Neural TTS (Edge, via backend) → far more human than the browser voice.
    try {
      const res = await fetch(`${API}/api/tts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        audioRef.current?.pause();
        if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
        const a = new Audio(url);
        audioRef.current = a;
        a.onplay = () => setSpeaking(true);
        a.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await a.play();
        return;
      }
    } catch {
      /* fall through to browser voice */
    }
    browserSpeak(clean);
  };

  const stopSpeak = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setSpeaking(false);
  };

  const buildContext = () => {
    if (!ready || !layers.length) return "ยังไม่มีผลการประเมิน (ผู้ใช้ยังไม่ได้กด Run)";
    const rows = layers.map((l) => `- ${l.label}: ${Math.round(l.score)}/100 (ระดับ${BAND_TH[l.band]})`).join("\n");
    return `ผลิตภัณฑ์/สูตร: ${productName}\nคะแนนความเสี่ยง 0-100:\n${rows}`;
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || thinking) return;
    setMessages((m) => [...m.slice(-6), { role: "user", text }]);
    setInput("");
    setThinking(true);
    let a = "";
    let err = "";
    try {
      const res = await fetch(`${API}/api/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, context: buildContext() }),
      });
      if (res.ok) a = (await res.json()).answer;
      else err = `(${res.status}) ${await res.text()}`;
    } catch (e) {
      err = String(e);
    }
    setThinking(false);
    if (!a) {
      // Gemini only — no rule-based fallback. Surface the real error to debug.
      setMessages((m) => [...m, { role: "ai", text: `⚠️ เชื่อมต่อ AI ไม่ได้ ${err}`.slice(0, 400) }]);
      return;
    }
    const { clean, formula } = parseFormula(a);
    setMessages((m) => [...m, { role: "ai", text: clean, formula }]);
    speak(clean); // don't read the JSON block aloud
  };

  // Extract a <formula>[...]</formula> JSON block from the AI reply (if any).
  const parseFormula = (text: string): { clean: string; formula?: FormulaItem[] } => {
    const m = text.match(/<formula>([\s\S]*?)<\/formula>/i);
    if (!m) return { clean: text };
    let formula: FormulaItem[] | undefined;
    try {
      const arr = JSON.parse(m[1].trim());
      if (Array.isArray(arr)) {
        formula = arr
          .filter((x) => x && x.smiles)
          .map((x) => ({
            name: String(x.name ?? ""),
            smiles: String(x.smiles),
            concentration: Number(x.concentration) || 0,
          }));
      }
    } catch {
      /* ignore malformed block */
    }
    return { clean: text.replace(m[0], "").trim(), formula };
  };

  const toggleListen = () => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) {
      ask("ขอสรุปผล");
      return;
    }
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
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript as string;
      setInput(t);
      ask(t);
    };
    r.start();
  };

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  const QUICK = ["สรุปผล", "เสี่ยงสุด", "คำแนะนำ"];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          🎙️ ผู้ช่วย AI (เสียง)
          {thinking && <span className="text-brand">● กำลังคิด…</span>}
          {!thinking && speaking && <span className="text-brand">● กำลังพูด</span>}
        </div>
        <button
          onClick={() => {
            setVoiceOn((v) => !v);
            if (voiceOn) stopSpeak();
          }}
          className="text-[11px] text-slate-500 hover:text-brand"
          title={voiceOn ? "ปิดเสียง" : "เปิดเสียง"}
        >
          {voiceOn ? "🔊" : "🔇"}
        </button>
      </div>

      {/* transcript */}
      {messages.length > 0 && (
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-[11px] leading-snug ${
                m.role === "user" ? "text-right text-slate-500" : "text-slate-800"
              }`}
            >
              <div>
                {m.role === "ai" ? "🤖 " : ""}
                {m.text}
              </div>
              {m.role === "ai" && m.formula && m.formula.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-1 text-[10px] font-semibold text-slate-500">
                    🧪 สูตรที่แนะนำ ({m.formula.length} สาร)
                  </div>
                  <div className="space-y-1">
                    {m.formula.map((f, j) => (
                      <div key={j} className="rounded border border-slate-200 bg-white px-2 py-1">
                        <div className="flex items-center gap-1 text-[11px]">
                          <span className="text-brand">◇</span>
                          <span className="flex-1 truncate font-medium text-slate-800">{f.name}</span>
                          <span className="font-mono tabular-nums text-slate-700">{f.concentration}</span>
                          <span className="text-[9px] text-slate-400">%</span>
                        </div>
                        {f.smiles && (
                          <div className="truncate pl-4 font-mono text-[9px] text-slate-400">{f.smiles}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => onImportFormula?.(m.formula!)}
                    className="mt-1.5 w-full rounded-md bg-brand px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-dark"
                  >
                    ⬇ Add to workspace
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* quick asks */}
      <div className="flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-brand hover:text-brand"
          >
            {q}
          </button>
        ))}
      </div>

      {/* input + mic */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleListen}
          className={`grid size-8 shrink-0 place-items-center rounded-lg border text-sm transition ${
            listening ? "animate-pulse border-brand bg-teal-50 text-brand" : "border-slate-200 text-slate-500 hover:border-brand hover:text-brand"
          }`}
          title="พูดเพื่อถาม"
        >
          🎤
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="พิมพ์ถาม เช่น เสี่ยงสุด…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand"
        />
        <button
          onClick={() => ask(input)}
          className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
        >
          ถาม
        </button>
      </div>
    </div>
  );
}
