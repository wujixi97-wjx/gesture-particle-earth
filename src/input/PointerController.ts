import { CONFIG, clamp } from '../config'

export const applyZoomSensitivity = (ratio: number, sensitivity: number): number =>
  Math.pow(Math.max(0.001, ratio), clamp(sensitivity, 0.2, 1.4))

export const applyRotationSensitivity = (delta: number, sensitivity: number): number =>
  delta * clamp(sensitivity, 0.15, 1.4)

export class PointerController {
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDistance = 0
  private pinchScale = 1
  constructor(
    private element: HTMLElement,
    private currentScale: () => number,
    private zoomSensitivity: () => number,
    private rotationSensitivity: () => number,
    private onRotate: (x: number, y: number) => void,
    private onZoom: (scale: number) => void,
    private onToggle: () => void,
  ) {
    element.addEventListener('pointerdown', this.down)
    element.addEventListener('pointermove', this.move)
    element.addEventListener('pointerup', this.up)
    element.addEventListener('pointercancel', this.up)
    element.addEventListener('wheel', this.wheel, { passive: false })
    element.addEventListener('dblclick', this.doubleClick)
  }
  private down = (event: PointerEvent): void => {
    this.element.setPointerCapture(event.pointerId)
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
      this.pinchScale = this.currentScale()
    }
  }
  private move = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId)
    if (!previous) return
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const next = Math.hypot(a.x - b.x, a.y - b.y)
      const ratio = next / Math.max(10, this.pinchDistance)
      this.onZoom(clamp(this.pinchScale * applyZoomSensitivity(ratio, this.zoomSensitivity()), CONFIG.minScale, CONFIG.maxScale))
    } else {
      const sensitivity = this.rotationSensitivity()
      this.onRotate(
        applyRotationSensitivity((event.clientY - previous.y) / window.innerHeight * 3.2, sensitivity),
        applyRotationSensitivity((event.clientX - previous.x) / window.innerWidth * 4.2, sensitivity),
      )
    }
  }
  private up = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId)
    if (this.pointers.size === 1) this.pinchDistance = 0
  }
  private wheel = (event: WheelEvent): void => {
    event.preventDefault()
    this.onZoom(clamp(this.currentScale() * Math.exp(-event.deltaY * 0.001 * this.zoomSensitivity()), CONFIG.minScale, CONFIG.maxScale))
  }
  private doubleClick = (event: MouseEvent): void => { event.preventDefault(); this.onToggle() }
  dispose(): void {
    this.element.removeEventListener('pointerdown', this.down)
    this.element.removeEventListener('pointermove', this.move)
    this.element.removeEventListener('pointerup', this.up)
    this.element.removeEventListener('pointercancel', this.up)
    this.element.removeEventListener('wheel', this.wheel)
    this.element.removeEventListener('dblclick', this.doubleClick)
  }
}
