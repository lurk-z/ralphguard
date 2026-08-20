"use client";

/**
 * SymptomLabModel — MARK-then-RUN symptom viewer for /symptom-lab.
 *
 * Flow (mirrors the production assess flow):
 *   1. Pick a symptom.
 *   2. Paint WHITE on the skin to mark the test area (like smearing a test cream).
 *   3. Press RUN — the marked area develops the selected symptom.
 *
 * Each symptom has its OWN grayscale mask + reveal + severity, so symptoms
 * COEXIST: a pixel shows whatever symptom(s) were actually painted there, and
 * switching/adding a symptom never erases the others. Run eases that symptom's
 * reveal 0→1, cross-fading its cream marks into the reaction.
 *
 * The GLSL only touches the skin material (Material.001) via onBeforeCompile,
 * leaving brows/lashes/eyes untouched — same technique as FaceIrritationModel.
 *
 * ─────────────────────── SYMPTOM MAP ───────────────────────
 * (each block in the fragment shader is tagged — search the [SX:*] tag to jump)
 *
 *   • redness  (ผิวแดง)  → tag [SX:REDNESS] · uniform uRedness
 *       รอยแดงระเรื่อเนียนทั้งบริเวณ ไม่เป็นจุด
 *   • papule   (ตุ่มแดง)  → tag [SX:PAPULE]  · uniform uPapule
 *       ตุ่มเม็ดเล็กนูนแดง (matte) เกาะตามรอยแดงเป็นทาง — แดงเฉพาะบนตุ่ม
 *   • peeling  (ผิวลอก)  → tag [SX:PEELING] · uniform uPeeling
 *       ขุยขาวเล็กๆ โค้ง ผิวแห้งด้าน เป็นหย่อม (iso-band)
 *   • edema    (ผิวบวม)  → tag [SX:EDEMA]   · uniform uEdema (+ [SX:EDEMA-VERT] swell)
 *       บวมเรียบต่อเนื่องทั้งผืน ผิวตึงเงา แดงระเรื่อ
 *   • eye      (ตาแดง)   → tag [SX:EYE] on the eyeball material · uniform uEyeRed
 *       ตาขาวแดงก่ำ — หมวดแยก เลือกซ้าย/ขวา/สองข้าง ไม่ต้องทา/Run
 *
 * Each skin symptom has its OWN mask + reveal + severity → they COEXIST.
 *
 * Asset: frontend/public/models/head.glb (Draco-compressed).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SemanticIcon } from "@/components/SemanticIcon";
import {
  faceRegionAtUv,
  loadFaceRegionMap,
  type FaceRegionMap,
} from "@/lib/face-region-map";
import type { PaintMaskSnapshot } from "@/lib/project-workspace";

// The four paintable skin symptoms (eye redness is a separate, non-painted category).
export type SkinKey = "redness" | "papule" | "peeling" | "edema";
const SKIN_KEYS: SkinKey[] = ["redness", "papule", "peeling", "edema"];
const SHARED_EXPOSURE_KEYS: SkinKey[] = ["redness"];
const MAX_PAINT_DABS_PER_POINTER_MOVE = 32;

const snapshotMaskDataUrls = (snapshot: PaintMaskSnapshot): string[] => {
  if (snapshot.exposure) return [snapshot.exposure];
  return SKIN_KEYS.map((key) => snapshot[key]).filter(
    (value): value is string => Boolean(value),
  );
};

// Brighten the base skin albedo (same lift the production model uses).
const SKIN_LIFT = 0.7;
const SKIN_LIFT_GLSL = `
diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.55 + 0.10, vec3(1.0)), uSkinLift);`;

// Value-noise + fbm — injected into BOTH vertex (edema blob) and fragment.
const NOISE_GLSL = `
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0,0.0,0.0));
  float n100 = hash13(i + vec3(1.0,0.0,0.0));
  float n010 = hash13(i + vec3(0.0,1.0,0.0));
  float n110 = hash13(i + vec3(1.0,1.0,0.0));
  float n001 = hash13(i + vec3(0.0,0.0,1.0));
  float n101 = hash13(i + vec3(1.0,0.0,1.0));
  float n011 = hash13(i + vec3(0.0,1.0,1.0));
  float n111 = hash13(i + vec3(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 3; i++){ s += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}`;

// Cellular "spot" field (fragment only): scatter round dots of RANDOM size and
// RANDOM intensity through 3D space so redness reads as many discrete specks
// (broken capillaries) rather than a flat wash.
const SPOTS_GLSL = `
float spots(vec3 P, float freq, float seed){
  vec3 p = P * freq + seed;
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float v = 0.0;
  for(int i=-1;i<=1;i++)
  for(int j=-1;j<=1;j++)
  for(int k=-1;k<=1;k++){
    vec3 o = vec3(float(i), float(j), float(k));
    vec3 rnd = hash33(ip + o + seed);
    vec3 center = o + rnd;                    // random dot centre in this cell
    float d = length(fp - center);
    float radius = mix(0.10, 0.48, rnd.x);    // varied dot size
    float inten  = mix(0.30, 1.00, rnd.y);    // varied dot redness
    v = max(v, inten * (1.0 - smoothstep(radius * 0.35, radius, d)));
  }
  return v;
}
// Stable round papule domes. Severity controls BOTH how many candidate cells
// survive and each dome's radius, keeping moderate results sparse and small.
float papuleDomes(vec3 P, float freq, float seed, float severity){
  vec3 p = P * freq + seed;
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float sev = clamp(severity, 0.0, 1.0);
  float growth = smoothstep(0.14, 1.0, sev);
  float density = mix(0.09, 0.92, growth);
  float radiusScale = mix(0.46, 1.28, growth);
  float v = 0.0;
  for(int i=-1;i<=1;i++)
  for(int j=-1;j<=1;j++)
  for(int k=-1;k<=1;k++){
    vec3 o = vec3(float(i), float(j), float(k));
    vec3 rnd = hash33(ip + o + seed);
    float keep = smoothstep(1.0 - density - 0.04, 1.0 - density + 0.04, rnd.z);
    vec3 center = o + rnd;
    float radius = mix(0.22, 0.36, rnd.x) * radiusScale;
    float q = clamp(length(fp - center) / max(radius, 1e-4), 0.0, 1.0);
    // Hemispherical height: round centre with a soft circular edge.
    float dome = pow(max(0.0, 1.0 - q * q), 1.5);
    v = max(v, keep * dome);
  }
  return v;
}
// Worley cellular: returns nearest (F1) and 2nd-nearest (F2) feature distances.
// Cell borders sit where F2-F1 is small -> used to draw dry-crack networks.
vec2 worley(vec3 P, float freq, float seed){
  vec3 p = P * freq + seed;
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float f1 = 9.0, f2 = 9.0;
  for(int i=-1;i<=1;i++)
  for(int j=-1;j<=1;j++)
  for(int k=-1;k<=1;k++){
    vec3 o = vec3(float(i), float(j), float(k));
    vec3 rnd = hash33(ip + o + seed);
    float d = length(fp - (o + rnd));
    if(d < f1){ f2 = f1; f1 = d; } else if(d < f2){ f2 = d; }
  }
  return vec2(f1, f2);
}`;

export type PaintApi = {
  clear: () => void;
  conceal: () => void;
  run: () => void;
  fillAll: () => void;
  snapshot: () => PaintMaskSnapshot;
};
export type PaintHoverInfo = {
  x: number;
  y: number;
  region: string;
  symptoms: SkinKey[];
};

export type AssessmentEndpointScores = {
  skin: number;
  eye: number;
  sens: number;
  acute: number;
};

/**
 * Visual cut-offs for the formula-level 0..100 risk bands shown by the UI.
 *
 * Do not use the per-molecule classifier operating thresholds here: the value
 * reaching this renderer is already a concentration-weighted formula score,
 * not a raw single-molecule probability. Keeping the visual cut-off aligned
 * with the UI prevents a "moderate" result from being silently rendered as 0.
 */
export const ASSESSMENT_VISUAL_THRESHOLDS = {
  skin: 0.25,
  eye: 0.25,
  sens: 0.25,
  acute: 0.25,
  // Peeling is a deliberately conservative visual proxy for a strong skin
  // response. It is not a separate RalphGuard prediction endpoint.
  skinPeeling: 0.75,
} as const;

function visualActivation(score: number, threshold: number): number {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  if (value < threshold) return 0;

  // Give the first moderate band a faint but readable signal, then scale the
  // effect smoothly to full intensity. Low-band results remain exactly zero,
  // so e.g. sens=1/100 cannot create papules.
  const progress = (value - threshold) / (1 - threshold);
  return Math.min(1, 0.14 + progress * 0.86);
}

/**
 * Single source of truth for mapping RalphGuard's four assessment endpoints to
 * the symptom renderer. Inputs are normalized 0..1 scores.
 *
 * Skin irritation drives erythema and edema, matching the two visible reactions
 * graded by OECD TG 404. Sensitisation is represented by papules only as a
 * visual proxy after the model's positive cut-off. Acute toxicity remains a
 * systemic/dose endpoint; the renderer therefore uses a whole-face pallor and
 * clammy-skin proxy instead of pretending it creates a local painted lesion.
 */
