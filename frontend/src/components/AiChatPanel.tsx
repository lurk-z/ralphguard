"use client";

// Self-built chat widget for the assess workspace's right panel — the shadcn
// "message-scroller" registry entry (ui.shadcn.com/docs/components/radix/message-scroller)
// is documented but not actually published (404s on every registry path/CLI version),
// and assistant-ui's <Thread> needs a runtime wired to a real backend we don't have yet.
// This is a local, self-contained stand-in with the same look or behavior:
// empty state, auto-scroll to newest message, user bubbles vs. plain assistant text.
import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

// Placeholder response until this is wired to a real AI backend.
const DEMO_REPLY =
  "นี่คือคำตอบตัวอย่าง (demo) — ยังไม่ได้เชื่อมกับ AI จริง เอาไว้ทดสอบหน้าตา UI เท่านั้น";

export default function AiChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const idSeq = useRef(0);

  // Auto-scroll to the newest message whenever the thread changes.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || sending) return;
    idSeq.current += 1;
    setMessages((m) => [...m, { id: `u${idSeq.current}`, role: "user", content: text }]);
    setInput("");
    setSending(true);
    setTimeout(() => {
      idSeq.current += 1;
      setMessages((m) => [...m, { id: `a${idSeq.current}`, role: "assistant", content: DEMO_REPLY }]);
      setSending(false);
    }, 700);
  };

  const reset = () => {
    setMessages([]);
    setInput("");
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
                {m.content}
              </div>
            </div>
          ))
        )}
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
            placeholder="พิมพ์ข้อความ..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            aria-label="ส่งข้อความ"
            onClick={send}
            disabled={!input.trim() || sending}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
