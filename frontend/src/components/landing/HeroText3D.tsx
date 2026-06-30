'use client'

import { useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import * as THREE from 'three'
import Text3D from '@/components/three/Text3D'

// Mouse tracks on window so it works even when cursor is elsewhere on the page.
function MouseTrack({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      t.current.x = (e.clientX / window.innerWidth) * 2 - 1
      t.current.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('mousemove', fn)
    return () => window.removeEventListener('mousemove', fn)
  }, [])

  useFrame(() => {
    const g = ref.current
    if (!g) return
    g.rotation.y += (t.current.x * 0.14 - g.rotation.y) * 0.04
    g.rotation.x += (t.current.y * 0.08 - g.rotation.x) * 0.04
  })

  return <group ref={ref}>{children}</group>
}

function TextScene() {
  return (
    <>
      <ambientLight intensity={1.4} color="#dce6f0" />
      <directionalLight position={[6, 10, 6]} intensity={2.8} color="#ffffff" castShadow />
      <directionalLight position={[-5, 3, -3]} intensity={0.9} color="#2DD4BF" />
      <pointLight position={[0, 4, 6]} intensity={1.4} color="#38bdf8" />

      <MouseTrack>
        <Float speed={1.1} rotationIntensity={0} floatIntensity={0.09}>
          {/* Line 1 — Thai */}
          <Text3D size={0.44} variant="metallic" position={[0, 1.05, 0]}>
            คัดกรองความเสี่ยง
          </Text3D>

          {/* Line 2 — Thai */}
          <Text3D size={0.38} variant="metallic" position={[0, 0.3, 0]}>
            สารเคมีด้วย
          </Text3D>

          {/* Line 3 — EN, large accent */}
          <Text3D size={0.92} font="en" variant="metallic" position={[0, -0.72, 0]}>
            AI
          </Text3D>
        </Float>
      </MouseTrack>
    </>
  )
}

export default function HeroText3D() {
  return (
    <Canvas
      camera={{ position: [0, 0.2, 8], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    >
      <TextScene />
    </Canvas>
  )
}
