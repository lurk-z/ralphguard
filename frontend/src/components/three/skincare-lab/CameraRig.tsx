'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import gsap from 'gsap'
import * as THREE from 'three'
import { topLevelOf, type PreparedRoom } from './prepareRoom'
import { OVERVIEW, fitDistance, poseForView, type CameraPose, type RoomView } from './views'

export type CameraRigHandle = {
  /** Glide to a shortcut view. */
  goTo: (view: RoomView, duration?: number) => void
  /** Frame one object (or the clicked spot on a large surface) and keep orbiting around it. */
  focus: (object: THREE.Object3D, point: THREE.Vector3) => void
}

type Props = {
  room: PreparedRoom
  /** Fired when the user grabs the camera (drag, wheel, pinch). */
  onManualControl?: () => void
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const CameraRig = forwardRef<CameraRigHandle, Props>(function CameraRig({ room, onManualControl }, ref) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const tweenRef = useRef<gsap.core.Tween | null>(null)

  // Every limit is derived from the room's real size, not hard-coded units.
  const { maxDim, targetBox } = useMemo(() => {
    const size = room.bounds.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetBox = room.bounds.clone().expandByScalar(maxDim * 0.2)
    targetBox.min.y = room.bounds.min.y // never pivot below the floor slab
    return { maxDim, targetBox }
  }, [room])

  const flyTo = useCallback(
    (pose: CameraPose, duration = 1.15) => {
      const controls = controlsRef.current
      if (!controls) return
      tweenRef.current?.kill()
      tweenRef.current = null

      const fromTarget = controls.target.clone()
      const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(fromTarget))
      const to = new THREE.Spherical().setFromVector3(pose.position.clone().sub(pose.target))
      // Swing the short way round.
      let dTheta = to.theta - from.theta
      dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta))

      const s = new THREE.Spherical()
      const offset = new THREE.Vector3()
      const apply = (t: number) => {
        controls.target.lerpVectors(fromTarget, pose.target, t)
        s.radius = THREE.MathUtils.lerp(from.radius, to.radius, t)
        s.phi = THREE.MathUtils.lerp(from.phi, to.phi, t)
        s.theta = from.theta + dTheta * t
        camera.position.copy(controls.target).add(offset.setFromSpherical(s))
        controls.update()
      }

      if (duration <= 0 || prefersReducedMotion()) {
        apply(1)
        return
      }
      const state = { t: 0 }
      tweenRef.current = gsap.to(state, {
        t: 1,
        duration,
        ease: 'power3.inOut',
        onUpdate: () => apply(state.t),
        onComplete: () => {
          tweenRef.current = null
        },
      })
    },
    [camera]
  )

  useImperativeHandle(
    ref,
    () => ({
      goTo: (view, duration) => flyTo(poseForView(view, room.root, room.bounds, camera), duration),
      focus: (object, point) => {
        const controls = controlsRef.current
        if (!controls) return
        const top = topLevelOf(object, room.root)
        const sphere = new THREE.Box3().setFromObject(top).getBoundingSphere(new THREE.Sphere())
        // Large surfaces (floor, walls, worktops): zoom toward the clicked spot.
        // Small props: frame the whole object.
        const large = sphere.radius > maxDim * 0.16
        const target = large ? point.clone() : sphere.center.clone()
        const dir = camera.position.clone().sub(controls.target).normalize()
        if (dir.y < 0.3) dir.setY(0.3).normalize() // keep a readable elevation
        const current = camera.position.distanceTo(controls.target)
        const distance = large
          ? THREE.MathUtils.clamp(current * 0.5, maxDim * 0.14, maxDim * 0.6)
          : Math.max(fitDistance(sphere.radius, camera) * 1.9, maxDim * 0.06)
        flyTo({ target, position: target.clone().addScaledVector(dir, distance) }, 0.9)
      },
    }),
    [camera, flyTo, maxDim, room]
  )

  // Start on the elevated overview.
  useLayoutEffect(() => {
    camera.near = maxDim * 0.004
    camera.far = maxDim * 30
    camera.updateProjectionMatrix()
    flyTo(poseForView(OVERVIEW, room.root, room.bounds, camera), 0)
  }, [camera, flyTo, maxDim, room])

  // Manual input wins immediately: any drag / wheel / pinch cancels a transition.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const onStart = () => {
      if (tweenRef.current) {
        tweenRef.current.kill()
        tweenRef.current = null
      }
      onManualControl?.()
    }
    controls.addEventListener('start', onStart)
    return () => {
      controls.removeEventListener('start', onStart)
      tweenRef.current?.kill()
    }
  }, [onManualControl])

  // Keep the orbit pivot near the room so panning can't lose the scene.
  useFrame(() => {
    const controls = controlsRef.current
    if (controls && !tweenRef.current) controls.target.clamp(targetBox.min, targetBox.max)
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning
      zoomToCursor
      rotateSpeed={0.7}
      zoomSpeed={0.9}
      panSpeed={0.9}
      minDistance={maxDim * 0.03}
      maxDistance={maxDim * 3}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.03}
    />
  )
})

export default CameraRig
