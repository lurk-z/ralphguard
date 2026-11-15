"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { createApplicationMask, createApplicationMaterial, createApplicationUniforms, setApplicationStyle, type ApplicationMode, type ApplicationStyle } from "./material";

export type ApplicationPaintState = { hasPaint: boolean; canUndo: boolean };
export type ApplicationApi = {
  clear: () => void;
  undo: () => void;
  sample: () => void;
  front: () => void;
};

export type SkinApplicationCanvasProps = {
  style: ApplicationStyle;
  mode: ApplicationMode;
  brushSize: number;
  amount: number;
  visible: boolean;
  scanEnabled: boolean;
  onReady: (api: ApplicationApi | null) => void;
  onChange: (state: ApplicationPaintState) => void;
};

function ApplicationHead({ style, mode, brushSize, amount, visible, scanEnabled, onReady, onChange }: SkinApplicationCanvasProps) {
  const { scene: original } = useGLTF("/models/head.glb", true);
  const { invalidate, camera } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const painting = useRef(false);
  const previous = useRef<THREE.Vector2 | null>(null);
  const history = useRef<ImageData[]>([]);
  const hasPaint = useRef(false);

  const resources = useMemo(() => {
    const mask = createApplicationMask();
    const uniforms = createApplicationUniforms(mask.texture);
    const scene = original.clone(true);
    const ownedMaterials: THREE.Material[] = [];
    let skin: THREE.Mesh | null = null;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const source = mesh.material as THREE.MeshStandardMaterial;
      if (source.name !== "Material.001") return;
      mesh.material = createApplicationMaterial(source, uniforms);
      ownedMaterials.push(mesh.material);
      skin = mesh;
    });
    if (!skin) throw new Error("ไม่พบพื้นผิวที่ใช้ทดลองทาสารในโมเดล");
    const box = new THREE.Box3().setFromObject(scene);
    scene.position.sub(box.getCenter(new THREE.Vector3()));
    const group = new THREE.Group();
    group.add(scene);
    group.scale.setScalar(2.6 / box.getSize(new THREE.Vector3()).y);
    group.updateMatrixWorld(true);
    return { mask, uniforms, group, skin: skin as THREE.Mesh, ownedMaterials };
  }, [original]);

  const { mask, uniforms, group, skin } = resources;

  useEffect(() => {
    setApplicationStyle(uniforms, style, amount);
    invalidate();
  }, [uniforms, style, amount, invalidate]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const startedAt = performance.now();
    const tick = () => {
      uniforms.uApplicationScanPhase.value = ((performance.now() - startedAt) / 6500) % 1;
      invalidate();
    };
    const sync = () => {
      clearInterval(timer);
      timer = undefined;
      uniforms.uApplicationScanEnabled.value = scanEnabled ? 1 : 0;
      // A static grid respects reduced motion and needs no animation loop.
      if (motion.matches) uniforms.uApplicationScanPhase.value = 0.5;
      invalidate();
      if (scanEnabled && visible && !document.hidden && !motion.matches) {
        tick();
        // Throttle only the scan; painting and camera controls remain responsive.
        timer = setInterval(tick, 1000 / 15);
      }
    };
    sync();
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [uniforms, scanEnabled, visible, invalidate]);

  const painter = useMemo(() => {
    const { context, canvas, texture } = mask;
    const notify = () => onChange({ hasPaint: hasPaint.current, canUndo: history.current.length > 0 });
    const save = () => {
      history.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
      if (history.current.length > 4) history.current.shift();
    };
    const update = () => {
      texture.needsUpdate = true;
      invalidate();
    };
    const finish = () => {
      if (!painting.current) return;
      painting.current = false;
      previous.current = null;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      hasPaint.current = false;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 0) { hasPaint.current = true; break; }
      }
      notify();
    };
    const stamp = (uv: THREE.Vector2, radius: number, erase: boolean) => {
      const x = uv.x * canvas.width;
      const y = uv.y * canvas.height;
      context.globalCompositeOperation = erase ? "destination-out" : "source-over";
      const gradient = context.createRadialGradient(x, y, radius * 0.15, x, y, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${erase ? 0.65 : 0.3})`);
      gradient.addColorStop(0.65, `rgba(255,255,255,${erase ? 0.4 : 0.17})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    };
    const draw = (uv: THREE.Vector2, brush: number, erase: boolean) => {
      const radius = (0.008 + brush * 0.00035) * canvas.width;
      const from = previous.current;
      const distance = from ? from.distanceTo(uv) : 0;
      // A UV seam or an interrupted stroke must not connect across the atlas.
      const steps = from && distance < 0.15 ? Math.max(1, Math.ceil(distance * canvas.width / (radius * 0.25))) : 1;
      for (let i = 1; i <= Math.min(steps, 48); i++) {
        const point = from && distance < 0.15 ? new THREE.Vector2().lerpVectors(from, uv, i / steps) : uv;
        stamp(point, radius, erase);
      }
      previous.current = uv.clone();
      update();
    };
    const sample = () => {
      finish();
      save();
      context.clearRect(0, 0, canvas.width, canvas.height);
      group.updateMatrixWorld(true);
      const raycaster = new THREE.Raycaster();
      const direction = new THREE.Vector3(0, 0, -1);
      // Short cosmetic swatches on the cheeks and forehead, projected onto skin.
      for (const [x, y, length] of [[-0.38, 0.22, 0.24], [0.36, 0.22, 0.2], [-0.12, 0.87, 0.23]]) {
        previous.current = null;
        for (let i = 0; i <= 18; i++) {
          raycaster.set(new THREE.Vector3(x + length * i / 18, y - 0.035 * Math.sin(i / 18 * Math.PI), 4), direction);
          const hit = raycaster.intersectObject(skin, false)[0];
          if (hit?.uv) draw(hit.uv, 46, false);
        }
      }
      painting.current = true;
      finish();
      update();
    };
    const clear = () => {
      finish();
      save();
      context.clearRect(0, 0, canvas.width, canvas.height);
      hasPaint.current = false;
      update();
      notify();
    };
    const undo = () => {
      finish();
      const image = history.current.pop();
      if (!image) return;
      context.putImageData(image, 0, 0);
      painting.current = true;
      finish();
      update();
    };
    return { save, draw, finish, sample, clear, undo };
  }, [mask, invalidate, group, skin, onChange]);

  useEffect(() => {
    painter.sample();
    history.current = [];
    onChange({ hasPaint: hasPaint.current, canUndo: false });
    onReady({
      clear: painter.clear,
      undo: painter.undo,
      sample: painter.sample,
      front: () => {
        camera.position.set(0, 0.1, 4.3);
        controls?.target.set(0, 0.1, 0);
        controls?.update();
        invalidate();
      },
    });
    window.addEventListener("pointerup", painter.finish);
    window.addEventListener("pointercancel", painter.finish);
    window.addEventListener("blur", painter.finish);
    return () => {
      painter.finish();
      onReady(null);
      window.removeEventListener("pointerup", painter.finish);
      window.removeEventListener("pointercancel", painter.finish);
      window.removeEventListener("blur", painter.finish);
    };
  }, [painter, onReady, onChange, camera, controls, invalidate]);

  useEffect(() => () => {
    mask.texture.dispose();
    resources.ownedMaterials.forEach((material) => material.dispose());
  }, [resources, mask]);

  useEffect(() => { painter.finish(); }, [mode, style, painter]);

  const hitUv = (event: ThreeEvent<PointerEvent>) => {
    // Eyes, lashes and brows remain untouched and block paint through them.
    const hit = event.intersections[0];
    return hit?.object === skin ? hit.uv : undefined;
  };

  return (
    <primitive
      object={group}
      dispose={null}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (mode === "rotate" || event.button !== 0) return;
        const uv = hitUv(event);
        if (!uv) return;
        event.stopPropagation();
        painter.save();
        painting.current = true;
        previous.current = null;
        painter.draw(uv, brushSize, mode === "erase");
      }}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (!painting.current || mode === "rotate") return;
        if (!(event.buttons & 1)) { painter.finish(); return; }
        const uv = hitUv(event);
        if (!uv) { previous.current = null; return; }
        event.stopPropagation();
        painter.draw(uv, brushSize, mode === "erase");
      }}
      onPointerOut={() => { previous.current = null; }}
      onPointerUp={painter.finish}
    />
  );
}

