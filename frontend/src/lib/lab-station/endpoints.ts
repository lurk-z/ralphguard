import type { EndpointCode } from "@/lib/api";

/**
 * The four endpoints the Ralph Lab testing station shows, in tray order.
 * Node names in the room's `test_station` group are derived from `id` (tray_<id>, rack_slot_<id>, aliquot_<id>, ...),
 * so adding an endpoint here plus one more tray in Blender is all a new station needs.
 */
export type StationEndpointId = Extract<EndpointCode, "skin" | "eye" | "sens" | "acute">;

/** How the 3D scene may illustrate a result. The result card is always the source of truth. */
export type EndpointVisual =
  | "skin-reaction" // redness / swelling on the skin insert may illustrate the score
  | "skin-reaction-illustrative" // same insert, but every visible reaction is labelled illustrative
  | "eye" // eye-specific insert and card
  | "card-only"; // no tissue look at all: the result is read from the card

export type StationEndpoint = {
  id: StationEndpointId;
  labelTh: string;
  labelEn: string;
  visual: EndpointVisual;
  /** One-line reminder of what the tray illustrates; shown on the result card. */
  visualNoteTh: string;
};

export const STATION_ENDPOINTS: readonly StationEndpoint[] = [
  {
    id: "skin",
    labelTh: "การระคายเคืองผิวหนัง",
    labelEn: "Skin irritation",
    visual: "skin-reaction",
    visualNoteTh: "รอยแดงหรือบวมบนชิ้นผิวหนังเป็นภาพประกอบระดับคะแนนคัดกรอง ไม่ใช่ผลทดลองจริง",
  },
  {
    id: "eye",
    labelTh: "การระคายเคืองดวงตา",
    labelEn: "Eye irritation",
    visual: "eye",
    visualNoteTh: "แบบจำลองดวงตาใช้แสดงระดับคะแนนคัดกรองสำหรับดวงตาเท่านั้น",
  },
  {
    id: "sens",
    labelTh: "การแพ้ผิวหนัง",
    labelEn: "Skin sensitization",
    visual: "skin-reaction-illustrative",
    visualNoteTh: "ปฏิกิริยาที่เห็นบนชิ้นผิวหนังเป็นภาพประกอบเท่านั้น การแพ้จริงต้องประเมินด้วยวิธีที่เหมาะสม",
  },
  {
    id: "acute",
    labelTh: "ความเป็นพิษเฉียบพลัน",
    labelEn: "Acute toxicity",
    visual: "card-only",
    visualNoteTh: "ความเป็นพิษเฉียบพลันแสดงเป็นการ์ดผลเท่านั้น ไม่อนุมานจากลักษณะผิวหนัง",
  },
] as const;

export const STATION_ENDPOINT_IDS = STATION_ENDPOINTS.map((e) => e.id);

export function stationEndpoint(id: StationEndpointId): StationEndpoint {
  const found = STATION_ENDPOINTS.find((e) => e.id === id);
  if (!found) throw new Error(`unknown station endpoint ${id}`);
  return found;
}

export function isStationEndpointId(value: unknown): value is StationEndpointId {
  return typeof value === "string" && (STATION_ENDPOINT_IDS as string[]).includes(value);
}