export function mapAssessmentEndpointsToSymptoms(scores: AssessmentEndpointScores): {
  sev: Record<SkinKey, number>;
  eyeRed: number;
  acuteSystemic: number;
} {
  const skinReaction = visualActivation(scores.skin, ASSESSMENT_VISUAL_THRESHOLDS.skin);
  const eyeReaction = visualActivation(scores.eye, ASSESSMENT_VISUAL_THRESHOLDS.eye);
  const sensitisationReaction = visualActivation(
    scores.sens,
    ASSESSMENT_VISUAL_THRESHOLDS.sens,
  );
  const acuteReaction = visualActivation(
    scores.acute,
    ASSESSMENT_VISUAL_THRESHOLDS.acute,
  );
  const peelingReaction = visualActivation(
    scores.skin,
    ASSESSMENT_VISUAL_THRESHOLDS.skinPeeling,
  );

  return {
    sev: {
      redness: skinReaction,
      papule: sensitisationReaction,
      // Once desquamation is active it needs enough contrast to remain legible
      // on top of simultaneous erythema and edema.
      peeling: Math.min(1, peelingReaction * 1.3),
      // A positive skin-irritation result includes swelling in this product's
      // visual language. Keep it subtler than erythema while using the same
      // formula-risk band cut-off.
      edema: skinReaction * 0.9,
    },
    eyeRed: eyeReaction,
    acuteSystemic: acuteReaction,
  };
}

/** Loop every GLTF clip (head.glb ships eye-dart clips) so the face feels alive. */
function usePlayAllAnimations(
  actions: Record<string, THREE.AnimationAction | null>,
) {
  useEffect(() => {
    const started = Object.values(actions).filter(Boolean) as THREE.AnimationAction[];
    started.forEach((a) => a.reset().setLoop(THREE.LoopRepeat, Infinity).play());
    return () => started.forEach((a) => a.stop());
  }, [actions]);
}

/** Frame the camera on the FACE skin mesh (Material.001), not the whole group. */
function useFaceCameraFit(
  groupRef: React.RefObject<THREE.Group>,
  distanceScale = 1.5,
) {
  const { camera, get } = useThree();
  const fitted = useRef(false);
  useFrame(() => {
    if (fitted.current) return;
    const root = groupRef.current;
    if (!root) return;
    const controls = get().controls as unknown as {
      target: THREE.Vector3;
      minDistance: number;
      maxDistance: number;
      update: () => void;
    } | null;
    if (!controls) return;

    let skinMesh: THREE.Mesh | null = null;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!skinMesh && m.isMesh && (m.material as THREE.Material | undefined)?.name === "Material.001") {
        skinMesh = m;
      }
    });
    if (!skinMesh) return;

    const box = new THREE.Box3().setFromObject(skinMesh);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    const persp = camera as THREE.PerspectiveCamera;
    const fovRad = (persp.fov * Math.PI) / 180;
    const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * distanceScale;

    const targetY = center.y - size.y * 0.035;
    const cameraTarget = new THREE.Vector3(center.x, targetY, center.z);

    persp.position.set(center.x, targetY, center.z + distance);
    persp.near = Math.max(0.01, distance / 100);
    persp.far = distance * 100;
    persp.updateProjectionMatrix();
    persp.lookAt(cameraTarget);

    controls.target.copy(cameraTarget);
    controls.minDistance = distance * 0.18; // allow close-up inspection of symptoms
    controls.maxDistance = distance * 2.5;
    controls.update();

    fitted.current = true;
  });
}

