"use client";

/**
 * AnatomyModel — anatomical "mannequin" built procedurally (no asset).
 *
 * Segmented like an anatomy map (head/torso/arms/forearms/hands/hips/thighs/
 * knees/calves/feet), each a separate smooth mesh. The clickable regions
 * (face/eye/forearm/hand) recolor their surface by risk band (and Day 1/3/7).
 */
import { Suspense, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type Region = "forearm" | "hand" | "face" | "eye";

// anatomy-map palette (soft, like the reference)
const C = {
  head: "#A6C3A2",
  torso: "#B3A2D4",
  abs: "#C7A2C2",
  delt: "#CDB98C",
  uarm: "#CDB98C",
  forearm: "#9FB7D8",
  hand: "#9FCBA1",
  pelvis: "#AFC791",
  thigh: "#CFBB8E",
  knee: "#ADA2D2",
  calf: "#90C5BF",
  foot: "#DBB0A4",
  eye: "#ffffff",
};
const HOVER = "#F6B98A";
const BRAND = "#E8551C";
const BAND_COLOR: Record<string, string> = {
  low: "#16A34A", moderate: "#E08A00", high: "#F97316", severe: "#DC2626",
};
const ENDPOINT_SHORT_TH: Record<string, string> = { skin: "ผิว", eye: "ตา", sens: "แพ้", acute: "พิษ" };
const REGION_LABEL_TH: Record<Region, string> = { forearm: "ท่อนแขน", hand: "มือ", face: "ใบหน้า", eye: "ดวงตา" };
const LABEL_POS: Record<Region, [number, number, number]> = {
  face: [0, 3.05, 0.4], eye: [0.12, 3.08, 0.45], forearm: [0.92, 1.4, 0.4], hand: [0.98, 1.0, 0.4],
};

type Shape = "sphere" | "capsule" | "box";
function Geo({ shape, args }: { shape: Shape; args: [number, number, number] }) {
  if (shape === "sphere") return <sphereGeometry args={[args[0], 40, 40]} />;
  if (shape === "box") return <boxGeometry args={args} />;
  return <capsuleGeometry args={[args[0], args[1], 18, 36]} />;
}

function Part({
  position, args, shape = "capsule", rotation, scale, tone,
}: {
  position: [number, number, number];
  args: [number, number, number];
  shape?: Shape;
  rotation?: [number, number, number];
  scale?: [number, number, number];
  tone: string;
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow receiveShadow>
      <Geo shape={shape} args={args} />
      <meshStandardMaterial color={tone} roughness={0.78} metalness={0.0} />
    </mesh>
  );
}

function Clickable({
  region, base, selected, hovered, onSelect, onHover, selectedColor, pulse,
  position, args, shape = "capsule", rotation, scale,
}: {
  region: Region; base: string;
  selected: Region; hovered: Region | null;
  onSelect: (r: Region) => void; onHover: (r: Region | null) => void;
  selectedColor?: string; pulse?: boolean;
  position: [number, number, number]; args: [number, number, number];
  shape?: Shape; rotation?: [number, number, number]; scale?: [number, number, number];
}) {
  const isSel = region === selected;
  const isHov = region === hovered;
  const color = isSel ? selectedColor ?? BRAND : isHov ? HOVER : base;
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.emissiveIntensity =
      isSel && pulse ? 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)) : isSel ? 0.25 : 0;
  });
  return (
    <mesh
      position={position} rotation={rotation} scale={scale} castShadow receiveShadow
      onPointerDown={(e) => { e.stopPropagation(); onSelect(region); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(region); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = "auto"; }}
    >
      <Geo shape={shape} args={args} />
      <meshStandardMaterial ref={matRef} color={color} emissive={isSel ? color : "#000"} roughness={0.7} metalness={0.0} />
    </mesh>
  );
}

