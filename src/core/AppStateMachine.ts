export type AppState = 'BOOT' | 'CAMERA_PERMISSION' | 'IDLE' | 'HAND_DETECTED' | 'INTERACTIVE' | 'EXPLODING' | 'EXPLODED' | 'ASSEMBLING' | 'MOUSE_FALLBACK' | 'ERROR'

const allowed: Record<AppState, AppState[]> = {
  BOOT: ['IDLE', 'CAMERA_PERMISSION', 'MOUSE_FALLBACK', 'ERROR'],
  CAMERA_PERMISSION: ['IDLE', 'HAND_DETECTED', 'MOUSE_FALLBACK', 'ERROR'],
  IDLE: ['CAMERA_PERMISSION', 'HAND_DETECTED', 'MOUSE_FALLBACK', 'EXPLODING', 'ERROR'],
  HAND_DETECTED: ['INTERACTIVE', 'IDLE', 'MOUSE_FALLBACK', 'EXPLODING', 'ERROR'],
  INTERACTIVE: ['IDLE', 'EXPLODING', 'ASSEMBLING', 'MOUSE_FALLBACK', 'ERROR'],
  EXPLODING: ['EXPLODED', 'ASSEMBLING', 'MOUSE_FALLBACK', 'ERROR'],
  EXPLODED: ['ASSEMBLING', 'IDLE', 'MOUSE_FALLBACK', 'ERROR'],
  ASSEMBLING: ['INTERACTIVE', 'IDLE', 'EXPLODING', 'MOUSE_FALLBACK', 'ERROR'],
  MOUSE_FALLBACK: ['CAMERA_PERMISSION', 'HAND_DETECTED', 'EXPLODING', 'ASSEMBLING', 'IDLE', 'ERROR'],
  ERROR: [],
}

export class AppStateMachine {
  state: AppState = 'BOOT'
  transition(next: AppState): boolean {
    if (next === this.state) return true
    if (!allowed[this.state].includes(next)) return false
    this.state = next
    return true
  }
}
