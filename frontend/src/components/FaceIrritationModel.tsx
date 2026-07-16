"use client";

/**
 * FaceIrritationModel — realistic head that paints skin-irritation ON the skin
 * surface via a shader injected through material.onBeforeCompile.
 *
 * Ported from the standalone 3D-skin-viewer (React 19 / R3F 9) to RalphGuard's
 * stack (React 18 / R3F 8 / drei 9 / three 0.169). The GLSL is kept verbatim —
 * it only touches the skin material (Material.001), leaving brows/lashes/eyes
 * untouched, and computes forehead/cheek/all region masks from normalized local
 * position. Driven by two inputs:
 *   - intensity : 0..1  (0 = clear skin, 1 = severe erythema + papules)
 *   - zone      : 'all' | 'forehead' | 'cheek'
 *
 * Asset: frontend/public/models/head.glb (Draco-compressed; drei fetches the decoder).
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type SkinZone = "all" | "forehead" | "cheek";
const ZONE_ID: Record<SkinZone, number> = { all: 0, forehead: 1, cheek: 2 };

const TIP_BAND_HEX: Record<string, string> = {
  low: "#16A34A",
  moderate: "#E08A00",
  high: "#DC2626",
  severe: "#B91C1C",
};

export type PaintLayer = { key: string; label: string; score: number; color: string; band: string };

// The shader keys off the brush HUE to pick lesion morphology (flat/wet for eye,
// hives for sensitisation, …), so anything synthesising a layer must reuse these
// exact colours rather than an arbitrary red.
const EP_COLOR: Record<string, string> = {
  skin: "#FF3B5C", // แดง
  eye: "#22D3EE", // ฟ้า
  sens: "#A855F7", // ม่วง
  acute: "#F59E0B", // ส้ม
};

/** #RRGGBB -> [r,g,b] in 0..1 */
function hex01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Map a 0..1 risk score to paint intensity. Near-proportional (mild curve) so the
 * swelling/redness tracks the actual score: low score → faint, high score → strong.
 */
function gain(raw: number) {
  return raw <= 0 ? 0 : Math.min(1, Math.pow(raw, 0.8) * 1.1);
}

/**
 * Which endpoints are relevant to the part being painted.
 * Eye region → eye irritation only; everywhere else → the skin endpoints.
 */
export function regionEndpoints(region: string): string[] {
  return region.includes("ตา") ? ["eye"] : ["skin", "sens", "acute"];
}

/**
 * Per-part skin sensitivity — thin/mucosal areas react more strongly to the same
 * substance than thick skin, so the same result paints differently by location.
 */
export function regionSensitivity(region: string): number {
  if (region.includes("ตา")) return 1.3; // รอบดวงตา บอบบางสุด
  if (region.includes("ปาก")) return 1.2; // ริมฝีปาก
  if (region.includes("จมูก")) return 1.1;
  if (region.includes("หน้าผาก")) return 0.9;
  if (region.includes("คาง")) return 0.85;
  if (region.includes("หู")) return 0.7;
  if (region.includes("คอ")) return 0.6;
  if (region.includes("หนังศีรษะ")) return 0.55;
  return 1.0; // แก้ม / ทั่วไป
}

// Lift the skin albedo toward white (the brighter "frontend" look). 0 = untouched.
const SKIN_LIFT = 0.7;

/** Loop every animation clip in a GLTF (head.glb ships eye-dart clips) so the face feels alive. */
function usePlayAllAnimations(actions: Record<string, THREE.AnimationAction | null>) {
  useEffect(() => {
    const started = Object.values(actions).filter(Boolean) as THREE.AnimationAction[];
    started.forEach((a) => a.reset().setLoop(THREE.LoopRepeat, Infinity).play());
    return () => started.forEach((a) => a.stop());
  }, [actions]);
}

// Frames the camera on the FACE skin mesh only (Material.001) instead of the
// whole head+neck+shoulders+hair group, so the orbit target sits on the face
// and the initial view looks straight at it instead of up from the chin/neck.
// Polls every frame (rather than a single effect) so it doesn't matter whether
// OrbitControls (which registers itself as `state.controls` via `makeDefault`)
// has mounted yet relative to this component.
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
    controls.minDistance = distance * 0.6;
    controls.maxDistance = distance * 2.5;
    controls.update();

    fitted.current = true;
  });
}

type IrritationUniforms = {
  uIntensity: { value: number };
  uZone: { value: number };
  uBBMin: { value: THREE.Vector3 };
  uBBMax: { value: THREE.Vector3 };
};

