"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Droplet, Eraser, FlaskConical, Loader2, Move3D, Paintbrush, RotateCcw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { APPLICATION_STYLES, type ApplicationMode, type ApplicationStyle } from "@/components/three/skin-application/material";
import type { ApplicationApi, ApplicationPaintState } from "@/components/three/skin-application/SkinApplicationCanvas";

const ApplicationCanvas = dynamic(() => import("@/components/three/skin-application/SkinApplicationCanvas"), { ssr: false });
const STYLE_ICONS = [Paintbrush, Droplet, FlaskConical, Sparkles];

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <div role="alert" className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        โหลดตัวอย่าง 3D ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและ WebGL แล้วโหลดหน้าใหม่
      </div>
    ) : this.props.children;
  }
}

/** Four finishes compared on one shared stroke mask and one on-demand 3D viewer. */
export function SkinApplicationDemo() {
  const [style, setStyle] = useState<ApplicationStyle>("cream");
  const [mode, setMode] = useState<ApplicationMode>("paint");
  const [brushSize, setBrushSize] = useState(46);
  const [amount, setAmount] = useState(75);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [paintState, setPaintState] = useState<ApplicationPaintState>({ hasPaint: false, canUndo: false });
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<ApplicationApi | null>(null);
  const preset = APPLICATION_STYLES.find((item) => item.id === style)!;
  const onReady = useCallback((value: ApplicationApi | null) => {
    api.current = value;
    setReady(Boolean(value));
  }, []);
  const onChange = useCallback((value: ApplicationPaintState) => setPaintState(value), []);

  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    });
    const preload = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStarted(true);
        preload.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(container.current);
    preload.observe(container.current);
    return () => { observer.disconnect(); preload.disconnect(); };
  }, []);

  return (
    <div ref={container} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">ลองทาบนผิว แล้วสลับวัสดุเพื่อเทียบรอยเดิม</p>
        <Badge variant="muted">4 แบบ · โมเดลเดียว</Badge>
      </div>

      <div role="group" aria-label="รูปแบบสารที่ทาบนผิว" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {APPLICATION_STYLES.map((item, index) => {
          const Icon = STYLE_ICONS[index];
          return (
            <Button
              key={item.id}
              variant="outline"
              aria-pressed={style === item.id}
              onClick={() => setStyle(item.id)}
              className={cn("h-auto min-h-20 min-w-0 flex-col items-start gap-1 whitespace-normal px-3 py-3 text-left", style === item.id && "border-primary bg-accent text-accent-foreground")}
            >
              <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="text-primary" />{item.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{item.description}</span>
            </Button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="relative h-[28rem] overflow-hidden rounded-xl border bg-muted/30 sm:h-[34rem]" aria-label={`พื้นที่ทดลองทาสาร 3D แบบ${preset.label}`}>
          <PreviewBoundary>
            {started && <ApplicationCanvas style={style} mode={mode} brushSize={brushSize} amount={amount} visible={visible} scanEnabled={scanEnabled} onReady={onReady} onChange={onChange} />}
            {!ready && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />กำลังเตรียมผิวสำหรับทดลองทา
              </div>
            )}
          </PreviewBoundary>
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border bg-card/95 px-3 py-2">
            <p className="text-sm font-semibold">{preset.label}</p>
            <p className="text-xs text-muted-foreground">{mode === "rotate" ? "ลากเพื่อหมุน · เลื่อนเพื่อซูม" : mode === "erase" ? "ลากบนผิวเพื่อลบรอย" : "ลากบนผิวเพื่อทาสาร"}</p>
          </div>
          <Button variant="outline" size="icon-lg" className="absolute right-3 top-3 bg-card" aria-label="กลับมุมหน้าตรง" title="กลับมุมหน้าตรง" disabled={!ready} onClick={() => api.current?.front()}><RotateCcw /></Button>
        </div>

        <div className="space-y-5 rounded-xl border bg-card p-4">
          <div>
            <p className="mb-2 text-sm font-semibold">เครื่องมือ</p>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="เครื่องมือทดลองทา">
              {([
                ["paint", "ทา", Paintbrush],
                ["erase", "ลบ", Eraser],
                ["rotate", "หมุน", Move3D],
              ] as const).map(([value, label, Icon]) => (
                <Button key={value} size="lg" variant={mode === value ? "default" : "outline"} aria-pressed={mode === value} onClick={() => setMode(value)} className="px-2 text-sm"><Icon />{label}</Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm"><span id="application-brush-label">ขนาดแปรง</span><span className="tabular-nums text-muted-foreground">{brushSize}%</span></div>
            <Slider aria-labelledby="application-brush-label" min={10} max={100} step={1} value={[brushSize]} onValueChange={([value]) => setBrushSize(value)} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm"><span id="application-amount-label">ปริมาณสาร</span><span className="tabular-nums text-muted-foreground">{amount}%</span></div>
            <Slider aria-labelledby="application-amount-label" min={0} max={100} step={1} value={[amount]} onValueChange={([value]) => setAmount(value)} />
          </div>

          <div className="space-y-2 border-t pt-4">
            <Button variant="outline" size="lg" className="w-full text-sm" disabled={!ready} onClick={() => api.current?.sample()}><Sparkles />เติมรอยตัวอย่าง</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" className="px-2 text-sm" disabled={!ready || !paintState.canUndo} onClick={() => api.current?.undo()}><Undo2 />ย้อนกลับ</Button>
              <Button variant="outline" size="lg" className="px-2 text-sm" disabled={!ready || !paintState.hasPaint} onClick={() => api.current?.clear()}><Trash2 />ล้างรอย</Button>
            </div>
          </div>
          <label htmlFor="application-scan" className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-t pt-4">
            <span>
              <span className="block text-sm font-semibold">สแกนผิวหน้า</span>
              <span className="block text-xs text-muted-foreground">เส้นตาข่ายและแถบสแกน</span>
            </span>
            <Switch id="application-scan" aria-label="สแกนผิวหน้า" checked={scanEnabled} onCheckedChange={setScanEnabled} />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground" aria-live="polite">{preset.description} สลับแบบได้โดยรอยทายังอยู่ตำแหน่งเดิม</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">ตัวอย่างลักษณะสารบนผิวเท่านั้น ไม่ใช่ผลประเมินหรือการจำลองการดูดซึม</p>
    </div>
  );
}
