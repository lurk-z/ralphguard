"use client";

/**
 * AnatomyModel — interactive 3D body for picking the test region.
 *
 * Built from primitive geometries (no external GLTF asset needed) so it works
 * offline and keeps the bundle small. Each clickable mesh maps to one of the
 * four regions the QSAR pipeline applies region-sensitivity factors to.
 */
import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";

export type Region = "forearm" | "hand" | "face" | "eye";

const ENDPOINT_SHORT_TH: Record<string, string> = { skin: "ผิว", eye: "ตา", sens: "แพ้", acute: "พิษ" };
// label anchor positions per region (local to the Body group)
const LABEL_POS: Record<Region, [number, number, number]> = {
  face: [0, 2.62, 0.5],
  eye: [0.13, 2.7, 0.55],
  forearm: [0.8, 0.95, 0.35],
  hand: [0.86, 0.5, 0.35],
};

const BRAND = "#2DD4BF";
const SKIN = "#9FB6B5";
const SKIN_HOVER = "#C4D6D5";

const BAND_COLOR: Record<string, string> = {
  low: "#34D399",
  moderate: "#FBBF24",
  high: "#FB923C",
  severe: "#EF4444",
};

type PartProps = {
  region: Region;
  selected: Region;
  hovered: Region | null;
  onSelect: (r: Region) => void;
  onHover: (r: Region | null) => void;
  position: [number, number, number];
  args: [number, number, number];
  shape?: "sphere" | "box" | "capsule" | "cylinder";
  selectedColor?: string;
};

function color(region: Region, selected: Region, hovered: Region | null, selectedColor?: string) {
  if (region === selected) return selectedColor ?? BRAND;
  if (region === hovered) return SKIN_HOVER;
  return SKIN;
}

function ClickablePart({
  region,
  selected,
  hovered,
  onSelect,
  onHover,
  position,
  args,
  shape = "sphere",
  selectedColor,
}: PartProps) {
  const c = color(region, selected, hovered, selectedColor);
  const emissive = region === selected ? selectedColor ?? BRAND : "#000000";
  return (
    <mesh
      position={position}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(region);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(region);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "auto";
      }}
    >
      {shape === "sphere" && <sphereGeometry args={[args[0], 24, 24]} />}
      {shape === "box" && <boxGeometry args={args} />}
      {shape === "capsule" && <capsuleGeometry args={[args[0], args[1], 8, 16]} />}
      {shape === "cylinder" && <cylinderGeometry args={[args[0], args[1], args[2], 16]} />}
      <meshStandardMaterial color={c} emissive={emissive} emissiveIntensity={0.35} />
    </mesh>
  );
}

/** Non-interactive structural part (torso, legs, etc.) */
function StaticPart({
  position,
  args,
  shape = "capsule",
  rotation,
}: {
  position: [number, number, number];
  args: [number, number, number];
  shape?: "sphere" | "box" | "capsule" | "cylinder";
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation}>
      {shape === "sphere" && <sphereGeometry args={[args[0], 24, 24]} />}
      {shape === "box" && <boxGeometry args={args} />}
      {shape === "capsule" && <capsuleGeometry args={[args[0], args[1], 8, 16]} />}
      {shape === "cylinder" && <cylinderGeometry args={[args[0], args[1], args[2], 16]} />}
      <meshStandardMaterial color={SKIN} />
    </mesh>
  );
}

const REGION_LABEL_TH: Record<Region, string> = {
  forearm: "ท่อนแขน", hand: "มือ", face: "ใบหน้า", eye: "ดวงตา",
};

function Body({
  selected,
  onSelect,
  band,
  scores,
}: {
  selected: Region;
  onSelect: (r: Region) => void;
  band?: string;
  scores?: Record<string, number>;
}) {
  const [hovered, setHovered] = useState<Region | null>(null);
  const selectedColor = band ? BAND_COLOR[band] : undefined;
  const shared = { selected, hovered, onSelect, onHover: setHovered, selectedColor };

  return (
    <group position={[0, -0.2, 0]}>
      {/* Head */}
      <StaticPart position={[0, 2.55, 0]} args={[0.45, 0, 0]} shape="sphere" />
      {/* Face (front of head) */}
      <ClickablePart
        {...shared}
        region="face"
        position={[0, 2.5, 0.34]}
        args={[0.22, 0, 0]}
        shape="sphere"
      />
      {/* Eye */}
      <ClickablePart
        {...shared}
        region="eye"
        position={[0.13, 2.62, 0.42]}
        args={[0.07, 0, 0]}
        shape="sphere"
      />

      {/* Neck + torso */}
      <StaticPart position={[0, 2.1, 0]} args={[0.12, 0.2, 0]} shape="capsule" />
      <StaticPart position={[0, 1.35, 0]} args={[0.42, 0.95, 0]} shape="capsule" />

      {/* Left arm: upper (static) + forearm (clickable) + hand (clickable) */}
      <StaticPart
        position={[-0.62, 1.55, 0]}
        args={[0.13, 0.5, 0]}
        shape="capsule"
        rotation={[0, 0, 0.25]}
      />
      <ClickablePart
        {...shared}
        region="forearm"
        position={[-0.8, 0.95, 0]}
        args={[0.12, 0.5, 0]}
        shape="capsule"
      />
      <ClickablePart
        {...shared}
        region="hand"
        position={[-0.86, 0.5, 0]}
        args={[0.16, 0, 0]}
        shape="sphere"
      />

      {/* Right arm (mirror) */}
      <StaticPart
        position={[0.62, 1.55, 0]}
        args={[0.13, 0.5, 0]}
        shape="capsule"
        rotation={[0, 0, -0.25]}
      />
      <ClickablePart
        {...shared}
        region="forearm"
        position={[0.8, 0.95, 0]}
        args={[0.12, 0.5, 0]}
        shape="capsule"
      />
      <ClickablePart
        {...shared}
        region="hand"
        position={[0.86, 0.5, 0]}
        args={[0.16, 0, 0]}
        shape="sphere"
      />

      {/* Legs (static) */}
      <StaticPart position={[-0.22, 0.25, 0]} args={[0.15, 0.9, 0]} shape="capsule" />
      <StaticPart position={[0.22, 0.25, 0]} args={[0.15, 0.9, 0]} shape="capsule" />

      {/* floating value readout on the selected region (interactive result) */}
      {scores && (
        <Html position={LABEL_POS[selected]} center distanceFactor={7} zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/20 bg-black/70 px-2 py-1 text-[10px] text-white shadow-lg">
            <div className="mb-0.5 font-semibold" style={{ color: selectedColor ?? "#fff" }}>
              {REGION_LABEL_TH[selected]}{band ? ` · ${band}` : ""}
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
    </group>
  );
}

export default function AnatomyModel({
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
  return (
    <div className="w-full h-72 rounded-lg overflow-hidden bg-elevated border border-border">
      <Canvas camera={{ position: [0, 1.6, 4.2], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 4]} intensity={1.1} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <Suspense fallback={null}>
          <Body selected={value} onSelect={onChange} band={band} scores={scores} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.8}
          minDistance={3}
          maxDistance={6}
        />
      </Canvas>
    </div>
  );
}
