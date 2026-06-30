'use client'

import { useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Float, Grid, Environment } from '@react-three/drei'
import { useState } from 'react'
import * as THREE from 'three'
import Text3D, { type Text3DVariant } from '@/components/three/Text3D'

// ── Mouse-tracking rotation ────────────────────────────────────────────────────
// Wraps children in a group that gently tilts toward the cursor.
// Max tilt: ±14° Y-axis, ±7° X-axis. Lerp factor keeps it smooth/lazy.
function MouseTrackGroup({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null)
  const target = useRef({ x: 0, y: 0 })
  const { gl } = useThree()

  useEffect(() => {
    const el = gl.domElement
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      // Normalise to -1..1
      target.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      target.current.y = -((e.clientY - r.top) / r.height) * 2 + 1
    }
    const onLeave = () => {
      target.current.x = 0
      target.current.y = 0
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [gl])

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    // ±0.24 rad (~14°) on both axes
    const ty = target.current.x * 0.24
    const tx = target.current.y * 0.24
    // Lazy lerp — feels organic, not snappy
    g.rotation.y += (ty - g.rotation.y) * 0.04
    g.rotation.x += (tx - g.rotation.x) * 0.04
  })

  return <group ref={groupRef}>{children}</group>
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ variant }: { variant: Text3DVariant }) {
  return (
    <>
      <ambientLight intensity={1.5} color="#dce6f0" />
      <directionalLight position={[6, 10, 6]} intensity={3} castShadow />
      <directionalLight position={[-5, 3, -3]} intensity={1} color="#2DD4BF" />
      <pointLight position={[0, 5, 5]} intensity={1.5} color="#38bdf8" />
      <Environment preset="city" />

      <MouseTrackGroup>
        <Float speed={1.4} rotationIntensity={0} floatIntensity={0.18}>
          {/* Line 1 — Thai, large */}
          <Text3D size={0.36} variant={variant} position={[0, 0.82, 0]}>
            คัดกรองความเสี่ยง
          </Text3D>

          {/* Line 2 — Thai, medium */}
          <Text3D size={0.30} variant={variant} position={[0, 0.3, 0]}>
            สารเคมีด้วย
          </Text3D>

          {/* "AI" — EN font, oversized as hero focal point */}
          <Text3D
            font="en"
            size={1.1}
            depth={0.28}
            variant={variant}
            color={variant === 'metallic' ? '#2DD4BF' : undefined}
            emissive={variant === 'metallic' ? '#0d6060' : undefined}
            emissiveIntensity={variant === 'metallic' ? 0.6 : undefined}
            position={[0, -0.62, 0]}
          >
            AI
          </Text3D>
        </Float>
      </MouseTrackGroup>

      <Grid
        position={[0, -2.2, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a3a3a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#2DD4BF"
        fadeDistance={12}
        infiniteGrid
      />
    </>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS: { key: Text3DVariant; label: string }[] = [
  { key: 'metallic', label: 'Metallic Teal' },
  { key: 'normal', label: 'Normal Map' },
  { key: 'glass', label: 'Glass' },
  { key: 'flat', label: 'Flat' },
]

export default function Text3DTest() {
  const [variant, setVariant] = useState<Text3DVariant>('metallic')

  return (
    <div className="relative w-full h-[calc(100vh-64px)]">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setVariant(t.key)}
            className={`px-3 py-1.5 rounded-full font-mono text-xs border transition-all ${variant === t.key
                ? 'bg-brand text-[#070b0c] border-brand font-bold'
                : 'bg-transparent text-foreground/60 border-white/20 hover:border-brand/50'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="absolute bottom-4 left-4 z-10 font-mono text-[10px] text-white/30 leading-relaxed">
        <p>Move mouse to rotate · LINE Seed Sans TH Bold</p>
      </div>

      <Canvas
        camera={{ position: [0, 0.3, 9], fov: 44 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
        style={{ background: '#070b0c' }}
      >
        <Scene variant={variant} />
      </Canvas>
    </div>
  )
}
