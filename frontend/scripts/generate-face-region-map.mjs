import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import draco3d from "draco3d";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, "..");
const MODEL_PATH = path.join(FRONTEND_DIR, "public", "models", "head.glb");
const OUTPUT_PATH = path.join(
  FRONTEND_DIR,
  "public",
  "models",
  "head-region-map.png",
);
const MAP_SIZE = 1024;

// The red channel stores a stable anatomical region ID. Runtime labels live in
// src/lib/face-region-map.ts. ID 0 is deliberately reserved for XYZ fallback.
const REGION = Object.freeze({
  UNKNOWN: 0,
  SCALP: 1,
  FOREHEAD: 2,
  EYE_BROW: 3,
  NOSE: 4,
  CHEEK: 5,
  MOUTH: 6,
  CHIN: 7,
  LEFT_EAR: 8,
  RIGHT_EAR: 9,
  BEHIND_LEFT_EAR: 10,
  BEHIND_RIGHT_EAR: 11,
  BACK_OF_HEAD: 12,
  NECK: 13,
  BACK: 14,
  TORSO: 15,
});

function parseGlb(buffer) {
  if (buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error(`${MODEL_PATH} is not a binary glTF file`);
  }

  let json = null;
  let binary = null;
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) {
      json = JSON.parse(data.toString("utf8").replace(/\0+$/g, ""));
    } else if (type === 0x004e4942) {
      binary = data;
    }
    offset += 8 + length;
  }

  if (!json || !binary) throw new Error("GLB is missing JSON or BIN data");
  return { json, binary };
}

function quaternionTransform([x, y, z], node) {
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  x *= sx;
  y *= sy;
  z *= sz;

  // v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
  const uvx = qy * z - qz * y;
  const uvy = qz * x - qx * z;
  const uvz = qx * y - qy * x;
  const uuvx = qy * uvz - qz * uvy;
  const uuvy = qz * uvx - qx * uvz;
  const uuvz = qx * uvy - qy * uvx;
  return [
    x + 2 * (qw * uvx + uuvx) + tx,
    y + 2 * (qw * uvy + uuvy) + ty,
    z + 2 * (qw * uvz + uuvz) + tz,
  ];
}

async function decodeHeadGeometry(glb) {
  const primitive = glb.json.meshes[0].primitives[0];
  const extension = primitive.extensions?.KHR_draco_mesh_compression;
  if (!extension) throw new Error("Head mesh is not Draco-compressed");

  const view = glb.json.bufferViews[extension.bufferView];
  const compressed = glb.binary.subarray(
    view.byteOffset ?? 0,
    (view.byteOffset ?? 0) + view.byteLength,
  );
  const decoderModule = await draco3d.createDecoderModule({});
  const decoderBuffer = new decoderModule.DecoderBuffer();
  const decoder = new decoderModule.Decoder();
  const mesh = new decoderModule.Mesh();
  decoderBuffer.Init(new Int8Array(compressed), compressed.byteLength);
  const status = decoder.DecodeBufferToMesh(decoderBuffer, mesh);
  if (!status.ok() || mesh.ptr === 0) {
    throw new Error(status.error_msg() || "Unable to decode head mesh");
  }

  const readFloatAttribute = (uniqueId, components) => {
    const attribute = decoder.GetAttributeByUniqueId(mesh, uniqueId);
    if (!attribute || attribute.ptr === 0) {
      throw new Error(`Missing Draco attribute ${uniqueId}`);
    }
    const values = new decoderModule.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
    const result = new Float32Array(mesh.num_points() * components);
    for (let index = 0; index < result.length; index += 1) {
      result[index] = values.GetValue(index);
    }
    decoderModule.destroy(values);
    return result;
  };

  const positions = readFloatAttribute(extension.attributes.POSITION, 3);
  const uvs = readFloatAttribute(extension.attributes.TEXCOORD_0, 2);
  const indices = new Uint32Array(mesh.num_faces() * 3);
  const face = new decoderModule.DracoInt32Array();
  for (let faceIndex = 0; faceIndex < mesh.num_faces(); faceIndex += 1) {
    decoder.GetFaceFromMesh(mesh, faceIndex, face);
    indices[faceIndex * 3] = face.GetValue(0);
    indices[faceIndex * 3 + 1] = face.GetValue(1);
    indices[faceIndex * 3 + 2] = face.GetValue(2);
  }

  decoderModule.destroy(face);
  decoderModule.destroy(mesh);
  decoderModule.destroy(decoder);
  decoderModule.destroy(decoderBuffer);

  const headNode = glb.json.nodes.find((node) => node.mesh === 0) ?? {};
  const worldPositions = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const transformed = quaternionTransform(
      [positions[index], positions[index + 1], positions[index + 2]],
      headNode,
    );
    worldPositions.set(transformed, index);
  }
  return { positions: worldPositions, uvs, indices };
}

