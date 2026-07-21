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
import type { PaintMaskSnapshot } from "@/lib/project-workspace";

// The four paintable skin symptoms (eye redness is a separate, non-painted category).
export type SkinKey = "redness" | "papule" | "peeling" | "edema";
const SKIN_KEYS: SkinKey[] = ["redness", "papule", "peeling", "edema"];

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
 * Single source of truth for mapping RalphGuard's four assessment endpoints to
 * the symptom renderer. Inputs are normalized 0..1 scores.
 *
 * Skin irritation drives both erythema and edema, matching the two visible
 * reactions used when irritation is graded. A high acute score can reinforce
 * the edema signal, but is not required for skin swelling to appear.
 */
export function mapAssessmentEndpointsToSymptoms(scores: AssessmentEndpointScores): {
  sev: Record<SkinKey, number>;
  eyeRed: number;
} {
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const skin = clamp01(scores.skin);
  const eye = clamp01(scores.eye);
  const sens = clamp01(scores.sens);
  const acute = clamp01(scores.acute);

  return {
    sev: {
      redness: skin,
      papule: sens,
      // Desquamation is a severe skin-irritation manifestation, not a separate
      // endpoint. Keep it absent below the severe visual threshold.
      peeling: Math.max(0, (skin - 0.55) / 0.45),
      // Irritated skin can be both red and swollen. Acute toxicity contributes
      // an additional edema signal only above its high-risk threshold.
      edema: Math.max(skin, Math.max(0, (acute - 0.5) / 0.5)),
    },
    eyeRed: eye,
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
function useFaceCameraFit(groupRef: React.RefObject<THREE.Group>) {
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
    const distance = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.5;

    persp.position.set(center.x, center.y, center.z + distance);
    persp.near = Math.max(0.01, distance / 100);
    persp.far = distance * 100;
    persp.updateProjectionMatrix();
    persp.lookAt(center);

    controls.target.copy(center);
    controls.minDistance = distance * 0.18; // allow close-up inspection of symptoms
    controls.maxDistance = distance * 2.5;
    controls.update();

    fitted.current = true;
  });
}

