'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, PerformanceMonitor, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import CameraRig from './CameraRig'
import { prepareRoom, type LabRoom } from './plainRoom'
import LabAgents from './agents/LabAgents'
import type { Role } from './agents/workflow'
import type { Progress } from './agents/handoffDemo'
import type { StationBridge } from './station/bridge'

// The three-room Ralph Lab from Blender, shown exactly as exported.
const MODEL_URL = '/models/Lab_room_3room.glb'
const ROOM_CAMERA = { fov: 32, near: 0.02, far: 100, position: [3, 2.5, 3.5] as [number, number, number] }

type Props = {
  /** Fired once the room is built and on screen. */
  onReady?: () => void
  /** Testing-station link to the DOM panel (the station is shown only when given). */
  bridge?: StationBridge
  chatOpen: boolean
  cameraAgent: Role | null
  onAgentSelect?: (role: Role) => void
  onStopFollowing: () => void
  onHandoff?: (progress: Progress) => void
  onSample?: () => void
}

function Lights({ room }: { room: LabRoom }) {
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

// Gradient backdrop drawn as geometry (not a clear colour) so it goes through
// the same tone mapping as the room.
function Backdrop({ room }: { room: LabRoom }) {
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

function Room({ onReady, bridge, chatOpen, cameraAgent, onAgentSelect, onStopFollowing, onHandoff, onSample }: Props) {
  const gltf = useGLTF(MODEL_URL)
  const room = useMemo(() => prepareRoom(gltf), [gltf])

  useEffect(() => {
    onReady?.()
  }, [room, onReady])

  // `/lab-room?debug` exposes the scene for inspection from the console.
  const get = useThree((s) => s.get)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return
    const w = window as unknown as { __labRoom?: unknown }
    w.__labRoom = { room, THREE, state: get }
    return () => {
      delete w.__labRoom
    }
  }, [room, get])

  // The room is static, so the shadow map is rendered once and again only when
  // a wall appears or disappears — not every frame.
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

  // Walls between the camera and the room are hidden.
  useFrame(({ camera }) => {
    let signature = ''
    for (const wall of room.walls) {
      wall.mesh.visible = !wall.isCameraOutside(camera.position)
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

  return (
    <>
      <Lights room={room} />
      <Backdrop room={room} />
      <primitive object={room.root} />
      {/* The five agents load after the room is on screen. */}
      <Suspense fallback={null}>
        <LabAgents room={room} bridge={bridge} followed={cameraAgent} onSelect={onAgentSelect} onStopFollowing={onStopFollowing} onHandoff={onHandoff} onSample={onSample} />
      </Suspense>
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
      <CameraRig room={room} chatOpen={chatOpen} followingAgent={cameraAgent !== null} />
    </>
  )
}

export default function LabRoomCanvas(props: Props) {
  // Adaptive quality: start sharp, drop resolution if the frame rate stays low.
  const maxDpr = typeof window === 'undefined' ? 1.5 : Math.min(window.devicePixelRatio || 1, 1.5)
  const [dpr, setDpr] = useState(maxDpr)

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={dpr}
      camera={ROOM_CAMERA}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.22,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(maxDpr)}
        onFallback={() => setDpr(1)}
        flipflops={3}
      />
      <Suspense fallback={null}>
        <Room {...props} />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)
