'use client'

import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, ContactShadows, OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useCallback, useState, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { scrollState } from '@/app/_lib/scroll'
import { storyState, smoothstep, STORY_HOLD } from '@/app/_lib/story'
const MODEL_URL = '/models/Lab_room_camera_new.glb'

type ReadyPayload = {
  center: THREE.Vector3
  size: THREE.Vector3
  minY: number
  cameras: THREE.Camera[]
}

function Model({ url, onReady }: { url: string; onReady?: (p: ReadyPayload) => void }) {
  const gltf = useGLTF(url)
  const { scene, animations, cameras } = gltf as unknown as {
    scene: THREE.Group
    animations: THREE.AnimationClip[]
    cameras: THREE.Camera[]
  }
  const { actions, names } = useAnimations(animations, scene)

  // Gentle floating bob applied ONLY while the hero is at rest (scroll top),
  // eased out as soon as the camera tour starts so the dive isn't affected.
  const floatGroup = useRef<THREE.Group>(null)
  const floatAmp = useRef(0.15)

  useFrame((state) => {
    const g = floatGroup.current
    if (!g) return
    const rest = THREE.MathUtils.clamp(1 - scrollState.progress / 0.05, 0, 1)
    const e = rest * rest * (3 - 2 * rest) // smoothstep
    g.position.y = Math.sin(state.clock.elapsedTime * 0.6) * floatAmp.current * e
  })

  useEffect(() => {
    if (!actions) return

    // A clip is a "skeleton/body" clip if it drives bone transforms
    // (position/quaternion/scale).
    const isBodyClip = (clip: THREE.AnimationClip) =>
      clip.tracks.some((t) => /\.(position|quaternion|scale)$/.test(t.name))

    // The walk is now a SINGLE baked clip ("WalkAround_Baked") that already
    // contains both the walk cycle AND the root-motion translation, at the
    // correct constant scale. Play that one clip alone at full weight.
    // The old split clips (Idle / Walk-in-place) are ignored — blending them
    // is what caused the in-place walking and the size issues before.
    const bodyClips = animations.filter(isBodyClip)
    const bodyClip =
      bodyClips.find((c) => /walkaround|rootmotion/i.test(c.name)) ??
      bodyClips.find((c) => /walk/i.test(c.name)) ??
      bodyClips[0]

    // The per-flask/tube liquid morph-weight clips each target a distinct
    // object, so they all play together at full weight without conflicting.
    const liquidClips = animations.filter((c) => !isBodyClip(c))

    const playing: THREE.AnimationAction[] = []

    if (bodyClip) {
      const action = actions[bodyClip.name]
      if (action) {
        action.reset()
        action.setLoop(THREE.LoopRepeat, Infinity)
        action.clampWhenFinished = false
        action.setEffectiveWeight(1)
        action.fadeIn(0.3).play()
        playing.push(action)
      }
    }

    liquidClips.forEach((c) => {
      const action = actions[c.name]
      if (!action) return
      action.reset()
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = false
      action.setEffectiveWeight(1)
      action.fadeIn(0.3).play()
      playing.push(action)
    })

    return () => {
      playing.forEach((action) => action.fadeOut(0.3))
    }
  }, [actions, names, animations])

  useEffect(() => {
    // Keep the model at its original Blender coordinates so the embedded
    // camera transforms stay valid (no recentering).
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    floatAmp.current = Math.max(size.x, size.y, size.z) * 0.012

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = (
        Array.isArray(child.material) ? child.material : [child.material]
      ) as THREE.MeshStandardMaterial[]

      let anyTransparent = false
      mats.forEach((mat) => {
        if (!mat) return
        if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.65)
        if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.05)

        // Single-sided everywhere. DoubleSide doubled the fragment work and,
        // on the transparent glass, caused heavy overdraw when a flask fills
        // the screen at close range — that was the Camera_2 lag.
        mat.side = THREE.FrontSide

        const isTransparent = mat.transparent || (mat.opacity ?? 1) < 1
        if (isTransparent) {
          anyTransparent = true
          mat.depthWrite = false
        }
      })

      // Opaque meshes cast + receive shadows. Transparent glass does neither —
      // transparent shadow casters are costly and look wrong anyway.
      child.castShadow = !anyTransparent
      child.receiveShadow = !anyTransparent
    })

    onReady?.({ center, size, minY: box.min.y, cameras: cameras || [] })
  }, [scene, cameras, onReady])

  return (
    <group ref={floatGroup}>
      <primitive object={scene} />
    </group>
  )
}

