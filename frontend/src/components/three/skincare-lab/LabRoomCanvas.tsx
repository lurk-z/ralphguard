'use client'

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, PerformanceMonitor, useAnimations, useGLTF } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import CameraRig, { type CameraRigHandle } from './CameraRig'
import { liquidGlow, liquidTime } from './materials'
import { prepareRoom, topLevelOf, type PreparedRoom } from './prepareRoom'
import { prepareUnionRoom } from './unionRoom'
import { isPickable } from './batching'
import { AGENT_RADIUS, AISLE, FOOTPRINTS, measureClearance } from './footprints'
import { AGENT_HEIGHT } from './layout'
import AgentFigures, { type AgentFiguresProps } from './agents/AgentFigures'

// By default the room is built at runtime from `Lab_room.glb`. Add `?union` to the
// URL to load the pre-built static `Lab_room_Union.glb` instead (made by
// scripts/blender/build_lab_room_union.py).
const UNION = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('union')
const LEGACY = !UNION
const MODEL_URL = LEGACY ? '/models/Lab_room.glb' : '/models/Lab_room_Union.glb'

export type LabRoomCanvasProps = {
  rigRef: RefObject<CameraRigHandle>
  /** Bloom + composer on/off. The room stays fully readable when off. */
  effects: boolean
  /** Hide whichever walls sit between the camera and the room. */
  cutaway: boolean
  /** Show the seven staff standing positions (markers + station names). */
  people?: boolean
  onReady?: (info: { removed: string[] }) => void
  onFocus?: (name: string | null) => void
  /** Fired when the user grabs the camera (drag, wheel, pinch). */
  onManualControl?: () => void
  /** Fired once when the frame rate stays low, so the page can switch effects off. */
  onPerformanceDrop?: () => void
  /** Turn off double-click-to-focus (camera stays free-orbit only). */
  noFocus?: boolean
  /** Show the five AI agents instead of the plain station markers. */
  agents?: AgentFiguresProps
  /** A click (not a drag) on the room that hits no agent, e.g. to close a chat. */
  onBackgroundClick?: () => void
}

function Lights({ room }: { room: PreparedRoom }) {
  const keyRef = useRef<THREE.DirectionalLight>(null)
  const { center, reach } = useMemo(() => {
    const center = room.bounds.getCenter(new THREE.Vector3())
    const size = room.bounds.getSize(new THREE.Vector3())
    return { center, reach: Math.max(size.x, size.z) * 0.75 }
  }, [room])

  useEffect(() => {
    const key = keyRef.current
    if (!key) return
    key.target.position.copy(center)
    key.target.updateMatrixWorld()
  }, [center])

  return (
    <>
      {/* Fill: soft sky/ground wash so small props never fall into black. */}
      <ambientLight intensity={0.55} color="#e3ecf5" />
      <hemisphereLight args={['#dcebf7', '#8b97a3', 0.75]} />
      <directionalLight
        position={[center.x - reach * 1.2, center.y + reach * 0.9, center.z + reach * 0.4]}
        intensity={0.55}
        color="#cfe2f5"
      />
      {/* Key: the only shadow caster. */}
      <directionalLight
        ref={keyRef}
        position={[center.x + reach * 0.8, center.y + reach * 1.7, center.z + reach * 1.15]}
        intensity={2.1}
        color="#fff6ea"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={reach * 0.2}
        shadow-camera-far={reach * 5}
        shadow-camera-left={-reach * 1.2}
        shadow-camera-right={reach * 1.2}
        shadow-camera-top={reach * 1.2}
        shadow-camera-bottom={-reach * 1.2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.004}
      />
    </>
  )
}

