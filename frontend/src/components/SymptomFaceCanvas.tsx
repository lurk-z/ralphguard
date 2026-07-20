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
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  PaintSymptomModel,
  type PaintApi,
  type PaintFormulaGroup,
  type PaintHoverInfo,
  type SkinKey,
  mapAssessmentEndpointsToSymptoms,
} from "./SymptomLabModel";

type PaintLayer = { key: string; label: string; score: number; color: string; band: string };
export type FormulaPaintGroupInput = {
  id: string;
  name: string;
  color: string;
  layers: PaintLayer[];
  waiting?: boolean;
};

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

function ZoomController({
  zoomPct,
  onZoomChange,
}: {
  zoomPct: number;
  onZoomChange?: (pct: number) => void;
}) {
  const { camera, controls } = useThree();
  const minDistance = 0.5;
  const maxDistance = 2.5;
  const toDistance = (pct: number) =>
    maxDistance - (Math.max(0, Math.min(100, pct)) / 100) * (maxDistance - minDistance);
  const toPercent = (distance: number) =>
    Math.max(
      0,
      Math.min(100, Math.round(((maxDistance - distance) / (maxDistance - minDistance)) * 100)),
    );
  const lastPct = useRef(zoomPct);

  useEffect(() => {
    if (!controls || zoomPct === lastPct.current) return;
    lastPct.current = zoomPct;
    const orbit = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    };
    const direction = camera.position.clone().sub(orbit.target).normalize();
    camera.position.copy(orbit.target.clone().add(direction.multiplyScalar(toDistance(zoomPct))));
    orbit.update();
  }, [camera, controls, zoomPct]);

  useEffect(() => {
    if (!controls || !onZoomChange) return;
    const orbit = controls as unknown as {
      target: THREE.Vector3;
      addEventListener: (event: string, listener: () => void) => void;
      removeEventListener: (event: string, listener: () => void) => void;
    };
    const handleChange = () => {
      const nextPct = toPercent(camera.position.distanceTo(orbit.target));
      if (nextPct === lastPct.current) return;
      lastPct.current = nextPct;
      onZoomChange(nextPct);
    };
    orbit.addEventListener("change", handleChange);
    return () => orbit.removeEventListener("change", handleChange);
  }, [camera, controls, onZoomChange]);

  return null;
}

