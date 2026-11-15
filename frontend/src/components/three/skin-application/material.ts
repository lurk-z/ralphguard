import * as THREE from "three";

export type ApplicationStyle = "cream" | "gel" | "serum" | "lotion";
export type ApplicationMode = "paint" | "erase" | "rotate";

const CLEAR_GLOSS = { roughness: 0.14, normal: 0.7, wet: 0.8 };

export const APPLICATION_STYLES = [
  { id: "cream", label: "ครีมบาง", english: "Soft cream", description: "สีขาวนวล ขอบนุ่ม ผิวสัมผัสกึ่งด้าน", tint: "#faf5eb", opacity: 0.8, roughness: 0.64, normal: 0.35, wet: 0 },
  { id: "gel", label: "เจลใส", english: "Clear gel", description: "โปร่งใส เคลือบเงา ยังมองเห็นเนื้อผิว", tint: "#d8f0ec", opacity: 0.12, ...CLEAR_GLOSS },
  { id: "serum", label: "เซรั่ม", english: "Silky serum", description: "ฟิล์มบางโทนอุ่น เงาลื่นเล็กน้อย", tint: "#edc792", opacity: 0.14, roughness: 0.24, normal: 0.9, wet: 0.35 },
  { id: "lotion", label: "โลชั่นน้ำนม", english: "Milky lotion", description: "ขาวโปร่งบาง เงาใส เกลี่ยกลืนกับผิว", tint: "#fffaf4", opacity: 0.42, ...CLEAR_GLOSS },
] as const;

/** One small alpha mask shared by every material preset; no overlay mesh. */
export function createApplicationMask(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("ไม่สามารถสร้างพื้นที่สำหรับรอยทาได้");
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  return { canvas, context, texture };
}

export function createApplicationUniforms(mask: THREE.Texture) {
  return {
    uApplicationMask: { value: mask },
    uApplicationTint: { value: new THREE.Color() },
    uApplicationOpacity: { value: 0.8 },
    uApplicationRoughness: { value: 0.64 },
    uApplicationNormal: { value: 0.35 },
    uApplicationWet: { value: 0 },
    uApplicationAmount: { value: 0.75 },
    uApplicationScanEnabled: { value: 1 },
    uApplicationScanPhase: { value: 0.5 },
    uApplicationScanColor: { value: new THREE.Color("#a4d8d5") },
  };
}

export function setApplicationStyle(uniforms: ReturnType<typeof createApplicationUniforms>, style: ApplicationStyle, amount: number) {
  const preset = APPLICATION_STYLES.find((item) => item.id === style)!;
  uniforms.uApplicationTint.value.set(preset.tint);
  uniforms.uApplicationOpacity.value = preset.opacity;
  uniforms.uApplicationRoughness.value = preset.roughness;
  uniforms.uApplicationNormal.value = preset.normal;
  uniforms.uApplicationWet.value = preset.wet;
  uniforms.uApplicationAmount.value = THREE.MathUtils.clamp(amount / 100, 0, 1);
}

/** Preserve the original skin maps and lighting, modifying only painted texels. */
export function createApplicationMaterial(source: THREE.MeshStandardMaterial, uniforms: ReturnType<typeof createApplicationUniforms>) {
  const material = source.clone();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vApplicationUv;\nvarying float vApplicationHeight;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvApplicationUv = uv;\nvApplicationHeight = (modelMatrix * vec4(transformed, 1.0)).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vApplicationUv;
varying float vApplicationHeight;
uniform sampler2D uApplicationMask;
uniform vec3 uApplicationTint;
uniform float uApplicationOpacity;
uniform float uApplicationRoughness;
uniform float uApplicationNormal;
uniform float uApplicationWet;
uniform float uApplicationAmount;
uniform float uApplicationScanEnabled;
uniform float uApplicationScanPhase;
uniform vec3 uApplicationScanColor;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
float applicationMask = texture2D(uApplicationMask, vApplicationUv).a;
float applicationCoverage = smoothstep(0.0, 0.9, applicationMask) * uApplicationAmount;
diffuseColor.rgb = mix(diffuseColor.rgb, uApplicationTint, applicationCoverage * uApplicationOpacity);
float applicationEdge = 4.0 * applicationMask * (1.0 - applicationMask);
diffuseColor.rgb += vec3(0.018) * applicationEdge * uApplicationWet * uApplicationAmount;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, uApplicationRoughness, applicationCoverage);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
normal = normalize(mix(nonPerturbedNormal, normal, mix(1.0, uApplicationNormal, applicationCoverage)));`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
if (uApplicationScanEnabled > 0.5) {
  // Analytic UV grid: no wireframe mesh, extra texture, or render pass.
  vec2 scanUv = vApplicationUv * 56.0;
  vec2 scanCell = fract(scanUv);
  vec2 scanEdge = min(scanCell, 1.0 - scanCell);
  vec2 scanWidth = max(fwidth(scanUv), vec2(0.012));
  vec2 scanLines = 1.0 - smoothstep(scanWidth * 0.2, scanWidth * 1.1, scanEdge);
  float scanGrid = max(scanLines.x, scanLines.y);
  float scanFace = smoothstep(-0.35, -0.12, vApplicationHeight);
  float scanY = mix(1.35, -0.35, uApplicationScanPhase);
  float scanBand = 1.0 - smoothstep(0.012, 0.075, abs(vApplicationHeight - scanY));
  float scanPresence = mix(0.1, 0.2, smoothstep(0.02, 0.2, applicationMask));
  totalEmissiveRadiance += uApplicationScanColor * scanFace * (scanGrid * scanPresence + scanBand * 0.18);
}`);
  };
  material.customProgramCacheKey = () => "skin-application-v2-scan";
  return material;
}
