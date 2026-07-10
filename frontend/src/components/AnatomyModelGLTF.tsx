"use client";

/**
 * AnatomyModelGLTF — realistic human model with auto-fit + clickable region hotspots.
 *
 * Loads a real human GLB and AUTO-FITS it (centers + scales to a target height)
 * so ANY humanoid model renders at the right size/position regardless of its
 * native scale/orientation. Hotspots are derived from the fitted bounding box.
 *
 * Model source (in priority):
 *   1. NEXT_PUBLIC_HUMAN_MODEL_URL  (env — e.g. a Ready Player Me .glb URL)
 *   2. /human.glb                   (local file in frontend/public)
 *   3. DEFAULT_HUMAN_URL            (a real human served from a public CDN)
 * If none load, falls back to the procedural model so the app never breaks.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

import AnatomyModel, { Region } from "./AnatomyModel";

// a recognizable, rigged human model served with CORS from a public CDN (demo)
const DEFAULT_HUMAN_URL =
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Soldier.glb";

function pickModelUrl(): string {
  const env =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_HUMAN_MODEL_URL : undefined;
  return env || DEFAULT_HUMAN_URL;
}

const TARGET_H = 3; // fitted model height in world units

const BAND_COLOR: Record<string, string> = {
  low: "#16A34A",
  moderate: "#E08A00",
  high: "#F97316",
  severe: "#DC2626",
};
const ENDPOINT_SHORT_TH: Record<string, string> = { skin: "ผิว", eye: "ตา", sens: "แพ้", acute: "พิษ" };
const REGION_LABEL_TH: Record<Region, string> = {
  forearm: "ท่อนแขน", hand: "มือ", face: "ใบหน้า", eye: "ดวงตา",
};

type Fit = {
  scale: number;
  pos: [number, number, number];
  H: number;
  W: number;
  D: number;
  hotspots: { region: Region; pos: [number, number, number]; label: string }[];
};

function computeFit(scene: THREE.Object3D): Fit {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  // scale by HEIGHT (Y) so the human is TARGET_H tall regardless of arm span/pose
  const scale = TARGET_H / (size.y || 1);
  // place feet on the ground (y=0), centered on x/z
  const pos: [number, number, number] = [
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale,
  ];
  const H = size.y * scale;
  const W = size.x * scale;
  const D = size.z * scale;
  // hotspots proportional to the fitted human (assumes facing +Z, standing)
  const hotspots: Fit["hotspots"] = [
    { region: "face", pos: [0, H * 0.9, D * 0.45], label: "ใบหน้า" },
    { region: "eye", pos: [W * 0.08, H * 0.93, D * 0.5], label: "ดวงตา" },
    { region: "forearm", pos: [W * 0.42, H * 0.5, W * 0.1], label: "ท่อนแขน" },
    { region: "hand", pos: [W * 0.46, H * 0.36, W * 0.1], label: "มือ" },
  ];
  return { scale, pos, H, W, D, hotspots };
}

function Hotspot({
  region, pos, selected, onSelect, bandColor, pulse = false,
}: {
  region: Region;
  pos: [number, number, number];
  selected: boolean;
  onSelect: (r: Region) => void;
  bandColor?: string;
  pulse?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const color = selected ? bandColor ?? "#E8551C" : hovered ? "#FBA66B" : "#E8551C";
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.emissiveIntensity = pulse
      ? 0.6 + 0.5 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4))
      : selected ? 0.8 : 0.35;
  });
  return (
    <mesh
      position={pos}
      scale={selected ? 1.5 : hovered ? 1.25 : 1}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(region); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
    >
      <sphereGeometry args={[0.11, 20, 20]} />
      <meshStandardMaterial ref={matRef} color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.9} />
    </mesh>
  );
}

function Scene({
  url, value, onChange, band, scores,
}: {
  url: string;
  value: Region;
  onChange: (r: Region) => void;
  band?: string;
  scores?: Record<string, number>;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => computeFit(cloned), [cloned]);
  const selectedHot = fit.hotspots.find((h) => h.region === value);
  const pulsing = band === "high" || band === "severe";

  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#e6d6c8", 0.6]} />
      <directionalLight position={[4, 7, 5]} intensity={1.2} />
      <directionalLight position={[-4, 3, 2]} intensity={0.4} />
      <primitive object={cloned} scale={fit.scale} position={fit.pos} />

      {fit.hotspots.map((h) => (
        <Hotspot
          key={h.region}
          region={h.region}
          pos={h.pos}
          selected={value === h.region}
          onSelect={onChange}
          bandColor={band ? BAND_COLOR[band] : undefined}
          pulse={value === h.region && pulsing}
        />
      ))}

      {scores && selectedHot && (
        <Html position={selectedHot.pos} center distanceFactor={6} zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-black/10 bg-white/90 px-2 py-1 text-[10px] text-gray-800 shadow">
            <div className="mb-0.5 font-semibold" style={{ color: band ? BAND_COLOR[band] : "#111" }}>
              {REGION_LABEL_TH[value]}{band ? ` · ${band}` : ""}
            </div>
            <div className="flex gap-1.5 font-mono">
              {(["skin", "eye", "sens", "acute"] as const).map((ep) =>
                scores[ep] != null ? <span key={ep}>{ENDPOINT_SHORT_TH[ep]} {Math.round(scores[ep])}</span> : null,
              )}
            </div>
          </div>
        </Html>
      )}

      <OrbitControls
        target={[0, TARGET_H * 0.5, 0]}
        enablePan={false}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 1.8}
        minDistance={2.6}
        maxDistance={8}
      />
    </>
  );
}

export default function AnatomyModelGLTF({
  value, onChange, band, scores,
}: {
  value: Region;
  onChange: (r: Region) => void;
  band?: string;
  scores?: Record<string, number>;
}) {
  const url = pickModelUrl();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch(url, { method: "HEAD" })
      .then((r) => active && setOk(r.ok))
      .catch(() => active && setOk(false));
    return () => { active = false; };
  }, [url]);

  if (ok === false) return <AnatomyModel value={value} onChange={onChange} band={band} scores={scores} />;
  if (ok === null)
    return (
      <div className="w-full h-72 rounded-lg bg-elevated border border-border grid place-items-center text-xs text-ink2/55">
        กำลังโหลดหุ่น 3 มิติ…
      </div>
    );

  return (
    <div className="w-full h-72 rounded-lg overflow-hidden bg-gradient-to-b from-[#fff4ec] to-[#f4ece4] border border-border relative">
      <Canvas camera={{ position: [0, TARGET_H * 0.55, TARGET_H * 1.6], fov: 42 }} dpr={[1, 2]}>
        <Suspense fallback={null}>
          <Scene url={url} value={value} onChange={onChange} band={band} scores={scores} />
        </Suspense>
      </Canvas>
      {band && (
        <div className="absolute bottom-2 left-2 flex gap-2 text-[10px]">
          {Object.entries(BAND_COLOR).map(([b, c]) => (
            <span key={b} className="flex items-center gap-1 text-ink2/60">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
