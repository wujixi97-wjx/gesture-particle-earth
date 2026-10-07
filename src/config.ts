export type QualityTier = 'high' | 'medium' | 'low'

// One restrained light shared by the land shader and city cores.
export const EARTH_LIGHT = {
  direction: [-0.62, 0.38, 0.68] as const,
  twilight: .26, night: .44, day: 1.08,
} as const

export const QUALITY = {
  high: { particles: 100_000, dpr: 2, stars: 1100, dust: true },
  medium: { particles: 55_000, dpr: 1.5, stars: 700, dust: true },
  low: { particles: 28_000, dpr: 1.25, stars: 400, dust: false },
} as const

export const CONFIG = {
  radius: 1.65,
  rotationSpeed: 0.055,
  minScale: 0.65,
  maxScale: 2.2,
  handSmoothing: 0.18,
  handDeadZone: 0.008,
  pinchEnter: 0.32,
  pinchExit: 0.42,
  gestureConfidence: 0.65,
  fistHoldMs: 500,
  gestureCooldownMs: 800,
  handLostMs: 1500,
  explosionMs: 1200,
  assembleMs: 1600,
  gravityRadius: 0.62,
  gravityStrength: 0.22,
  lowFps: 45,
  highFps: 57,
  degradeMs: 4000,
  upgradeMs: 12000,
  qualityCooldownMs: 15000,
} as const

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
export const smoothstep = (min: number, max: number, value: number): number => {
  const t = clamp((value - min) / (max - min), 0, 1)
  return t * t * (3 - 2 * t)
}
