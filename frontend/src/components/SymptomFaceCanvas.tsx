"use client";

/**
 * SymptomFaceCanvas — results-driven wrapper around SymptomLabModel's rich
 * paint renderer (from the update-model commit). Instead of manual mark-then-run,
 * it maps the assessment's 4 endpoint scores onto the four skin symptoms and
 * develops them across the face automatically:
 *
 *   skin (ระคายเคืองผิว)  → redness  (+ peeling when severe)
 *   sens (แพ้ผิวหนัง)      → papule
 *   acute/severe          → edema (swelling)
 *   eye  (ระคายเคืองตา)   → per-eye redness
 *
 * Drop-in replacement for FacePaintCanvas (same props) so the assess viewport
 * can use the richer rendering.
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PaintSymptomModel, type PaintApi, type SkinKey } from "./SymptomLabModel";

type PaintLayer = { key: string; label: string; score: number; color: string; band: string };

export function SymptomFaceCanvas({
  layers = [],
  armed = true,
  background = "#F4F1EE",
  eraseMode = false,
}: {
  layers?: PaintLayer[];
  armed?: boolean;
  background?: string;
  productName?: string; // accepted for API compatibility (unused)
  eraseMode?: boolean;
}) {
  const scoreOf = (k: string) => (layers.find((l) => l.key === k)?.score ?? 0) / 100;
  const skin = scoreOf("skin");
  const eye = scoreOf("eye");
  const sens = scoreOf("sens");
  const acute = scoreOf("acute");

  const sev: Record<SkinKey, number> = useMemo(
    () => ({
      redness: skin,
      papule: sens,
      peeling: Math.max(0, (skin - 0.55) / 0.45), // desquamation only when severe
      edema: Math.max(0, (Math.max(skin, acute) - 0.5) / 0.5), // swelling only when high
    }),
    [skin, sens, acute],
  );
  const eyeRed = eye;

  const dominant: SkinKey = useMemo(() => {
    const entries: [SkinKey, number][] = [
      ["redness", sev.redness],
      ["papule", sev.papule],
      ["edema", sev.edema],
      ["peeling", sev.peeling],
    ];
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [sev]);

  const apiRef = useRef<PaintApi | null>(null);
  // When armed (assessment done) just ENABLE reveal — nothing shows until the
  // user paints; painted spots then develop the mapped symptom immediately.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => apiRef.current?.run(), 80);
    return () => clearTimeout(t);
  }, [armed, skin, eye, sens, acute]);

  return (
    <div className={`relative h-full w-full ${armed ? "cursor-crosshair" : ""}`}>
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
          <PaintSymptomModel
            activeSymptom={dominant}
            sev={sev}
            brushSizePct={50}
            eyeLeft={eyeRed}
            eyeRight={eyeRed}
            eraseMode={eraseMode}
            apiRef={apiRef}
          />
        </Suspense>
        {/* Left-right orbit only (locked polar) to keep the face front-on. */}
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.05}
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
}

export default SymptomFaceCanvas;
