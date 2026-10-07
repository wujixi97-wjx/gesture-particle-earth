// Pure timing rules shared by the HUD and render loop; no extra timers.
export const PRESENTATION = { idleMs: 15_000, controlsMs: 3500, cruiseSpeed: .035 } as const

export class PresentationController {
  immersive = false
  private lastInput: number
  constructor(now = performance.now()) { this.lastInput = now }
  interact(now: number): void { this.lastInput = now }
  toggle(now: number): void { this.immersive = !this.immersive; this.interact(now) }
  controlsHidden(now: number): boolean { return this.immersive && now - this.lastInput >= PRESENTATION.controlsMs }
  cruising(now: number, cameraBusy: boolean, idleEarth: boolean, reducedMotion: boolean, exploring = false): boolean {
    return !cameraBusy && idleEarth && !reducedMotion && !exploring && now - this.lastInput >= PRESENTATION.idleMs
  }
}
