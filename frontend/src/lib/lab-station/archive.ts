import { isStationEndpointId, type StationEndpointId } from "./endpoints";

/**
 * Fridge archive: one record per kept aliquot, stored per project next to the project workspace
 * (`ralphguard:lab-archive:v1:<projectId>`). Discarded aliquots never get a record, and nothing
 * here touches the project's assessments.
 */

const KEY_PREFIX = "ralphguard:lab-archive:v1:";
export const FRIDGE_CAPACITY = 8;

export type ArchiveRecord = {
  /** `${assessmentId}:${endpoint}` — one kept aliquot per endpoint of one tested revision. */
  id: string;
  projectId: number;
  assessmentId: string;
  endpoint: StationEndpointId;
  formulaId: string | null;
  formulaName: string;
  formulaSignature: string;
  slot: number;
  storedAt: string;
};

export type ArchiveStorage = Pick<Storage, "getItem" | "setItem">;

function storage(): ArchiveStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function key(projectId: number) {
  return Number.isSafeInteger(projectId) && projectId > 0 ? `${KEY_PREFIX}${projectId}` : null;
}

export function archiveRecordId(assessmentId: string, endpoint: StationEndpointId) {
  return `${assessmentId}:${endpoint}`;
}

function normalize(value: unknown, projectId: number): ArchiveRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.assessmentId !== "string" || !isStationEndpointId(v.endpoint)) return null;
  const slot = Number(v.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= FRIDGE_CAPACITY) return null;
  return {
    id: archiveRecordId(v.assessmentId, v.endpoint),
    projectId,
    assessmentId: v.assessmentId,
    endpoint: v.endpoint,
    formulaId: typeof v.formulaId === "string" ? v.formulaId : null,
    formulaName: typeof v.formulaName === "string" ? v.formulaName : "",
    formulaSignature: typeof v.formulaSignature === "string" ? v.formulaSignature : "",
    slot,
    storedAt: typeof v.storedAt === "string" ? v.storedAt : "",
  };
}

export function loadArchive(projectId: number, store: ArchiveStorage | null = storage()): ArchiveRecord[] {
  const k = key(projectId);
  if (!k || !store) return [];
  try {
    const raw = store.getItem(k);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    const seenSlots = new Set<number>();
    const seenIds = new Set<string>();
    const out: ArchiveRecord[] = [];
    for (const item of Array.isArray(list) ? list : []) {
      const r = normalize(item, projectId);
      if (!r || seenSlots.has(r.slot) || seenIds.has(r.id)) continue;
      seenSlots.add(r.slot);
      seenIds.add(r.id);
      out.push(r);
    }
    return out.sort((a, b) => a.slot - b.slot);
  } catch {
    return [];
  }
}

export function freeSlot(records: ArchiveRecord[], capacity = FRIDGE_CAPACITY): number | null {
  const used = new Set(records.map((r) => r.slot));
  for (let i = 0; i < capacity; i++) if (!used.has(i)) return i;
  return null;
}

export type SaveResult =
  | { ok: true; record: ArchiveRecord; created: boolean }
  | { ok: false; reason: "full" | "storage"; messageTh: string };

/**
 * Store one kept aliquot. Idempotent: saving the same assessment + endpoint again returns the
 * existing record (and its slot) instead of adding a second one.
 */
export function saveArchiveRecord(
  input: Omit<ArchiveRecord, "id" | "slot" | "storedAt">,
  store: ArchiveStorage | null = storage(),
  now = new Date(),
): SaveResult {
  const k = key(input.projectId);
  if (!k || !store) return { ok: false, reason: "storage", messageTh: "บันทึกตัวอย่างไม่ได้: เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล" };
  const records = loadArchive(input.projectId, store);
  const id = archiveRecordId(input.assessmentId, input.endpoint);
  const existing = records.find((r) => r.id === id);
  if (existing) return { ok: true, record: existing, created: false };
  const slot = freeSlot(records);
  if (slot === null) {
    return { ok: false, reason: "full", messageTh: `ตู้เย็นเต็มแล้ว (${FRIDGE_CAPACITY}/${FRIDGE_CAPACITY} ช่อง) เก็บตัวอย่างนี้เพิ่มไม่ได้ ตัวอย่างยังอยู่บนถาด เลือกทิ้งได้` };
  }
  const record: ArchiveRecord = { ...input, id, slot, storedAt: now.toISOString() };
  try {
    store.setItem(k, JSON.stringify([...records, record]));
  } catch {
    return { ok: false, reason: "storage", messageTh: "บันทึกตัวอย่างไม่สำเร็จ พื้นที่จัดเก็บของเบราว์เซอร์อาจเต็ม" };
  }
  // read back: only a record that is really stored counts as kept
  const back = loadArchive(input.projectId, store).find((r) => r.id === id);
  if (!back) return { ok: false, reason: "storage", messageTh: "บันทึกตัวอย่างไม่สำเร็จ" };
  return { ok: true, record: back, created: true };
}