export default function SkinApplicationCanvas(props: SkinApplicationCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.1, 4.3], fov: 38, near: 0.1, far: 30 }}
      dpr={[1, 1.5]}
      frameloop={props.visible ? "demand" : "never"}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ touchAction: "none", cursor: props.mode === "rotate" ? "grab" : "crosshair" }}
    >
      <hemisphereLight args={["#ffffff", "#b5a59a", 1]} />
      <directionalLight position={[3, 4, 5]} intensity={2.1} />
      <directionalLight position={[-4, 1, 3]} intensity={0.6} />
      <Suspense fallback={null}>
        {/* One small, generated studio reflection map; no downloaded HDR. */}
        <Environment resolution={32} frames={1}>
          <Lightformer position={[-3, 2, 4]} scale={[3, 5, 1]} intensity={2} />
          <Lightformer position={[3, 1, 2]} rotation={[0, -Math.PI / 4, 0]} scale={[1, 4, 1]} intensity={1.5} />
        </Environment>
        <ApplicationHead {...props} />
      </Suspense>
      <OrbitControls
        makeDefault
        enableRotate={props.mode === "rotate"}
        enablePan={false}
        enableDamping={false}
        minDistance={2.6}
        maxDistance={6}
        minPolarAngle={Math.PI * 0.3}
        maxPolarAngle={Math.PI * 0.7}
        target={[0, 0.1, 0]}
      />
    </Canvas>
  );
}
