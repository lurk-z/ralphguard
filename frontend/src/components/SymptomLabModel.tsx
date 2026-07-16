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

export type PaintApi = { clear: () => void; run: () => void; fillAll: () => void };

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
}: {
  activeSymptom: SkinKey;
  sev: Record<SkinKey, number>; // 0..1 severity PER symptom (each kept independently)
  brushSizePct: number;
  eyeLeft: number; // 0..1 — left-eye redness (independent of paint/Run)
  eyeRight: number; // 0..1 — right-eye redness
  apiRef?: React.MutableRefObject<PaintApi | null>;
  eraseMode?: boolean; // when true, painting rubs the active symptom out
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
  // Each symptom keeps its OWN severity (so painted symptoms coexist, never
  // zeroed just because another symptom is active).
  useEffect(() => {
    uRedness.current.value = sev.redness;
    uPapule.current.value = sev.papule;
    uPeeling.current.value = sev.peeling;
    uEdema.current.value = sev.edema;
  }, [sev.redness, sev.papule, sev.peeling, sev.edema]);
  // Eye redness is its own category — per eye, live (no painting / no Run).
  useEffect(() => {
    uEyeRedL.current.value = eyeLeft;
    uEyeRedR.current.value = eyeRight;
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
  const skinMesh = useRef<THREE.Mesh | null>(null);

  // Keep the active symptom in a ref so paint/run/clear always use the current one.
  const activeRef = useRef<SkinKey>(activeSymptom);
  useEffect(() => void (activeRef.current = activeSymptom), [activeSymptom]);

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

  // Seamless tiling vesicle-relief map (baked from the Blender dome pattern).
  // Sampled triplanar in object space inside the papule branch.
  const blisterTex = useMemo(() => {
    const t = new THREE.TextureLoader().load("/textures/blister_height.png");
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
      if (mesh.name === "Realtime_Eyeball_Left" || mesh.name === "Realtime_Eyeball_Right") {
        const emat = srcMat.clone();
        mesh.material = emat;
        const uER = mesh.name === "Realtime_Eyeball_Left" ? uEyeRedL.current : uEyeRedR.current;
        emat.onBeforeCompile = (shader) => {
          shader.uniforms.uEyeRed = uER;
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
uniform float uEyeRed;`
            )
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
// Sclera = brightish areas; iris/pupil stay dark and untouched.
float _lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
float _white = smoothstep(0.18, 0.55, _lum);
float _e = clamp(uEyeRed * _white, 0.0, 1.0);
diffuseColor.r = mix(diffuseColor.r, min(diffuseColor.r * 1.10 + 0.45, 1.0), _e);
diffuseColor.g *= 1.0 - _e * 0.82;
diffuseColor.b *= 1.0 - _e * 0.82;`
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
      uEdemaScale.current.value = (bb.max.y - bb.min.y) * 0.06;
      // Tile repeats across the largest dimension (lower = bigger, sparser vesicles).
      uBlisterScale.current.value =
        5.5 / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);

      const uMaskRedness = { value: masks.redness.tex };
      const uMaskPapule = { value: masks.papule.tex };
      const uMaskPeeling = { value: masks.peeling.tex };
      const uMaskEdema = { value: masks.edema.tex };

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uMaskRedness = uMaskRedness;
        shader.uniforms.uMaskPapule = uMaskPapule;
        shader.uniforms.uMaskPeeling = uMaskPeeling;
        shader.uniforms.uMaskEdema = uMaskEdema;
        shader.uniforms.uRevealRedness = uRevealRedness.current;
        shader.uniforms.uRevealPapule = uRevealPapule.current;
        shader.uniforms.uRevealPeeling = uRevealPeeling.current;
        shader.uniforms.uRevealEdema = uRevealEdema.current;
        shader.uniforms.uRedness = uRedness.current;
        shader.uniforms.uPapule = uPapule.current;
        shader.uniforms.uPeeling = uPeeling.current;
        shader.uniforms.uEdema = uEdema.current;
        shader.uniforms.uSkinLift = uSkinLift.current;
        shader.uniforms.uEdemaScale = uEdemaScale.current;
        shader.uniforms.uBlisterTex = { value: blisterTex };
        shader.uniforms.uBlisterScale = uBlisterScale.current;

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
float _m = smoothstep(0.0, 0.85, texture2D(uMaskEdema, uv).r) * uRevealEdema * uEdema;
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
uniform float uRevealRedness;
uniform float uRevealPapule;
uniform float uRevealPeeling;
uniform float uRevealEdema;
uniform float uRedness;
uniform float uPapule;
uniform float uPeeling;
uniform float uEdema;
uniform float uSkinLift;
uniform sampler2D uBlisterTex;
uniform float uBlisterScale;
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

// White "test cream" marking = any symptom painted but not yet revealed.
float _cream = clamp(max(
  max(_mR * (1.0 - uRevealRedness), _mP * (1.0 - uRevealPapule)),
  max(_mK * (1.0 - uRevealPeeling), _mE * (1.0 - uRevealEdema))), 0.0, 1.0);

float gRed   = clamp(_mR * uRevealRedness * uRedness, 0.0, 1.0);
float gPap   = clamp(_mP * uRevealPapule  * uPapule,  0.0, 1.0);
float gPeel  = clamp(_mK * uRevealPeeling * uPeeling, 0.0, 1.0);
float gEdema = clamp(_mE * uRevealEdema   * uEdema,   0.0, 1.0);
float gPapDot = 0.0;
float gFlake  = 0.0;
float gTaut   = 0.0;   // edema tautness (drives the wet/stretched sheen)
float gBumpH  = 0.0;

vec3 _c = diffuseColor.rgb;

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
  float _pap  = smoothstep(0.55, 0.85, _bh);
  float _gate = smoothstep(0.10, 0.30, _flush);   // bumps only where red
  float _papv = _pap * _gate;

  // Red lives ONLY on the papules (slightly stronger since it's the only red).
  _c.r += _papv * 0.34;
  _c.g -= _papv * 0.14;
  _c.b -= _papv * 0.11;

  gBumpH += _papv * 0.35;   // soft small relief; matte (no wet gloss)
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
  - gTaut * 0.42,
  0.03, 1.0);`
          );
      };
      mat.needsUpdate = true;
    });
  }, [scene, gl, masks, blisterTex]);

  // Run reveals ALL painted symptoms at once; Clear wipes the ACTIVE symptom.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      clear: () => {
        const k = activeRef.current as SkinKey;
        const m = masks[k];
        if (!m) return;
        m.ctx.globalCompositeOperation = "source-over";
        m.ctx.fillStyle = "#000000";
        m.ctx.fillRect(0, 0, m.canvas.width, m.canvas.height);
        m.tex.needsUpdate = true;
        revealTargets.current[k] = 0;
        revealRefs[k].current.value = 0;
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
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, masks]);

  // Ease every symptom's reveal toward its own target (~0.9s).
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 2.2);
    SKIN_KEYS.forEach((s) => {
      const ref = revealRefs[s].current;
      ref.value += (revealTargets.current[s] - ref.value) * k;
    });
  });

  const paintAt = (uv: THREE.Vector2) => {
    const k = activeRef.current as SkinKey;
    const m = masks[k];
    if (!m) return;
    const W = m.canvas.width;
    const H = m.canvas.height;
    const px = uv.x * W;
    const py = uv.y * H; // flipY=false + raw uv -> no inversion

    // pct = 20 / 50 / 85 (เล็ก / กลาง / ใหญ่) -> distinct, usefully-sized radii.
    const pct = brushSizeRef.current;
    const r = (pct / 100) * 0.09 * W;

    // Paint WHITE (mark) — or rub out in erase mode (destination-out).
    const g = m.ctx.createRadialGradient(px, py, 0, px, py, r);
    if (eraseRef.current) {
      g.addColorStop(0, "rgba(0,0,0,0.9)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      m.ctx.globalCompositeOperation = "destination-out";
    } else {
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      m.ctx.globalCompositeOperation = "lighter";
    }
    m.ctx.fillStyle = g;
    m.ctx.beginPath();
    m.ctx.arc(px, py, r, 0, Math.PI * 2);
    m.ctx.fill();
    m.tex.needsUpdate = true;
    // Do NOT reset this symptom's reveal: already-revealed areas stay revealed
    // when you paint MORE of the same symptom. New marks show as cream only
    // before the first Run (reveal 0); after that they appear immediately.
  };

  const isSkin = (o: THREE.Object3D) => o === skinMesh.current;

  const setControls = (enabled: boolean) => {
    const c = getState().controls as unknown as { enabled: boolean } | null;
    if (c) c.enabled = enabled;
  };
  const stopPaint = () => {
    if (painting.current) {
      painting.current = false;
      setControls(true);
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
          painting.current = true;
          setControls(false);
          if (e.uv) paintAt(e.uv);
        }}
        onPointerMove={(e: any) => {
          if (!painting.current || !isSkin(e.object)) return;
          e.stopPropagation();
          if (e.uv) paintAt(e.uv);
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
    <div className="fixed inset-0 cursor-crosshair overflow-hidden bg-white">
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
// Vesicle relief map: public/textures/blister_height.png (sampled triplanar in the papule branch).
