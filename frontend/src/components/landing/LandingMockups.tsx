/**
 * Stylized "mockup" panels used on the landing page — lightweight HTML/SVG
 * representations of the app's screens (no screenshots needed). Dark theme,
 * brand accents. Purely presentational.
 */
import { SemanticIcon } from "@/components/SemanticIcon";

const cardCls =
  'w-full max-w-md rounded-2xl border border-white/10 bg-panel/80 p-5 shadow-2xl shadow-black/40 backdrop-blur'

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
      {children}
    </span>
  )
}

/** Step 1 — ingredient / formula input (substance name, SMILES, CSV, %). */
export function InputMockup() {
  const rows = [
    ['Water (Aqua)', 'O', 90],
    ['Glycolic Acid', 'OCC(=O)O', 5],
    ['Niacinamide', 'O=C(N)c1cccnc1', 4],
    ['Phenoxyethanol', 'OCCOc1ccccc1', 1],
  ] as const
  return (
    <div className={cardCls}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">ส่วนผสม / Formula</span>
        <Chip>＋ นำเข้า CSV</Chip>
      </div>

      <div className="space-y-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">ชื่อสาร</div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90">
            Niacinamide
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">SMILES</div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-brand">
            O=C(N)c1cccnc1
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60">
        <SemanticIcon name="file-spreadsheet" className="size-3.5" /> formula.csv · 4 สาร พร้อมสัดส่วน %
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
        {rows.map(([name, smi, pct], i) => (
          <div
            key={name}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
              i % 2 ? 'bg-white/[0.03]' : ''
            }`}
          >
            <SemanticIcon name="circle" className="size-2.5 text-brand" />
            <span className="flex-1 truncate text-white/85">{name}</span>
            <span className="hidden font-mono text-[10px] text-white/35 sm:inline">{smi}</span>
            <span className="w-10 text-right font-mono tabular-nums text-white/70">{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Step 1 (trio) — three input methods side by side: name / SMILES / CSV. */
export function InputTrioMockup() {
  const mini =
    'w-[13.5rem] max-w-[82vw] rounded-2xl border border-white/10 bg-panel/85 p-4 shadow-2xl shadow-black/40 backdrop-blur'
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-4">
      {/* by substance name */}
      <div className={mini}>
        <div className="mb-2 text-xs font-semibold text-white">ค้นหาด้วยชื่อสาร</div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90">
          <SemanticIcon name="scan" className="size-3.5 text-white/40" /> Niacinamide
        </div>
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex items-center gap-2 rounded-md bg-white/[0.05] px-2 py-1 text-white/75">
            <SemanticIcon name="circle" className="size-2.5 text-brand" /> Niacinamide
          </div>
          <div className="flex items-center gap-2 rounded-md px-2 py-1 text-white/45">
            <SemanticIcon name="circle" className="size-2.5 text-brand" /> Niacin (Vit B3)
          </div>
        </div>
      </div>

      {/* SMILES */}
      <div className={mini}>
        <div className="mb-2 text-xs font-semibold text-white">ป้อน SMILES</div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-brand">
          O=C(N)c1cccnc1
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400"><SemanticIcon name="check" className="size-3" /> โครงสร้างถูกต้อง · MW 122.13</div>
        <svg viewBox="0 0 120 56" className="mt-2 h-12 w-full">
          <g fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round">
            <polygon points="40,8 60,18 60,38 40,48 20,38 20,18" />
            <line x1="60" y1="18" x2="80" y2="10" />
            <line x1="80" y1="10" x2="98" y2="18" />
          </g>
          <circle cx="98" cy="18" r="3" fill="#2DD4BF" />
        </svg>
      </div>

      {/* CSV upload */}
      <div className={mini}>
        <div className="mb-2 text-xs font-semibold text-white">อัปโหลดไฟล์ CSV</div>
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60">
          <SemanticIcon name="file-spreadsheet" className="size-3.5" /> formula.csv
        </div>
        <div className="mt-2 overflow-hidden rounded-lg border border-white/10 text-xs">
          {([['Water (Aqua)', 90], ['Glycolic Acid', 5], ['Niacinamide', 4]] as const).map(([n, p], i) => (
            <div key={n} className={`flex justify-between px-2.5 py-1 ${i % 2 ? 'bg-white/[0.03]' : ''}`}>
              <span className="truncate text-white/80">{n}</span>
              <span className="font-mono text-white/60">{p}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Step 2 — structure check, molecular descriptors, fingerprint. */
export function DescriptorMockup() {
  const desc = [
    ['MW', '138.12'],
    ['logP', '−0.37'],
    ['TPSA', '55.98'],
    ['HBD', '1'],
    ['HBA', '3'],
    ['Rings', '1'],
  ] as const
  // deterministic-looking fingerprint bits
  const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0]
  return (
    <div className={cardCls}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">โครงสร้าง & Descriptors</span>
        <Chip><SemanticIcon name="check" className="size-3" /> ผ่านการตรวจสอบ</Chip>
      </div>

      <div className="flex items-center gap-4">
        {/* molecule glyph */}
        <svg viewBox="0 0 120 110" className="h-24 w-28 shrink-0">
          <g fill="none" stroke="#2DD4BF" strokeWidth="2.5" strokeLinecap="round">
            <polygon points="60,18 92,36 92,72 60,90 28,72 28,36" strokeOpacity="0.9" />
            <line x1="60" y1="18" x2="60" y2="2" />
            <line x1="92" y1="36" x2="110" y2="27" />
            <line x1="28" y1="72" x2="10" y2="82" />
          </g>
          <g fill="#2DD4BF">
            <circle cx="60" cy="2" r="4" />
            <circle cx="110" cy="27" r="4" />
            <circle cx="10" cy="82" r="4" fill="#E08A00" />
          </g>
        </svg>

        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {desc.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-center">
              <div className="text-[9px] uppercase tracking-wide text-white/40">{k}</div>
              <div className="font-mono text-xs text-white/90">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/40">
          <span>Morgan fingerprint (2048-bit)</span>
          <span className="font-mono text-brand">ON: 218</span>
        </div>
        <div className="flex flex-wrap gap-[3px]">
          {bits.map((b, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-[3px] ${b ? 'bg-brand' : 'bg-white/10'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Step 3 — virtual lab: simulate reaction / concentration, no animal testing. */
export function LabMockup() {
  const ep = [
    ['ระคายเคืองผิว', 62, '#DC2626'],
    ['ระคายเคืองตา', 24, '#16A34A'],
    ['แพ้ผิวหนัง', 41, '#E08A00'],
    ['พิษเฉียบพลัน', 18, '#16A34A'],
  ] as const
  return (
    <div className={cardCls}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">ห้องแล็บเสมือน (in-silico)</span>
        <Chip>ไม่ทดลองกับสัตว์</Chip>
      </div>

      <div className="flex items-center gap-4">
        {/* face silhouette with an irritation hotspot */}
        <svg viewBox="0 0 90 110" className="h-28 w-24 shrink-0">
          <defs>
            <radialGradient id="hot" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M45 6 C24 6 15 24 15 44 C15 70 30 100 45 100 C60 100 75 70 75 44 C75 24 66 6 45 6 Z"
            fill="#14282A"
            stroke="#2DD4BF"
            strokeOpacity="0.5"
            strokeWidth="2"
          />
          <circle cx="34" cy="42" r="3" fill="#2DD4BF" />
          <circle cx="56" cy="42" r="3" fill="#2DD4BF" />
          <ellipse cx="45" cy="70" rx="34" ry="24" fill="url(#hot)" />
          <circle cx="45" cy="66" r="5" fill="#EF4444">
            <animate attributeName="r" values="4;7;4" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </svg>

        <div className="flex-1 space-y-2">
          {ep.map(([label, val, color]) => (
            <div key={label}>
              <div className="mb-0.5 flex justify-between text-[11px]">
                <span className="text-white/70">{label}</span>
                <span className="font-mono tabular-nums text-white/90">{val}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${val}%`, background: color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-white/45">
        จำลองปฏิกิริยาและความเข้มข้นในสภาวะต่าง ๆ แล้วแสดงผลบนโมเดล 3 มิติ
      </p>
    </div>
  )
}
