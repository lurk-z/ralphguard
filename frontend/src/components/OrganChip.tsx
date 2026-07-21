"use client";

/**
 * OrganChip — a SIMULATED (in-silico) organ-on-a-chip view. NOT a real device:
 * it visualizes how the assessed formula would affect skin, cornea and liver
 * tissue over an exposure period, driven by the QSAR endpoint scores. Purely a
 * teaching/визualization layer on top of the existing risk model.
 */
import { useState } from "react";
import { SemanticIcon, type SemanticIconName } from "@/components/SemanticIcon";

type Layer = { key: string; label: string; score: number; color: string; band: string };

const bandOf = (s: number) => (s < 25 ? "low" : s < 50 ? "moderate" : s < 75 ? "high" : "severe");
const BAND: Record<string, { c: string; t: string }> = {
  low: { c: "#16A34A", t: "ต่ำ" },
  moderate: { c: "#E08A00", t: "กลาง" },
  high: { c: "#DC2626", t: "สูง" },
  severe: { c: "#B91C1C", t: "รุนแรง" },
};

const ORGANS = [
  { key: "skin", ep: "skin", icon: "spray", name: "ผิวหนัง", en: "Skin epidermis", tissue: "Keratinocyte" },
  { key: "eye", ep: "eye", icon: "eye", name: "กระจกตา", en: "Cornea", tissue: "Corneal epithelium" },
  { key: "liver", ep: "acute", icon: "activity", name: "ตับ", en: "Liver", tissue: "Hepatocyte" },
] as const;

const CELLS = 28; // 7 × 4 tissue chamber
// scattered damage pattern so dead cells don't clump on one side
const scatter = (i: number) => (i * 11 + 5) % CELLS;