function FaceModel({ intensity, zone }: { intensity: number; zone: SkinZone }) {
  const { scene: rawScene } = useGLTF("/models/head.glb", true); // true = enable Draco decoder
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);
  useFaceCameraFit(group);

  // drei caches the loaded scene by URL and shares it across every mount, so a
  // module-level "already injected" guard would orphan later instances' uniforms
  // (redness would stop reacting after the first mount / re-assessment). Clone the
  // scene per instance so each one owns its own skin material + uniforms.
  const scene = useMemo(() => rawScene.clone(true), [rawScene]);

  const uniforms = useRef<IrritationUniforms>({
    uIntensity: { value: 0 },
    uZone: { value: 0 },
    uBBMin: { value: new THREE.Vector3() },
    uBBMax: { value: new THREE.Vector3() },
  });

  // Inject the shader once when the scene loads (useMemo runs before compile).
  useMemo(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const srcMat = mesh.material as THREE.MeshStandardMaterial;
      if (!srcMat) return;

      // Sharpen: enable anisotropic filtering on every texture (fixes blur on
      // grazing-angle skin like cheeks/jaw). Textures are shared — safe to tweak.
      const maxA = gl.capabilities.getMaxAnisotropy();
      [srcMat.map, srcMat.normalMap, srcMat.roughnessMap, srcMat.metalnessMap].forEach((t) => {
        if (t && t.anisotropy !== maxA) {
          t.anisotropy = maxA;
          t.needsUpdate = true;
        }
      });

      // Only the skin material — skip brows/lashes/lens/eyeball/eye-wet.
      if (srcMat.name !== "Material.001") return;

      // Clone the material so THIS instance owns it (and its uniforms). Without
      // this, the shared cached material would only bind to the first mount.
      const mat = srcMat.clone();
      mesh.material = mat;

      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      uniforms.current.uBBMin.value.copy(bb.min);
      uniforms.current.uBBMax.value.copy(bb.max);

      const U = uniforms.current;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uIntensity = U.uIntensity;
        shader.uniforms.uZone = U.uZone;
        shader.uniforms.uBBMin = U.uBBMin;
        shader.uniforms.uBBMax = U.uBBMax;

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vLocalPos;
varying vec3 vObjN;
varying vec3 vViewN;`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vLocalPos = position;
vObjN = normal;
vViewN = normalize(normalMatrix * normal);`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vLocalPos;
varying vec3 vObjN;
varying vec3 vViewN;
uniform float uIntensity;
uniform int uZone;
uniform vec3 uBBMin;
uniform vec3 uBBMax;
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
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
}`
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
float _front = smoothstep(0.0, 0.35, vViewN.z);
vec3 _nrm = (vLocalPos - uBBMin) / max(uBBMax - uBBMin, vec3(1e-4));
float _h = 1.0 - _nrm.z; // world-up maps to local -Z (head geometry is rotated +90deg about X)
float _fore  = smoothstep(0.80, 0.86, _h);
float _cy    = smoothstep(0.48, 0.56, _h) * (1.0 - smoothstep(0.70, 0.78, _h));
float _cx    = smoothstep(0.14, 0.26, abs(_nrm.x - 0.5));
float _cheek = _cy * _cx;
float _all   = smoothstep(0.40, 0.48, _h);
float _region = (uZone == 1 ? _fore : (uZone == 2 ? _cheek : _all)) * _front;
float gIrr = clamp(_region * uIntensity, 0.0, 1.0);
float gPapule = 0.0;
if (gIrr > 0.001) {
  float _blotch = fbm(vLocalPos * 20.0);
  float _spot   = fbm(vLocalPos * 220.0);
  float _clust  = smoothstep(0.35, 0.75, fbm(vLocalPos * 60.0));
  float _e = gIrr * (0.5 + 0.6 * _blotch);
  gPapule = smoothstep(0.62, 0.90, _spot) * _clust * gIrr;
  vec3 c = diffuseColor.rgb;
  c.r += _e * 0.34;
  c.g -= _e * 0.14;
  c.b -= _e * 0.12;
  c = mix(c, vec3(c.r * 1.06 + 0.10, c.g * 0.72, c.b * 0.66), gPapule * 0.75);
  c = mix(c, c * 0.85, smoothstep(0.45, 0.62, _spot) * _clust * gIrr * 0.5);
  diffuseColor.rgb = clamp(c, 0.0, 1.0);
}`
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + gIrr * 0.16 + gPapule * 0.22, 0.0, 1.0);`
          );
      };
      mat.needsUpdate = true;
    });
  }, [scene, gl]);

  // Sync React props -> shader uniforms
  useEffect(() => {
    uniforms.current.uIntensity.value = intensity;
    uniforms.current.uZone.value = ZONE_ID[zone];
  }, [intensity, zone]);

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

/** Bare canvas — drive it from assessment results (no built-in controls). */
export function FaceIrritationCanvas({
  intensity,
  zone,
  background = "#141414",
}: {
  intensity: number;
  zone: SkinZone;
  background?: string;
}) {
  return (
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
      <color attach="background" args={[background]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 3, 4]} intensity={2.2} color="#fff5ec" />
      <directionalLight position={[-4, 1, -2]} intensity={0.5} color="#bcd3ff" />
      <directionalLight position={[0, 2, -5]} intensity={0.6} color="#ffffff" />
      <Suspense fallback={null}>
        <FaceModel intensity={intensity} zone={zone} />
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
  );
}

// ─────────────────────────────────────────────────────────────
// Paint mode — the assessment result becomes a "loaded brush"; the user
// drags on the skin to paint it, and the redness blooms where painted.
// Paint is accumulated into a CanvasTexture sampled by UV in the shader.
// ─────────────────────────────────────────────────────────────

export type PaintApi = { clear: () => void };

function PaintFaceModel({
  layers,
  armed,
  eraseMode,
  apiRef,
  onPaintStart,
  onHover,
  onOverModel,
  brushSizePct = 50,
}: {
  layers: PaintLayer[]; // all endpoint scores; the brush picks by region at click time
  armed: boolean;
  eraseMode?: boolean; // click to erase painted spots instead of painting
  apiRef?: React.MutableRefObject<PaintApi | null>;
  onPaintStart?: () => void;
  onHover?: (info: { x: number; y: number; region: string } | null) => void;
  onOverModel?: (over: boolean) => void; // enable wheel-zoom only over the model
  brushSizePct?: number; // brush diameter from the toolbar slider (10–100)
}) {
  const { scene: rawScene, animations } = useGLTF("/models/head.glb", true);
  const gl = useThree((s) => s.gl);
  const getState = useThree((s) => s.get); // read live state (controls) in handlers
  const scene = useMemo(() => {
    const s = rawScene.clone(true);
    // Center the model at the origin so OrbitControls (target 0,0,0) keeps it
    // perfectly centered while rotating/zooming.
    const box = new THREE.Box3().setFromObject(s);
    const center = box.getCenter(new THREE.Vector3());
    s.position.sub(center);
    return s;
  }, [rawScene]);

  // Drive the GLTF's eye-dart clips against this instance's cloned scene.
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  usePlayAllAnimations(actions);
  useFaceCameraFit(group);

  const brushSizeRef = useRef(brushSizePct);
  useEffect(() => {
    brushSizeRef.current = brushSizePct;
  }, [brushSizePct]);

  // Offscreen paint canvas (self-consistent: flipY=false + raw uv both when
  // drawing and sampling, so orientation is correct regardless of the model map).
  const paint = useMemo(() => {
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

  const uBloom = useRef({ value: 1 });
  const uSwell = useRef({ value: 0 }); // max displacement (local units) at full intensity
  const uTime = useRef({ value: 0 });  // drives the swelling pulse
  const uSkinLift = useRef({ value: SKIN_LIFT }); // brighten the skin albedo
  const hasPainted = useRef(false);
  // Stamps still "developing" — each click grows 0→full over STAMP_DURATION seconds.
  const stampsRef = useRef<
    { cx: number; cy: number; r: number; R: number; G: number; B: number; t0: number }[]
  >([]);
  const painting = useRef(false);
  const brushRef = useRef(0); // set per-click from the region's dominant endpoint
  const colorRef = useRef<[number, number, number]>([1, 0.23, 0.36]);
  const layersRef = useRef<PaintLayer[]>(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const eraseRef = useRef(!!eraseMode);
  useEffect(() => {
    eraseRef.current = !!eraseMode;
  }, [eraseMode]);

  const skinMesh = useRef<THREE.Mesh | null>(null);
  const bbRef = useRef<{ min: THREE.Vector3; max: THREE.Vector3 } | null>(null);
  const eyeMeshRef = useRef<THREE.Object3D | null>(null); // eyeball mesh → calibrates eye line
  const calibRef = useRef<{ minY: number; maxY: number; eyeY: number } | null>(null);

  // Inject the paint-driven erythema shader onto a per-instance skin material.
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

      if (!eyeMeshRef.current && (mesh.name.includes("Eyeball") || mesh.name.includes("Eye Wet"))) {
        eyeMeshRef.current = mesh;
      }

      if (srcMat.name !== "Material.001") return;
      const mat = srcMat.clone();
      mesh.material = mat;
      skinMesh.current = mesh;
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      bbRef.current = { min: bb.min.clone(), max: bb.max.clone() };
      // Max swell ≈ 13% of the head size, in the mesh's own local units.
      const _sz = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
      uSwell.current.value = _sz * 0.09;

      const uPaint = { value: paint.tex };
      const uB = uBloom.current;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uPaintMap = uPaint;
        shader.uniforms.uBloom = uB;
        shader.uniforms.uSwell = uSwell.current;
        shader.uniforms.uTime = uTime.current;
        shader.uniforms.uSkinLift = uSkinLift.current;

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vLocalPos;
varying vec2 vPaintUv;
uniform sampler2D uPaintMap;
uniform float uBloom;
uniform float uSwell;
uniform float uTime;
float vhash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vnz(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n000=vhash(i), n100=vhash(i+vec3(1,0,0)), n010=vhash(i+vec3(0,1,0)), n110=vhash(i+vec3(1,1,0));
  float n001=vhash(i+vec3(0,0,1)), n101=vhash(i+vec3(1,0,1)), n011=vhash(i+vec3(0,1,1)), n111=vhash(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vLocalPos = position;
vPaintUv = uv;
// Swelling per endpoint (identified by painted hue): skin=swell, sens=very bumpy,
// eye=flat & wet, acute=flat. Plus procedural papule bumps and a gentle pulse.
vec3 _pt = texture2D(uPaintMap, uv).rgb;
float _pmax = max(max(_pt.r, _pt.g), _pt.b);
float _pv = _pmax * uBloom;
if (_pv > 0.02) {
  vec3 _hue = _pt / max(_pmax, 1e-4);
  float _sw = 1.0;                                                     // skin irritation
  if (_hue.b > 0.55 && _hue.g > 0.55 && _hue.r < 0.5) _sw = 0.25;      // eye: flat/wet
  else if (_hue.r > 0.5 && _hue.b > 0.5 && _hue.g < 0.55) _sw = 0.85;  // sensitization
  else if (_hue.r > 0.6 && _hue.g > 0.35 && _hue.b < 0.35) _sw = 0.35; // acute: flat
  float _pulse = 1.0 + 0.08 * sin(uTime * 4.0);
  // Band scale: low = NO swelling; higher bands swell more but capped.
  float _band = 0.0;                    // ต่ำ (score < 25) → ไม่บวม
  if (_pv >= 0.87) _band = 0.85;        // รุนแรง
  else if (_pv >= 0.63) _band = 0.60;   // สูง
  else if (_pv >= 0.36) _band = 0.40;   // กลาง
  // Smooth the profile (smoothstep) + uniform push along the normal → rounded
  // dome with soft edges instead of faceted ridges.
  float _s = _pv * _pv * (3.0 - 2.0 * _pv);
  float _rise = _s * uSwell * _sw * _pulse * _band;
  transformed += objectNormal * _rise;
}`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vLocalPos;
varying vec2 vPaintUv;
uniform sampler2D uPaintMap;
uniform float uBloom;
uniform float uTime;
uniform float uSkinLift;
float _paintH(vec2 uv){ vec3 c = texture2D(uPaintMap, uv).rgb; return max(max(c.r, c.g), c.b); }
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n000=hash13(i+vec3(0,0,0)); float n100=hash13(i+vec3(1,0,0));
  float n010=hash13(i+vec3(0,1,0)); float n110=hash13(i+vec3(1,1,0));
  float n001=hash13(i+vec3(0,0,1)); float n101=hash13(i+vec3(1,0,1));
  float n011=hash13(i+vec3(0,1,1)); float n111=hash13(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<3;i++){s+=a*vnoise(p);p*=2.02;a*=0.5;} return s; }`
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
// Skin brightening (frontend look) — lift base albedo toward white on skin only.
diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.55 + 0.10, vec3(1.0)), uSkinLift);
vec3  pTex  = texture2D(uPaintMap, vPaintUv).rgb;      // endpoint hue * intensity
float pMax  = max(max(pTex.r, pTex.g), pTex.b);        // intensity (brightest channel)
float gMask = clamp(pMax * uBloom, 0.0, 1.0);          // reveal with bloom
float gRough = 0.0;
vec3  gNeon  = vec3(0.0);
if (gMask > 0.02) {
  vec3 hue = pTex / max(pMax, 1e-4);
  int eff = 0;                                                        // skin irritation (red)
  if (hue.b > 0.55 && hue.g > 0.55 && hue.r < 0.5) eff = 1;           // eye (cyan)
  else if (hue.r > 0.5 && hue.b > 0.5 && hue.g < 0.55) eff = 2;       // sensitization (purple)
  else if (hue.r > 0.6 && hue.g > 0.35 && hue.b < 0.35) eff = 3;      // acute (orange)

  // Severity for color — compressed at the high end (low scores stay the same),
  // so a high score isn't overwhelmingly red. The grid (below) still uses gMask.
  float sev = gMask * (1.0 - 0.4 * gMask);
  vec3 c = diffuseColor.rgb;
  if (eff == 0) {
    // Skin irritation: red erythema
    c = mix(c, vec3(0.95, 0.16, 0.18), sev * 0.75);
    gRough = sev * 0.10;
  } else if (eff == 1) {
    // Eye irritation: glossy pink / wet
    c = mix(c, vec3(1.0, 0.45, 0.5), sev * 0.6);
    c += vec3(0.14) * sev;
    gRough = -0.35 * sev;
  } else if (eff == 2) {
    // Sensitization: mottled allergic wheals
    float blotch = smoothstep(0.4, 0.8, fbm(vLocalPos * 40.0));
    c = mix(c, vec3(0.85, 0.22, 0.55), sev * (0.4 + 0.55 * blotch));
    gRough = sev * 0.25;
  } else {
    // Acute toxicity: pale / desaturated
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, mix(vec3(lum), vec3(0.34, 0.32, 0.29), 0.5), sev * 0.7);
    gRough = sev * 0.35;
  }

  // Locator grid + endpoint-colored glow that breathes over time (interaction)
  float breathe = 0.82 + 0.24 * sin(uTime * 3.0);
  vec2 guv = vPaintUv * 60.0;
  vec2 gf  = abs(fract(guv) - 0.5);
  float grid = 1.0 - smoothstep(0.0, 0.05, min(gf.x, gf.y)); // thin, fine lines
  vec3 gridCol = mix(hue, vec3(1.0), 0.4);       // slight whiten
  // "present" = wherever painted (any score) → the grid stays BRIGHT as a
  // location marker, while the redness/swelling above track the actual score.
  float present = smoothstep(0.02, 0.12, gMask);
  c += gridCol * grid * present * 1.6 * breathe; // bright location grid
  c += hue * present * 0.10;                       // faint tint marking the patch
  diffuseColor.rgb = clamp(c, 0.0, 1.0);
  gNeon = (gridCol * grid * 1.1 + hue * 0.2) * present * breathe;
}`
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
totalEmissiveRadiance += gNeon;`
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + gRough, 0.0, 1.0);`
          )
          .replace(
            "#include <normal_fragment_begin>",
            `#include <normal_fragment_begin>
{
  // Shade the swelling as a smooth rounded dome by tilting the shading normal
  // along the paint-height gradient (sampled from the height texture, so it's
  // smooth across the whole patch — not just the edges). Independent of mesh res.
  float _e = 0.004;
  float _hx = _paintH(vPaintUv + vec2(_e, 0.0)) - _paintH(vPaintUv - vec2(_e, 0.0));
  float _hy = _paintH(vPaintUv + vec2(0.0, _e)) - _paintH(vPaintUv - vec2(0.0, _e));
  normal = normalize(normal - vec3(vec2(_hx, _hy) * uBloom * 16.0, 0.0));
}`
          );
      };
      mat.needsUpdate = true;
    });
  }, [scene, gl, paint]);

  // Expose a clear() to the parent overlay
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      clear: () => {
        stampsRef.current = [];
        paint.ctx.fillStyle = "#000000";
        paint.ctx.fillRect(0, 0, paint.canvas.width, paint.canvas.height);
        paint.tex.needsUpdate = true;
        hasPainted.current = false;
      },
    };
  }, [apiRef, paint]);

  // Bloom: once anything is painted, ease the reveal toward 1 (~0.8s) so the
  // erythema "develops" instead of snapping on.
  const STAMP_DURATION = 0.7; // seconds for a click to fully "develop"

  // Redraw one stamp at intensity fraction k (0..1) into the paint canvas.
  const drawStamp = (
    s: { cx: number; cy: number; r: number; R: number; G: number; B: number },
    k: number,
  ) => {
    const R = Math.round(s.R * k);
    const G = Math.round(s.G * k);
    const B = Math.round(s.B * k);
    const g = paint.ctx.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, s.r);
    // Smooth dome falloff (no flat plateau) → rounded swelling, soft edges.
    g.addColorStop(0.0, `rgba(${R},${G},${B},1)`);
    g.addColorStop(0.35, `rgba(${R},${G},${B},0.88)`);
    g.addColorStop(0.7, `rgba(${R},${G},${B},0.45)`);
    g.addColorStop(1.0, `rgba(${R},${G},${B},0)`);
    paint.ctx.globalCompositeOperation = "source-over";
    paint.ctx.fillStyle = g;
    paint.ctx.beginPath();
    paint.ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
    paint.ctx.fill();
  };

  useFrame(() => {
    uBloom.current.value = 1;
    uTime.current.value = performance.now() / 1000;
    const stamps = stampsRef.current;
    if (!stamps.length) return;
    const now = performance.now() / 1000;
    const still: typeof stamps = [];
    for (const s of stamps) {
      const p = Math.min(1, (now - s.t0) / STAMP_DURATION);
      const k = p * p * (3 - 2 * p); // smoothstep ease
      drawStamp(s, k);
      if (p < 1) still.push(s);
    }
    stampsRef.current = still;
    paint.tex.needsUpdate = true;
  });

  const paintAt = (uv: THREE.Vector2) => {
    const W = paint.canvas.width;
    const H = paint.canvas.height;
    const v = brushRef.current;
    const [cr, cg, cb] = colorRef.current;
    // Map the toolbar's 10–100 slider onto a 0.010–0.030 × W stamp radius.
    const mappedPct = 10 + ((brushSizeRef.current - 10) * 20) / 90;
    const r = (mappedPct / 1000) * W;
    // Register a stamp at full target value/color; the frame loop grows it 0→full
    // so the swelling/redness develops gradually after the click.
    stampsRef.current.push({
      cx: uv.x * W,
      cy: uv.y * H, // flipY=false + raw uv → no inversion
      r,
      R: Math.round(cr * v * 255),
      G: Math.round(cg * v * 255),
      B: Math.round(cb * v * 255),
      t0: performance.now() / 1000,
    });
    if (!hasPainted.current) {
      hasPainted.current = true;
      onPaintStart?.();
    }
  };

  // Erase the WHOLE painted blob under the click: flood-fill the connected
  // painted pixels from the clicked point and clear them all at once.
  const eraseWholeAt = (uv: THREE.Vector2) => {
    const W = paint.canvas.width;
    const H = paint.canvas.height;
    const sx = Math.max(0, Math.min(W - 1, Math.floor(uv.x * W)));
    const sy = Math.max(0, Math.min(H - 1, Math.floor(uv.y * H)));
    const img = paint.ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const TH = 12; // painted if any channel > TH
    const painted = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      return Math.max(d[i], d[i + 1], d[i + 2]) > TH;
    };
    if (!painted(sx, sy)) return; // clicked empty skin → nothing to erase
    const seen = new Uint8Array(W * H);
    const stack: number[] = [sy * W + sx];
    seen[sy * W + sx] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W;
      const y = (p / W) | 0;
      const i = p * 4;
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; // clear pixel
      if (x + 1 < W && !seen[p + 1] && painted(x + 1, y)) { seen[p + 1] = 1; stack.push(p + 1); }
      if (x - 1 >= 0 && !seen[p - 1] && painted(x - 1, y)) { seen[p - 1] = 1; stack.push(p - 1); }
      if (y + 1 < H && !seen[p + W] && painted(x, y + 1)) { seen[p + W] = 1; stack.push(p + W); }
      if (y - 1 >= 0 && !seen[p - W] && painted(x, y - 1)) { seen[p - W] = 1; stack.push(p - W); }
    }
    paint.ctx.putImageData(img, 0, 0);
    paint.tex.needsUpdate = true;
    // Drop stamps inside the cleared blob or right next to the click.
    const rr = 0.08 * W;
    stampsRef.current = stampsRef.current.filter((s) => {
      const px = Math.max(0, Math.min(W - 1, Math.round(s.cx)));
      const py = Math.max(0, Math.min(H - 1, Math.round(s.cy)));
      return !seen[py * W + px] && Math.hypot(s.cx - sx, s.cy - sy) > rr;
    });
  };

  // Read back the painted intensity (red channel 0..255) at a UV — used to tell
  // whether the pointer is hovering over an already-painted spot.
  const sampleAt = (uv: THREE.Vector2) => {
    const W = paint.canvas.width;
    const H = paint.canvas.height;
    const x = Math.max(0, Math.min(W - 1, Math.floor(uv.x * W)));
    const y = Math.max(0, Math.min(H - 1, Math.floor(uv.y * H)));
    const d = paint.ctx.getImageData(x, y, 1, 1).data;
    return Math.max(d[0], d[1], d[2]);
  };

  // Map a world-space hit point on the skin to a named facial part.
  // Uses world-up (Y) for height — robust to the model's rotation — and anchors
  // the bands to the real eye line (from the eyeball mesh's bounding box). Bands
  // are expressed as fractions of the eye→crown distance (≈ half a head).
  const regionAt = (world: THREE.Vector3): string => {
    const m = skinMesh.current;
    const bb = bbRef.current;
    if (!m || !bb) return "";
    if (calibRef.current == null) {
      const sbb = new THREE.Box3().setFromObject(m);
      let eyeY = sbb.min.y + (sbb.max.y - sbb.min.y) * 0.62; // fallback
      if (eyeMeshRef.current) {
        eyeY = new THREE.Box3().setFromObject(eyeMeshRef.current).getCenter(new THREE.Vector3()).y;
      }
      calibRef.current = { minY: sbb.min.y, maxY: sbb.max.y, eyeY };
    }
    const { minY, maxY, eyeY } = calibRef.current;
    const H = Math.max(1e-4, maxY - minY);
    const hy = (world.y - minY) / H; // 0 = bottom, 1 = crown (world up)
    const E = (eyeY - minY) / H;
    const fu = Math.max(1e-4, 1 - E); // eye→crown ≈ half-head unit
    const t = (hy - E) / fu; // height relative to eye line, in half-head units
    const p = m.worldToLocal(world.clone());
    const nx = (p.x - bb.min.x) / Math.max(1e-4, bb.max.x - bb.min.x);
    const side = Math.abs(nx - 0.5);
    if (side > 0.3 && Math.abs(t) < 0.6) return "หู";
    if (t > 0.8) return "หนังศีรษะ";
    if (t > 0.25) return "หน้าผาก";
    if (t >= -0.2) return "ตา / คิ้ว";
    if (t >= -0.55) return side < 0.09 ? "จมูก" : "แก้ม";
    if (t >= -0.8) return "ปาก / ริมฝีปาก";
    if (t >= -1.15) return "คาง";
    if (t >= -2.2) return "คอ";
    return "ไหล่ / หน้าอก";
  };

  // Set the brush (value + color) from the dominant relevant endpoint at a point.
  // Returns false if no relevant endpoint applies there (nothing to paint).
  const setBrushForRegion = (world: THREE.Vector3): boolean => {
    const region = regionAt(world);
    const keys = regionEndpoints(region);
    const cands = layersRef.current.filter((L) => keys.includes(L.key));
    if (!cands.length) return false;
    const top = cands.reduce((a, b) => (b.score > a.score ? b : a));
    // Same substance, different part → scale intensity by local skin sensitivity.
    brushRef.current = Math.min(1, gain(top.score / 100) * regionSensitivity(region));
    colorRef.current = hex01(top.color);
    return true;
  };

  const isSkin = (o: THREE.Object3D) => o === skinMesh.current;

  // Pause OrbitControls while painting (it listens on the DOM, so R3F's
  // stopPropagation can't block it) — otherwise a paint drag also rotates.
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

  // End a stroke even if the pointer is released off the mesh.
  useEffect(() => {
    window.addEventListener("pointerup", stopPaint);
    return () => window.removeEventListener("pointerup", stopPaint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group ref={group}>
      <primitive
        object={scene}
        onPointerOver={() => onOverModel?.(true)}
        onPointerDown={(e: any) => {
          if (!isSkin(e.object)) return;
          if (eraseRef.current) {
            e.stopPropagation();
            if (e.uv) eraseWholeAt(e.uv); // one click removes the whole painted blob
            return;
          }
          if (!armed) return;
          if (!setBrushForRegion(e.point)) return;
          e.stopPropagation();
          painting.current = true;
          setControls(false);
          if (e.uv) paintAt(e.uv);
        }}
        onPointerMove={(e: any) => {
          if (!isSkin(e.object)) return;
          if (painting.current) {
            if (!armed) return;
            if (!setBrushForRegion(e.point)) return;
            e.stopPropagation();
            if (e.uv) paintAt(e.uv);
            return;
          }
          // Report hover on ANY skin point → tooltip shows that part's results
          if (onHover && e.uv) {
            onHover({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, region: regionAt(e.point) });
          }
        }}
        onPointerOut={() => {
          onHover?.(null);
          onOverModel?.(false);
        }}
        onPointerUp={stopPaint}
      />
    </group>
  );
}

/**
 * Interactive paint canvas — the assessment result arms a brush; the user drags
 * on the skin and the redness blooms where painted. Self-contained wrapper.
 */
// Two-way bridge between the toolbar's zoom slider and OrbitControls: pushes
// slider changes onto the camera, and reports orbit/wheel zoom back as a
// percentage. `lastPctRef` guards both directions against feedback loops.
function ZoomController({ zoomPct, onZoomChange }: { zoomPct: number, onZoomChange?: (pct: number) => void }) {
  const { camera, controls } = useThree();
  const MIN_DIST = 0.5;
  const MAX_DIST = 2.5;

  const pctToDist = (pct: number) => MAX_DIST - (pct / 100) * (MAX_DIST - MIN_DIST);
  const distToPct = (dist: number) => Math.max(0, Math.min(100, Math.round(((MAX_DIST - dist) / (MAX_DIST - MIN_DIST)) * 100)));

  const lastPctRef = useRef(zoomPct);

  useEffect(() => {
    if (zoomPct !== lastPctRef.current) {
      lastPctRef.current = zoomPct;
      if (controls) {
        const ctrl = controls as any;
        const dir = camera.position.clone().sub(ctrl.target).normalize();
        const newPos = ctrl.target.clone().add(dir.multiplyScalar(pctToDist(zoomPct)));
        camera.position.copy(newPos);
        ctrl.update();
      }
    }
  }, [zoomPct, camera, controls]);

  useEffect(() => {
    if (!controls || !onZoomChange) return;
    const ctrl = controls as any;
    const onChange = () => {
      const dist = camera.position.distanceTo(ctrl.target);
      const newPct = distToPct(dist);
      if (newPct !== lastPctRef.current) {
        lastPctRef.current = newPct;
        onZoomChange(newPct);
      }
    };
    ctrl.addEventListener("change", onChange);
    return () => ctrl.removeEventListener("change", onChange);
  }, [controls, camera, onZoomChange]);

  useEffect(() => {
    if (controls) {
      const ctrl = controls as any;
      const dist = camera.position.distanceTo(ctrl.target);
      const currentPct = distToPct(dist);
      if (currentPct !== zoomPct) {
        const dir = camera.position.clone().sub(ctrl.target).normalize();
        const newPos = ctrl.target.clone().add(dir.multiplyScalar(pctToDist(zoomPct)));
        camera.position.copy(newPos);
        ctrl.update();
      }
    }
  }, []); // eslint-disable-line

  return null;
}

export function FacePaintCanvas({
  layers = [],
  armed = true,
  background = "#2A2320",
  productName = "สูตรที่ประเมิน",
  eraseMode = false,
  zoomPct = 50,
  brushSizePct = 50,
  onZoomChange,
  brushValue,
  clearTrigger,
}: {
  layers?: PaintLayer[];
  armed?: boolean;
  background?: string;
  productName?: string;
  eraseMode?: boolean;
  zoomPct?: number; // driven by the toolbar slider (0–100)
  brushSizePct?: number; // driven by the toolbar slider (10–100)
  onZoomChange?: (pct: number) => void; // reports orbit-driven zoom back to the toolbar
  /**
   * Single 0–1 intensity for callers that have no per-endpoint breakdown yet
   * (the project workspace still runs on mock scores). Ignored once `layers` is
   * non-empty — that is the real, region-aware input.
   */
  brushValue?: number;
  /** Clear the painted skin whenever this number changes (toolbar clear button). */
  clearTrigger?: number;
}) {
  const apiRef = useRef<PaintApi | null>(null);
  const [painted, setPainted] = useState(false);
  const [zoomOn, setZoomOn] = useState(false); // wheel-zoom only while hovering the model

  // Fall back to a flat brush when the caller only has one number: give skin and
  // eye the same score so every region still paints, in the endpoint colours the
  // shader expects.
  const effectiveLayers = useMemo(() => {
    if (layers.length || brushValue == null) return layers;
    const score = Math.max(0, Math.min(1, brushValue)) * 100;
    return [
      { key: "skin", label: "ระคายผิว", score, color: EP_COLOR.skin, band: "" },
      { key: "eye", label: "ระคายตา", score, color: EP_COLOR.eye, band: "" },
    ];
  }, [layers, brushValue]);

  // Toolbar-driven clear. Skip the mount pass so the canvas isn't wiped on load.
  const lastClear = useRef(clearTrigger);
  useEffect(() => {
    if (clearTrigger === lastClear.current) return;
    lastClear.current = clearTrigger;
    apiRef.current?.clear();
    setPainted(false);
  }, [clearTrigger]);

  // Hover-hold tooltip: show a small info box after the pointer rests ~2s on a
  // painted spot. Restart the timer only when the pointer moves far enough.
  const [tip, setTip] = useState<{ x: number; y: number; region: string } | null>(null);
  const hoverPos = useRef<{ x: number; y: number; region: string } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHover = (info: { x: number; y: number; region: string } | null) => {
    if (!info) {
      hoverPos.current = null;
      if (tipTimer.current) {
        clearTimeout(tipTimer.current);
        tipTimer.current = null;
      }
      setTip(null);
      return;
    }
    const prev = hoverPos.current;
    hoverPos.current = info;
    const movedFar = !prev || Math.hypot(prev.x - info.x, prev.y - info.y) > 12;
    if (movedFar) {
      if (tipTimer.current) clearTimeout(tipTimer.current);
      setTip(null);
      tipTimer.current = setTimeout(() => {
        if (hoverPos.current) setTip({ ...hoverPos.current });
      }, 2000);
    }
  };
  useEffect(() => () => { if (tipTimer.current) clearTimeout(tipTimer.current); }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden ${armed ? "cursor-crosshair" : ""}`}>
      <Canvas
        camera={{ fov: 70, position: [90, 30, 390] }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <color attach="background" args={[background]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 3, 4]} intensity={2.2} color="#fff5ec" />
        <directionalLight position={[-4, 1, -2]} intensity={0.5} color="#bcd3ff" />
        <directionalLight position={[0, 2, -5]} intensity={0.6} color="#ffffff" />
        <Suspense fallback={null}>
          <PaintFaceModel
            layers={effectiveLayers}
            armed={armed}
            eraseMode={eraseMode}
            apiRef={apiRef}
            onPaintStart={() => setPainted(true)}
            onHover={handleHover}
            onOverModel={setZoomOn}
            brushSizePct={brushSizePct}
          />
        </Suspense>
        <ZoomController zoomPct={zoomPct} onZoomChange={onZoomChange} />
        {/* Orbit + zoom toward the cursor (zoom only while the pointer is over the model, no pan) */}
        <OrbitControls
          makeDefault
          enableRotate
          enableZoom={zoomOn}
          zoomSpeed={0.9}
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
          minDistance={0.5}
          maxDistance={2.5}
        />
      </Canvas>

      {/* Hint + clear */}
      {armed && !painted && effectiveLayers.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-brand/40 bg-white/85 px-4 py-1.5 text-xs font-medium text-brand-dark shadow-card backdrop-blur">
          🖌️ คลิกบนส่วนของโมเดล — ผิวจะแสดง ระคายผิว/แพ้/พิษ · ตาจะแสดงระคายตา
        </div>
      )}
      <button
        onClick={() => {
          apiRef.current?.clear();
          setPainted(false);
        }}
        className="absolute bottom-3 right-3 rounded-lg border border-slate-200 bg-white/85 px-3 py-1.5 text-xs text-slate-700 shadow-card backdrop-blur hover:border-brand hover:text-brand"
      >
        ล้างรอย
      </button>

      {/* Hover-hold tooltip: product name + all endpoint results */}
      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-52 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-slate-800 shadow-lg backdrop-blur"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <div className="truncate text-xs font-semibold">🧴 {productName}</div>
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-brand-dark">
            <span>📍 ตำแหน่ง:</span>
            <span className="font-semibold">{tip.region || "—"}</span>
          </div>
          <div className="space-y-1">
            {effectiveLayers
              .filter((L) => regionEndpoints(tip.region).includes(L.key))
              .map((L) => {
                // Score adjusted by the sensitivity of THIS part → differs by location.
                const adj = Math.min(100, Math.round(L.score * regionSensitivity(tip.region)));
                const band = adj < 25 ? "low" : adj < 50 ? "moderate" : adj < 75 ? "high" : "severe";
                return (
                  <div key={L.key} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="size-2 rounded-full" style={{ background: L.color }} />
                      {L.label}
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: TIP_BAND_HEX[band] }}>
                      {adj}
                    </span>
                  </div>
                );
              })}
            {!effectiveLayers.length && <div className="text-[11px] text-slate-400">ยังไม่มีผล</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const ZONES: { id: SkinZone; label: string }[] = [
  { id: "all", label: "ทั้งหน้า" },
  { id: "forehead", label: "หน้าผาก" },
  { id: "cheek", label: "แก้ม" },
];

/**
 * Standalone viewer with built-in controls (themed to RalphGuard).
 * `intensity` / `zone` seed the initial state; leave unset for a manual demo.
 */
export default function FaceIrritationModel({
  intensity: seedIntensity = 0,
  zone: seedZone = "all",
}: {
  intensity?: number;
  zone?: SkinZone;
}) {
  const [intensity, setIntensity] = useState(seedIntensity);
  const [zone, setZone] = useState<SkinZone>(seedZone);

  return (
    <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg border border-border bg-[#141414]">
      <FaceIrritationCanvas intensity={intensity} zone={zone} />

      {/* Control panel */}
      <div className="absolute bottom-4 left-4 w-[min(340px,calc(100%-2rem))] rounded-xl border border-white/10 bg-black/60 p-4 text-gray-100 backdrop-blur-md">
        <div className="mb-3 text-xs text-gray-300">จำลองการระคายเคืองผิว</div>

        <div className="mb-4 flex gap-2">
          {ZONES.map((z) => {
            const active = zone === z.id;
            return (
              <button
                key={z.id}
                onClick={() => setZone(z.id)}
                className={`flex-1 rounded-lg border py-2 text-sm transition ${
                  active
                    ? "border-brand bg-brand/20 text-brand-soft"
                    : "border-white/15 text-gray-300 hover:border-white/30"
                }`}
              >
                {z.label}
              </button>
            );
          })}
        </div>

        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-gray-300">ความรุนแรง</span>
          <span className="font-mono tabular-nums text-brand">
            {Math.round(intensity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(intensity * 100)}
          onChange={(e) => setIntensity(Number(e.target.value) / 100)}
          className="w-full cursor-pointer accent-brand"
          aria-label="ความรุนแรงการระคายเคือง"
        />
      </div>
    </div>
  );
}

useGLTF.preload("/models/head.glb");
