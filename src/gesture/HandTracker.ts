import type { GestureSource, HandFrame } from './types'

export class HandTracker implements GestureSource {
  readonly video = document.createElement('video')
  private stream: MediaStream | null = null
  private worker: Worker | null = null
  private running = false
  private busy = false
  private lastSend = 0
  private raf = 0
  private onFrame: (frame: HandFrame) => void = () => {}
  private onError: (message: string) => void = () => {}
  private targetInterval = 50

  async start(onFrame: (frame: HandFrame) => void, onError: (message: string) => void, onLoading: () => void = () => {}): Promise<void> {
    this.stop()
    this.onFrame = onFrame; this.onError = onError
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera requires HTTPS or localhost')
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false })
    this.video.srcObject = this.stream
    this.video.muted = true; this.video.playsInline = true
    await this.video.play()
    onLoading()
    this.worker = new Worker(new URL('recognizer.worker.js', new URL(import.meta.env.BASE_URL, location.href)), { type: 'classic' })
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Gesture model initialization timed out')), 20_000)
      this.worker!.onerror = event => {
        window.clearTimeout(timeout)
        const message = event.message || 'Hand tracking worker failed'
        if (this.running) { this.onError(message); this.stop() }
        else reject(new Error(message))
      }
      this.worker!.onmessage = (event: MessageEvent<{ type: string; frame?: HandFrame; message?: string }>) => {
        if (event.data.type === 'ready') {
          window.clearTimeout(timeout)
          this.running = true; this.loop(); resolve()
        }
        if (event.data.type === 'result' && event.data.frame) {
          this.busy = false; this.onFrame(event.data.frame)
        }
        if (event.data.type === 'error') {
          const message = event.data.message || 'Hand tracking failed'
          if (!this.running) { window.clearTimeout(timeout); reject(new Error(message)) }
          else { this.onError(message); this.stop() }
        }
      }
      this.worker!.postMessage({ type: 'init', base: new URL(import.meta.env.BASE_URL, location.href).href })
    }).catch(error => { this.stop(); throw error })
  }

  setFrameRate(fps: number): void { this.targetInterval = 1000 / Math.max(15, Math.min(30, fps)) }

  private loop = (): void => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.loop)
    if (document.hidden || this.busy || this.video.readyState < 2) return
    const now = performance.now()
    if (now - this.lastSend < this.targetInterval) return
    this.lastSend = now; this.busy = true
    createImageBitmap(this.video).then(bitmap => {
      if (!this.worker || !this.running) { bitmap.close(); this.busy = false; return }
      this.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap])
    }).catch(error => { this.busy = false; this.onError(String(error)); this.stop() })
  }

  stop(): void {
    this.running = false; this.busy = false
    cancelAnimationFrame(this.raf)
    this.worker?.terminate(); this.worker = null
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null
    this.video.srcObject = null
  }
}