export function SymptomFaceCanvas({
  layers = [],
  armed = true,
  background = "#F4F1EE",
  productName = "สูตรที่ประเมิน",
  eraseMode = false,
  zoomPct = 50,
  brushSizePct = 50,
  clearTrigger,
  onZoomChange,
  waitingForResult = false,
  day = 3,
  onPaintStateChange,
  formulaGroups,
  activeGroupId,
  clearGroupRequest,
  clearAllTrigger,
  onPaintGroupStateChange,
  onPaintGroupChange,
  onPaintGroupRegion,
  onPaintBlocked,
}: {
  layers?: PaintLayer[];
  armed?: boolean;
  background?: string;
  productName?: string;
  eraseMode?: boolean;
  zoomPct?: number;
  brushSizePct?: number;
  clearTrigger?: number;
  onZoomChange?: (pct: number) => void;
  /** The backend job is active; preserve cream masks and suppress reveal. */
  waitingForResult?: boolean;
  /** Selected backend timecourse day. Changing it never clears paint masks. */
  day?: 1 | 3 | 7;
  /** Reports whether the user has applied formula to the model. */
  onPaintStateChange?: (hasPaint: boolean) => void;
  formulaGroups?: FormulaPaintGroupInput[];
  activeGroupId?: string | null;
  clearGroupRequest?: { groupId: string; token: number } | null;
  clearAllTrigger?: number;
  onPaintGroupStateChange?: (groupId: string, hasPaint: boolean) => void;
  /** Reports a successful new stroke so an older assessment is not reused. */
  onPaintGroupChange?: (groupId: string) => void;
  onPaintGroupRegion?: (groupId: string, region: string) => void;
  onPaintBlocked?: (ownerGroupIds: string[]) => void;
  /** Kept for drop-in compatibility; endpoint layers drive the symptoms. */
  brushValue?: number;
}) {
  const scoreOf = (k: string) => (layers.find((l) => l.key === k)?.score ?? 0) / 100;
  const skin = scoreOf("skin");
  const eye = scoreOf("eye");
  const sens = scoreOf("sens");
  const acute = scoreOf("acute");
  const multiGroupMode = Array.isArray(formulaGroups);
  const mappedGroups = useMemo<PaintFormulaGroup[]>(
    () => (formulaGroups ?? []).map((group) => {
      const score = (key: string) => (group.layers.find((layer) => layer.key === key)?.score ?? 0) / 100;
      const mapped = mapAssessmentEndpointsToSymptoms({
        skin: score("skin"),
        eye: score("eye"),
        sens: score("sens"),
        acute: score("acute"),
      });
      return {
        id: group.id,
        name: group.name,
        color: group.color,
        sev: mapped.sev,
        eyeRed: mapped.eyeRed,
        resultReady: group.layers.length > 0,
        waiting: group.waiting,
      };
    }),
    [formulaGroups],
  );
  const assessmentReady = multiGroupMode
    ? mappedGroups.some((group) => group.resultReady)
    : layers.length > 0;
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
  const [zoomOn, setZoomOn] = useState(false);
  const [visualPhase, setVisualPhase] = useState<
    "cream" | "waiting" | "revealing" | "revealed"
  >(assessmentReady ? "revealing" : "cream");
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tip, setTip] = useState<PaintHoverInfo | null>(null);
  const hoverPos = useRef<PaintHoverInfo | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHover = (info: PaintHoverInfo | null) => {
    if (!info || (!assessmentReady && !multiGroupMode)) {
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
      previous.symptoms.join(",") !== info.symptoms.join(",") ||
      (previous.groupIds ?? []).join(",") !== (info.groupIds ?? []).join(",");
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
      if (phaseTimer.current) clearTimeout(phaseTimer.current);
    },
    [],
  );
  // A formula arms the white cream brush. Symptoms stay hidden until real
  // assessment layers arrive, then every area already painted is revealed.
  useEffect(() => {
    if (multiGroupMode) return;
    if (!assessmentReady || waitingForResult) return;

    // The GLB and its shader can take longer than the wrapper to mount. A
    // one-shot timer can fire while apiRef is still null, leaving every later
    // paint stroke stuck as white cream. Retry briefly until the renderer has
    // exposed its API, then enable reveal exactly once for this score set.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const runWhenReady = () => {
      if (cancelled) return;
      if (apiRef.current) {
        apiRef.current.run();
        setVisualPhase("revealing");
        if (phaseTimer.current) clearTimeout(phaseTimer.current);
        phaseTimer.current = setTimeout(() => {
          setVisualPhase("revealed");
          phaseTimer.current = null;
        }, 1600);
        return;
      }
      attempts += 1;
      if (attempts < 80) timer = setTimeout(runWhenReady, 100);
    };
    timer = setTimeout(runWhenReady, 80);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (phaseTimer.current) {
        clearTimeout(phaseTimer.current);
        phaseTimer.current = null;
      }
    };
  }, [assessmentReady, waitingForResult, skin, eye, sens, acute, multiGroupMode]);

  useEffect(() => {
    if (multiGroupMode) return;
    if (!waitingForResult) {
      if (!assessmentReady) setVisualPhase("cream");
      return;
    }

    // apiRef may still be loading on a first visit. The masks default to cream,
    // so a missing ref is already the desired waiting state. When it exists,
    // prepare() hides an older result without clearing the user's paint.
    apiRef.current?.prepare();
    setVisualPhase("waiting");
    setTip(null);
  }, [assessmentReady, waitingForResult, multiGroupMode]);

  const lastClear = useRef(clearTrigger);
  useEffect(() => {
    if (multiGroupMode) return;
    if (clearTrigger === lastClear.current) return;
    lastClear.current = clearTrigger;
    apiRef.current?.clear();
    setVisualPhase("cream");
    setTip(null);
  }, [clearTrigger, multiGroupMode]);

  const lastGroupClearToken = useRef(clearGroupRequest?.token);
  useEffect(() => {
    if (!multiGroupMode || !clearGroupRequest) return;
    if (lastGroupClearToken.current === clearGroupRequest.token) return;
    lastGroupClearToken.current = clearGroupRequest.token;
    apiRef.current?.clearGroup(clearGroupRequest.groupId);
    setTip(null);
  }, [clearGroupRequest, multiGroupMode]);

  const lastClearAll = useRef(clearAllTrigger);
  useEffect(() => {
    if (!multiGroupMode || clearAllTrigger === lastClearAll.current) return;
    lastClearAll.current = clearAllTrigger;
    apiRef.current?.clearAllGroups();
    setTip(null);
  }, [clearAllTrigger, multiGroupMode]);

  const hoveredFormulaGroups = (tip?.groupIds ?? [])
    .map((groupId) => formulaGroups?.find((group) => group.id === groupId))
    .filter((group): group is FormulaPaintGroupInput => Boolean(group));
  const hoveredLayers = hoveredFormulaGroups[0]?.layers ?? layers;
  const hoveredSymptoms = tip?.symptoms ?? visibleSymptoms;

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
            activeSymptom={dominant}
            paintSymptoms={ASSESSMENT_PAINT_SYMPTOMS}
            sev={sev}
            brushSizePct={brushSizePct}
            eyeLeft={eyeRed}
            eyeRight={eyeRed}
            eraseMode={eraseMode}
            apiRef={apiRef}
            onHover={handleHover}
            paintEnabled={armed && !waitingForResult}
            eyeRevealControlled
            onOverModel={setZoomOn}
            onPaintStateChange={onPaintStateChange}
            paintGroupId={activeGroupId}
            paintGroups={formulaGroups ? mappedGroups : undefined}
            onPaintGroupStateChange={onPaintGroupStateChange}
            onPaintGroupChange={onPaintGroupChange}
            onPaintGroupRegion={onPaintGroupRegion}
            onPaintBlocked={onPaintBlocked}
          />
        </Suspense>
        <ZoomController zoomPct={zoomPct} onZoomChange={onZoomChange} />
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


      {tip && (assessmentReady || multiGroupMode) && !waitingForResult && (
        <div
          className="pointer-events-none absolute z-20 w-56 rounded-xl border border-teal-200/80 bg-white/95 p-3 text-slate-800 shadow-xl backdrop-blur"
          style={{
            left: `min(calc(100% - 14rem - 8px), ${tip.x + 14}px)`,
            top: `min(calc(100% - 11rem), ${tip.y + 14}px)`,
          }}
        >
          <div className="space-y-1">
            {(hoveredFormulaGroups.length
              ? hoveredFormulaGroups
              : [{ id: "legacy", name: productName, color: "#009FA5", layers }]
            ).map((group) => (
              <div key={group.id} className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: group.color }} />
                <span className="truncate">{group.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-teal-700">
            <span>ตำแหน่ง:</span>
            <span className="font-semibold">{tip.region}</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {hoveredSymptoms.length
              ? `อาการ Day ${day}: ${hoveredSymptoms.map((key) => SYMPTOM_LABEL[key]).join(", ")}`
              : "ยังไม่แสดงอาการในช่วงเวลานี้"}
          </div>
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {hoveredLayers
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
            {!hoveredLayers.some((layer) => regionEndpoints(tip.region).includes(layer.key)) && (
              <div className="text-[11px] text-slate-400">ยังไม่มีผลประเมินสำหรับบริเวณนี้</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SymptomFaceCanvas;
