"use client";

/**
 * AnatomyModelGLTF — realistic human model (GLTF) with clickable region hotspots.
 *
 * Place a CC0/permissive human model at:  frontend/public/human.glb
 * (non-Draco-compressed .glb recommended). If the file is missing or fails to
 * load, this component automatically FALLS BACK to the procedural AnatomyModel
 * so the app never breaks.
 *
 * Region selection uses labelled hotspot markers (small glowing spheres) placed
 * over the body — clicking a marker selects that test region. Tune HOTSPOTS
 * positions to match your specific .glb (see notes below).
 */
import { Component, ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, Html, OrbitControls, useGLTF } from "@react-three/drei";
import type * as THREE from "three";

import AnatomyModel, { Region } from "./AnatomyModel";

const MODEL_URL = "/human.glb";

// Risk band -> color (for the optional result highlight on the selected region)
const BAND_COLOR: Record<string, string> = {
  low: "#34D399",
  moderate: "#FBBF24",
  high: "#FB923C",
  severe: "#EF4444",
};

// Hotspot positions assume the model is centered and scaled to ~3 units tall
// (origin at body center). Adjust X/Y/Z to line up with YOUR .glb.
const HOTSPOTS: { region: Region; pos: [number, number, number]; label: string }[] = [
  { region: "face", pos: [0.0, 1.25, 0.22], label: "ใบหน้า" },
  { region: "eye", pos: [0.08, 1.33, 0.25], label: "ดวงตา" },
  { region: "forearm", pos: [0.62, 0.15, 0.1], label: "ท่อนแขน" },
  { region: "hand", pos: [0.72, -0.35, 0.1], label: "มือ" },
];

function HumanGLB({ scale = 1.0 }: { scale?: number }) {
  const { scene } = useGLTF(MODEL_URL);
  return (
    <Center>
      <primitive object={scene} scale={scale} />
    </Center>
  );
}
// best-effort preload (ignored if the asset is absent)
try {
  // @ts-ignore
  useGLTF.preload(MODEL_URL);
} catch {
  /* no-op */
}

function Hotspot({
  region,
  pos,
  selected,
  onSelect,
  bandColor,
  pulse = false,
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
  const color = selected ? bandColor ?? "#2DD4BF" : hovered ? "#9DECE3" : "#2DD4BF";

  // pulse the emissive intensity when this region is selected AND high-risk
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    if (pulse) {
      matRef.current.emissiveIntensity = 0.6 + 0.5 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4));
    } else {
      matRef.current.emissiveIntensity = selected ? 0.8 : 0.35;
    }
  });

  return (
    <mesh
      position={pos}
      scale={selected ? 1.5 : hovered ? 1.25 : 1}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(region);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <sphereGeometry args={[0.09, 20, 20]} />
      <meshStandardMaterial
        ref={matRef}
        color={color}
        emissive={color}
        emissiveIntensity={selected ? 0.8 : 0.35}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

const ENDPOINT_SHORT_TH: Record<string, string> = {
  skin: "ผิว", eye: "ตา", sens: "แพ้", acute: "พิษ",
};

function Scene({
  value,
  onChange,
  band,
  scores,
}: {
  value: Region;
  onChange: (r: Region) => void;
  band?: string;
  scores?: Record<string, number>;
}) {
  const selectedHot = HOTSPOTS.find((h) => h.region === value);
  const pulsing = band === "high" || band === "severe";
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 6, 5]} intensity={1.2} />
      <directionalLight position={[-4, 2, -3]} intensity={0.4} />
      <Suspense fallback={null}>
        <HumanGLB />
      </Suspense>
      {HOTSPOTS.map((h) => (
        <Hotspot
          key={h.region + h.label}
          region={h.region}
          pos={h.pos}
          selected={value === h.region}
          onSelect={onChange}
          bandColor={band ? BAND_COLOR[band] : undefined}
          pulse={value === h.region && pulsing}
        />
      ))}

      {/* floating value label on the selected region (interactive result readout) */}
      {scores && selectedHot && (
        <Html position={selectedHot.pos} center distanceFactor={6} zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/20 bg-black/70 px-2 py-1 text-[10px] text-white shadow-lg">
            <div className="mb-0.5 font-semibold" style={{ color: band ? BAND_COLOR[band] : "#fff" }}>
              {selectedHot.label}{band ? ` · ${band}` : ""}
            </div>
            <div className="flex gap-1.5 font-mono">
              {(["skin", "eye", "sens", "acute"] as const).map((ep) =>
                scores[ep] != null ? (
                  <span key={ep}>
                    {ENDPOINT_SHORT_TH[ep]} {Math.round(scores[ep])}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </Html>
      )}

      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.8}
        minDistance={2.5}
        maxDistance={7}
      />
    </>
  );
}

/** Error boundary: if the .glb fails to load, fall back to the procedural model. */
class GLBErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function AnatomyModelGLTF({
  value,
  onChange,
  band,
  scores,
}: {
  value: Region;
  onChange: (r: Region) => void;
  band?: string; // optional risk band of the selected region (low|moderate|high|severe)
  scores?: Record<string, number>; // per-endpoint peak scores for the value readout
}) {
  // Probe for the model file first — R3F errors don't reliably reach an outer
  // error boundary, so we decide before mounting the Canvas.
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch(MODEL_URL, { method: "HEAD" })
      .then((r) => active && setHasModel(r.ok))
      .catch(() => active && setHasModel(false));
    return () => {
      active = false;
    };
  }, []);

  if (hasModel === false) {
    // no .glb provided -> use the procedural model
    return <AnatomyModel value={value} onChange={onChange} band={band} scores={scores} />;
  }
  if (hasModel === null) {
    return (
      <div className="w-full h-72 rounded-lg bg-elevated border border-border grid place-items-center text-xs text-gray-500">
        กำลังตรวจโมเดล 3 มิติ…
      </div>
    );
  }

  return (
    <div className="w-full h-72 rounded-lg overflow-hidden bg-elevated border border-border relative">
      <GLBErrorBoundary fallback={<AnatomyModel value={value} onChange={onChange} band={band} scores={scores} />}>
        <Canvas camera={{ position: [0, 1.0, 4.5], fov: 45 }}>
          <Scene value={value} onChange={onChange} band={band} scores={scores} />
        </Canvas>
      </GLBErrorBoundary>
      {band && (
        <div className="absolute bottom-2 left-2 flex gap-2 text-[10px] print:hidden">
          {Object.entries(BAND_COLOR).map(([b, c]) => (
            <span key={b} className="flex items-center gap-1 text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