export function PaintSymptomModel({
  activeSymptom,
  sev,
  brushSizePct,
  eyeLeft,
  eyeRight,
  apiRef,
  eraseMode = false,
  onHover,
  paintSymptoms,
  initialPaint,
  onPaintChange,
  occupiedPaint = [],
  onPaintBlocked,
}: {
  activeSymptom: SkinKey;
  sev: Record<SkinKey, number>; // 0..1 severity PER symptom (each kept independently)
  brushSizePct: number;
  eyeLeft: number; // 0..1 — left-eye redness (independent of paint/Run)
  eyeRight: number; // 0..1 — right-eye redness
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
}) {
  const { scene: rawScene, animations } = useGLTF("/models/head.glb", true);
  const gl = useThree((s) => s.gl);
  const getState = useThree((s) => s.get);
  const scene = useMemo(() => rawScene.clone(true), [rawScene]);

  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  usePlayAllAnimations(actions);
  useFaceCameraFit(group);

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
  // Timecourse changes should develop/fade on the model instead of snapping
  // between days. Props update these targets; useFrame eases live uniforms.
  const severityTargets = useRef({
    redness: sev.redness,
    papule: sev.papule,
    peeling: sev.peeling,
    edema: sev.edema,
    eyeLeft,
    eyeRight,
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
  }, [eyeLeft, eyeRight]);

  const uSkinLift = useRef({ value: SKIN_LIFT });
  const uEdemaScale = useRef({ value: 0 });
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
  const skinMesh = useRef<THREE.Mesh | null>(null);
  const skinBounds = useRef<THREE.Box3 | null>(null);
  const eyeMesh = useRef<THREE.Object3D | null>(null);
  const faceCalibration = useRef<{ minY: number; maxY: number; eyeY: number } | null>(null);

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
      return { canvas, ctx, tex };
    };
    return {
      redness: make(), papule: make(), peeling: make(), edema: make(),
    } as Record<SkinKey, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }>;
  }, []);

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
    return { canvas, ctx, tex };
  }, []);
  const occupiedReady = useRef(false);
  const blockedDuringStroke = useRef(false);
  const paintProbe = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    return { canvas, ctx: canvas.getContext("2d")! };
  }, []);

  const hasAnyPaint = () =>
    SKIN_KEYS.some((key) => {
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
    SKIN_KEYS.forEach((key) => {
      snapshot[key] = masks[key].canvas.toDataURL("image/png");
    });
    return snapshot;
  };

  const notifyPaintChange = () => {
    onPaintChangeRef.current?.(snapshotMasks());
  };

  // A formula switch remounts the assessment renderer with its own snapshot.
  // Restore the saved grayscale masks without emitting a change event, otherwise
  // hydration would rewrite localStorage before the images finish loading.
  useEffect(() => {
    let cancelled = false;
    const clearMasks = () => {
      SKIN_KEYS.forEach((key) => {
        const mask = masks[key];
        mask.ctx.globalCompositeOperation = "source-over";
        mask.ctx.fillStyle = "#000000";
        mask.ctx.fillRect(0, 0, mask.canvas.width, mask.canvas.height);
        mask.tex.needsUpdate = true;
      });
    };
    clearMasks();
    if (!initialPaint) return () => void (cancelled = true);

    void Promise.all(
      SKIN_KEYS.map(
        (key) =>
          new Promise<void>((resolve) => {
            const dataUrl = initialPaint[key];
            if (!dataUrl) return resolve();
            const image = new Image();
            image.onload = () => {
              if (!cancelled) {
                const mask = masks[key];
                mask.ctx.globalCompositeOperation = "source-over";
                mask.ctx.drawImage(image, 0, 0, mask.canvas.width, mask.canvas.height);
                mask.tex.needsUpdate = true;
              }
              resolve();
            };
            image.onerror = () => resolve();
            image.src = dataUrl;
          }),
      ),
    ).then(() => {
      // Old workspace snapshots did not carry hasPaint metadata. Once their
      // images are restored, emit the same masks with accurate pixel presence
      // so refresh migration completes without guessing from a PNG's existence.
      if (!cancelled) notifyPaintChange();
    });

    return () => {
      cancelled = true;
    };
    // initialPaint belongs to this mounted formula and never changes in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masks]);

  // Formula switches remount this component, so occupiedPaint is an immutable
  // snapshot for the lifetime of the renderer. Merge every symptom layer from
  // every other formula into one grayscale collision/display mask.
  useEffect(() => {
    let cancelled = false;
    occupiedReady.current = occupiedPaint.length === 0;
    occupiedMask.ctx.globalCompositeOperation = "source-over";
    occupiedMask.ctx.fillStyle = "#000000";
    occupiedMask.ctx.fillRect(0, 0, occupiedMask.canvas.width, occupiedMask.canvas.height);
    occupiedMask.tex.needsUpdate = true;

    const dataUrls = occupiedPaint.flatMap((snapshot) =>
      SKIN_KEYS.map((key) => snapshot[key]).filter((value): value is string => Boolean(value)),
    );
    if (dataUrls.length === 0) {
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
                occupiedMask.tex.needsUpdate = true;
              }
              resolve();
            };
            image.onerror = () => resolve();
            image.src = dataUrl;
          }),
      ),
    ).then(() => {
      if (!cancelled) occupiedReady.current = true;
    });

    return () => {
      cancelled = true;
    };
    // occupiedPaint belongs to this mounted formula and never changes in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupiedMask]);

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
        if (!eyeMesh.current) eyeMesh.current = mesh;
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
      skinMesh.current = mesh;

      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      skinBounds.current = bb.clone();
      // 1.8% of head height gives a visible local swell without distorting the
      // face silhouette. The previous 6% looked like an inflated mesh.
      uEdemaScale.current.value = (bb.max.y - bb.min.y) * 0.018;
      // Tile repeats across the largest dimension (lower = bigger, sparser vesicles).
      uBlisterScale.current.value =
        5.5 / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);

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
        shader.uniforms.uSkinLift = uSkinLift.current;
        shader.uniforms.uEdemaScale = uEdemaScale.current;
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
uniform float uRevealEdema;
uniform float uEdema;
uniform float uEdemaScale;
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
float _shapeSeverity = smoothstep(0.30, 1.0, uEdema);
float _m = smoothstep(0.16, 0.92, texture2D(uMaskEdema, uv).r)
         * uRevealEdema * _shapeSeverity;