// Gradient backdrop drawn as geometry (not a clear colour) so it passes through
// the same tone mapping whether the effect composer is on or off.
function Backdrop({ room }: { room: PreparedRoom }) {
  const { center, radius } = useMemo(() => {
    const sphere = room.bounds.getBoundingSphere(new THREE.Sphere())
    return { center: sphere.center, radius: sphere.radius * 9 }
  }, [room])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color('#dfe9f0') },
          uBottom: { value: new THREE.Color('#aebccb') },
        },
        vertexShader: /* glsl */ `
          varying float vH;
          void main() {
            vH = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uBottom;
          varying float vH;
          void main() {
            gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(-0.35, 0.55, vH)), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    []
  )
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh position={center} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  )
}

// Seven staff standing positions: agent-sized capsules, floor rings and station
// names. The main aisle line is drawn only in the debug view (`?debug`).
function FootprintMarkers({ floorY, aisle, labels }: { floorY: number; aisle: boolean; labels: boolean }) {
  const line = useMemo(() => {
    const pts = AISLE.map(([x, z]) => new THREE.Vector3(x, floorY + 0.012, z))
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: '#f59e0b' })
    )
  }, [floorY])
  return (
    <group name="debug-footprints">
      {FOOTPRINTS.map((f) => (
        <group key={f.id} position={[f.x, floorY, f.z]}>
          <mesh position={[0, AGENT_HEIGHT / 2, 0]}>
            <capsuleGeometry args={[AGENT_RADIUS, AGENT_HEIGHT - AGENT_RADIUS * 2, 4, 12]} />
            <meshStandardMaterial color="#f59e0b" transparent opacity={0.45} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
            <ringGeometry args={[AGENT_RADIUS * 0.85, AGENT_RADIUS, 24]} />
            <meshBasicMaterial color="#b45309" />
          </mesh>
          {labels && (
            <Html position={[0, AGENT_HEIGHT + 0.05, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <span className="whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-amber-800 shadow-sm">
                {f.label}
              </span>
            </Html>
          )}
        </group>
      ))}
      {aisle && <primitive object={line} />}
    </group>
  )
}

function Room({
  rigRef,
  cutaway,
  onReady,
  onFocus,
  onManualControl,
  people,
  noFocus,
  agents,
}: Pick<LabRoomCanvasProps, 'rigRef' | 'cutaway' | 'onReady' | 'onFocus' | 'onManualControl' | 'people' | 'noFocus' | 'agents'>) {
  const gltf = useGLTF(MODEL_URL)
  const room = useMemo(() => {
    const t0 = performance.now()
    const prepared = LEGACY ? prepareRoom(gltf) : prepareUnionRoom(gltf)
    // Exposed for the debug view's performance notes.
    prepared.root.userData.prepareMs = Math.round(performance.now() - t0)
    return prepared
  }, [gltf])
  useEffect(() => () => room.dispose(), [room])

  // Liquid fill levels: the GLB's own morph-weight clips, looping.
  const { actions } = useAnimations(room.liquidClips, room.root)
  useEffect(() => {
    const playing = Object.values(actions).filter(Boolean) as THREE.AnimationAction[]
    playing.forEach((a) => a.reset().setLoop(THREE.LoopRepeat, Infinity).play())
    return () => playing.forEach((a) => a.stop())
  }, [actions])

  useEffect(() => {
    onReady?.({ removed: room.removed })
  }, [room, onReady])

  // `/lab-room?debug` exposes the scene for inspection from the console
  // (camera placement for comparison screenshots, mesh/material audits).
  const get = useThree((s) => s.get)
  const [debug, setDebug] = useState(false)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return
    setDebug(true)
    const w = window as unknown as { __labRoom?: unknown }
    const tile = room.root.getObjectByName('tile')
    const floor = tile ? new THREE.Box3().setFromObject(tile).max.y : room.bounds.min.y
    w.__labRoom = { room, THREE, state: get, clearance: measureClearance(room.root, floor) }
    return () => {
      delete w.__labRoom
    }
  }, [room, get])

  // The room is static, so the shadow map is rendered once and again only when
  // a cut-away wall appears or disappears — not every frame.
  const gl = useThree((s) => s.gl)
  const shadowSignature = useRef('')
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    shadowSignature.current = ''
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl, room])

  useFrame(({ camera }, delta) => {
    // The pre-built room is fully static: liquids keep their colour and glow but do not shimmer.
    if (LEGACY) liquidTime.value += Math.min(delta, 0.1)
    for (const s of room.spinners) s.object.rotation.y += s.speed * Math.min(delta, 0.1)
    let signature = ''
    for (const wall of room.walls) {
      wall.mesh.visible = !(cutaway && wall.isCameraOutside(camera.position))
      signature += wall.mesh.visible ? '1' : '0'
    }
    if (signature !== shadowSignature.current) {
      shadowSignature.current = signature
      gl.shadowMap.needsUpdate = true
    }
  })

  const floorY = useMemo(() => {
    const tile = room.root.getObjectByName('tile')
    return tile ? new THREE.Box3().setFromObject(tile).max.y : room.bounds.min.y
  }, [room])
  const center = useMemo(() => room.bounds.getCenter(new THREE.Vector3()), [room])
  const size = useMemo(() => room.bounds.getSize(new THREE.Vector3()), [room])

  // Double-click to focus. Raycasting only on double-click (instead of R3F
  // pointer events, which raycast every mesh on every pointer move) keeps
  // orbiting smooth.
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (noFocus) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const onDouble = (ev: MouseEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      // Cut-away walls are hidden but still hit-testable: skip them.
      const hit = ray.intersectObject(room.root, true).find((i) => isPickable(i.object))
      if (!hit) return
      rigRef.current?.focus(hit.object, hit.point)
      onFocus?.(topLevelOf(hit.object, room.root).name)
    }
    el.addEventListener('dblclick', onDouble)
    return () => el.removeEventListener('dblclick', onDouble)
  }, [gl, camera, room, rigRef, onFocus, noFocus])

  return (
    <>
      <Lights room={room} />
      <Backdrop room={room} />
      <primitive object={room.root} />
      {/* Restrained grounding shadow under furniture legs; baked once (static room). */}
      <ContactShadows
        position={[center.x, floorY + 0.002, center.z]}
        scale={[size.x * 1.05, size.z * 1.05]}
        far={size.y * 0.18}
        resolution={512}
        blur={1.6}
        opacity={0.32}
        color="#1c2733"
        frames={1}
      />
      {agents ? (
        <AgentFigures floorY={floorY} {...agents} />
      ) : (
        (debug || people) && <FootprintMarkers floorY={floorY} aisle={debug} labels={!!people} />
      )}
      <CameraRig ref={rigRef} room={room} onManualControl={onManualControl} />
    </>
  )
}

export default function LabRoomCanvas({
  rigRef,
  effects,
  cutaway,
  people,
  onReady,
  onFocus,
  onManualControl,
  onPerformanceDrop,
  noFocus,
  agents,
  onBackgroundClick,
}: LabRoomCanvasProps) {
  useEffect(() => {
    liquidGlow.value = effects ? 1.75 : 1.3
  }, [effects])

  // Adaptive quality: start sharp, drop resolution (and tell the page to turn
  // effects off) if the frame rate stays low; restore when it recovers.
  const maxDpr = typeof window === 'undefined' ? 1.5 : Math.min(window.devicePixelRatio || 1, 1.5)
  const [dpr, setDpr] = useState(maxDpr)
  const dropped = useRef(false)
  const decline = () => {
    setDpr(1)
    if (!dropped.current) {
      dropped.current = true
      onPerformanceDrop?.()
    }
  }

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={dpr}
      camera={{ fov: 32, near: 0.02, far: 100, position: [3, 2.5, 3.5] }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.22,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      onPointerMissed={onBackgroundClick}
    >
      <PerformanceMonitor onDecline={decline} onIncline={() => setDpr(maxDpr)} onFallback={decline} flipflops={3} />
      <Suspense fallback={null}>
        <Room
          rigRef={rigRef}
          cutaway={cutaway}
          people={people}
          onReady={onReady}
          onFocus={onFocus}
          onManualControl={onManualControl}
          noFocus={noFocus}
          agents={agents}
        />
      </Suspense>

      {effects && (
        <EffectComposer multisampling={2}>
          {/* Threshold sits above every lit surface, so only the emissive liquids bloom. */}
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.12} intensity={1.05} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)