export function PaintSymptomModel({
  paintOwnerKey = "standalone",
  paintEnabled = true,
  activeSymptom,
  sev,
  brushSizePct,
  eyeLeft,
  eyeRight,
  acuteSystemic = 0,
  apiRef,
  eraseMode = false,
  onHover,
  paintSymptoms,
  initialPaint,
  onPaintChange,
  occupiedPaint = [],
  onPaintBlocked,
  cameraDistanceScale,
  sharedExposureMask = false,
}: {
  paintOwnerKey?: string;
  paintEnabled?: boolean;
  activeSymptom: SkinKey;
  sev: Record<SkinKey, number>; // 0..1 severity PER symptom (each kept independently)
  brushSizePct: number;
  eyeLeft: number; // 0..1 — left-eye redness (independent of paint/Run)
  eyeRight: number; // 0..1 — right-eye redness
  acuteSystemic?: number; // 0..1 — whole-face visual proxy, never a local lesion
  apiRef?: React.MutableRefObject<PaintApi | null>;
  eraseMode?: boolean; // when true, dragging uses a soft brush to erase every symptom layer
  onHover?: (info: PaintHoverInfo | null) => void;
  // Production assessment can paint several endpoint-driven symptoms with one
  // stroke. The standalone lab omits this and continues to paint only activeSymptom.
  paintSymptoms?: SkinKey[];
  initialPaint?: PaintMaskSnapshot | null;
  onPaintChange?: (snapshot: PaintMaskSnapshot) => void;
  occupiedPaint?: PaintMaskSnapshot[];
  onPaintBlocked?: () => void;
  cameraDistanceScale?: number;
  // Assessment uses one exposure area for all endpoints. The standalone lab
  // leaves this disabled so each symptom continues to own an independent mask.
  sharedExposureMask?: boolean;
}) {
  const { scene: rawScene, animations } = useGLTF("/models/head.glb", true);
  const gl = useThree((s) => s.gl);
  const getState = useThree((s) => s.get);
  const scene = useMemo(() => rawScene.clone(true), [rawScene]);

  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  usePlayAllAnimations(actions);
  useFaceCameraFit(group, cameraDistanceScale);

  const brushSizeRef = useRef(brushSizePct);
  useEffect(() => void (brushSizeRef.current = brushSizePct), [brushSizePct]);
  const eraseRef = useRef(eraseMode);
  useEffect(() => void (eraseRef.current = eraseMode), [eraseMode]);

  // Per-symptom severity uniforms — each holds its own symptom's severity.
  const uRedness = useRef({ value: 0 });
  const uPapule = useRef({ value: 0 });
  const uPeeling = useRef({ value: 0 });
  const uEdema = useRef({ value: 0 });
  const uEyeRedL = useRef({ value: 0 });
  const uEyeRedR = useRef({ value: 0 });
  const uAcuteSystemic = useRef({ value: 0 });
  // Timecourse changes should develop/fade on the model instead of snapping
  // between days. Props update these targets; useFrame eases live uniforms.
  const severityTargets = useRef({
    redness: sev.redness,
    papule: sev.papule,
    peeling: sev.peeling,
    edema: sev.edema,
    eyeLeft,
    eyeRight,
    acuteSystemic,
  });
  // Interaction feedback is independent from predicted severity: the grid
  // remains visible even when the model score rounds to zero.
  const uScanTime = useRef({ value: 0 });
  // Each symptom keeps its OWN severity (so painted symptoms coexist, never
  // zeroed just because another symptom is active).
  useEffect(() => {
    severityTargets.current.redness = sev.redness;
    severityTargets.current.papule = sev.papule;
    severityTargets.current.peeling = sev.peeling;
    severityTargets.current.edema = sev.edema;
  }, [sev.redness, sev.papule, sev.peeling, sev.edema]);
  // Eye redness is its own category — per eye, live (no painting / no Run).
  useEffect(() => {
    severityTargets.current.eyeLeft = eyeLeft;
    severityTargets.current.eyeRight = eyeRight;
    severityTargets.current.acuteSystemic = acuteSystemic;
  }, [eyeLeft, eyeRight, acuteSystemic]);

  const uSkinLift = useRef({ value: SKIN_LIFT });
  const uEdemaScale = useRef({ value: 0 });
  const uPapuleScale = useRef({ value: 0 });
  // One reveal (0->1 eased after that symptom's Run) PER symptom.
  const uRevealRedness = useRef({ value: 0 });
  const uRevealPapule = useRef({ value: 0 });
  const uRevealPeeling = useRef({ value: 0 });
  const uRevealEdema = useRef({ value: 0 });
  const revealRefs: Record<SkinKey, React.MutableRefObject<{ value: number }>> = {
    redness: uRevealRedness,
    papule: uRevealPapule,
    peeling: uRevealPeeling,
    edema: uRevealEdema,
  };
  const revealTargets = useRef<Record<SkinKey, number>>({
    redness: 0, papule: 0, peeling: 0, edema: 0,
  });
  const painting = useRef(false);
  const lastPaintUv = useRef<THREE.Vector2 | null>(null);
  // Some GLB exports split the jaw/neck from the face while reusing the same
  // skin material. Track every such mesh so paint/erase ray hits are accepted
  // across the full visible skin instead of only the last traversed mesh.
  const skinMeshes = useRef<Set<THREE.Mesh>>(new Set());
  const eyeMeshes = useRef<{ left: THREE.Object3D | null; right: THREE.Object3D | null }>({
    left: null,
    right: null,
  });
  const faceCalibration = useRef<{
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    eyeY: number;
    centerX: number;
    eyeSpan: number;
    leftIsPositiveX: boolean;
  } | null>(null);
  const faceRegionMap = useRef<FaceRegionMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadFaceRegionMap().then((map) => {
      if (!cancelled) faceRegionMap.current = map;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the production paint set in a ref so pointer events always use the
  // latest endpoint mapping; the standalone lab falls back to activeSymptom.
  const paintSymptomsRef = useRef<SkinKey[]>(paintSymptoms ?? [activeSymptom]);
  const onPaintChangeRef = useRef(onPaintChange);
  const onPaintBlockedRef = useRef(onPaintBlocked);
  useEffect(() => void (onPaintChangeRef.current = onPaintChange), [onPaintChange]);
  useEffect(() => void (onPaintBlockedRef.current = onPaintBlocked), [onPaintBlocked]);
  useEffect(() => {
    paintSymptomsRef.current = paintSymptoms?.length ? paintSymptoms : [activeSymptom];
  }, [paintSymptoms, activeSymptom]);
  const writableMaskKeys = sharedExposureMask ? SHARED_EXPOSURE_KEYS : SKIN_KEYS;

  // One 1024² grayscale mask per skin symptom — white where the user painted it.
  const masks = useMemo(() => {
    const make = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return { canvas, ctx, tex };
    };
    if (sharedExposureMask) {
      const exposure = make();
      return {
        redness: exposure,
        papule: exposure,
        peeling: exposure,
        edema: exposure,
      } as Record<SkinKey, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }>;
    }
    return {
      redness: make(), papule: make(), peeling: make(), edema: make(),
    } as Record<SkinKey, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }>;
  }, [sharedExposureMask]);

  // Union of every non-selected formula's paint. It is deliberately separate
  // from the active symptom masks: other formulas remain visible as test-cream
  // marks, but can never inherit the selected formula's assessment severity.
  const occupiedMask = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return { canvas, ctx, tex };
  }, []);
  const dirtyCanvasTextures = useRef<Set<THREE.CanvasTexture>>(new Set());
  const markTextureDirty = (texture: THREE.CanvasTexture) => {
    dirtyCanvasTextures.current.add(texture);
  };
  // Binary version of occupiedMask used only for collision clipping. Keeping
  // it separate preserves the soft visual edge of other formulas while making
  // the no-overlap rule exact at every accepted pixel.
  const occupiedExclusionMask = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    return { canvas, ctx: canvas.getContext("2d")! };
  }, []);
  // A reusable transparent canvas lets one brush dab be clipped by the binary
  // exclusion mask before it is copied into each symptom layer.
  const paintDabMask = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    return { canvas, ctx: canvas.getContext("2d")! };
  }, []);
  const occupiedReady = useRef(false);
  const hasOccupiedPaint = useRef(false);
  const blockedDuringStroke = useRef(false);
  const paintProbe = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    return { canvas, ctx: canvas.getContext("2d")! };
  }, []);

  const hasAnyPaint = () =>
    writableMaskKeys.some((key) => {
      paintProbe.ctx.globalCompositeOperation = "source-over";
      paintProbe.ctx.clearRect(0, 0, paintProbe.canvas.width, paintProbe.canvas.height);
      paintProbe.ctx.drawImage(
        masks[key].canvas,
        0,
        0,
        paintProbe.canvas.width,
        paintProbe.canvas.height,
      );
      const pixels = paintProbe.ctx.getImageData(
        0,
        0,
        paintProbe.canvas.width,
        paintProbe.canvas.height,
      ).data;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] > 12) return true;
      }
      return false;
    });

  const snapshotMasks = (): PaintMaskSnapshot => {
    const snapshot: PaintMaskSnapshot = { hasPaint: hasAnyPaint() };
    if (sharedExposureMask) {
      snapshot.exposure = masks.redness.canvas.toDataURL("image/png");
    } else {
      SKIN_KEYS.forEach((key) => {
        snapshot[key] = masks[key].canvas.toDataURL("image/png");
      });
    }
    return snapshot;
  };

  const notifyPaintChange = () => {
    onPaintChangeRef.current?.(snapshotMasks());
  };

  // Switch the active formula's masks inside the existing renderer. Keeping the
  // Canvas and scene mounted preserves the camera, controls, and loaded GLB.
  useEffect(() => {
    let cancelled = false;
    const clearMasks = () => {
      writableMaskKeys.forEach((key) => {
        const mask = masks[key];
        mask.ctx.globalCompositeOperation = "source-over";
        mask.ctx.fillStyle = "#000000";
        mask.ctx.fillRect(0, 0, mask.canvas.width, mask.canvas.height);
        markTextureDirty(mask.tex);
      });
    };
    clearMasks();
    if (!initialPaint) return () => void (cancelled = true);

    const loadImage = (dataUrl: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = dataUrl;
      });

    if (sharedExposureMask) {
      // New assessment snapshots have one exposure image. Legacy snapshots
      // have up to four symptom images, which are unioned into that one canvas.
      void Promise.all(snapshotMaskDataUrls(initialPaint).map(loadImage)).then((images) => {
        if (cancelled) return;
        const mask = masks.redness;
        mask.ctx.globalCompositeOperation = "lighten";
        images.forEach((image) => {
          if (image) mask.ctx.drawImage(image, 0, 0, mask.canvas.width, mask.canvas.height);
        });
        mask.ctx.globalCompositeOperation = "source-over";
        markTextureDirty(mask.tex);
        // Saving the restored mask immediately migrates legacy four-image
        // snapshots to the compact exposure key without a workspace version bump.
        notifyPaintChange();
      });
    } else {
      void Promise.all(
        SKIN_KEYS.map(async (key) => ({
          key,
          image: initialPaint[key] ? await loadImage(initialPaint[key]) : null,
        })),
      ).then((loadedMasks) => {
        if (cancelled) return;
        loadedMasks.forEach(({ key, image }) => {
          if (!image) return;
          const mask = masks[key];
          mask.ctx.globalCompositeOperation = "source-over";
          mask.ctx.drawImage(image, 0, 0, mask.canvas.width, mask.canvas.height);
          markTextureDirty(mask.tex);
        });
        notifyPaintChange();
      });
    }

    return () => {
      cancelled = true;
    };
    // A new owner key selects a different formula snapshot. Paint updates for the
    // current owner do not reload these masks and therefore cannot interrupt a stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintOwnerKey, masks]);

  // Rebuild the collision/display union when the selected formula changes, while
  // reusing the same Three.js texture and scene.
  useEffect(() => {
    let cancelled = false;
    const rebuildExclusionMask = () => {
      const width = occupiedMask.canvas.width;
      const height = occupiedMask.canvas.height;
      const occupiedPixels = occupiedMask.ctx.getImageData(0, 0, width, height).data;
      const exclusionPixels = occupiedExclusionMask.ctx.createImageData(width, height);
      for (let index = 0; index < occupiedPixels.length; index += 4) {
        if (occupiedPixels[index] <= 12) continue;
        exclusionPixels.data[index] = 255;
        exclusionPixels.data[index + 1] = 255;
        exclusionPixels.data[index + 2] = 255;
        exclusionPixels.data[index + 3] = 255;
      }
      occupiedExclusionMask.ctx.clearRect(0, 0, width, height);
      occupiedExclusionMask.ctx.putImageData(exclusionPixels, 0, 0);
    };

    const collisionSnapshots = occupiedPaint.filter(
      (snapshot) =>
        snapshot.hasPaint !== false &&
        snapshotMaskDataUrls(snapshot).length > 0,
    );
    hasOccupiedPaint.current = collisionSnapshots.length > 0;
    occupiedReady.current = collisionSnapshots.length === 0;
    occupiedMask.ctx.globalCompositeOperation = "source-over";
    occupiedMask.ctx.fillStyle = "#000000";
    occupiedMask.ctx.fillRect(0, 0, occupiedMask.canvas.width, occupiedMask.canvas.height);
    markTextureDirty(occupiedMask.tex);
    occupiedExclusionMask.ctx.clearRect(
      0,
      0,
      occupiedExclusionMask.canvas.width,
      occupiedExclusionMask.canvas.height,
    );

    const dataUrls = collisionSnapshots.flatMap(snapshotMaskDataUrls);
    if (dataUrls.length === 0) {
      hasOccupiedPaint.current = false;
      occupiedReady.current = true;
      return () => void (cancelled = true);
    }

    void Promise.all(
      dataUrls.map(
        (dataUrl) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => {
              if (!cancelled) {
                occupiedMask.ctx.globalCompositeOperation = "lighter";
                occupiedMask.ctx.drawImage(
                  image,
                  0,
                  0,
                  occupiedMask.canvas.width,
                  occupiedMask.canvas.height,
                );
                markTextureDirty(occupiedMask.tex);
              }
              resolve();
            };
            image.onerror = () => resolve();
            image.src = dataUrl;
          }),
      ),
    ).then(() => {
      if (!cancelled) {
        rebuildExclusionMask();
        occupiedReady.current = true;
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintOwnerKey, occupiedExclusionMask, occupiedMask, occupiedPaint.length]);

  // Seamless tiling vesicle-relief map (baked from the Blender dome pattern).
  // Sampled triplanar in object space inside the papule branch.
  const blisterTex = useMemo(() => {
    const t = new THREE.TextureLoader().load("/textures/blister_height.png");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  const blisterNormalTex = useMemo(() => {
    const t = new THREE.TextureLoader().load("/textures/blister_normal.png");
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  const uBlisterScale = useRef({ value: 7 });

  // Inject the mark/reveal symptom shader onto a per-instance skin material.
  useMemo(() => {
    skinMeshes.current.clear();
    eyeMeshes.current = { left: null, right: null };
    faceCalibration.current = null;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const srcMat = mesh.material as THREE.MeshStandardMaterial;
      if (!srcMat) return;

      const maxA = gl.capabilities.getMaxAnisotropy();
      [srcMat.map, srcMat.normalMap, srcMat.roughnessMap, srcMat.metalnessMap].forEach((t) => {
        if (t && t.anisotropy !== maxA) {
          t.anisotropy = maxA;
          t.needsUpdate = true;
        }
      });

      // ═══════════════ [SX:EYE] — ตาแดง (eye redness) ═══════════════
      // Eyeballs — redden the sclera (white) toward bloodshot. Per-eye and live
      // (its own category: pick a side + severity, no painting / no Run).
      const meshKey = mesh.name.replace(/[ _-]+/g, "").toLowerCase();
      if (meshKey === "realtimeeyeballleft" || meshKey === "realtimeeyeballright") {
        if (meshKey === "realtimeeyeballleft") eyeMeshes.current.left = mesh;
        else eyeMeshes.current.right = mesh;
        const emat = srcMat.clone();
        mesh.material = emat;
        const uER = meshKey === "realtimeeyeballleft" ? uEyeRedL.current : uEyeRedR.current;
        emat.onBeforeCompile = (shader) => {
          shader.uniforms.uEyeRed = uER;
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
varying vec2 vEyeUv;`,
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
vEyeUv = uv;`,
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
uniform float uEyeRed;
varying vec2 vEyeUv;`
            )
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
// Sclera = brightish areas; iris/pupil stay dark and untouched.
float _lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
float _white = smoothstep(0.18, 0.55, _lum);
// A gentle response curve makes moderate irritation readable while preserving
// the ordering of the assessment score.
float _eyeSeverity = pow(clamp(uEyeRed, 0.0, 1.0), 0.72);
float _e = clamp(_eyeSeverity * _white, 0.0, 1.0);

// Two warped fine-line fields suggest conjunctival vessels. They stay on the
// sclera because the white-area mask excludes the iris and pupil.
float _vesselA = 1.0 - smoothstep(
  0.015, 0.075,
  abs(sin(vEyeUv.y * 118.0 + sin(vEyeUv.x * 31.0) * 4.2))
);
float _vesselB = 1.0 - smoothstep(
  0.018, 0.085,
  abs(sin(vEyeUv.x * 91.0 - sin(vEyeUv.y * 23.0) * 3.6))
);
float _vessels = max(_vesselA, _vesselB) * _white * smoothstep(0.18, 0.72, _eyeSeverity);

diffuseColor.r = mix(diffuseColor.r, min(diffuseColor.r * 1.08 + 0.55, 1.0), _e * 0.92);
diffuseColor.g *= 1.0 - _e * 0.88;
diffuseColor.b *= 1.0 - _e * 0.84;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.025, 0.035), _vessels * 0.72);`
            )
            .replace(
              "#include <roughnessmap_fragment>",
              `#include <roughnessmap_fragment>
float _eyeWetness = pow(clamp(uEyeRed, 0.0, 1.0), 0.72);
roughnessFactor = mix(roughnessFactor, 0.06, _eyeWetness * 0.72);`,
            );
        };
        emat.needsUpdate = true;
        return;
      }

      if (srcMat.name !== "Material.001") return;
      const mat = srcMat.clone();
      mesh.material = mat;
      skinMeshes.current.add(mesh);

      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      // 2.4% of head height keeps a high-risk local swell readable without the
      // inflated look produced by the old 6% displacement.
      const headHeight = bb.max.y - bb.min.y;
      uEdemaScale.current.value = headHeight * 0.024;
      // Papules need real silhouette displacement, not only a normal-map
      // illusion. Keep them intentionally small: 0.35% of head height is
      // enough to catch side lighting without resembling large blisters.
      uPapuleScale.current.value = headHeight * 0.0035;
      // Tile repeats across the largest dimension (lower = bigger, sparser vesicles).
      uBlisterScale.current.value =
        9.0 / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);

      const uMaskRedness = { value: masks.redness.tex };
      const uMaskPapule = { value: masks.papule.tex };
      const uMaskPeeling = { value: masks.peeling.tex };
      const uMaskEdema = { value: masks.edema.tex };
      const uMaskOccupied = { value: occupiedMask.tex };

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uMaskRedness = uMaskRedness;
        shader.uniforms.uMaskPapule = uMaskPapule;
        shader.uniforms.uMaskPeeling = uMaskPeeling;
        shader.uniforms.uMaskEdema = uMaskEdema;
        shader.uniforms.uMaskOccupied = uMaskOccupied;
        shader.uniforms.uRevealRedness = uRevealRedness.current;
        shader.uniforms.uRevealPapule = uRevealPapule.current;
        shader.uniforms.uRevealPeeling = uRevealPeeling.current;
        shader.uniforms.uRevealEdema = uRevealEdema.current;
        shader.uniforms.uRedness = uRedness.current;
        shader.uniforms.uPapule = uPapule.current;
        shader.uniforms.uPeeling = uPeeling.current;
        shader.uniforms.uEdema = uEdema.current;
        shader.uniforms.uEyeRedL = uEyeRedL.current;
        shader.uniforms.uEyeRedR = uEyeRedR.current;
        shader.uniforms.uAcuteSystemic = uAcuteSystemic.current;
        shader.uniforms.uSkinLift = uSkinLift.current;
        shader.uniforms.uEdemaScale = uEdemaScale.current;
        shader.uniforms.uPapuleScale = uPapuleScale.current;
        shader.uniforms.uBlisterTex = { value: blisterTex };
        shader.uniforms.uBlisterNormalTex = { value: blisterNormalTex };
        shader.uniforms.uBlisterScale = uBlisterScale.current;
        shader.uniforms.uScanTime = uScanTime.current;

        // ── VERTEX ── puff the marked area when edema is revealed.
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec2 vPaintUv;
varying vec3 vLocalPos;
uniform sampler2D uMaskEdema;
uniform sampler2D uMaskPapule;
uniform float uRevealEdema;
uniform float uRevealPapule;
uniform float uEdema;
uniform float uPapule;
uniform float uEdemaScale;
uniform float uPapuleScale;
${NOISE_GLSL}
${SPOTS_GLSL}`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vPaintUv = uv;
vLocalPos = position;
// ─── [SX:EDEMA-VERT] — ผิวบวม: geometry swell (edema only) ───
// Soft-graded mask edge so the swell fades out, never a sharp rim.
// Moderate scores stay subtle, while a score around 50 now produces a
// readable smooth lift instead of being suppressed by a second hard cut-off.
float _shapeSeverity = smoothstep(0.18, 0.85, uEdema);
float _m = smoothstep(0.16, 0.92, texture2D(uMaskEdema, uv).r)
         * uRevealEdema * _shapeSeverity;
// ONE smooth continuous swell (ref photo): no lumpy mounds — only a gentle
// large-scale variation so the surface still reads organic.
float _h = 0.85 + 0.15 * fbm(position * 6.0);
transformed += normal * _m * _h * uEdemaScale;

// ─── [SX:PAPULE-VERT] — real round papule geometry ───
// Use the same stable cellular field and organic clustering as the fragment
// shader. This moves vertices along the skin normal, so the bumps retain a
// curved silhouette when the head is viewed from the side.
float _pPres = smoothstep(0.10, 0.88, texture2D(uMaskPapule, uv).r)
             * uRevealPapule;
float _pSev = clamp(uPapule, 0.0, 1.0);
if (_pPres > 0.001 && _pSev > 0.001) {
  vec3 _pStreakPos = position;
  _pStreakPos.xy = mat2(0.94, -0.34, 0.34, 0.94) * _pStreakPos.xy;
  float _pStreak = fbm(_pStreakPos * vec3(27.0, 88.0, 88.0));
  float _pFlush = smoothstep(0.38, 0.56, _pStreak)
                * _pPres * (0.35 + 0.65 * _pSev);
  float _pDome = papuleDomes(position, 64.0, 19.7, _pSev);
  float _pGateLo = mix(0.31, 0.08, _pSev);
  float _pGateHi = mix(0.45, 0.20, _pSev);
  float _pGate = smoothstep(_pGateLo, _pGateHi, _pFlush);
  float _pHeight = smoothstep(0.05, 0.90, _pDome) * _pGate;
  float _pSeverityHeight = mix(0.42, 1.0, smoothstep(0.12, 1.0, _pSev));
  transformed += normal * _pHeight * _pSeverityHeight * uPapuleScale;
}`
          );

        // ── FRAGMENT ── white cream marks → cross-fade into the symptom.
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec2 vPaintUv;
varying vec3 vLocalPos;
uniform sampler2D uMaskRedness;
uniform sampler2D uMaskPapule;
uniform sampler2D uMaskPeeling;
uniform sampler2D uMaskEdema;
uniform sampler2D uMaskOccupied;
uniform float uRevealRedness;
uniform float uRevealPapule;
uniform float uRevealPeeling;
uniform float uRevealEdema;
uniform float uRedness;
uniform float uPapule;
uniform float uPeeling;
uniform float uEdema;
uniform float uEyeRedL;
uniform float uEyeRedR;
uniform float uAcuteSystemic;
uniform float uSkinLift;
uniform sampler2D uBlisterTex;
uniform sampler2D uBlisterNormalTex;
uniform float uBlisterScale;
uniform float uScanTime;
${NOISE_GLSL}
${SPOTS_GLSL}`
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>${SKIN_LIFT_GLSL}
// Each symptom reads its OWN mask + reveal, so painted symptoms coexist and
// only appear where THAT symptom was painted.
float _mR = clamp(texture2D(uMaskRedness, vPaintUv).r, 0.0, 1.0);
float _mP = clamp(texture2D(uMaskPapule,  vPaintUv).r, 0.0, 1.0);
float _mK = clamp(texture2D(uMaskPeeling, vPaintUv).r, 0.0, 1.0);
float _mE = clamp(texture2D(uMaskEdema,   vPaintUv).r, 0.0, 1.0);
float _mOccupied = clamp(texture2D(uMaskOccupied, vPaintUv).r, 0.0, 1.0);

// White "test cream" marking = any symptom painted but not yet revealed.
float _cream = clamp(max(
  max(_mR * (1.0 - uRevealRedness), _mP * (1.0 - uRevealPapule)),
  max(_mK * (1.0 - uRevealPeeling), _mE * (1.0 - uRevealEdema))), 0.0, 1.0);
// Other formulas stay visible as neutral cream. They are not allowed to use
// this formula's severity/reveal uniforms.
_cream = max(_cream, _mOccupied * 0.88);

float gRed   = clamp(_mR * uRevealRedness * uRedness, 0.0, 1.0);
float gPap   = clamp(_mP * uRevealPapule  * uPapule,  0.0, 1.0);
float gPeel  = clamp(_mK * uRevealPeeling * uPeeling, 0.0, 1.0);
float gEdema = clamp(_mE * uRevealEdema   * uEdema,   0.0, 1.0);
float gPapDot = 0.0;
float gFlake  = 0.0;
float gTaut   = 0.0;   // edema tautness (drives the wet/stretched sheen)
float gBumpH  = 0.0;
float gEyeRim = 0.0;   // eye-score-driven eyelid irritation (not a paint mask)

vec3 _c = diffuseColor.rgb;

// ═══════════════ [SX:SCAN-GRID] — paint interaction feedback ═══════════════
// This locator is driven only by the masks, never by risk severity. A score of
// zero therefore still produces clear feedback that the brush hit the model.
float _paintPresence = smoothstep(
  0.015,
  0.12,
  max(max(max(_mR, _mP), max(_mK, _mE)), _mOccupied)
);
vec2 _gridUv = fract(vPaintUv * 68.0);
vec2 _edge = min(_gridUv, 1.0 - _gridUv);
float _gridX = 1.0 - smoothstep(0.018, 0.045, _edge.x);
float _gridY = 1.0 - smoothstep(0.018, 0.045, _edge.y);
float _grid = max(_gridX, _gridY) * _paintPresence;
float _scanBand = 1.0 - smoothstep(
  0.018,
  0.065,
  abs(fract(vPaintUv.y * 7.0 - uScanTime * 0.72) - 0.5)
);
vec3 _scanColor = vec3(0.02, 0.95, 0.88);
_c += _scanColor * (_grid * 0.42 + _scanBand * _paintPresence * 0.18);

// White "test cream" marking (fades out as the symptom develops).
_c = mix(_c, vec3(0.96, 0.95, 0.93), _cream * 0.60);

// ═══════════════ [SX:REDNESS] — ผิวแดง (erythema) ═══════════════
// Smooth diffuse rosy flush (NO dots): deeper in soft patches, fading gently at
// the edges, faint streaky variation. Severity (uRedness) → overall intensity.
if (gRed > 0.001) {
  vec3 _rp = vLocalPos;
  _rp.xy = mat2(0.94, -0.34, 0.34, 0.94) * _rp.xy;        // slight diagonal grain
  float _v1 = fbm(_rp * vec3(9.0, 24.0, 24.0));           // soft streaky variation
  float _v2 = fbm(vLocalPos * 5.0 + 3.1);                 // broad patch variation
  float _f  = smoothstep(0.28, 0.62, _v1 * 0.5 + _v2 * 0.5);
  float _amt = gRed * (0.35 + 0.65 * _f);                 // base flush + patch depth
  _c.r += _amt * 0.30;
  _c.g -= _amt * 0.115;
  _c.b -= _amt * 0.095;
}

// ═══════════════ [SX:PAPULE] — ตุ่มแดง (papules) ═══════════════
// Small MATTE red bumps scattered along streaky red trails (BLR_ Blender design).
// Red lives ONLY on the bumps. Severity (uPapule) → bump size. No fluid domes.
if (gPap > 0.001) {
  float _pres = clamp(_mP * uRevealPapule, 0.0, 1.0);
  float _sev  = clamp(uPapule, 0.0, 1.0);

  // Streaky flush: anisotropic noise (stretched left-right, slight diagonal
  // tilt) makes soft elongated red trails instead of a uniform wash.
  vec3 _sp3 = vLocalPos;
  _sp3.xy = mat2(0.94, -0.34, 0.34, 0.94) * _sp3.xy;      // ~20° tilt
  float _streak = fbm(_sp3 * vec3(27.0, 88.0, 88.0));
  float _flush = smoothstep(0.38, 0.56, _streak) * _pres * (0.35 + 0.65 * _sev);

  // NOTE: the flush itself is NOT tinted — skin between papules stays clean.
  // It only decides WHERE papules cluster (organic streaky distribution).

  // Small matte papules INSIDE the flush — reuse the dome map at ~2x tiling
  // (triplanar, object space) so bumps are tiny and only live on red skin.
  // Cellular centres stay fixed while severity increases: existing papules
  // enlarge first and additional stable papules then fade in.
  float _dome = papuleDomes(vLocalPos, 64.0, 19.7, _sev);
  // Moderate scores occupy only the strongest clusters. Higher scores open
  // progressively more of the painted region without turning it into a rash.
  float _gateLo = mix(0.31, 0.08, _sev);
  float _gateHi = mix(0.45, 0.20, _sev);
  float _gate = smoothstep(_gateLo, _gateHi, _flush);
  float _papv = smoothstep(0.05, 0.32, _dome) * _gate;
  float _papRim = max(
    0.0,
    smoothstep(0.04, 0.22, _dome) - smoothstep(0.48, 0.78, _dome)
  ) * _gate;

  // Keep the original blister assets only as very fine surface detail inside
  // the procedural circular footprint; they no longer decide count or shape.
  vec3 _gn = normalize(cross(dFdx(vLocalPos), dFdy(vLocalPos)));
  vec3 _bw = abs(_gn); _bw /= (_bw.x + _bw.y + _bw.z + 1e-4);
  float _microBs = uBlisterScale * 4.2;
  float _microH = texture2D(uBlisterTex, vLocalPos.yz * _microBs).r * _bw.x
                + texture2D(uBlisterTex, vLocalPos.zx * _microBs).r * _bw.y
                + texture2D(uBlisterTex, vLocalPos.xy * _microBs).r * _bw.z;
  float _microN = texture2D(uBlisterNormalTex, vLocalPos.yz * _microBs).b * _bw.x
                + texture2D(uBlisterNormalTex, vLocalPos.zx * _microBs).b * _bw.y
                + texture2D(uBlisterNormalTex, vLocalPos.xy * _microBs).b * _bw.z;
  float _microDetail = clamp(_microH * 0.7 + _microN * 0.3, 0.0, 1.0);

  // Preserve a darker rim and a softly lit centre so papules remain readable
  // even when erythema and edema are active underneath them.
  _c = mix(_c, vec3(0.76, 0.12, 0.14), _papv * 0.58);
  _c += vec3(0.12, 0.045, 0.035) * _papv;
  _c -= vec3(0.07, 0.025, 0.02) * _papRim;

  // Hemispherical derivative height makes each spot a round dome. Severity
  // scales its height as well as the radius/count controlled above.
  gBumpH += (_papv + _papRim * 0.35)
    * mix(0.24, 1.20, _sev) * mix(0.94, 1.06, _microDetail);
  gPapDot = max(gPapDot, max(_papv, _papRim * 0.55));
}

// ═══════════════ [SX:PEELING] — ผิวลอก (desquamation) ═══════════════
// Small separate curly white flakes (ขุย) + dry matte skin, in irregular patches
// (iso-band recipe, BLP_ Blender design). Severity (uPeeling) → patch + flakes.
if (gPeel > 0.001) {
  // Ported from the Blender BLP_ design (matched to the reference photo).
  // WHERE it peels: irregular patches; severity grows the patches.
  float _patch = smoothstep(0.58 - gPeel * 0.26, 0.70 - gPeel * 0.22, fbm(vLocalPos * 13.0));

  // Dry patches read PALE WHITISH (like the Blender design) — desaturate and
  // lift toward chalky, NOT pink/red.
  float _lum = dot(_c, vec3(0.299, 0.587, 0.114));
  _c = mix(_c, mix(_c, vec3(_lum), 0.45) * 1.03 + 0.03, _patch * gPeel * 0.55);

  // Only a whisper of warmth under heavy peeling (no rosy flush).
  float _pink = _patch * gPeel * 0.12;
  _c.r += _pink * 0.08;
  _c.g -= _pink * 0.02;
  _c.b -= _pink * 0.02;

  // ขุย — Blender recipe: thin ISO-BAND ribbons of high-freq noise (naturally
  // curly, like lifted flake edges) BROKEN into small separate chips by a
  // second noise. High frequency + crisped edges = small SHARP flakes.
  float _fn   = fbm(vLocalPos * 230.0);
  float _band = 1.0 - smoothstep(0.0, 0.030, abs(_fn - 0.45));   // thin curvy ribbon
  float _keep = smoothstep(0.49, 0.58, fbm(vLocalPos * 145.0 + 7.3)); // fragment it
  float _flake = _band * _keep * _patch * (0.40 + 0.60 * gPeel); // denser w/ severity
  _flake = smoothstep(0.15, 0.60, _flake);                       // crisp edges

  // Pale dry chips (Blender: BLP_ColFlake) — sit IN the skin, not on top.
  _c = mix(_c, vec3(0.97, 0.96, 0.94), _flake * 0.96);

  gFlake = max(_flake * 0.8, _patch * gPeel * 0.6);   // dry matte roughness
  // NO bump — flakes stay flush with the skin exactly like the Blender look.
}

// ═══════════════ [SX:EDEMA] — ผิวบวม (edema) ═══════════════
// ONE smooth continuous swell (geometry comes from [SX:EDEMA-VERT] in the vertex
// shader) + strong even rosy-red flush + taut SHINY skin. Severity (uEdema) →
// swell height + redness.
if (gEdema > 0.001) {
  float _var = fbm(vLocalPos * 6.0);              // soft large-scale variation only

  // Strong even red flush — deeper in soft patches, like inflamed swollen skin.
  float _flush = gEdema * (0.55 + 0.30 * _var);
  _c.r += _flush * 0.34;
  _c.g -= _flush * 0.14;
  _c.b -= _flush * 0.11;

  // Taut stretched skin: slight bright lift so highlights bloom on the swell.
  _c = mix(_c, _c * 1.06 + 0.03, gEdema * 0.35);

  gTaut = gEdema * (0.75 + 0.25 * _var);          // glossy tight skin everywhere
  // No bump — the swell itself comes from the vertex displacement, kept smooth.
}

// ═══════════════ [SX:EYE-RIM] — ขอบตาแดงจาก endpoint ตาโดยตรง ═══════════════
// The eyeballs remain separate meshes; this only adds a soft periorbital rim to
// the surrounding Head skin. Local head coordinates are used so it follows the
// eyelids without depending on a painted UV mask.
float _eyeScoreAtSide = mix(uEyeRedR, uEyeRedL, step(0.0, vLocalPos.x));
if (_eyeScoreAtSide > 0.001) {
  float _eyeSev = pow(clamp(_eyeScoreAtSide, 0.0, 1.0), 0.72);
  vec2 _eyeCoord = vec2(
    (abs(vLocalPos.x) - 0.030) / 0.030,
    (vLocalPos.z + 0.300) / 0.022
  );
  float _eyeHalo = 1.0 - smoothstep(0.60, 1.42, length(_eyeCoord));
  float _frontFace = smoothstep(0.072, 0.115, vLocalPos.y);
  gEyeRim = _eyeHalo * _frontFace * _eyeSev;
  _c = mix(_c, vec3(0.94, 0.25, 0.31), gEyeRim * 0.48);
}

// ═══════════════ [SX:ACUTE-SYSTEMIC] — systemic visual proxy ═══════════════
// Acute toxicity is not a skin lesion and therefore ignores the paint masks.
// A graded whole-face pallor/desaturation plus a subtle clammy sheen makes the
// endpoint visible without implying that it predicts papules or erythema.
float gAcute = clamp(uAcuteSystemic, 0.0, 1.0);
if (gAcute > 0.001) {
  float _acuteCurve = pow(gAcute, 0.72);
  float _luma = dot(_c, vec3(0.299, 0.587, 0.114));
  vec3 _pale = mix(vec3(_luma), vec3(0.70, 0.76, 0.74), 0.42);   // sickly grey-green pallor
  _c = mix(_c, _pale, _acuteCurve * 0.85);                        // stronger, clearly visible
  _c += vec3(0.020, 0.052, 0.046) * _acuteCurve;                  // clammy sheen
}

diffuseColor.rgb = clamp(_c, 0.0, 1.0);`
          )
          .replace(
            "#include <normal_fragment_maps>",
            `#include <normal_fragment_maps>
if (abs(gBumpH) > 0.0001) {
  vec2 _dHdxy = vec2(dFdx(gBumpH), dFdy(gBumpH));
  vec3 _sigX = dFdx(-vViewPosition);
  vec3 _sigY = dFdy(-vViewPosition);
  vec3 _R1 = cross(_sigY, normal);
  vec3 _R2 = cross(normal, _sigX);
  float _det = dot(_sigX, _R1);
  _det *= (gl_FrontFacing ? 1.0 : -1.0);
  vec3 _grad = sign(_det) * (_dHdxy.x * _R1 + _dHdxy.y * _R2);
  normal = normalize(abs(_det) * normal - _grad * 4.8);
}`
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
roughnessFactor = clamp(
  roughnessFactor
  + gRed * 0.06
  + gPapDot * 0.16
  + gFlake * 0.55
  - gTaut * (1.0 - gFlake) * 0.45
  - gEyeRim * 0.12
  - clamp(uAcuteSystemic, 0.0, 1.0) * 0.20,
  0.03, 1.0);`
          );
      };
      mat.needsUpdate = true;
    });
  }, [scene, gl, masks, occupiedMask, blisterTex, blisterNormalTex]);

  // Run reveals ALL painted symptoms at once; Clear wipes the current paint set
  // (one selected symptom in the lab, or all mapped symptoms in assessment).
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      clear: () => {
        const keysToClear = sharedExposureMask
          ? writableMaskKeys
          : paintSymptomsRef.current;
        keysToClear.forEach((k) => {
          const m = masks[k];
          if (!m) return;
          m.ctx.globalCompositeOperation = "source-over";
          m.ctx.fillStyle = "#000000";
          m.ctx.fillRect(0, 0, m.canvas.width, m.canvas.height);
          markTextureDirty(m.tex);
        });
        paintSymptomsRef.current.forEach((k) => {
          revealTargets.current[k] = 0;
          revealRefs[k].current.value = 0;
        });
        notifyPaintChange();
      },
      conceal: () => {
        SKIN_KEYS.forEach((k) => {
          revealTargets.current[k] = 0;
        });
      },
      run: () => {
        // One press reveals every painted symptom (empty masks show nothing).
        SKIN_KEYS.forEach((k) => {
          revealTargets.current[k] = 1;
        });
      },
      // Fill every mask so the whole face shows the mapped symptoms at once
      // (used by the results-driven canvas — no manual painting required).
      fillAll: () => {
        writableMaskKeys.forEach((k) => {
          const m = masks[k];
          if (!m) return;
          m.ctx.globalCompositeOperation = "source-over";
          m.ctx.fillStyle = "#ffffff";
          m.ctx.fillRect(0, 0, m.canvas.width, m.canvas.height);
          markTextureDirty(m.tex);
        });
        SKIN_KEYS.forEach((k) => {
          revealTargets.current[k] = 1;
        });
        notifyPaintChange();
      },
      snapshot: snapshotMasks,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, masks]);

  // Ease every symptom's reveal toward its own target (~0.9s).
  useFrame((_, dt) => {
    // Canvas drawing can happen many times inside one stroke. Upload each
    // changed texture once at the end of the frame instead of once per dab.
    dirtyCanvasTextures.current.forEach((texture) => {
      texture.needsUpdate = true;
    });
    dirtyCanvasTextures.current.clear();

    const k = Math.min(1, dt * 2.2);
    const severityK = 1 - Math.exp(-dt * 5.5);
    uScanTime.current.value += dt;
    SKIN_KEYS.forEach((s) => {
      const ref = revealRefs[s].current;
      ref.value += (revealTargets.current[s] - ref.value) * k;
    });
    uRedness.current.value += (severityTargets.current.redness - uRedness.current.value) * severityK;
    uPapule.current.value += (severityTargets.current.papule - uPapule.current.value) * severityK;
    uPeeling.current.value += (severityTargets.current.peeling - uPeeling.current.value) * severityK;
    uEdema.current.value += (severityTargets.current.edema - uEdema.current.value) * severityK;
    uEyeRedL.current.value += (severityTargets.current.eyeLeft - uEyeRedL.current.value) * severityK;
    uEyeRedR.current.value += (severityTargets.current.eyeRight - uEyeRedR.current.value) * severityK;
    uAcuteSystemic.current.value +=
      (severityTargets.current.acuteSystemic - uAcuteSystemic.current.value) * severityK;
  });

  const dabAt = (uv: THREE.Vector2) => {
    let clippedDabBounds: {
      minX: number;
      minY: number;
      width: number;
      height: number;
    } | null = null;

    if (!eraseRef.current) {
      // Wait for the other formula masks before accepting paint. This closes a
      // short race immediately after switching formulas where overlap could be
      // written before their PNG snapshots finish decoding.
      if (!occupiedReady.current) return;

      // Most strokes have no other formula paint to collide with. Keep that
      // common path free from synchronous pixel reads and the temporary dab
      // canvas; collision clipping is only prepared when occupied paint exists.
      if (hasOccupiedPaint.current) {
        const W = occupiedMask.canvas.width;
        const H = occupiedMask.canvas.height;
        const px = uv.x * W;
        const py = uv.y * H;
        const radius = (brushSizeRef.current / 100) * 0.09 * W;
        const minX = Math.max(0, Math.floor(px - radius));
        const minY = Math.max(0, Math.floor(py - radius));
        const maxX = Math.min(W - 1, Math.ceil(px + radius));
        const maxY = Math.min(H - 1, Math.ceil(py + radius));
        const width = Math.max(1, maxX - minX + 1);
        const height = Math.max(1, maxY - minY + 1);
        const pixels = occupiedMask.ctx.getImageData(minX, minY, width, height).data;
        let hasPaintableArea = false;

        // Only reject a dab when its useful area is completely occupied. Partial
        // collisions remain valid and are clipped pixel-for-pixel below.
        for (let y = 0; y < height && !hasPaintableArea; y += 4) {
          for (let x = 0; x < width; x += 4) {
            const dx = minX + x - px;
            const dy = minY + y - py;
            if (dx * dx + dy * dy > radius * radius * 0.85) continue;
            if (pixels[(y * width + x) * 4] <= 12) {
              hasPaintableArea = true;
              break;
            }
          }
        }

        if (!hasPaintableArea) {
          if (!blockedDuringStroke.current) {
            blockedDuringStroke.current = true;
            onPaintBlockedRef.current?.();
          }
          return;
        }

        // Build one soft dab, then punch out only pixels owned by other formulas.
        // The remaining crescent/edge is still painted even when the brush centre
        // is very close to an existing mark.
        paintDabMask.ctx.globalCompositeOperation = "source-over";
        paintDabMask.ctx.clearRect(minX, minY, width, height);
        const gradient = paintDabMask.ctx.createRadialGradient(px, py, 0, px, py, radius);
        gradient.addColorStop(0, "rgba(255,255,255,0.85)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        paintDabMask.ctx.fillStyle = gradient;
        paintDabMask.ctx.beginPath();
        paintDabMask.ctx.arc(px, py, radius, 0, Math.PI * 2);
        paintDabMask.ctx.fill();
        paintDabMask.ctx.globalCompositeOperation = "destination-out";
        paintDabMask.ctx.drawImage(
          occupiedExclusionMask.canvas,
          minX,
          minY,
          width,
          height,
          minX,
          minY,
          width,
          height,
        );
        paintDabMask.ctx.globalCompositeOperation = "source-over";
        clippedDabBounds = { minX, minY, width, height };
      }
    }

    // Erasing uses the same brush interaction as painting and clears every
    // symptom mask underneath it so no hidden reaction layer is left behind.
    const targetSymptoms = sharedExposureMask
      ? writableMaskKeys
      : eraseRef.current
        ? SKIN_KEYS
        : paintSymptomsRef.current;
    targetSymptoms.forEach((k) => {
      const m = masks[k];
      if (!m) return;
      const W = m.canvas.width;
      const H = m.canvas.height;
      const px = uv.x * W;
      const py = uv.y * H; // flipY=false + raw uv -> no inversion

      // pct = 20 / 50 / 85 (เล็ก / กลาง / ใหญ่) -> distinct, usefully-sized radii.
      const pct = brushSizeRef.current;
      const r = (pct / 100) * 0.09 * W * (eraseRef.current ? 1.15 : 1);

      if (eraseRef.current) {
        // A solid centre makes the erased path predictable, while the feathered
        // edge keeps a dragged stroke from looking like disconnected grid cells.
        // Repeat the dab across texture borders. The jaw/neck UV seam often
        // sits at U=0/1; without wrapping, half of an eraser dab was clipped.
        const centersX = [px];
        const centersY = [py];
        if (px - r < 0) centersX.push(px + W);
        if (px + r > W) centersX.push(px - W);
        if (py - r < 0) centersY.push(py + H);
        if (py + r > H) centersY.push(py - H);
        m.ctx.globalCompositeOperation = "destination-out";
        centersX.forEach((cx) => {
          centersY.forEach((cy) => {
            const g = m.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0, "rgba(0,0,0,1)");
            g.addColorStop(0.72, "rgba(0,0,0,1)");
            g.addColorStop(1, "rgba(0,0,0,0)");
            m.ctx.fillStyle = g;
            m.ctx.beginPath();
            m.ctx.arc(cx, cy, r, 0, Math.PI * 2);
            m.ctx.fill();
          });
        });
        markTextureDirty(m.tex);
        return;
      }

      m.ctx.globalCompositeOperation = "lighter";
      if (clippedDabBounds) {
        // Copy only the non-overlapping portion of the prepared dab.
        m.ctx.drawImage(
          paintDabMask.canvas,
          clippedDabBounds.minX,
          clippedDabBounds.minY,
          clippedDabBounds.width,
          clippedDabBounds.height,
          clippedDabBounds.minX,
          clippedDabBounds.minY,
          clippedDabBounds.width,
          clippedDabBounds.height,
        );
      } else {
        // Fast path: no other formula owns paint, so draw directly into the
        // active mask without getImageData() or a full-size temporary canvas.
        const gradient = m.ctx.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(0, "rgba(255,255,255,0.85)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        m.ctx.fillStyle = gradient;
        m.ctx.beginPath();
        m.ctx.arc(px, py, r, 0, Math.PI * 2);
        m.ctx.fill();
      }
      markTextureDirty(m.tex);
    });
    // Do NOT reset this symptom's reveal: already-revealed areas stay revealed
    // when you paint MORE of the same symptom. New marks show as cream only
    // before the first Run (reveal 0); after that they appear immediately.
  };

  const paintStrokeTo = (uv: THREE.Vector2) => {
    const previous = lastPaintUv.current;
    if (!previous) {
      dabAt(uv);
      lastPaintUv.current = uv.clone();
      return;
    }

    const distance = previous.distanceTo(uv);
    if (distance < 0.0001) return;
    // Do not bridge distant UV islands across a model seam. Within one island,
    // interpolate dabs so a quick drag still produces one continuous stroke.
    if (distance > 0.2) {
      dabAt(uv);
    } else {
      const brushRadiusUv = (brushSizeRef.current / 100) * 0.09;
      const spacing = Math.max(0.004, brushRadiusUv * 0.35);
      const steps = Math.min(
        MAX_PAINT_DABS_PER_POINTER_MOVE,
        Math.max(1, Math.ceil(distance / spacing)),
      );
      for (let step = 1; step <= steps; step += 1) {
        dabAt(previous.clone().lerp(uv, step / steps));
      }
    }
    lastPaintUv.current = uv.clone();
  };

  // Return the symptoms that were actually painted under this UV. Keeping this
  // check next to the masks means a hover tooltip can never appear on untouched
  // skin just because the pointer happens to be over the model.
  const paintedSymptomsAt = (uv: THREE.Vector2): SkinKey[] => {
    if (sharedExposureMask) {
      const mask = masks.redness;
      const x = Math.max(0, Math.min(mask.canvas.width - 1, Math.floor(uv.x * mask.canvas.width)));
      const y = Math.max(0, Math.min(mask.canvas.height - 1, Math.floor(uv.y * mask.canvas.height)));
      return mask.ctx.getImageData(x, y, 1, 1).data[0] > 12
        ? paintSymptomsRef.current
        : [];
    }
    return SKIN_KEYS.filter((k) => {
      const m = masks[k];
      const x = Math.max(0, Math.min(m.canvas.width - 1, Math.floor(uv.x * m.canvas.width)));
      const y = Math.max(0, Math.min(m.canvas.height - 1, Math.floor(uv.y * m.canvas.height)));
      return m.ctx.getImageData(x, y, 1, 1).data[0] > 12;
    });
  };

  // Convert a world-space hit point to a stable anatomical region. Orbiting the
  // camera does not change these coordinates, so the label stays attached to
  // the same part of the head from front, side, and rear views.
  const regionAt = (world: THREE.Vector3): string => {
    if (!skinMeshes.current.size) return "ผิวหน้า";

    if (!faceCalibration.current) {
      const worldBounds = new THREE.Box3();
      skinMeshes.current.forEach((mesh) => worldBounds.expandByObject(mesh));
      if (worldBounds.isEmpty()) return "ผิวหน้า";

      const modelCenter = worldBounds.getCenter(new THREE.Vector3());
      const modelSize = worldBounds.getSize(new THREE.Vector3());
      const leftEyeCenter = eyeMeshes.current.left
        ? new THREE.Box3().setFromObject(eyeMeshes.current.left).getCenter(new THREE.Vector3())
        : null;
      const rightEyeCenter = eyeMeshes.current.right
        ? new THREE.Box3().setFromObject(eyeMeshes.current.right).getCenter(new THREE.Vector3())
        : null;

      let eyeY = worldBounds.min.y + (worldBounds.max.y - worldBounds.min.y) * 0.62;
      let centerX = modelCenter.x;
      let eyeSpan = Math.max(modelSize.x * 0.18, 1e-4);
      let leftIsPositiveX = false;
      if (leftEyeCenter && rightEyeCenter) {
        eyeY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
        centerX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
        eyeSpan = Math.max(Math.abs(leftEyeCenter.x - rightEyeCenter.x), 1e-4);
        leftIsPositiveX = leftEyeCenter.x > rightEyeCenter.x;
      } else if (leftEyeCenter || rightEyeCenter) {
        const eyeCenter = leftEyeCenter ?? rightEyeCenter!;
        eyeY = eyeCenter.y;
        centerX = eyeCenter.x;
      }

      faceCalibration.current = {
        minY: worldBounds.min.y,
        maxY: worldBounds.max.y,
        minZ: worldBounds.min.z,
        maxZ: worldBounds.max.z,
        eyeY,
        centerX,
        eyeSpan,
        leftIsPositiveX,
      };
    }

    const {
      minY,
      maxY,
      minZ,
      maxZ,
      eyeY,
      centerX,
      eyeSpan,
      leftIsPositiveX,
    } = faceCalibration.current;
    const height = Math.max(1e-4, maxY - minY);
    const normalizedY = (world.y - minY) / height;
    const eyeLine = (eyeY - minY) / height;
    const eyeToCrown = Math.max(1e-4, 1 - eyeLine);
    const relativeY = (normalizedY - eyeLine) / eyeToCrown;

    const lateralFromEyes = Math.abs(world.x - centerX) / eyeSpan;
    const normalizedDepth = (world.z - minZ) / Math.max(1e-4, maxZ - minZ);
    const isAnatomicalLeft = leftIsPositiveX
      ? world.x >= centerX
      : world.x < centerX;
    const sideLabel = isAnatomicalLeft ? "ซ้าย" : "ขวา";

    // Ears occupy the eye-height side band. Depth separates the visible pinna
    // from the skin immediately behind it when the user rotates the model.
    if (lateralFromEyes > 0.92 && relativeY > -0.55 && relativeY < 0.48) {
      return normalizedDepth < 0.4
        ? `หลังใบหู${sideLabel}`
        : `หู${sideLabel}`;
    }

    // Rear-facing hits must be resolved before the ordinary facial bands;
    // otherwise the back of the skull is incorrectly labelled forehead/cheek.
    if (normalizedDepth < 0.38 && relativeY > -1.45) return "หลังศีรษะ";
    if (normalizedDepth < 0.42 && relativeY <= -1.45) return "หลัง";

    if (relativeY > 0.8) return "หนังศีรษะ";
    if (relativeY > 0.25) return "หน้าผาก";
    if (relativeY >= -0.2) return "ตา / คิ้ว";
    if (relativeY >= -0.55) return lateralFromEyes < 0.35 ? "จมูก" : "แก้ม";
    if (relativeY >= -0.8) return "ปาก / ริมฝีปาก";
    if (relativeY >= -1.15) return "คาง";
    if (relativeY >= -2.2) return "คอ";
    return "ลำตัว";
  };

  const isSkin = (o: THREE.Object3D) =>
    o instanceof THREE.Mesh && skinMeshes.current.has(o);

  const setControls = (enabled: boolean) => {
    const c = getState().controls as unknown as { enabled: boolean } | null;
    if (c) c.enabled = enabled;
  };
  const stopPaint = () => {
    if (painting.current) {
      painting.current = false;
      lastPaintUv.current = null;
      setControls(true);
      notifyPaintChange();
    }
  };
  useEffect(() => {
    const handleWindowPointerUp = () => stopPaint();
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => window.removeEventListener("pointerup", handleWindowPointerUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group ref={group}>
      <primitive
        object={scene}
        onPointerDown={(e: any) => {
          if (!paintEnabled || !isSkin(e.object)) return;
          e.stopPropagation();
          onHover?.(null);
          blockedDuringStroke.current = false;
          painting.current = true;
          lastPaintUv.current = null;
          setControls(false);
          if (e.uv) paintStrokeTo(e.uv);
        }}
        onPointerMove={(e: any) => {
          if (!isSkin(e.object)) return;
          if (!paintEnabled) {
            if (painting.current) stopPaint();
            onHover?.(null);
            return;
          }
          if (painting.current) {
            e.stopPropagation();
            onHover?.(null);
            if (e.uv) paintStrokeTo(e.uv);
            return;
          }

          if (!e.uv) return onHover?.(null);
          const symptoms = paintedSymptomsAt(e.uv);
          if (!symptoms.length) return onHover?.(null);
          onHover?.({
            x: e.nativeEvent.offsetX,
            y: e.nativeEvent.offsetY,
            // Prefer the anatomical UV map so the label follows the exact
            // painted texel. Keep the calibrated XYZ classifier as a safe
            // fallback for map-loading failures and unmapped UV seams.
            region: faceRegionAtUv(faceRegionMap.current, e.uv) ?? regionAt(e.point),
            symptoms,
          });
        }}
        onPointerOut={() => {
          onHover?.(null);
        }}
        onPointerUp={stopPaint}
      />
    </group>
  );
}

const SYMPTOMS: { id: SkinKey; label: string; desc: string }[] = [
  { id: "redness", label: "ผิวแดง", desc: "รอยแดงระเรื่อเนียนทั้งบริเวณ (erythema) เข้มเป็นหย่อมจางออกที่ขอบ ไม่เป็นจุด" },
  { id: "papule", label: "ตุ่มแดง", desc: "ผิวแดงเป็นรอยทาง + ตุ่มเม็ดเล็กนูนเบาๆ กระจายในบริเวณแดง (papules) ไม่มีหัวหนอง" },
  { id: "peeling", label: "ผิวลอก", desc: "ผิวแห้งลอกเป็นขุย (desquamation)" },
  { id: "edema", label: "ผิวบวม", desc: "บวมนูนเรียบต่อเนื่องทั้งบริเวณ ผิวตึงเงาสะท้อนแสง แดงระเรื่อทั่วผืน ขอบจางนุ่ม (edema)" },
];

const BRUSH_SIZES: { id: string; label: string; pct: number }[] = [
  { id: "s", label: "เล็ก", pct: 20 },
  { id: "m", label: "กลาง", pct: 50 },
  { id: "l", label: "ใหญ่", pct: 85 },
];

/** Map a 1–100 severity percentage to its Thai level label. */
function severityLevel(pct: number): string {
  if (pct <= 25) return "ต่ำ";
  if (pct <= 50) return "ปานกลาง";
  if (pct <= 75) return "สูง";
  return "รุนแรง";
}

type EyeSide = "none" | "left" | "right" | "both";

/**
 * Symptom lab — pick a symptom, paint white to mark the area, press Run.
 */
export default function SymptomLabModel() {
  const [active, setActive] = useState<SkinKey>("redness");
  // Each symptom keeps its own severity so they can coexist.
  const [sevMap, setSevMap] = useState<Record<SkinKey, number>>({
    redness: 0.7, papule: 0.7, peeling: 0.7, edema: 0.7,
  });
  const [brushSize, setBrushSize] = useState(50); // matches BRUSH_SIZES "กลาง"
  const [eyeSide, setEyeSide] = useState<EyeSide>("none");
  const [eyeSeverity, setEyeSeverity] = useState(0.4);
  const apiRef = useRef<PaintApi | null>(null);

  const activeMeta = SYMPTOMS.find((s) => s.id === active)!;
  const severity = sevMap[active];
  const setActiveSeverity = (v: number) => setSevMap((m) => ({ ...m, [active]: v }));
  const sevPct = Math.round(severity * 100);
  const eyePct = Math.round(eyeSeverity * 100);
  const eyeLeft = eyeSide === "left" || eyeSide === "both" ? eyeSeverity : 0;
  const eyeRight = eyeSide === "right" || eyeSide === "both" ? eyeSeverity : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-white">
      <Canvas
        camera={{ fov: 35, position: [0, 0, 2] }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 3, 4]} intensity={2.2} color="#fff5ec" />
        <directionalLight position={[-4, 1, -2]} intensity={0.5} color="#bcd3ff" />
        <directionalLight position={[0, 2, -5]} intensity={0.6} color="#ffffff" />
        <Suspense fallback={null}>
          <PaintSymptomModel
            activeSymptom={active}
            sev={sevMap}
            brushSizePct={brushSize}
            eyeLeft={eyeLeft}
            eyeRight={eyeRight}
            apiRef={apiRef}
          />
        </Suspense>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
        />
      </Canvas>

      {/* Control panel */}
      <div className="absolute bottom-4 left-4 w-[min(360px,calc(100%-2rem))] rounded-2xl border border-gray-200 bg-white/90 p-4 text-gray-800 shadow-lg backdrop-blur-md">
        <div className="mb-3 text-xs text-gray-500">
          ทาได้หลายอาการ (เลือกอาการแล้วทาทีละแบบ) → กด Run ครั้งเดียวแสดงทั้งหมด
        </div>

        {/* 4 symptom buttons */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {SYMPTOMS.map((s) => {
            const on = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`rounded-lg border py-2 text-sm transition ${on
                    ? "border-brand bg-brand/10 text-brand font-medium"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-gray-500">{activeMeta.desc}</p>

        {/* Severity + level label */}
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-gray-600">ความรุนแรง</span>
          <span className="font-mono tabular-nums text-brand">
            {sevPct}% · ระดับ{severityLevel(sevPct)}
          </span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          value={sevPct}
          onChange={(e) => setActiveSeverity(Number(e.target.value) / 100)}
          className="mb-3 w-full cursor-pointer accent-brand"
          aria-label="ความรุนแรงของอาการ"
        />

        {/* Brush size — เล็ก / กลาง / ใหญ่ */}
        <div className="mb-1.5 text-sm text-gray-600">ขนาดพู่กัน</div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {BRUSH_SIZES.map((b) => {
            const on = brushSize === b.pct;
            return (
              <button
                key={b.id}
                onClick={() => setBrushSize(b.pct)}
                className={`rounded-lg border py-1.5 text-sm transition ${on
                    ? "border-brand bg-brand/10 text-brand font-medium"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Run + Clear */}
        <div className="flex gap-2">
          <button
            onClick={() => apiRef.current?.run()}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
          >
            <span className="inline-flex items-center justify-center gap-1"><SemanticIcon name="play" className="size-4" /> Run</span>
          </button>
          <button
            onClick={() => apiRef.current?.clear()}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
          >
            ล้าง
          </button>
        </div>

        {/* ── Eye irritation — separate category (no painting / no Run) ── */}
        <div className="mt-4 border-t border-gray-200 pt-3">
          <div className="mb-2 text-sm font-medium text-gray-700">การระคายเคืองดวงตา</div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {([
              { id: "left", label: "ตาซ้าย" },
              { id: "right", label: "ตาขวา" },
              { id: "both", label: "ทั้งสองข้าง" },
            ] as { id: EyeSide; label: string }[]).map((o) => {
              const on = eyeSide === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => setEyeSide(on ? "none" : o.id)}
                  className={`rounded-lg border py-1.5 text-xs transition ${on
                      ? "border-brand bg-brand/10 text-brand font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className={eyeSide === "none" ? "text-gray-400" : "text-gray-600"}>ความรุนแรง</span>
            <span className={`font-mono tabular-nums ${eyeSide === "none" ? "text-gray-300" : "text-brand"}`}>
              {eyePct}% · ระดับ{severityLevel(eyePct)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={eyePct}
            onChange={(e) => setEyeSeverity(Number(e.target.value) / 100)}
            disabled={eyeSide === "none"}
            className="w-full cursor-pointer accent-brand disabled:opacity-40"
            aria-label="ความรุนแรงของอาการตาแดง"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
            เลือกข้างตาให้ตาขาวแดงก่ำได้ทันที ไม่ต้องทา/กด Run
          </p>
        </div>
      </div>
    </div>
  );
}

useGLTF.preload("/models/head.glb");
// Vesicle relief maps: public/textures/blister_height.png defines the domes and
// blister_normal.png restores their fine directional lighting in the papule branch.
