"use client";

/**
 * SymptomFaceCanvas — results-driven wrapper around SymptomLabModel's rich
 * paint renderer (from the update-model commit). Instead of manual mark-then-run,
 * it maps the assessment's 4 endpoint scores onto the four skin symptoms and
 * develops them across the face automatically:
 *
 *   skin (ระคายเคืองผิว)  → redness + edema (+ peeling when severe)
 *   sens (แพ้ผิวหนัง)      → papule
 *   acute/severe          → reinforces edema (swelling)
 *   eye  (ระคายเคืองตา)   → per-eye redness
 *
 * Drop-in replacement for FacePaintCanvas (same props) so the assess viewport
 * can use the richer rendering.
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SemanticIcon } from "@/components/SemanticIcon";
import type { PaintMaskSnapshot } from "@/lib/project-workspace";
import {
  PaintSymptomModel,
  type PaintApi,
  type PaintHoverInfo,
  type SkinKey,
  mapAssessmentEndpointsToSymptoms,
} from "./SymptomLabModel";

type PaintLayer = { key: string; label: string; score: number; color: string; band: string };

// A painted spot represents one formula-exposure area, not the symptoms that
// happen to be visible on the currently selected day. Keep every skin mask so
// a reaction that develops later in the timecourse can appear without asking
// the user to paint the same area again.
const ASSESSMENT_PAINT_SYMPTOMS: SkinKey[] = ["redness", "papule", "peeling", "edema"];

const BAND_COLOR: Record<string, string> = {
  low: "#16A34A",
  moderate: "#E08A00",
  high: "#DC2626",
  severe: "#B91C1C",
};

const SYMPTOM_LABEL: Record<SkinKey, string> = {
  redness: "ผิวแดง",
  papule: "ตุ่ม / ผื่นแพ้",
  peeling: "ผิวลอก",
  edema: "ผิวบวม",
};

const regionEndpoints = (region: string) =>
  region.includes("ตา") ? ["eye"] : ["skin", "sens", "acute"];

const regionSensitivity = (region: string) => {
  if (region.includes("ตา")) return 1.3;
  if (region.includes("ปาก")) return 1.2;
  if (region.includes("จมูก")) return 1.1;
  if (region.includes("หน้าผาก")) return 0.9;
  if (region.includes("คาง")) return 0.85;
  if (region.includes("หู")) return 0.7;
  if (region.includes("คอ")) return 0.6;
  if (region.includes("หนังศีรษะ")) return 0.55;
  return 1;
};

export function SymptomFaceCanvas({
  paintOwnerKey,
  layers = [],
  armed = true,
  background = "#F4F1EE",
  productName = "สูตรที่ประเมิน",
  eraseMode = false,
  initialPaint = null,
  onPaintChange,
  occupiedPaint = [],
  onPaintBlocked,
}: {
  paintOwnerKey: string;
  layers?: PaintLayer[];
  armed?: boolean;
  background?: string;
  productName?: string;
  eraseMode?: boolean;
  initialPaint?: PaintMaskSnapshot | null;
  onPaintChange?: (snapshot: PaintMaskSnapshot) => void;
  occupiedPaint?: PaintMaskSnapshot[];
  onPaintBlocked?: () => void;
}) {
  const scoreOf = (k: string) => (layers.find((l) => l.key === k)?.score ?? 0) / 100;
  const skin = scoreOf("skin");
  const eye = scoreOf("eye");
  const sens = scoreOf("sens");
  const acute = scoreOf("acute");
  // Visual mapping is defined only in SymptomLabModel; this assessment wrapper
  // supplies the four endpoint scores without maintaining a second recipe.
  const { sev, eyeRed } = useMemo(
    () => mapAssessmentEndpointsToSymptoms({ skin, eye, sens, acute }),
    [skin, eye, sens, acute],
  );

  const dominant: SkinKey = useMemo(() => {
    const entries: [SkinKey, number][] = [
      ["redness", sev.redness],
      ["papule", sev.papule],
      ["edema", sev.edema],
      ["peeling", sev.peeling],
    ];
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }, [sev]);

  // Only use this list for hover copy. Masks include every symptom so moving
  // Day 1 -> Day 3 -> Day 7 can reveal newly developed reactions over the
  // original painted area.
  const visibleSymptoms = useMemo(() => {
    return (Object.entries(sev) as [SkinKey, number][])
      .filter(([, value]) => value > 0.001)
      .map(([key]) => key);
  }, [sev]);

  const apiRef = useRef<PaintApi | null>(null);
  const [tip, setTip] = useState<PaintHoverInfo | null>(null);
  const hoverPos = useRef<PaintHoverInfo | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHover = (info: PaintHoverInfo | null) => {
    if (!info || !armed) {
      hoverPos.current = null;
      if (tipTimer.current) clearTimeout(tipTimer.current);
      tipTimer.current = null;
      setTip(null);
      return;
    }

    const previous = hoverPos.current;
    hoverPos.current = info;
    const moved = !previous || Math.hypot(previous.x - info.x, previous.y - info.y) > 10;
    const changed =
      !previous ||
      previous.region !== info.region ||
      previous.symptoms.join(",") !== info.symptoms.join(",");
    if (moved || changed) {
      if (tipTimer.current) clearTimeout(tipTimer.current);
      setTip(null);
      tipTimer.current = setTimeout(() => {
        if (hoverPos.current) setTip({ ...hoverPos.current });
      }, 450);
    }
  };

  useEffect(
    () => () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    },
    [],
  );
  // When armed (assessment done) just ENABLE reveal — nothing shows until the
  // user paints; painted spots then develop the mapped symptom immediately.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => apiRef.current?.run(), 80);
    return () => clearTimeout(t);
  }, [armed, skin, eye, sens, acute]);

  return (
    <div className="relative h-full w-full">
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
            paintOwnerKey={paintOwnerKey}
            activeSymptom={dominant}
            paintSymptoms={ASSESSMENT_PAINT_SYMPTOMS}
            sev={sev}
            brushSizePct={50}
            eyeLeft={eyeRed}
            eyeRight={eyeRed}
            eraseMode={eraseMode}
            apiRef={apiRef}
            onHover={handleHover}
            initialPaint={initialPaint}
            onPaintChange={onPaintChange}
            occupiedPaint={occupiedPaint}
            onPaintBlocked={onPaintBlocked}
            cameraDistanceScale={1.15}
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
      {armed && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold tracking-wide text-slate-700">
          ▦ ลากบนผิวเพื่อวาง Grid Scan
        </div>
      )}

      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-56 rounded-xl border border-teal-200/80 bg-white/95 p-3 text-slate-800 shadow-xl backdrop-blur"
          style={{
            left: `min(calc(100% - 14rem - 8px), ${tip.x + 14}px)`,
            top: `min(calc(100% - 11rem), ${tip.y + 14}px)`,
          }}
        >
          <div className="flex items-center gap-1 truncate text-xs font-semibold"><SemanticIcon name="spray" className="size-3.5 shrink-0" /> {productName}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-teal-700">
            <span>ตำแหน่ง:</span>
            <span className="font-semibold">{tip.region}</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {visibleSymptoms.length
              ? `อาการที่แสดงตามเวลานี้: ${visibleSymptoms.map((key) => SYMPTOM_LABEL[key]).join(", ")}`
              : "ยังไม่แสดงอาการในช่วงเวลานี้"}
          </div>
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {layers
              .filter((layer) => regionEndpoints(tip.region).includes(layer.key))
              .map((layer) => {
                const score = Math.min(
                  100,
                  Math.round(layer.score * regionSensitivity(tip.region)),
                );
                const band =
                  score < 25 ? "low" : score < 50 ? "moderate" : score < 75 ? "high" : "severe";
                return (
                  <div key={layer.key} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: layer.color }} />
                      <span className="truncate">{layer.label}</span>
                    </span>
                    <span className="font-mono font-semibold tabular-nums" style={{ color: BAND_COLOR[band] }}>
                      {score}
                    </span>
                  </div>
                );
              })}
            {!layers.some((layer) => regionEndpoints(tip.region).includes(layer.key)) && (
              <div className="text-[11px] text-slate-400">ยังไม่มีผลประเมินสำหรับบริเวณนี้</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SymptomFaceCanvas;
