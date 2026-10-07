import { CONFIG, clamp } from '../config'
import type { GestureActivity, HandFrame, InteractionIntent, Point3, TrackedHand } from './types'

const ZOOM = { smoothing: .22, deadZone: .025, gain: 1.8, openPalmMs: 200 } as const

const distance = (a: Point3, b: Point3): number => Math.hypot(a.x - b.x, a.y - b.y)
export const palmCenter = (hand: TrackedHand): { x: number; y: number } => {
  const p = hand.landmarks
  return { x: 1 - (p[0].x * 0.4 + p[5].x * 0.3 + p[9].x * 0.3), y: p[0].y * 0.4 + p[5].y * 0.3 + p[9].y * 0.3 }
}
export const pinchRatio = (hand: TrackedHand): number => distance(hand.landmarks[4], hand.landmarks[8]) / Math.max(0.001, distance(hand.landmarks[5], hand.landmarks[17]))

export class GestureController {
  private hasPosition = false
  private smoothX = 0.5
  private smoothY = 0.5
  private rotationAnchorX = 0.5
  private rotationAnchorY = 0.5
  private pinch = false
  private smoothRatio = 0
  private zoomAnchor = 0
  private zoomScale = 1
  private openSince: number | null = null
  private lastHand = -Infinity
  private handCount = 0
  private gesture = 'None'
  private confidence = 0
  private palm: { x: number; y: number } | null = null
  private pinchDistance = 0
  private field: InteractionIntent['field'] = null
  private rotationX = 0
  private rotationY = 0
  private targetScale: number | null = null
  private activity: GestureActivity = 'NO_HAND'

  process(frame: HandFrame, currentScale: number): void {
    const now = frame.timestamp
    this.handCount = frame.hands.length
    if (!this.handCount) {
      // Pause on missing detections, but don't change modes on a single bad frame.
      if (now - this.lastHand > CONFIG.handLostMs) this.onLost(now)
      else {
        this.hasPosition = false; this.openSince = null
        this.rotationX = 0; this.rotationY = 0; this.targetScale = null
        this.field = null; this.activity = 'NO_HAND'
      }
      return
    }
    if (now - this.lastHand > CONFIG.handLostMs) this.onLost(now)
    this.lastHand = now
    const wasRotating = this.activity === 'ROTATING'
    const primary = frame.hands[0]
    const center = palmCenter(primary)
    if (!this.hasPosition) {
      this.smoothX = this.rotationAnchorX = center.x
      this.smoothY = this.rotationAnchorY = center.y
      this.hasPosition = true
      this.zoomScale = currentScale
      this.smoothRatio = this.zoomAnchor = pinchRatio(primary)
    } else {
      this.smoothX += (center.x - this.smoothX) * CONFIG.handSmoothing
      this.smoothY += (center.y - this.smoothY) * CONFIG.handSmoothing
    }
    this.palm = { x: this.smoothX, y: this.smoothY }
    this.gesture = primary.gesture
    this.confidence = primary.confidence
    this.pinchDistance = pinchRatio(primary)

    const isFist = primary.confidence >= CONFIG.gestureConfidence && primary.gesture === 'Closed_Fist'
    if (isFist) {
      // A closed hand pauses input; effects are controlled by the button instead.
      this.hasPosition = false; this.openSince = null
      this.zoomScale = currentScale
      this.smoothRatio = this.zoomAnchor = this.pinchDistance
      this.targetScale = this.pinch ? currentScale : null
      this.rotationX = 0; this.rotationY = 0
      this.activity = this.pinch ? 'ZOOMING' : 'ROTATING'
      return
    }
    const confidentOpen = primary.gesture === 'Open_Palm' && primary.confidence >= CONFIG.gestureConfidence
    if (!this.pinch && !confidentOpen && this.pinchDistance < CONFIG.pinchEnter) {
      this.pinch = true; this.zoomScale = currentScale
      this.smoothRatio = this.zoomAnchor = this.pinchDistance
      this.openSince = null
    }
    if (this.pinch) {
      const open = confidentOpen && this.pinchDistance > CONFIG.pinchExit
      if (open) {
        if (this.openSince === null) this.openSince = now
        // Freeze and rebase while opening the hand so exiting zoom never enlarges the Earth.
        this.zoomScale = currentScale
        this.smoothRatio = this.zoomAnchor = this.pinchDistance
        if (now - this.openSince >= ZOOM.openPalmMs) this.pinch = false
      } else {
        this.openSince = null
        this.smoothRatio += (this.pinchDistance - this.smoothRatio) * ZOOM.smoothing
        const delta = this.smoothRatio - this.zoomAnchor
        const move = Math.sign(delta) * Math.max(0, Math.abs(delta) - ZOOM.deadZone)
        this.zoomScale = clamp(this.zoomScale * Math.exp(move * ZOOM.gain), CONFIG.minScale, CONFIG.maxScale)
        this.zoomAnchor += move
      }
    }
    this.targetScale = this.pinch ? this.zoomScale : null
    this.field = null
    this.activity = this.pinch ? 'ZOOMING' : 'ROTATING'
    if (!this.pinch && wasRotating) {
        // Keep sub-threshold displacement so slow movement survives the jitter filter.
        const dx = this.smoothX - this.rotationAnchorX
        const dy = this.smoothY - this.rotationAnchorY
        const moveX = Math.sign(dx) * Math.max(0, Math.abs(dx) - CONFIG.handDeadZone)
        const moveY = Math.sign(dy) * Math.max(0, Math.abs(dy) - CONFIG.handDeadZone)
        this.rotationY += moveX * 3.5; this.rotationX += moveY * 2.6
        this.rotationAnchorX += moveX; this.rotationAnchorY += moveY
    } else if (!this.pinch) {
        // Rebase when rotating resumes; never replay motion from a pinch or fist.
        this.smoothX = this.rotationAnchorX = center.x
        this.smoothY = this.rotationAnchorY = center.y
        this.palm = { x: center.x, y: center.y }
        this.rotationX = 0; this.rotationY = 0
    }
    if (this.activity !== 'ROTATING') {
      this.rotationAnchorX = this.smoothX; this.rotationAnchorY = this.smoothY
      this.rotationX = 0; this.rotationY = 0
    }
  }

  onLost(now: number): void {
    this.handCount = 0; this.field = null; this.targetScale = null
    this.pinch = false
    this.openSince = null
    this.activity = 'NO_HAND'
    this.hasPosition = false
    this.rotationX = 0; this.rotationY = 0
    if (now - this.lastHand > CONFIG.handLostMs) { this.rotationX = 0; this.rotationY = 0; this.gesture = 'None'; this.confidence = 0; this.palm = null }
  }

  get hasRecentHand(): boolean { return performance.now() - this.lastHand < CONFIG.handLostMs }

  consume(): InteractionIntent {
    const intent: InteractionIntent = {
      rotationX: this.rotationX, rotationY: this.rotationY, targetScale: this.targetScale,
      explode: false, assemble: false,
      field: this.field, handCount: this.handCount, gesture: this.gesture,
      confidence: this.confidence, palm: this.palm, pinchDistance: this.pinchDistance,
      fistProgress: 0, activity: this.activity,
    }
    this.rotationX = 0; this.rotationY = 0
    return intent
  }
}