// ONE smooth continuous swell (ref photo): no lumpy mounds — only a gentle
// large-scale variation so the surface still reads organic.
float _h = 0.85 + 0.15 * fbm(position * 6.0);
transformed += normal * _m * _h * uEdemaScale;`
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
  vec3 _gn = normalize(cross(dFdx(vLocalPos), dFdy(vLocalPos)));
  vec3 _bw = abs(_gn); _bw /= (_bw.x + _bw.y + _bw.z + 1e-4);
  float _bs = uBlisterScale * 2.1;
  float _bh = texture2D(uBlisterTex, vLocalPos.yz * _bs).r * _bw.x
            + texture2D(uBlisterTex, vLocalPos.zx * _bs).r * _bw.y
            + texture2D(uBlisterTex, vLocalPos.xy * _bs).r * _bw.z;
  // The baked tangent-space normal map adds the fine directional light response
  // that the height silhouette alone cannot preserve. Blend all three planar
  // projections with the same weights as the height map, then feed that detail
  // into the derivative bump pass below.
  vec3 _bnX = texture2D(uBlisterNormalTex, vLocalPos.yz * _bs).xyz * 2.0 - 1.0;
  vec3 _bnY = texture2D(uBlisterNormalTex, vLocalPos.zx * _bs).xyz * 2.0 - 1.0;
  vec3 _bnZ = texture2D(uBlisterNormalTex, vLocalPos.xy * _bs).xyz * 2.0 - 1.0;
  vec2 _bnXY = _bnX.xy * _bw.x + _bnY.xy * _bw.y + _bnZ.xy * _bw.z;
  float _normalDetail = dot(_bnXY, vec2(0.70710678));
  float _pap  = smoothstep(0.55, 0.85, _bh);
  float _gate = smoothstep(0.10, 0.30, _flush);   // bumps only where red
  float _papv = _pap * _gate;

  // Red lives ONLY on the papules (slightly stronger since it's the only red).
  _c.r += _papv * 0.34;
  _c.g -= _papv * 0.14;
  _c.b -= _papv * 0.11;

  // Both maps are restricted to the actual papule footprint. Applying normal
  // detail to the wider flush gate makes the whole painted patch look swollen.
  gBumpH += _papv * (0.35 + _normalDetail * 0.08);
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
  float _fn   = fbm(vLocalPos * 430.0);
  float _band = 1.0 - smoothstep(0.0, 0.020, abs(_fn - 0.45));   // thin curvy ribbon
  float _keep = smoothstep(0.52, 0.60, fbm(vLocalPos * 260.0 + 7.3)); // fragment it
  float _flake = _band * _keep * _patch * (0.40 + 0.60 * gPeel); // denser w/ severity
  _flake = smoothstep(0.15, 0.60, _flake);                       // crisp edges

  // Pale dry chips (Blender: BLP_ColFlake) — sit IN the skin, not on top.
  _c = mix(_c, vec3(0.94, 0.93, 0.91), _flake * 0.9);

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
  normal = normalize(abs(_det) * normal - _grad * 3.0);
}`
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
roughnessFactor = clamp(
  roughnessFactor
  + gRed * 0.06
  - gPapDot * 0.45
  + gFlake * 0.42
  - gTaut * 0.42
  - gEyeRim * 0.12,
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
        paintSymptomsRef.current.forEach((k) => {
          const m = masks[k];
          if (!m) return;
          m.ctx.globalCompositeOperation = "source-over";
          m.ctx.fillStyle = "#000000";
          m.ctx.fillRect(0, 0, m.canvas.width, m.canvas.height);
          m.tex.needsUpdate = true;
          revealTargets.current[k] = 0;
          revealRefs[k].current.value = 0;
        });
        notifyPaintChange();
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
        SKIN_KEYS.forEach((k) => {
          const m = masks[k];
          if (!m) return;
          m.ctx.globalCompositeOperation = "source-over";
          m.ctx.fillStyle = "#ffffff";
          m.ctx.fillRect(0, 0, m.canvas.width, m.canvas.height);
          m.tex.needsUpdate = true;
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
  });

  const dabAt = (uv: THREE.Vector2) => {
    if (!eraseRef.current) {
      // Wait for the other formula masks before accepting paint. This closes a
      // short race immediately after switching formulas where overlap could be
      // written before their PNG snapshots finish decoding.
      if (!occupiedReady.current) return;

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
      let overlapsOtherFormula = false;

      // Sampling every four pixels is fast enough for continuous strokes while
      // still detecting the feathered edge of another formula's brush mask.
      for (let y = 0; y < height && !overlapsOtherFormula; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const dx = minX + x - px;
          const dy = minY + y - py;
          if (dx * dx + dy * dy > radius * radius) continue;
          if (pixels[(y * width + x) * 4] > 12) {
            overlapsOtherFormula = true;
            break;
          }
        }
      }

      if (overlapsOtherFormula) {
        if (!blockedDuringStroke.current) {
          blockedDuringStroke.current = true;
          onPaintBlockedRef.current?.();
        }
        return;
      }
    }

    // Erasing uses the same brush interaction as painting and clears every
    // symptom mask underneath it so no hidden reaction layer is left behind.
    const targetSymptoms = eraseRef.current ? SKIN_KEYS : paintSymptomsRef.current;
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
        const g = m.ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.72, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        m.ctx.globalCompositeOperation = "destination-out";
        m.ctx.fillStyle = g;
        m.ctx.beginPath();
        m.ctx.arc(px, py, r, 0, Math.PI * 2);
        m.ctx.fill();
        m.tex.needsUpdate = true;
        return;
      }

      // Paint WHITE (mark).
      const g = m.ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      m.ctx.globalCompositeOperation = "lighter";
      m.ctx.fillStyle = g;
      m.ctx.beginPath();
      m.ctx.arc(px, py, r, 0, Math.PI * 2);
      m.ctx.fill();
      m.tex.needsUpdate = true;
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
    // Do not bridge distant UV islands across a model seam. Within one island,
    // interpolate dabs so a quick drag still produces one continuous stroke.
    if (distance > 0.2) {
      dabAt(uv);
    } else {
      const brushRadiusUv = (brushSizeRef.current / 100) * 0.09;
      const spacing = Math.max(0.004, brushRadiusUv * 0.35);
      const steps = Math.min(32, Math.max(1, Math.ceil(distance / spacing)));
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
    return SKIN_KEYS.filter((k) => {
      const m = masks[k];
      const x = Math.max(0, Math.min(m.canvas.width - 1, Math.floor(uv.x * m.canvas.width)));
      const y = Math.max(0, Math.min(m.canvas.height - 1, Math.floor(uv.y * m.canvas.height)));
      return m.ctx.getImageData(x, y, 1, 1).data[0] > 12;
    });
  };

  // Convert a hit point to a human-readable facial region. The vertical bands
  // are calibrated against the actual eye line, so they continue to work after
  // rotating or resizing the 3D model.
  const regionAt = (world: THREE.Vector3): string => {
    const mesh = skinMesh.current;
    const localBounds = skinBounds.current;
    if (!mesh || !localBounds) return "ผิวหน้า";

    if (!faceCalibration.current) {
      const worldBounds = new THREE.Box3().setFromObject(mesh);
      let eyeY = worldBounds.min.y + (worldBounds.max.y - worldBounds.min.y) * 0.62;
      if (eyeMesh.current) {
        eyeY = new THREE.Box3()
          .setFromObject(eyeMesh.current)
          .getCenter(new THREE.Vector3()).y;
      }
      faceCalibration.current = {
        minY: worldBounds.min.y,
        maxY: worldBounds.max.y,
        eyeY,
      };
    }

    const { minY, maxY, eyeY } = faceCalibration.current;
    const height = Math.max(1e-4, maxY - minY);
    const normalizedY = (world.y - minY) / height;
    const eyeLine = (eyeY - minY) / height;
    const eyeToCrown = Math.max(1e-4, 1 - eyeLine);
    const relativeY = (normalizedY - eyeLine) / eyeToCrown;

    const local = mesh.worldToLocal(world.clone());
    const normalizedX =
      (local.x - localBounds.min.x) /
      Math.max(1e-4, localBounds.max.x - localBounds.min.x);
    const side = Math.abs(normalizedX - 0.5);

    if (side > 0.3 && Math.abs(relativeY) < 0.6) return "หู";
    if (relativeY > 0.8) return "หนังศีรษะ";
    if (relativeY > 0.25) return "หน้าผาก";
    if (relativeY >= -0.2) return "ตา / คิ้ว";
    if (relativeY >= -0.55) return side < 0.09 ? "จมูก" : "แก้ม";
    if (relativeY >= -0.8) return "ปาก / ริมฝีปาก";
    if (relativeY >= -1.15) return "คาง";
    if (relativeY >= -2.2) return "คอ";
    return "ผิวหน้า";
  };

  const isSkin = (o: THREE.Object3D) => o === skinMesh.current;

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
    window.addEventListener("pointerup", stopPaint);
    return () => window.removeEventListener("pointerup", stopPaint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group ref={group}>
      <primitive
        object={scene}
        onPointerDown={(e: any) => {
          if (!isSkin(e.object)) return;
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
            region: regionAt(e.point),
            symptoms,
          });
        }}
        onPointerOut={() => onHover?.(null)}
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
            ▶ Run
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
