export interface Point3 { x: number; y: number; z: number }
export interface TrackedHand {
  handedness: 'Left' | 'Right' | 'Unknown'
  landmarks: Point3[]
  worldLandmarks: Point3[]
  gesture: string
  confidence: number
}
export interface HandFrame { timestamp: number; hands: TrackedHand[] }
export type EffectMode = 'assembled' | 'dispersed' | 'busy'
export type GestureActivity = 'ROTATING' | 'ZOOMING' | 'NO_HAND'
export interface GestureSource {
  start(onFrame: (frame: HandFrame) => void, onError: (message: string) => void): Promise<void>
  stop(): void
}
export interface InteractionIntent {
  rotationX: number
  rotationY: number
  targetScale: number | null
  explode: boolean
  assemble: boolean
  field: { x: number; y: number; strength: number } | null
  handCount: number
  gesture: string
  confidence: number
  palm: { x: number; y: number } | null
  pinchDistance: number
  fistProgress: number
  activity: GestureActivity
}
