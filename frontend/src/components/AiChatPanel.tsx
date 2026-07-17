"use client";

// Chat widget for the assess workspace's right panel — the shadcn
// "message-scroller" registry entry (ui.shadcn.com/docs/components/radix/message-scroller)
// is documented but not actually published (404s on every registry path/CLI version),
// and assistant-ui's <Thread> needs a runtime of its own. This is a local,
// self-contained thread: empty state, auto-scroll to newest message, user
// bubbles vs. plain assistant text.
//
// It talks to the same /api/chat endpoint /assess's VoiceAssistant does, and
// handles the reply the same way: agent commands are carried out, a suggested
// formula becomes an import card, and neither block is ever shown as raw JSON.
import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, Mic, Square, Volume2, VolumeX } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { api, type FormulaItem } from "@/lib/api";
import { parseAssistantReply, type AssistantAction } from "@/lib/assistant";
import { useVoice } from "@/components/useVoice";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** A formula the assistant suggested, offered to the user as an import. */
  formula?: FormulaItem[];
  /** How many agent commands this reply carried out. */
  acted?: number;
  error?: boolean;
};

export default function AiChatPanel({
  buildContext,
  onAction,
  onImportFormula,
}: {
  /** Current formula + results, so the assistant answers about this workspace. */
  buildContext?: () => string;
  /** Carry out the reply's agent commands. */
  onAction?: (actions: AssistantAction[]) => void;
  /** Import a suggested formula when the user asks for it. */
  onImportFormula?: (items: FormulaItem[]) => void;
} = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const idSeq = useRef(0);
  const voice = useVoice();

  // Auto-scroll to the newest message whenever the thread changes.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const push = (m: Omit<ChatMessage, "id">) => {
    idSeq.current += 1;
    setMessages((prev) => [...prev, { id: `m${idSeq.current}`, ...m }]);
  };

  /** `spoken` comes from the mic, which can't wait for the input state to land. */
  const send = async (spoken?: string) => {
    const text = (spoken ?? input).trim();
    if (!text || sending) return;
    push({ role: "user", content: text });
    setInput("");
    setSending(true);

    let answer = "";
    let err = "";
    try {
      answer = (await api.chat(text, buildContext?.())).answer;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    setSending(false);

    if (!answer) {
      // No canned fallback: show what actually went wrong, the way /assess does.
      push({ role: "assistant", content: `⚠️ เชื่อมต่อ AI ไม่ได้ ${err}`.slice(0, 400), error: true });
      return;
    }

    const reply = parseAssistantReply(answer);
    if (reply.actions.length) onAction?.(reply.actions);
    push({
      role: "assistant",
      content: reply.text,
      formula: reply.formula,
      acted: reply.actions.length,
    });
    voice.speak(reply.text); // the parsed text only — never the JSON blocks
  };

  return (
    <div className="flex h-full flex-col bg-card text-foreground">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <Empty className="h-full border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="rounded-xl">
                <MessageCircle className="size-4" />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold text-muted-foreground">ฉันคือ Ai ผู้ช่วยคุณ</EmptyTitle>
              <EmptyDescription className="max-w-[220px] text-xs text-muted-foreground/80">
                วันนี้จะให้ช่วยอะไรดี?
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-xl bg-secondary/70 px-3 py-2 text-xs text-foreground"
                    : "max-w-[85%] text-xs leading-relaxed text-muted-foreground"
                }
              >
                <p className={m.error ? "text-destructive" : undefined}>{m.content}</p>

                {m.role === "assistant" && !!m.acted && (
                  <p className="mt-1 text-[10px] text-primary">✓ ปรับสูตรให้แล้ว {m.acted} รายการ</p>
                )}

                {m.role === "assistant" && m.formula && m.formula.length > 0 && (
                  <div className="mt-1.5 rounded-lg border border-border bg-card p-2">
                    <p className="mb-1 text-[10px] font-semibold text-muted-foreground">
                      🧪 สูตรที่แนะนำ ({m.formula.length} สาร)
                    </p>
                    <div className="space-y-0.5">
                      {m.formula.map((f) => (
                        <div key={f.smiles} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-foreground">{f.name || f.smiles}</span>
                          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                            {f.concentration}%
                          </span>
                        </div>
                      ))}
                    </div>
                    {onImportFormula && (
                      <button
                        onClick={() => onImportFormula(m.formula!)}
                        className="mt-1.5 w-full rounded-md border border-primary/40 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-accent/40"
                      >
                        + นำเข้าเป็นสูตรใหม่
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {sending && <p className="text-xs text-muted-foreground">กำลังคิด…</p>}
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background p-1.5 pl-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder={voice.listening ? "กำลังฟัง…" : "พิมพ์ข้อความ..."}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />

          {/* Mute the reply. Hidden where dictation and TTS are both pointless. */}
          <button
            aria-label={voice.voiceOn ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ"}
            onClick={() => {
              if (voice.voiceOn) voice.stopSpeak();
              voice.setVoiceOn(!voice.voiceOn);
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            {voice.voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>

          {voice.canListen && (
            <button
              aria-label={voice.listening ? "หยุดฟัง" : "พูดแทนการพิมพ์"}
              onClick={() =>
                voice.listen((t) => {
                  setInput(t);
                  send(t);
                })
              }
              disabled={sending}
              className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40 ${
                voice.listening
                  ? "animate-pulse bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mic className="size-4" />
            </button>
          )}

          <button
            aria-label={voice.speaking ? "หยุดพูด" : "ส่งข้อความ"}
            onClick={() => (voice.speaking ? voice.stopSpeak() : send())}
            disabled={!voice.speaking && (!input.trim() || sending)}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {voice.speaking ? <Square className="size-3.5" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
