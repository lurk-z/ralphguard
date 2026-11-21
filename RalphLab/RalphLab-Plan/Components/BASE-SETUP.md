# เริ่มโปรเจกต์ใหม่: ต้องมีอะไรก่อนคัดลอก Component

Component ทุกชิ้นใน [COMPONENTS-INDEX](COMPONENTS-INDEX.md) ต้องการฐานเดียวกันนี้ ทำครั้งเดียว

เวอร์ชันที่ใช้: **V1** · 19 พ.ย. 2569 · Next.js 14.2.13 (App Router) · React 18 · Tailwind 3.4 · shadcn style `new-york` (Radix)

## 1. ติดตั้งแพ็กเกจพื้นฐาน

```bash
npm install class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^2.6.1 lucide-react@^0.446.0 sonner@^2.0.7 @radix-ui/react-slot@^1.3.0
npm install -D tailwindcss@^3.4.13 tailwindcss-animate@^1.0.7
```

## 2. ไฟล์ที่ต้องสร้าง

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `src/lib/utils.ts` | ฟังก์ชัน `cn()` รวมคลาส Tailwind (ทุก component ใช้) |
| `components.json` | ตั้งค่า shadcn (alias `@/components`, `@/lib/utils`) |
| `tailwind.config.js` | สีธีมและ plugin `tailwindcss-animate` |
| `src/app/globals.css` | ตัวแปรสีธีม `--primary`, `--primary-strong` ฯลฯ |
| `tsconfig.json` | alias `@/*` ชี้ `./src/*` |

`src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## 3. ตัวแปรสีธีม (`globals.css`, ธีมหลัก `:root`)

สีหลักของแบรนด์ teal `#009FA5` (`--primary: 182 100% 32%`) ใช้กับไอคอน เส้น และพื้นหลังอ่อน ส่วน **ตัวหนังสือและปุ่มพื้น teal** ใช้ `--primary-strong` (`182 100% 24%` ≈ `#00767A`) เพื่อให้ contrast ผ่าน 4.5:1 ปุ่ม `Button` แบบ default ใช้ `bg-primary-strong` อยู่แล้ว

```css
:root {
    --background: 200 24% 98%;
    /* #F7FAFB cool near-white */
    --foreground: 202 40% 16%;
    /* #18333B slate ink */
    --card: 0 0% 100%;
    /* white surface */
    --card-foreground: 202 40% 16%;
    --popover: 0 0% 100%;
    --popover-foreground: 202 40% 16%;
    --primary: 182 100% 32%;
    /* brand #009FA5 */
    --primary-foreground: 0 0% 100%;
    /* Darker teal for text and filled buttons: >= 4.5:1 on white and on --accent. */
    --primary-strong: 182 100% 24%;
    --secondary: 190 30% 95%;
    --secondary-foreground: 202 40% 16%;
    --muted: 200 24% 96%;
    --muted-foreground: 202 14% 42%;
    /* #5C6B70 */
    --accent: 182 60% 93%;
    /* soft teal tint */
    --accent-foreground: 182 100% 24%;
    --destructive: 0 72% 50%;
    --destructive-foreground: 0 0% 100%;
    --border: 200 20% 90%;
    /* #DDE5E8 hairline */
    --input: 200 20% 88%;
    --ring: 182 100% 32%;
    --radius: 0.5rem;
    color-scheme: light;
    --sidebar-background: 0 0% 100%;
    --sidebar-foreground: 202 40% 16%;
    --sidebar-primary: 182 100% 32%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 182 60% 93%;
    --sidebar-accent-foreground: 182 100% 24%;
    --sidebar-border: 200 20% 90%;
    --sidebar-ring: 182 100% 32%;
  }
```

ต้องมี `primary.strong` และสี brand ใน `tailwind.config.js` ด้วย

```js
primary: {
  DEFAULT: 'hsl(var(--primary))',
  foreground: 'hsl(var(--primary-foreground))',
  strong: 'hsl(var(--primary-strong))'
},
brand: '#009FA5',
'brand-dark': '#007D82',
'brand-soft': '#134E4A',
```

และ plugin: `plugins: [require("tailwindcss-animate")]`

## 4. กฎที่ใช้กับ component ทุกชิ้น

- ปุ่มและช่องกรอกสูง 36px (`h-9`) บนจอใหญ่ พื้นที่แตะบนมือถืออย่างน้อย 36–44px
- ขอบมน `rounded-lg` / `rounded-xl` วงโฟกัส `ring-[3px] ring-ring/40`
- ตัวหนังสือ `text-base` / `text-sm` / `text-xs` (ฟอนต์ LINE Seed Sans TH)
- รองรับจอ iPhone 11 (414px) ขึ้นไป ตรวจแล้วที่ 390, 414, 768
- 3D ใช้ [use-idle-frameloop](hooks/UseIdleFrameloop.md) และห้องเรียก `useGLTF.preload()` นอก component