function CameraRig({
  center,
  size,
  cameras,
  cameraName,
}: {
  center: THREE.Vector3
  size: THREE.Vector3
  cameras: THREE.Camera[]
  cameraName?: string
}) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)
  const maxDim = Math.max(size.x, size.y, size.z)

  useEffect(() => {
    if (!size) return
    const persp = camera as THREE.PerspectiveCamera

    // 1) Try to use a named camera embedded in the GLB (authored in Blender)
    const embedded = cameraName
      ? (cameras.find((c) => c.name === cameraName) as THREE.PerspectiveCamera | undefined)
      : undefined

    if (embedded) {
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      embedded.getWorldPosition(pos)
      embedded.getWorldQuaternion(quat)

      persp.position.copy(pos)
      persp.quaternion.copy(quat)
      if ((embedded as THREE.PerspectiveCamera).fov) {
        persp.fov = (embedded as THREE.PerspectiveCamera).fov
      }
      persp.updateProjectionMatrix()

      // Put the orbit pivot in front of the camera (preserves the authored framing)
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
      const dist = Math.max(pos.distanceTo(center), maxDim * 0.5)
      if (controlsRef.current) {
        controlsRef.current.target.copy(pos.clone().add(fwd.multiplyScalar(dist)))
        controlsRef.current.update()
      }
      return
    }

    // 2) Fallback — automatic top-down dollhouse view
    const distance = maxDim * 1.45
    const el = THREE.MathUtils.degToRad(46)
    const az = THREE.MathUtils.degToRad(45)
    persp.position.set(
      center.x + distance * Math.cos(el) * Math.sin(az),
      center.y + distance * Math.sin(el),
      center.z + distance * Math.cos(el) * Math.cos(az)
    )
    persp.lookAt(center)
    persp.updateProjectionMatrix()
    if (controlsRef.current) {
      controlsRef.current.target.copy(center)
      controlsRef.current.update()
    }
  }, [center, size, cameras, cameraName, camera, maxDim])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      enablePan={false}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={maxDim * 0.4}
      maxDistance={maxDim * 3}
      rotateSpeed={0.6}
      zoomSpeed={0.7}
    />
  )
}

type Stop = { name: string; p: THREE.Vector3; q: THREE.Quaternion; fov: number }

function ScrollCameraRig({
  center,
  size,
  cameras,
  order,
}: {
  center: THREE.Vector3
  size: THREE.Vector3
  cameras: THREE.Camera[]
  order: string[]
}) {
  const { camera, size: viewport } = useThree()
  const controlsRef = useRef<any>(null)
  const maxDim = Math.max(size.x, size.y, size.z)

  // Precompute world transforms of each camera in the scroll order.
  // NOTE: three's GLTFLoader strips reserved chars (".[]:/" ) from node names,
  // so a Blender camera "Camera_7.1" arrives as "Camera_71". Match on the
  // sanitized name so the lookup still finds it.
  const stops = useMemo<Stop[]>(() => {
    const sanitize = (n: string) => n.replace(/\s/g, '_').replace(/[[\]./:]/g, '')
    return order
      .map((name) => {
        const c = cameras.find(
          (cam) => cam.name === name || sanitize(cam.name) === sanitize(name)
        ) as THREE.PerspectiveCamera | undefined
        if (!c) return null
        const p = new THREE.Vector3()
        const q = new THREE.Quaternion()
        c.getWorldPosition(p)
        c.getWorldQuaternion(q)
        return { name, p, q, fov: c.fov || 22.9 }
      })
      .filter(Boolean) as Stop[]
  }, [cameras, order])

  // A "hero rest" framing derived from Camera_end: keep its exact iso angle but
  // raise the camera straight up in world space. With the orientation unchanged
  // this slides the room down into the lower half of the frame (no lateral
  // drift, no angle change), leaving a clean dark band at the top for the copy.
  //
  // Narrow / portrait viewports crop the wide room horizontally and zoom it in,
  // so on those we widen the fov (room shrinks back to fit) and raise the camera
  // a touch less — keeping the hero composition consistent from phone to desktop.
  const heroRest = useMemo<Stop | null>(() => {
    if (stops.length === 0) return null
    const s0 = stops[0]
    const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1.6
    const portrait = THREE.MathUtils.clamp((0.9 - aspect) / 0.6, 0, 1)
    const up = new THREE.Vector3(0, 1, 0)
    const p = s0.p.clone().addScaledVector(up, maxDim * (0.4 + portrait * 0.3))
    const fov = s0.fov * (1 + portrait * 1.0)
    return { name: 'hero', p, q: s0.q.clone(), fov }
  }, [stops, maxDim, viewport.width, viewport.height])

  // Place the camera at the hero rest framing on load.
  useEffect(() => {
    if (!heroRest) return
    const persp = camera as THREE.PerspectiveCamera
    persp.position.copy(heroRest.p)
    persp.quaternion.copy(heroRest.q)
    persp.fov = heroRest.fov
    persp.updateProjectionMatrix()
  }, [heroRest, camera])

  // The scrollytelling stop list: the hero rest framing first, then each detail
  // camera. The camera HOLDS on a stop while its chapter is read, then MOVES to
  // the next — both driven by storyState() so it stays in sync with the text.
  const storyStops = useMemo<Stop[]>(() => {
    if (!heroRest || stops.length === 0) return []
    // Use heroRest for both the first (hero) and last (CTA) stops so the
    // 3D model sits below the text in the same composition.
    return [heroRest, ...stops.slice(1, -1), heroRest]
  }, [heroRest, stops])

  const tmpP = useMemo(() => new THREE.Vector3(), [])
  const tmpQ = useMemo(() => new THREE.Quaternion(), [])
  const ctrl = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    if (storyStops.length < 2) return
    const p = scrollState.progress
    const controls = controlsRef.current
    const persp = camera as THREE.PerspectiveCamera

    // Fully scroll-driven (no manual orbit).
    if (controls && controls.enabled) controls.enabled = false

    const transitions = storyStops.length - 1
    const { k, move } = storyState(p, transitions, STORY_HOLD)
    const from = storyStops[k]
    const to = storyStops[Math.min(k + 1, storyStops.length - 1)]
    const m = smoothstep(move) // 0 while holding, eases 0→1 while travelling

    // Arc the path upward on moves that would otherwise clip through furniture
    // (e.g. Camera_4 → Camera_5 cuts through the computer desk).
    const lift = from.name === 'Camera_4' && to.name === 'Camera_5' ? maxDim * 0.45 : 0
    if (lift > 0 && move > 0) {
      ctrl.copy(from.p).add(to.p).multiplyScalar(0.5)
      ctrl.y += lift
      const oms = 1 - m
      tmpP.set(
        oms * oms * from.p.x + 2 * oms * m * ctrl.x + m * m * to.p.x,
        oms * oms * from.p.y + 2 * oms * m * ctrl.y + m * m * to.p.y,
        oms * oms * from.p.z + 2 * oms * m * ctrl.z + m * m * to.p.z
      )
    } else {
      tmpP.copy(from.p).lerp(to.p, m)
    }
    tmpQ.copy(from.q).slerp(to.q, m)
    const fov = THREE.MathUtils.lerp(from.fov, to.fov, m)

    // Frame-rate-independent damping (clamp delta so a stall can't jump).
    const d = Math.min(delta, 0.05)
    const a = 1 - Math.exp(-9 * d)
    camera.position.lerp(tmpP, a)
    camera.quaternion.slerp(tmpQ, a)
    persp.fov += (fov - persp.fov) * a
    persp.updateProjectionMatrix()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      enablePan={false}
      enableZoom={false}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2.05}
      rotateSpeed={0.6}
    />
  )
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.3, 0.3, 0.3]} />
      <meshStandardMaterial color="#2DD4BF" wireframe />
    </mesh>
  )
}

