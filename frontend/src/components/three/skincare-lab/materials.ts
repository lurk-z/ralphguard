import * as THREE from 'three'

// One clock shared by every liquid material, advanced once per frame.
export const liquidTime = { value: 0 }
// Emission strength — raised a little while bloom is on, lowered when it's off
// so the liquids stay readable either way.
export const liquidGlow = { value: 1.5 }

const KEY_LIGHT_DIR = new THREE.Vector3(0.45, 0.8, 0.4).normalize()

// Shared vertex stage. Supports the GLB's morph targets (the liquid "fill
// level" animation) through three's own morph chunks, so the animated surface
// stays inside its vessel exactly as authored.
const vertexShader = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewPos;
varying float vSeed;

void main() {
  vUv = uv;
  #include <morphinstance_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>

  vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = worldPos.xyz;
  vec4 mvPos = viewMatrix * worldPos;
  vViewPos = mvPos.xyz;
  // Per-object seed from the object's world origin → every vessel drifts and
  // pulses out of phase while still sharing one material.
  vSeed = fract(sin(dot(modelMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  gl_Position = projectionMatrix * mvPos;
}
`

const noiseGLSL = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
        mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
        mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`

// Face normal from screen-space derivatives: always matches the faceted
// low-poly look and stays correct while morph targets deform the mesh.
const flatNormalGLSL = /* glsl */ `
  vec3 N = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
  vec3 V = normalize(-vViewPos);
  if (dot(N, V) < 0.0) N = -N;
`

const liquidFragment = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uEmissiveMap;
uniform float uTime;
uniform float uGlow;
uniform float uGlowScale;
uniform vec3 uLightDir;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewPos;
varying float vSeed;

${noiseGLSL}

void main() {
  // Colour comes from the GLB's palette, so each vessel keeps its own hue.
  vec3 base = max(texture2D(uMap, vUv).rgb, texture2D(uEmissiveMap, vUv).rgb);

  ${flatNormalGLSL}
  vec3 Nw = normalize((vec4(N, 0.0) * viewMatrix).xyz);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
  float surface = smoothstep(0.6, 0.95, Nw.y);

  // Slow drifting noise → subtle colour variation inside the volume.
  float t = uTime * 0.35 + vSeed * 6.2831;
  float n = vnoise(vWorldPos * 55.0 + vec3(0.0, -t * 0.6, t * 0.25)) * 0.65
          + vnoise(vWorldPos * 126.0 + vec3(t * 0.4, 0.0, -t * 0.3)) * 0.35;
  // Push saturation a little: tone mapping pulls bright colours toward white.
  vec3 rich = mix(vec3(dot(base, vec3(0.2126, 0.7152, 0.0722))), base, 1.45);
  rich = max(rich, vec3(0.0));
  vec3 deep = rich * 0.5;
  vec3 light = mix(rich, vec3(1.0), 0.14);
  vec3 col = mix(deep, light, smoothstep(0.2, 0.8, n) * 0.6 + 0.2);

  // Facet shading keeps the volume's shape readable under the glow.
  float ndl = dot(Nw, normalize(uLightDir)) * 0.5 + 0.5;
  col *= mix(0.68, 1.05, ndl);

  float glow = uGlow * uGlowScale;
  float pulse = 0.93 + 0.07 * sin(uTime * 1.3 + vSeed * 6.2831);
  vec3 emission = col * glow * pulse;
  emission += rich * fresnel * 0.5 * glow;                          // soft rim
  emission += mix(rich, vec3(1.0), 0.35) * surface * 0.28 * glow;     // fill line

  gl_FragColor = vec4(emission, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const glassFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLightDir;
uniform float uTintMix;
uniform float uAlphaBase;
uniform vec3 uRim;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vViewPos;
varying float vSeed;

void main() {
  vec3 tex = texture2D(uMap, vUv).rgb;

  ${flatNormalGLSL}
  // Thin-shell look: facets facing the viewer stay nearly clear so the liquid
  // reads through; facets at grazing angles darken into a teal-grey outline.
  // A dark rim (rather than a bright one) keeps the vessel visible against the
  // room's pale walls and worktops as well as against dark backgrounds.
  // The ramp starts early because a low-poly cylinder only has a few facet
  // angles (0°, 45°, 90°…) — the 45° facets must already read as glass.
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.5);
  float edge = smoothstep(0.02, 0.5, fresnel);
  vec3 L = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 70.0);

  vec3 body = mix(tex, vec3(0.62, 0.8, 0.88), uTintMix);
  vec3 rim = uRim;
  // Stay under the bloom threshold — only the liquids should glow.
  vec3 col = min(mix(body, rim, edge) + vec3(spec) * 0.55, vec3(0.92));
  float alpha = clamp(uAlphaBase + (0.82 - uAlphaBase) * edge + spec * 0.6, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
BLACK.needsUpdate = true

type PaletteSource = Pick<THREE.MeshStandardMaterial, 'name' | 'map' | 'emissiveMap'>

export type LiquidOptions = {
  /** Multiplies the shared glow: < 1 for creams and gels that should read as lit, not lit-up. */
  glow?: number
}

export type GlassOptions = {
  /** How far the vessel colour is pulled toward clear glass blue (0 = keep tint, e.g. amber). */
  tintMix?: number
  /** Opacity of facets seen head-on. */
  alphaBase?: number
  /** Outline colour at grazing angles. */
  rim?: THREE.ColorRepresentation
}

/** A 1×1 sRGB texture so plain colours can drive the palette-based shaders. */
export function solidTexture(color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color)
  const rgb = c.getHexString()
  const data = new Uint8Array([
    parseInt(rgb.slice(0, 2), 16),
    parseInt(rgb.slice(2, 4), 16),
    parseInt(rgb.slice(4, 6), 16),
    255,
  ])
  const tex = new THREE.DataTexture(data, 1, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function createLiquidMaterial(source: PaletteSource, options: LiquidOptions = {}) {
  const material = new THREE.ShaderMaterial({
    name: `liquid:${source.name}`,
    vertexShader,
    fragmentShader: liquidFragment,
    uniforms: {
      uMap: { value: source.map ?? BLACK },
      uEmissiveMap: { value: source.emissiveMap ?? BLACK },
      uTime: liquidTime,
      uGlow: liquidGlow,
      uGlowScale: { value: options.glow ?? 1 },
      uLightDir: { value: KEY_LIGHT_DIR },
    },
    side: THREE.FrontSide,
  })
  return material
}

export function createGlassMaterial(source: PaletteSource, options: GlassOptions = {}) {
  return new THREE.ShaderMaterial({
    name: `glass:${source.name}`,
    vertexShader,
    fragmentShader: glassFragment,
    uniforms: {
      uMap: { value: source.map ?? BLACK },
      uLightDir: { value: KEY_LIGHT_DIR },
      uTintMix: { value: options.tintMix ?? 0.6 },
      uAlphaBase: { value: options.alphaBase ?? 0.2 },
      // Default rim matches the original lab glass (linear RGB).
      uRim: { value: options.rim !== undefined ? new THREE.Color(options.rim) : new THREE.Color(0.16, 0.32, 0.42) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })
}
