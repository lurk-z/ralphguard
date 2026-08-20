"use client";

/**
 * SymptomFaceCanvas — results-driven wrapper around SymptomLabModel's rich
 * paint renderer (from the update-model commit). Instead of manual mark-then-run,
 * it maps the assessment's 5 endpoint scores onto the four skin symptoms and
 * develops them across the face automatically:
 *
 *   skin (ระคายเคืองผิว)  → redness + edema (+ peeling when severe)
 *   sens (แพ้ผิวหนัง)      → papule
 *   acute                 → whole-face pallor/clammy-skin systemic proxy
 *   eye  (ระคายเคืองตา)   → per-eye redness
 *   skin_dryness          → peeling / dry flakes
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
  region.includes("ตา") ? ["eye"] : ["skin", "sens", "acute", "skin_dryness"];

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

const compactRegionLabel = (region: string) => {
  if (region === "ปาก / ริมฝีปาก") return "ปาก";
  if (region === "ตา / คิ้ว") return "ตา";
  if (region.startsWith("หลังใบหู")) return "หลังหู";
  if (region.startsWith("หู")) return "หู";
  if (region === "หลังศีรษะ") return "หลังหัว";
  if (region === "หนังศีรษะ") return "ศีรษะ";
  return region;
};

export function SymptomFaceCanvas({
  paintOwnerKey,
  layers = [],
  armed = true,
  revealResults = false,
  background = "#F4F1EE",
  productName = "สูตรที่ประเมิน",
  eraseMode = false,
  brushSizePct = 50,
  clearPaintRequest = 0,
  initialPaint = null,
  onPaintChange,
  occupiedPaint = [],
  onPaintBlocked,
  paused = false,
}: {
  paintOwnerKey: string;
  layers?: PaintLayer[];
  armed?: boolean;
  revealResults?: boolean;
  background?: string;
  productName?: string;
  eraseMode?: boolean;
  brushSizePct?: number;
  clearPaintRequest?: number;
  initialPaint?: PaintMaskSnapshot | null;
  onPaintChange?: (snapshot: PaintMaskSnapshot) => void;
  occupiedPaint?: PaintMaskSnapshot[];
  onPaintBlocked?: () => void;
  paused?: boolean;
}) {
  const scoreOf = (k: string) => (layers.find((l) => l.key === k)?.score ?? 0) / 100;
  const skin = scoreOf("skin");
  const eye = scoreOf("eye");
  const sens = scoreOf("sens");
  const acute = scoreOf("acute");
  const skinDryness = scoreOf("skin_dryness");
  // Visual mapping is defined only in SymptomLabModel; this assessment wrapper
  // supplies the four endpoint scores without maintaining a second recipe.
  const { sev, eyeRed, acuteSystemic } = useMemo(
    () =>
      mapAssessmentEndpointsToSymptoms({
        skin,
        eye,
        sens,
        acute,
        skin_dryness: skinDryness,
      }),
    [skin, eye, sens, acute, skinDryness],
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
  const lastClearPaintRequestRef = useRef(clearPaintRequest);
  const [hasExposurePaint, setHasExposurePaint] = useState(initialPaint?.hasPaint === true);
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
  useEffect(() => {
    if (clearPaintRequest === lastClearPaintRequestRef.current) return;
    lastClearPaintRequestRef.current = clearPaintRequest;
    apiRef.current?.clear();
  }, [clearPaintRequest]);
  useEffect(() => {
    setHasExposurePaint(initialPaint?.hasPaint === true);
  }, [paintOwnerKey, initialPaint?.hasPaint]);

  const handlePaintChange = (snapshot: PaintMaskSnapshot) => {
    setHasExposurePaint(snapshot.hasPaint === true);
    onPaintChange?.(snapshot);
  };
  // Painting is armed as soon as the formula is scientifically ready. Before
  // assessment the endpoint severities are zero, so only the white exposure
  // layer appears; completed results reveal symptoms over the same masks.
  useEffect(() => {
    const t = setTimeout(() => {
      if (revealResults) apiRef.current?.run();
      else apiRef.current?.conceal();
    }, 80);
    return () => clearTimeout(t);
  }, [revealResults, skin, eye, sens, acute]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ fov: 35, position: [0, 0, 2] }}
        dpr={[1, 1.5]}
        frameloop={paused ? "never" : "always"}
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
            paintEnabled={armed}
            activeSymptom={dominant}
            paintSymptoms={ASSESSMENT_PAINT_SYMPTOMS}
            sev={sev}
            brushSizePct={brushSizePct}
            eyeLeft={hasExposurePaint ? eyeRed : 0}
            eyeRight={hasExposurePaint ? eyeRed : 0}
            acuteSystemic={hasExposurePaint ? acuteSystemic : 0}
            eraseMode={eraseMode}
            apiRef={apiRef}
            onHover={handleHover}
            initialPaint={initialPaint}
            onPaintChange={handlePaintChange}
            occupiedPaint={occupiedPaint}
            onPaintBlocked={onPaintBlocked}
            cameraDistanceScale={1.28}
            sharedExposureMask
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
      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-60 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 text-slate-800 shadow-lg backdrop-blur"
          style={{
            left: `min(calc(100% - 15rem - 8px), ${tip.x + 14}px)`,
            top: `min(calc(100% - 11.5rem - 8px), ${tip.y + 14}px)`,
          }}
        >
          <div className="p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-brand">
                <SemanticIcon name="flask" className="size-4" />
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-semibold text-slate-800">{productName}</span>
                <span
                  className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
                  aria-label={`บริเวณ ${tip.region}`}
                >
                  {compactRegionLabel(tip.region)}
                </span>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-slate-500">
              <span
                className={`size-1.5 shrink-0 rounded-full ${visibleSymptoms.length || acuteSystemic > 0.001 ? "bg-emerald-500" : "bg-slate-300"}`}
              />
              <span>
                {visibleSymptoms.length || acuteSystemic > 0.001
                  ? `${visibleSymptoms.length + (acuteSystemic > 0.001 ? 1 : 0)} อาการกำลังแสดงตามช่วงเวลา`
                  : "ยังไม่แสดงอาการในช่วงเวลานี้"}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[9px] font-medium text-slate-400">
              <span>ผลประเมินบริเวณนี้</span>
              <span>คะแนน</span>
            </div>
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
                  <div key={layer.key} className="flex min-h-6 items-center justify-between gap-2 border-t border-slate-100 first:border-t-0 text-[10px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: layer.color }} />
                      <span className="truncate">{layer.label}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums" style={{ color: BAND_COLOR[band] }}>
                      {score}<span className="ml-0.5 text-[8px] font-normal text-slate-400">/100</span>
                    </span>
                  </div>
                );
              })}
            {!layers.some((layer) => regionEndpoints(tip.region).includes(layer.key)) && (
              <div className="rounded-lg bg-white px-2 py-2 text-[10px] text-slate-400">ยังไม่มีผลประเมินสำหรับบริเวณนี้</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SymptomFaceCanvas;
