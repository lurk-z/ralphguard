// Shared scroll progress (0 → 1) written by the ScrollSmoother/ScrollTrigger
// setup and read by the 3D camera rig each frame. A plain mutable object keeps
// it out of React state so updates don't trigger re-renders.
export const scrollState = { progress: 0 }
