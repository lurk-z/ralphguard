const FACE_REGION_MAP_URL = "/models/head-region-map.png";

const REGION_LABELS: Record<number, string> = {
  1: "หนังศีรษะ",
  2: "หน้าผาก",
  3: "ตา / คิ้ว",
  4: "จมูก",
  5: "แก้ม",
  6: "ปาก / ริมฝีปาก",
  7: "คาง",
  8: "หูซ้าย",
  9: "หูขวา",
  10: "หลังใบหูซ้าย",
  11: "หลังใบหูขวา",
  12: "หลังศีรษะ",
  13: "คอ",
  14: "หลัง",
  15: "ลำตัว",
};

export type FaceRegionMap = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

let cachedMapPromise: Promise<FaceRegionMap | null> | null = null;

/** Load the UV region map once per browser session. A null result is safe: the
 * caller deliberately retains its existing XYZ classifier as fallback. */
export function loadFaceRegionMap(): Promise<FaceRegionMap | null> {
  if (cachedMapPromise) return cachedMapPromise;
  cachedMapPromise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return resolve(null);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({
        width: canvas.width,
        height: canvas.height,
        data: imageData.data,
      });
    };
    image.onerror = () => resolve(null);
    image.src = FACE_REGION_MAP_URL;
  });
  return cachedMapPromise;
}

/** Resolve an anatomical label from the same raw UV orientation used by the
 * paint masks (CanvasTexture.flipY=false). Unknown pixels return null so XYZ
 * can remain the final fallback. */
export function faceRegionAtUv(
  map: FaceRegionMap | null,
  uv: { x: number; y: number },
): string | null {
  if (!map) return null;
  const x = Math.max(0, Math.min(map.width - 1, Math.floor(uv.x * map.width)));
  const y = Math.max(0, Math.min(map.height - 1, Math.floor(uv.y * map.height)));
  const regionId = map.data[(y * map.width + x) * 4];
  return REGION_LABELS[regionId] ?? null;
}