function Body({
  selected, onSelect, band, scores,
}: {
  selected: Region; onSelect: (r: Region) => void; band?: string; scores?: Record<string, number>;
}) {
  const [hovered, setHovered] = useState<Region | null>(null);
  const selColor = band ? BAND_COLOR[band] : undefined;
  const pulse = band === "high" || band === "severe";
  const ck = { selected, hovered, onSelect, onHover: setHovered, selectedColor: selColor, pulse };

  return (
    <group position={[0, 0, 0]}>
      {/* Head + neck + face/eyes */}
      <Part tone={C.head} position={[0, 2.82, 0]} args={[0.22, 0, 0]} shape="sphere" scale={[1, 1.18, 1.05]} />
      <Part tone={C.head} position={[0, 2.54, 0]} args={[0.09, 0.12, 0]} />
      <Clickable {...ck} region="face" base={C.head} position={[0, 2.8, 0.12]} args={[0.155, 0, 0]} shape="sphere" />
      <Clickable {...ck} region="eye" base={C.eye} position={[0.085, 2.88, 0.19]} args={[0.05, 0, 0]} shape="sphere" />
      <Part tone={C.eye} position={[-0.085, 2.88, 0.19]} args={[0.05, 0, 0]} shape="sphere" />

      {/* Torso: chest -> abs -> pelvis */}
      <Part tone={C.torso} position={[0, 2.16, 0]} args={[0.29, 0.28, 0]} scale={[1.12, 1, 0.82]} />
      <Part tone={C.abs} position={[0, 1.78, 0]} args={[0.23, 0.34, 0]} scale={[1, 1, 0.8]} />
      <Part tone={C.pelvis} position={[0, 1.42, 0]} args={[0.25, 0.18, 0]} scale={[1.05, 1, 0.85]} />
      {/* deltoids */}
      <Part tone={C.delt} position={[-0.37, 2.3, 0]} args={[0.16, 0, 0]} shape="sphere" />
      <Part tone={C.delt} position={[0.37, 2.3, 0]} args={[0.16, 0, 0]} shape="sphere" />

      {/* Arms (down & slightly out) */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Part tone={C.torso} position={[s * 0.48, 2.0, 0]} args={[0.115, 0.4, 0]} rotation={[0, 0, s * 0.2]} />
          <Part tone={C.abs} position={[s * 0.62, 1.72, 0]} args={[0.115, 0, 0]} shape="sphere" />
          <Clickable {...ck} region="forearm" base={C.forearm} position={[s * 0.72, 1.38, 0]} args={[0.1, 0.4, 0]} rotation={[0, 0, s * 0.1]} />
          <Clickable {...ck} region="hand" base={C.hand} position={[s * 0.8, 1.04, 0]} args={[0.12, 0.14, 0]} scale={[1, 1, 0.55]} />
        </group>
      ))}

      {/* Legs */}
      {[-0.17, 0.17].map((x, i) => (
        <group key={i}>
          <Part tone={C.thigh} position={[x, 1.02, 0]} args={[0.17, 0.5, 0]} />
          <Part tone={C.knee} position={[x, 0.7, 0.01]} args={[0.145, 0, 0]} shape="sphere" />
          <Part tone={C.calf} position={[x, 0.38, 0]} args={[0.135, 0.44, 0]} scale={[1.05, 1, 1.05]} />
          <Part tone={C.foot} position={[x, 0.06, 0.11]} args={[0.12, 0.09, 0.32]} shape="box" />
        </group>
      ))}

      {scores && (
        <Html position={LABEL_POS[selected]} center distanceFactor={7} zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-black/10 bg-white/95 px-2 py-1 text-[10px] text-gray-800 shadow">
            <div className="mb-0.5 font-semibold" style={{ color: selColor ?? "#E8551C" }}>
              {REGION_LABEL_TH[selected]}{band ? ` · ${band}` : ""}
            </div>
            <div className="flex gap-1.5 font-mono">
              {(["skin", "eye", "sens", "acute"] as const).map((ep) =>
                scores[ep] != null ? <span key={ep}>{ENDPOINT_SHORT_TH[ep]} {Math.round(scores[ep])}</span> : null,
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default function AnatomyModel({
  value, onChange, band, scores,
}: {
  value: Region; onChange: (r: Region) => void; band?: string; scores?: Record<string, number>;
}) {
  return (
    <div className="w-full h-72 rounded-lg overflow-hidden bg-gradient-to-b from-[#fffaf4] to-[#f1e9e0] border border-border">
      <Canvas shadows camera={{ position: [0, 1.9, 4.7], fov: 36 }} dpr={[1, 2]}>
        <ambientLight intensity={0.7} />
        <hemisphereLight args={["#ffffff", "#e8d8c8", 0.5]} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 3, 2]} intensity={0.35} />
        <directionalLight position={[0, 3, -4]} intensity={0.45} color="#ffd9b3" />
        <Suspense fallback={null}>
          <Body selected={value} onSelect={onChange} band={band} scores={scores} />
          <ContactShadows position={[0, 0, 0]} opacity={0.34} scale={5} blur={2.5} far={4} color="#7a5a3a" />
        </Suspense>
        <OrbitControls
          target={[0, 1.5, 0]} enablePan={false}
          minPolarAngle={Math.PI / 3.4} maxPolarAngle={Math.PI / 1.85}
          minDistance={3} maxDistance={7}
        />
      </Canvas>
    </div>
  );
}
