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
 * Asset: frontend/public/head.glb (Draco-compressed; drei fetches the decoder).
 */
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type SkinZone = "all" | "forehead" | "cheek";
const ZONE_ID: Record<SkinZone, number> = { all: 0, forehead: 1, cheek: 2 };

type IrritationUniforms = {
  uIntensity: { value: number };
  uZone: { value: number };
  uBBMin: { value: THREE.Vector3 };
  uBBMax: { value: THREE.Vector3 };
};

function FaceModel({ intensity, zone }: { intensity: number; zone: SkinZone }) {
  const { scene: rawScene } = useGLTF("/head.glb", true); // true = enable Draco decoder
  const gl = useThree((s) => s.gl);

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
varying vec3 vObjN;`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vLocalPos = position;
vObjN = normal;`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vLocalPos;
varying vec3 vObjN;
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
float _front = smoothstep(0.0, 0.4, -vObjN.z);
vec3 _nrm = (vLocalPos - uBBMin) / max(uBBMax - uBBMin, vec3(1e-4));
float _fore  = smoothstep(0.80, 0.86, _nrm.y);
float _cy    = smoothstep(0.48, 0.56, _nrm.y) * (1.0 - smoothstep(0.70, 0.78, _nrm.y));
float _cx    = smoothstep(0.14, 0.26, abs(_nrm.x - 0.5));
float _cheek = _cy * _cx;
float _all   = smoothstep(0.40, 0.48, _nrm.y);
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

  return <primitive object={scene} />;
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
        <Bounds fit clip observe margin={1.15}>
          <FaceModel intensity={intensity} zone={zone} />
        </Bounds>
      </Suspense>
      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.05} />
    </Canvas>
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

useGLTF.preload("/head.glb");
