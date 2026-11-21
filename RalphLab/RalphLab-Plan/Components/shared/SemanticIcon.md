---
component: SemanticIcon
version: V1
file: frontend/src/components/shared/SemanticIcon.tsx
group: shared
weight: light
size_gzip_kb: 0.9
lazy: false
pages: [/, /assess]
tags: [component, V1]
---

# SemanticIcon · V1

> ชุดไอคอนตามความหมายของแอป (ใบหน้า ตา ขวดทดลอง ฯลฯ)

| รุ่น | ไฟล์ | น้ำหนัก | ขนาด (gzip) | โหลดเมื่อ |
|---|---|---|---:|---|
| **V1** · 19 พ.ย. 2569 | `frontend/src/components/shared/SemanticIcon.tsx` | เบา | 0.9 KB | พร้อมหน้า |

## ใช้งานหน้าไหน

| หน้า | โหลด |
|---|---|
| `/` | พร้อมหน้า |
| `/assess` | พร้อมหน้า |

นำเข้าโดย: `app/(dashboard)/assess/page.tsx`, `components/assistant/VoiceAssistant.tsx`, `components/face/SymptomFaceCanvas.tsx`, `components/formula/CsvImportModal.tsx`, `components/formula/FormulaGraph.tsx`, `components/formula/LabelScanModal.tsx`, `components/landing/AIAssistantShowcase.tsx`, `components/substances/ManualSubstanceModal.tsx`, `components/substances/SubstanceHoverCard.tsx`, `components/substances/SubstanceLibraryPage.tsx`, `lib/catalog.ts`

## ไฟล์ที่ต้องมี

สร้างไฟล์ `frontend/src/components/shared/SemanticIcon.tsx` จากโค้ดด้านล่าง

ไม่ต้องมีไฟล์อื่นเพิ่ม

## การติดตั้ง

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

แพ็กเกจพื้นฐานที่ต้องมีอยู่แล้ว: `lucide-react`, `react`

## ตัวอย่างการใช้

```tsx
import { SemanticIcon } from "@/components/shared/SemanticIcon";
```

ของจริงใน `app/(dashboard)/assess/page.tsx` บรรทัด 2329:

```tsx
              <SemanticIcon name="beaker" />
              <span className="hidden min-[340px]:inline">คลังสาร</span>
            </Button>
          </div>
        )}
        <button
          type="button"
          onClick={toggleFormulaSidebar}
          aria-label={isCompactWorkspace ? "ปิดกล่องสูตร" : formulaSidebarCollapsed ? "ขยายกล่องสูตร" : "ย่อกล่องสูตร"}
          title={isCompactWorkspace ? "ปิดกล่องสูตร" : formulaSidebarCollapsed ? "ขยายกล่องสูตร" : "ย่อกล่องสูตร"}
          className={`grid size-9 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 ${formulaSidebarCollapsed && !isCompactWorkspace ? "bg-transparent" : "ml-2 rounded-lg hover:bg-accent"
            }`}
```

## โค้ด V1

`frontend/src/components/shared/SemanticIcon.tsx` · 145 บรรทัด

```tsx
import type { ComponentProps } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  BadgeCheck,
  Beaker,
  BicepsFlexed,
  Bot,
  Brush,
  Camera,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Droplet,
  Download,
  Eraser,
  Eye,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Flower2,
  Hand,
  House,
  Image,
  Info,
  Leaf,
  Lightbulb,
  Link2Off,
  LocateFixed,
  MapPin,
  MessageCircle,
  Mic,
  Package,
  Palette,
  Pause,
  Pencil,
  Puzzle,
  Play,
  Plus,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  SprayCan,
  Sun,
  Syringe,
  Target,
  Timer,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  Waves,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  activity: Activity,
  alert: AlertTriangle,
  "arrow-up": ArrowUp,
  approved: BadgeCheck,
  beaker: Beaker,
  bot: Bot,
  brush: Brush,
  bubbles: Waves,
  camera: Camera,
  chart: ChartNoAxesCombined,
  check: Check,
  "chevron-down": ChevronDown,
  "check-circle": CircleCheck,
  circle: Circle,
  "circle-alert": CircleAlert,
  clipboard: ClipboardList,
  droplet: Droplet,
  download: Download,
  eraser: Eraser,
  eye: Eye,
  file: FileText,
  "file-spreadsheet": FileSpreadsheet,
  flask: FlaskConical,
  flower: Flower2,
  hand: Hand,
  home: House,
  image: Image,
  info: Info,
  leaf: Leaf,
  lightbulb: Lightbulb,
  "link-off": Link2Off,
  locate: LocateFixed,
  map: MapPin,
  message: MessageCircle,
  mic: Mic,
  muscle: BicepsFlexed,
  package: Package,
  palette: Palette,
  pause: Pause,
  pencil: Pencil,
  puzzle: Puzzle,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  save: Save,
  scan: ScanLine,
  search: Search,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  spray: SprayCan,
  sun: Sun,
  syringe: Syringe,
  target: Target,
  timer: Timer,
  trash: Trash2,
  upload: Upload,
  volume: Volume2,
  "volume-off": VolumeX,
  wand: WandSparkles,
  x: X,
  "x-circle": XCircle,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type SemanticIconName = keyof typeof ICONS;

export function SemanticIcon({
  name,
  "aria-hidden": ariaHidden = true,
  ...props
}: { name: SemanticIconName } & Omit<ComponentProps<LucideIcon>, "name">) {
  const Icon = ICONS[name];
  return <Icon aria-hidden={ariaHidden} {...props} />;
}
```

## ประวัติเวอร์ชัน

| รุ่น | วันที่ | สิ่งที่เปลี่ยน | commit |
|---|---|---|---|
| V1 | 19 พ.ย. 2569 | บันทึกครั้งแรกตามโค้ดในโปรเจกต์ | ddd97e1 (jay-sandbox) |

> แก้โค้ดแล้ว **ห้ามเขียนทับ V1** ให้เพิ่มหัวข้อ `## โค้ด V2` ใต้ V1 พร้อมแถวใหม่ในตารางนี้ ดูวิธีใน [VERSIONS](../VERSIONS.md)
