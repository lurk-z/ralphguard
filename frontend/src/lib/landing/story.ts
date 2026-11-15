// Shared scrollytelling math. Both the 3D camera rig (Three) and the text
// overlay (DOM) read the same scroll progress through these helpers so the
// camera move and the text crossfade stay perfectly in sync.

export const STORY_HOLD = 0.5 // fraction of each chapter spent "holding" to read
// The hero is already on screen at load, so it gets almost no hold — the camera
// starts moving toward chapter 1 as soon as the user scrolls (avoids a long
// "nothing happens" dead zone at the very top).
export const HERO_HOLD = 0.05

export function smoothstep(x: number) {
  const c = Math.min(Math.max(x, 0), 1)
  return c * c * (3 - 2 * c)
}

/**
 * Splits scroll progress (0..1) into per-chapter "hold then move" phases.
 * `transitions` = number of camera moves = chapters - 1.
 *  - k:    index of the chapter we're currently anchored on
 *  - move: 0 while holding (reading), then 0→1 while travelling to chapter k+1
 */
export function storyState(p: number, transitions: number, hold = STORY_HOLD) {
  if (transitions < 1) return { k: 0, u: 0, move: 0 }
  const seg = 1 / transitions
  let k = Math.floor(p / seg)
  if (k > transitions - 1) k = transitions - 1
  if (k < 0) k = 0
  const u = (p - k * seg) / seg
  const h = k === 0 ? HERO_HOLD : hold
  const move = u <= h ? 0 : (u - h) / (1 - h)
  return { k, u, move }
}