function classifyRegion(x, y, z) {
  const absX = Math.abs(x);
  const leftSide = x >= 0;

  // Resolve ears before the horizontal facial bands. The rear/outer side of
  // each pinna is intentionally separate from the visible ear surface.
  if (absX >= 6.4 && y >= 23.2 && y <= 33.7) {
    const behindEar = z < 1.05 || absX > 9.3;
    if (behindEar) {
      return leftSide ? REGION.BEHIND_LEFT_EAR : REGION.BEHIND_RIGHT_EAR;
    }
    return leftSide ? REGION.LEFT_EAR : REGION.RIGHT_EAR;
  }

  // Back-facing surface must be resolved before the ordinary Y bands.
  if (z < 1.2 && y > 16) return REGION.BACK_OF_HEAD;
  if (z < 1.8 && y <= 16) return REGION.BACK;

  if (y > 36.8) return REGION.SCALP;
  if (y > 32.3) return REGION.FOREHEAD;
  if (y > 27.8) return REGION.EYE_BROW;
  if (y > 24.2) return absX < 2.35 ? REGION.NOSE : REGION.CHEEK;
  if (y > 21.6) return REGION.MOUTH;
  if (y > 18.5) return REGION.CHIN;
  if (y > 11) return REGION.NECK;
  return REGION.TORSO;
}

function rasterizeRegionMap({ positions, uvs, indices }) {
  const pixels = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const edge = (ax, ay, bx, by, px, py) =>
    (px - ax) * (by - ay) - (py - ay) * (bx - ax);

  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index];
    const ib = indices[index + 1];
    const ic = indices[index + 2];
    const ax = uvs[ia * 2] * (MAP_SIZE - 1);
    const ay = uvs[ia * 2 + 1] * (MAP_SIZE - 1);
    const bx = uvs[ib * 2] * (MAP_SIZE - 1);
    const by = uvs[ib * 2 + 1] * (MAP_SIZE - 1);
    const cx = uvs[ic * 2] * (MAP_SIZE - 1);
    const cy = uvs[ic * 2 + 1] * (MAP_SIZE - 1);
    const area = edge(ax, ay, bx, by, cx, cy);
    if (Math.abs(area) < 1e-8) continue;

    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(MAP_SIZE - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(MAP_SIZE - 1, Math.ceil(Math.max(ay, by, cy)));

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const sampleX = px + 0.5;
        const sampleY = py + 0.5;
        const wa = edge(bx, by, cx, cy, sampleX, sampleY) / area;
        const wb = edge(cx, cy, ax, ay, sampleX, sampleY) / area;
        const wc = 1 - wa - wb;
        if (wa < -1e-5 || wb < -1e-5 || wc < -1e-5) continue;

        const x =
          positions[ia * 3] * wa +
          positions[ib * 3] * wb +
          positions[ic * 3] * wc;
        const y =
          positions[ia * 3 + 1] * wa +
          positions[ib * 3 + 1] * wb +
          positions[ic * 3 + 1] * wc;
        const z =
          positions[ia * 3 + 2] * wa +
          positions[ib * 3 + 2] * wb +
          positions[ic * 3 + 2] * wc;
        pixels[py * MAP_SIZE + px] = classifyRegion(x, y, z);
      }
    }
  }

  // Fill a two-pixel fringe around UV islands. Raycast UVs can land on a
  // rasterized triangle edge; this keeps those edge hits on the UV path rather
  // than needlessly falling back to XYZ.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = pixels.slice();
    for (let y = 1; y < MAP_SIZE - 1; y += 1) {
      for (let x = 1; x < MAP_SIZE - 1; x += 1) {
        const pixelIndex = y * MAP_SIZE + x;
        if (pixels[pixelIndex] !== REGION.UNKNOWN) continue;
        const neighbours = [
          pixels[pixelIndex - 1],
          pixels[pixelIndex + 1],
          pixels[pixelIndex - MAP_SIZE],
          pixels[pixelIndex + MAP_SIZE],
        ].filter(Boolean);
        if (neighbours.length) next[pixelIndex] = neighbours[0];
      }
    }
    pixels.set(next);
  }
  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodeRegionPng(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(MAP_SIZE, 0);
  header.writeUInt32BE(MAP_SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale; the sample value is the region ID
  const rows = Buffer.alloc((MAP_SIZE + 1) * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y += 1) {
    const rowOffset = y * (MAP_SIZE + 1);
    rows[rowOffset] = 0; // PNG filter: none
    Buffer.from(pixels.buffer, pixels.byteOffset + y * MAP_SIZE, MAP_SIZE).copy(
      rows,
      rowOffset + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const glb = parseGlb(fs.readFileSync(MODEL_PATH));
const geometry = await decodeHeadGeometry(glb);
const regionPixels = rasterizeRegionMap(geometry);
fs.writeFileSync(OUTPUT_PATH, encodeRegionPng(regionPixels));

const counts = new Map();
for (const region of regionPixels) {
  if (region === REGION.UNKNOWN) continue;
  counts.set(region, (counts.get(region) ?? 0) + 1);
}
console.log(
  `Generated ${path.relative(FRONTEND_DIR, OUTPUT_PATH)} (${MAP_SIZE}x${MAP_SIZE})`,
);
console.log(
  `UV coverage: ${[...counts.values()].reduce((sum, count) => sum + count, 0).toLocaleString()} pixels; regions: ${counts.size}`,
);