function lerpColor(t: number) {
  // green (22,163,74) → amber (224,138,0) → red (220,38,38)
  const stops = [
    [22, 163, 74],
    [224, 138, 0],
    [220, 38, 38],
  ];
  const x = Math.max(0, Math.min(1, t)) * 2;
  const i = Math.min(1, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function OrganCard({
  organ,
  score,
  exposure,
  playing,
}: {
  organ: (typeof ORGANS)[number];
  score: number;
  exposure: number;
  playing: boolean;
}) {
  const s = score;
  const e = exposure;
  const damage = Math.round(s * e); // tissue response
  const viability = Math.max(0, Math.round(100 - s * e * 0.85));
  const permeation = Math.round(Math.min(100, (28 + s * 0.5) * e));
  const band = bandOf(damage);
  const flowColor = BAND[bandOf(s)].c;
  const damagedCount = Math.round((CELLS * damage) / 100);

  return (
    <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <SemanticIcon name={organ.icon as SemanticIconName} className="size-5" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-800">{organ.name}</div>
          <div className="text-[10px] text-slate-400">{organ.en} · {organ.tissue}</div>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: BAND[band].c }}>
          {BAND[band].t}
        </span>
      </div>

      {/* microfluidic lane: inlet → channel (flow) → tissue chamber → outlet */}
      <div className="relative flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <div className="text-[9px] font-medium text-slate-400">IN</div>
        <div className="oc-channel relative h-6 flex-1 overflow-hidden rounded-full bg-slate-200/70">
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className="oc-dot absolute top-1/2 size-2 -translate-y-1/2 rounded-full"
              style={{
                background: flowColor,
                animationDelay: `${(i * 0.28).toFixed(2)}s`,
                animationDuration: `${(2.4 - e * 1.2).toFixed(2)}s`,
                animationPlayState: playing ? "running" : "paused",
              }}
            />
          ))}
        </div>

        {/* tissue chamber */}
        <div className="grid grid-cols-7 gap-[3px] rounded-lg border border-slate-200 bg-white p-1.5">
          {Array.from({ length: CELLS }).map((_, i) => {
            const dead = scatter(i) < damagedCount;
            return (
              <span
                key={i}
                className="size-2 rounded-full transition-colors"
                style={{ background: dead ? lerpColor(0.5 + (s / 100) * 0.5) : "#22C55E", opacity: dead ? 1 : 0.85 }}
              />
            );
          })}
        </div>
        <div className="text-[9px] font-medium text-slate-400">OUT</div>
      </div>

      {/* metrics */}
      <div className="mt-3 space-y-2">
        {[
          ["การซึมผ่านสะสม", permeation, "#0D9488"],
          ["การตอบสนองของเนื้อเยื่อ", damage, BAND[band].c],
          ["Cell viability", viability, viability > 60 ? "#16A34A" : viability > 30 ? "#E08A00" : "#DC2626"],
        ].map(([label, val, color]) => (
          <div key={label as string}>
            <div className="mb-0.5 flex justify-between text-[11px]">
              <span className="text-slate-500">{label}</span>
              <span className="font-mono tabular-nums text-slate-700">{val}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full transition-all" style={{ width: `${val}%`, background: color as string }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-slate-400">
        อ้างอิงจากคะแนน “{organ.name === "ตับ" ? "พิษเฉียบพลัน" : organ.name === "กระจกตา" ? "ระคายเคืองตา" : "ระคายเคืองผิว"}” = {s}/100
      </div>
    </div>
  );
}

export default function OrganChip({
  layers,
  ready,
  productName,
}: {
  layers: Layer[];
  ready: boolean;
  productName: string;
}) {
  const [exposure, setExposure] = useState(0.6);
  const [playing, setPlaying] = useState(true);
  const scoreOf = (k: string) => Math.round(layers.find((l) => l.key === k)?.score ?? 0);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[repeating-linear-gradient(45deg,#F8FAFB,#F8FAFB_16px,#F4F7F8_16px,#F4F7F8_32px)] p-6">
      <style>{`@keyframes ocflow{from{left:-8px}to{left:100%}}.oc-dot{left:-8px;animation-name:ocflow;animation-timing-function:linear;animation-iteration-count:infinite}`}</style>

      <div className="mx-auto max-w-5xl">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-1.5 font-display text-lg font-bold text-slate-800"><SemanticIcon name="flask" className="size-5" /> Organ-on-a-Chip <span className="font-normal text-slate-400">(จำลอง in-silico)</span></h2>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            แบบจำลองคอมพิวเตอร์ · ไม่ใช่อุปกรณ์ OoC จริง
          </span>
        </div>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-slate-500">
          จำลองการไหลของสารในสูตร <b className="text-slate-700">“{productName}”</b> ผ่านช่องไมโครฟลูอิดิก
          เข้าสู่เนื้อเยื่อจำลอง 3 อวัยวะ แล้วประเมินการซึมผ่าน · การตอบสนองของเนื้อเยื่อ · และการรอดของเซลล์
          ตามระยะเวลาสัมผัส โดยอิงคะแนนความเสี่ยงจากแบบจำลอง QSAR
        </p>

        {/* controls */}
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="grid size-8 place-items-center rounded-lg bg-brand text-white hover:bg-brand-dark"
            title={playing ? "หยุดการไหล" : "เริ่มการไหล"}
          >
            <SemanticIcon name={playing ? "pause" : "play"} className="size-4" />
          </button>
          <div className="flex flex-1 items-center gap-3">
            <span className="whitespace-nowrap text-xs font-medium text-slate-600">ระยะเวลาสัมผัส</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(exposure * 100)}
              onChange={(e) => setExposure(Number(e.target.value) / 100)}
              className="flex-1 accent-[#0D9488]"
            />
            <span className="w-10 text-right font-mono text-xs tabular-nums text-slate-700">{Math.round(exposure * 100)}%</span>
          </div>
          {!ready && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500">
              ยังไม่ได้ประเมิน — กด Run เพื่อป้อนค่าจริง (ตอนนี้แสดงค่า 0)
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          {ORGANS.map((o) => (
            <OrganCard key={o.key} organ={o} score={scoreOf(o.ep)} exposure={exposure} playing={playing} />
          ))}
        </div>

        <p className="mt-5 text-[10px] leading-relaxed text-slate-400">
          หมายเหตุ: ค่าที่แสดงเป็นการประมาณเชิงคำนวณจากคะแนน QSAR × ระยะเวลาสัมผัส เพื่อการสื่อสารผลเท่านั้น
          ไม่ได้มาจากการเพาะเลี้ยงเซลล์จริง และไม่ทดแทนการทดสอบ Organ-on-a-Chip หรือการทดสอบมาตรฐานใด ๆ
        </p>
      </div>
    </div>
  );
}
