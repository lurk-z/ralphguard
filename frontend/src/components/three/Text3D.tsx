'use client'

/**
 * <Text3D> — reusable 3D extruded text for R3F scenes.
 *
 * Usage (inside a <Canvas>):
 *   <Text3D>คัดกรองความเสี่ยง</Text3D>
 *   <Text3D size={1.5} color="#ffffff" variant="glass">AI</Text3D>
 *   <Text3D font="en" depth={0.3} emissive="#ff0000">HELLO</Text3D>
 */

import { Suspense } from 'react'
import { Text3D as DreiText3D, Center } from '@react-three/drei'
import type { Vector3 } from '@react-three/fiber'

// ── Font paths ────────────────────────────────────────────────────────────────
const FONTS = {
  thai: '/fonts/LINESeedSansTH_W_Bd.json',
  en: '/fonts/LINESeedSans_W_Bd.json',
} as const

/** Detect if a string contains Thai characters (Unicode U+0E00–U+0E7F). */
const hasThai = (s: string) => /[฀-๿]/.test(s)

// ── Types ─────────────────────────────────────────────────────────────────────
export type Text3DVariant = 'metallic' | 'glass' | 'flat' | 'normal'

export interface Text3DProps {
  children: string

  // ── Font ──────────────────────────────────────────────────────────────────
  /** 'thai' | 'en' | custom URL path.
   *  Omit to auto-detect from content (Thai chars → thai font). */
  font?: 'thai' | 'en' | (string & {})

  // ── Geometry ──────────────────────────────────────────────────────────────
  /** Font size in Three.js units. @default 1 */
  size?: number
  /** Extrusion depth. @default size * 0.2 */
  depth?: number
  /** Enable bevel. @default true */
  bevel?: boolean
  /** Letter spacing multiplier. @default 0.01 */
  letterSpacing?: number

  // ── Appearance ────────────────────────────────────────────────────────────
  /** Visual preset. @default 'metallic' */
  variant?: Text3DVariant
  /** Primary hex color. @default '#2DD4BF' */
  color?: string
  /** Metalness 0–1 (overrides preset). */
  metalness?: number
  /** Roughness 0–1 (overrides preset). */
  roughness?: number
  /** Emissive hex color (overrides preset). */
  emissive?: string
  /** Emissive intensity (overrides preset). */
  emissiveIntensity?: number

  // ── Layout ────────────────────────────────────────────────────────────────
  /** Auto-center mesh in its bounding box. @default true */
  center?: boolean
  position?: Vector3
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
}

// ── Material sub-component ────────────────────────────────────────────────────
// Must be a component (not a shared element) so React can mount
// an independent instance for each Text3D.
function Material({
  variant = 'metallic',
  color = '#2DD4BF',
  metalness,
  roughness,
  emissive,
  emissiveIntensity,
}: Pick<Text3DProps, 'variant' | 'color' | 'metalness' | 'roughness' | 'emissive' | 'emissiveIntensity'>) {
  switch (variant) {
    case 'normal':
      return <meshNormalMaterial />

    case 'glass':
      return (
        <meshPhysicalMaterial
          color={color ?? '#ffffff'}
          metalness={metalness ?? 0}
          roughness={roughness ?? 0}
          transmission={0.95}
          thickness={0.5}
          transparent
        />
      )

    case 'flat':
      return (
        <meshStandardMaterial
          color={color}
          roughness={roughness ?? 0.55}
          metalness={metalness ?? 0}
        />
      )

    default: // 'metallic'
      return (
        <meshPhysicalMaterial
          color={color}
          metalness={metalness ?? 0.82}
          roughness={roughness ?? 0.1}
          emissive={emissive ?? '#0a5555'}
          emissiveIntensity={emissiveIntensity ?? 0.4}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      )
  }
}

// ── Inner mesh (suspends while font loads) ────────────────────────────────────
function TextMesh(props: Text3DProps) {
  const {
    children,
    font,
    size = 1,
    depth,
    bevel = true,
    letterSpacing = 0.01,
    variant = 'metallic',
    color = '#2DD4BF',
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
  } = props

  // Resolve font: explicit → auto-detect
  const resolvedFont =
    font === 'thai' ? FONTS.thai
    : font === 'en'  ? FONTS.en
    : font           ? font
    : hasThai(children) ? FONTS.thai
    : FONTS.en

  const h = depth ?? size * 0.2
  const bs = size * 0.025
  const bt = bs * 1.2

  return (
    <DreiText3D
      font={resolvedFont}
      size={size}
      height={h}
      bevelEnabled={bevel}
      bevelSize={bevel ? bs : 0}
      bevelThickness={bevel ? bt : 0}
      bevelSegments={5}
      curveSegments={8}
      letterSpacing={letterSpacing}
    >
      {children}
      <Material
        variant={variant}
        color={color}
        metalness={metalness}
        roughness={roughness}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
    </DreiText3D>
  )
}

// ── Public component ──────────────────────────────────────────────────────────
export default function Text3D({
  center = true,
  position,
  rotation,
  scale,
  ...rest
}: Text3DProps) {
  // Suspense must wrap TextMesh directly — Center needs real geometry to measure,
  // so TextMesh (not Suspense) is the immediate child of Center.
  const mesh = (
    <Suspense fallback={null}>
      {center ? (
        <Center>
          <TextMesh {...rest} />
        </Center>
      ) : (
        <TextMesh {...rest} />
      )}
    </Suspense>
  )

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {mesh}
    </group>
  )
}