export default function LabScene({
  cameraName,
  scrollSequence,
  onModelReady,
}: {
  cameraName?: string
  scrollSequence?: string[]
  onModelReady?: () => void
}) {
  const [center, setCenter] = useState<THREE.Vector3>(new THREE.Vector3(0, 1, 0))
  const [size, setSize] = useState<THREE.Vector3>(new THREE.Vector3(1, 1, 1))
  const [minY, setMinY] = useState(0)
  const [cameras, setCameras] = useState<THREE.Camera[]>([])

  const handleReady = useCallback((p: ReadyPayload) => {
    setCenter(p.center)
    setSize(p.size)
    setMinY(p.minY)
    setCameras(p.cameras)
    onModelReady?.()
  }, [onModelReady])

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ position: [5, 5, 5], fov: 35 }}
      dpr={[1, 1.5]}
      gl={{
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.3,
        outputColorSpace: THREE.SRGBColorSpace,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <fog attach="fog" args={['#070b0c', 20, 45]} />

      <ambientLight intensity={0.5} color="#dce6f0" />
      <hemisphereLight args={['#b8d4e8', '#8a9aa8', 0.4]} />

      <directionalLight
        position={[6, 12, 8]}
        intensity={1.3}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.04}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-5, 6, -3]} intensity={0.4} color="#c0d8ee" />
      <directionalLight position={[0, 4, -8]} intensity={0.25} color="#a0c8e0" />

      <Suspense fallback={<LoadingFallback />}>
        <Model url={MODEL_URL} onReady={handleReady} />
        <ContactShadows
          position={[center.x, minY + 0.01, center.z]}
          opacity={0.35}
          scale={Math.max(size.x, size.z) * 1.4}
          blur={2.5}
          far={Math.max(size.y, 4)}
          color="#1a2030"
        />
      </Suspense>

      {scrollSequence ? (
        <ScrollCameraRig
          center={center}
          size={size}
          cameras={cameras}
          order={scrollSequence}
        />
      ) : (
        <CameraRig center={center} size={size} cameras={cameras} cameraName={cameraName} />
      )}
    </Canvas>
  )
}

useGLTF.preload(MODEL_URL)
