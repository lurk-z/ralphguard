/**
 * Bounded intent recognition for the deterministic demo (no model call).
 * Live agents replace this later; the engine only depends on the `Intent` shape.
 */
import type { AgentRole } from "./events.ts";

export type Intent =
  | { kind: "read"; subject?: string }
  | { kind: "commission"; multiRole: boolean; title: string }
  | { kind: "clarify"; question: string };

const READ = /(^ช่วย(ดู|อธิบาย|บอก)|มีอะไร|อะไรบ้าง|ไหม|มั้ย|หรือเปล่า|เท่าไร|เท่าไหร่|ยังไง|อย่างไร|ทำไม|ผลเป็น|ดูผล|กราฟ|ตาราง|\?)/;
const COMMISSION = /(ทำ|สร้าง|พัฒนา|ลอง|ออกแบบ|เอา.+ออก|ตัด.+ออก|เปลี่ยน|ปรับ|ตรวจ|ทบทวน|ค้นหลักฐาน|สรุป)/;
/** A new product goal needs brief, evidence, recipe and screening: more than one role. */
const NEW_PRODUCT = /(คลีนเซอร์|โทนเนอร์|เซรั่ม|ครีม|โลชั่น|สูตรใหม่|(?:ทำ|สร้าง|ออกแบบ|พัฒนา)\s*สูตร|ผลิตภัณฑ์|ทางเลือก)/;
const VERSION = /\bV\d+(?:-[A-Z]+)?\b/i;

/** The demo Director names the conversation from the user's brief. An API can supply its own title. */
export function demoJobTitle(brief: string) {
  const subject = brief.trim().replace(/^ขอเปิดโจทย์\s*·\s*/, "")
    .replace(/^(?:รบกวน|ช่วย)?\s*(?:ออกแบบ|สร้าง|พัฒนา|ทำ|ทดลอง|ลอง)\s*/, "")
    .replace(/(?:ให้หน่อย|ให้ที|หน่อย|ด้วย)?\s*(?:ครับ|ค่ะ|คะ)?[.!?]*$/, "")
    .replace(/\s+/g, " ").trim();
  return subject || brief.trim() || "การทดลอง";
}

export function classifyIntent(text: string): Intent {
  const t = text.trim();
  const subject = t.match(VERSION)?.[0]?.toUpperCase();
  const asks = READ.test(t);
  const orders = COMMISSION.test(t.replace(/^ช่วย(ดู|อธิบาย|บอก)/, ""));
  if (/(?:สร้าง|ทำ|แสดง|ขอ|ดู)\s*(?:เป็น)?\s*(?:กราฟ|ตาราง)/.test(t) && !NEW_PRODUCT.test(t)) return { kind: "read", subject };

  // "ช่วยดู…", "V1 มีอะไรบ้าง", "ใน V1 มีน้ำหอมไหม" are questions about existing data.
  if (asks && !/^ช่วยทำ|สร้าง|ลองสูตร/.test(t)) return { kind: "read", subject };
  if (orders) return { kind: "commission", multiRole: NEW_PRODUCT.test(t) && /ทำ|สร้าง|พัฒนา|ลอง|ออกแบบ/.test(t), title: t.slice(0, 60) };
  return { kind: "clarify", question: "ต้องการให้ดูข้อมูลที่มีอยู่ หรือให้เริ่มทดลองสูตรใหม่?" };
}

/** Who owns a commissioned job. A new multi-role goal goes to the Lab Director. */
export function ownerFor(intent: Extract<Intent, { kind: "commission" }>, current: AgentRole): AgentRole {
  return intent.multiRole ? "director" : current;
}
