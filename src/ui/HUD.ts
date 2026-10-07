import type { AppState } from '../core/AppStateMachine'
import type { GestureActivity, HandFrame, InteractionIntent } from '../gesture/types'
import type { QualityTier } from '../config'
import type { CityRecord } from '../data/cities'

export class HUD {
  readonly canvas: HTMLCanvasElement
  readonly enableButton: HTMLButtonElement
  readonly retryButton: HTMLButtonElement
  readonly effectButton: HTMLButtonElement
  readonly immersiveButton: HTMLButtonElement
  readonly fullscreenButton: HTMLButtonElement
  readonly closeCityButton: HTMLButtonElement
  readonly zoomSensitivityInput: HTMLInputElement
  readonly zoomSensitivityValue: HTMLOutputElement
  readonly rotationSensitivityInput: HTMLInputElement
  readonly rotationSensitivityValue: HTMLOutputElement
  private status: HTMLElement
  private statusText: HTMLElement
  private hint: HTMLElement
  private debug: HTMLElement
  private cameraButton: HTMLButtonElement
  private preview: HTMLElement
  private videoSlot: HTMLElement
  private landmarks: HTMLCanvasElement
  private debugEnabled = new URLSearchParams(location.search).get('debug') === 'true'
  private cameraShown = false
  private video: HTMLVideoElement | null = null
  private presentationKey = ''

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="experience" id="experience"></div>
      <div class="vignette"></div>
      <header class="topbar"><div class="brand"><strong>GESTURE EARTH</strong><span>PARTICLE INTERACTION SYSTEM</span></div><div class="live"><i></i> LIVE <span class="live-line"></span> 001 / 001</div></header>
      <div class="center-copy" id="center-copy"></div>
      <div class="side-readout"><span>01 / TERRA</span><div class="side-line"></div><span>51.5072° N<br>0.1276° W</span></div>
      <div class="bottom-panel"><div class="gesture-key"><span>01 <b>移动手掌旋转</b><small>MOVE HAND / ROTATE</small></span><span>02 <b>捏合后两指开合缩放</b><small>张掌退出 / PINCH · ZOOM</small></span></div><div class="button-group"><div class="sensitivity-panel"><label class="sensitivity-control" for="rotation-sensitivity"><span>ROTATE</span><div><input id="rotation-sensitivity" type="range" min="0.15" max="1.4" step="0.05" value="0.35"><output id="rotation-sensitivity-value" for="rotation-sensitivity">35%</output></div></label><label class="sensitivity-control" for="zoom-sensitivity"><span>ZOOM</span><div><input id="zoom-sensitivity" type="range" min="0.2" max="1.4" step="0.05" value="0.5"><output id="zoom-sensitivity-value" for="zoom-sensitivity">50%</output></div></label></div><button id="toggle-effect" class="secondary" data-effect="idle" disabled>爆炸</button><button id="enable-camera" class="primary">ENABLE GESTURE CONTROL <span>↗</span></button><button id="retry-camera" class="secondary hidden">RETRY CAMERA</button></div></div>
      <div class="tracking"><span>HAND TRACKING</span><strong id="tracking-status"><i></i> STANDBY</strong><small id="tracking-message">MOUSE / TOUCH READY</small><button id="debug-camera" class="text-button">DEBUG CAMERA</button></div>
      <div id="camera-preview" class="camera-preview hidden"><div id="video-slot"></div><canvas id="landmark-canvas"></canvas><span>LOCAL VISION / NO UPLOAD</span></div>
      <div id="debug-panel" class="debug-panel hidden"></div>
      <div id="error-banner" class="error-banner hidden" role="status"></div>
      <div class="footer-note">EARTH / IN MOTION <span>·</span> 2026</div>
      <div class="view-controls"><button id="toggle-immersive" class="secondary" aria-pressed="false">沉浸模式</button><button id="toggle-fullscreen" class="secondary">全屏</button></div>
      <aside id="city-info" class="city-info hidden" aria-label="城市信息"><strong id="city-name"></strong><span id="city-country"></span><span id="city-coordinates"></span><button id="close-city" class="text-button">关闭 · 恢复自由操作</button></aside>
    `
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'webgl'
    root.querySelector('#experience')!.append(this.canvas)
    this.enableButton = root.querySelector('#enable-camera')!
    this.retryButton = root.querySelector('#retry-camera')!
    this.effectButton = root.querySelector('#toggle-effect')!
    this.immersiveButton = root.querySelector('#toggle-immersive')!
    this.fullscreenButton = root.querySelector('#toggle-fullscreen')!
    this.closeCityButton = root.querySelector('#close-city')!
    this.zoomSensitivityInput = root.querySelector('#zoom-sensitivity')!
    this.zoomSensitivityValue = root.querySelector('#zoom-sensitivity-value')!
    this.rotationSensitivityInput = root.querySelector('#rotation-sensitivity')!
    this.rotationSensitivityValue = root.querySelector('#rotation-sensitivity-value')!
    this.status = root.querySelector('#tracking-status')!
    this.statusText = root.querySelector('#tracking-message')!
    this.hint = root.querySelector('#center-copy')!
    this.debug = root.querySelector('#debug-panel')!
    this.cameraButton = root.querySelector('#debug-camera')!
    this.preview = root.querySelector('#camera-preview')!
    this.videoSlot = root.querySelector('#video-slot')!
    this.landmarks = root.querySelector('#landmark-canvas')!
    this.setTracking('standby', 'MOUSE / TOUCH READY')
    if (this.debugEnabled) this.debug.classList.remove('hidden')
    this.cameraButton.onclick = () => {
      this.cameraShown = !this.cameraShown
      this.preview.classList.toggle('hidden', !this.cameraShown)
      this.cameraButton.classList.toggle('selected', this.cameraShown)
    }
  }

  bindVideo(video: HTMLVideoElement): void {
    this.video = video
    video.classList.add('preview-video')
    this.videoSlot.append(video)
    this.landmarks.width = 320; this.landmarks.height = 240
  }

  setTracking(status: 'standby' | 'loading' | 'active' | 'fallback', message: string): void {
    const names = { standby: '摄像头未开启', loading: '加载中', active: '摄像头已开启', fallback: '摄像头不可用' }
    this.status.innerHTML = `<i></i> ${names[status]}`
    this.status.dataset.status = status
    this.statusText.textContent = message
    this.enableButton.classList.toggle('hidden', status === 'active' || status === 'loading')
    this.retryButton.classList.toggle('hidden', status !== 'fallback')
  }

  showError(message: string): void {
    const banner = document.querySelector<HTMLElement>('#error-banner')!
    banner.textContent = message
    banner.classList.remove('hidden')
    window.setTimeout(() => banner.classList.add('hidden'), 6500)
  }

  setReady(): void { document.body.classList.add('ready') }
  showCity(city: CityRecord | null): void {
    const panel = document.querySelector<HTMLElement>('#city-info')!
    panel.classList.toggle('hidden', !city)
    if (!city) return
    panel.querySelector('#city-name')!.textContent = city.name
    panel.querySelector('#city-country')!.textContent = city.country ? `国家代码 · ${city.country}` : '国家信息未提供'
    panel.querySelector('#city-coordinates')!.textContent = `${Math.abs(city.lat).toFixed(4)}° ${city.lat < 0 ? 'S' : 'N'} / ${Math.abs(city.lon).toFixed(4)}° ${city.lon < 0 ? 'W' : 'E'}`
  }
  setPresentation(immersive: boolean, hidden: boolean, cruising: boolean): void {
    const key = `${immersive}/${hidden}/${cruising}`
    if (key === this.presentationKey) return
    this.presentationKey = key
    document.body.classList.toggle('immersive', immersive)
    document.body.classList.toggle('controls-hidden', hidden)
    document.body.dataset.cruising = String(cruising)
    this.immersiveButton.textContent = immersive ? '退出沉浸' : '沉浸模式'
    this.immersiveButton.setAttribute('aria-pressed', String(immersive))
  }
  setInteracting(active: boolean): void { this.hint.classList.toggle('vanished', active) }

  setGestureFeedback(activity: GestureActivity | 'EXPLODING' | 'ASSEMBLING'): void {
    if (this.status.dataset.status !== 'active') return
    this.statusText.textContent = { ROTATING: '旋转 · 移动手掌', ZOOMING: '缩放 · 两指开合（张掌退出）', NO_HAND: '未识别到手', EXPLODING: '爆炸中', ASSEMBLING: '聚合中' }[activity]
  }

  setEffectState(mode: 'idle' | 'exploding' | 'exploded' | 'assembling'): void {
    this.effectButton.disabled = mode === 'exploding' || mode === 'assembling'
    this.effectButton.dataset.effect = mode
    const text = { idle: '爆炸', exploding: '爆炸中…', exploded: '聚合', assembling: '聚合中…' }[mode]
    if (this.effectButton.textContent !== text) this.effectButton.textContent = text
  }

  drawHands(frame: HandFrame): void {
    if (!this.cameraShown) return
    const context = this.landmarks.getContext('2d')!
    context.clearRect(0, 0, 320, 240)
    context.fillStyle = '#d4d4cf'
    context.strokeStyle = '#969792'
    context.lineWidth = 1
    const bones = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]]
    for (const hand of frame.hands) {
      for (const [a,b] of bones) {
        context.beginPath(); context.moveTo(hand.landmarks[a].x * 320, hand.landmarks[a].y * 240)
        context.lineTo(hand.landmarks[b].x * 320, hand.landmarks[b].y * 240); context.stroke()
      }
      for (const point of hand.landmarks) {
        context.beginPath(); context.arc(point.x * 320, point.y * 240, 2, 0, Math.PI * 2); context.fill()
      }
    }
  }

  updateDebug(fps: number, tier: QualityTier, count: number, state: AppState, intent: InteractionIntent, rotation: { x: number; y: number }, scale: number): void {
    if (!this.debugEnabled) return
    this.debug.textContent = `FPS             ${fps.toFixed(0)}\nPARTICLES       ${count.toLocaleString()}\nQUALITY         ${tier.toUpperCase()}\nSTATE           ${state}\nACTIVITY        ${intent.activity}\nGESTURE         ${intent.gesture}\nCONFIDENCE      ${intent.confidence.toFixed(2)}\nPALM            ${intent.palm ? `${intent.palm.x.toFixed(2)}, ${intent.palm.y.toFixed(2)}` : '—'}\nROTATION        ${rotation.x.toFixed(3)}, ${rotation.y.toFixed(3)}\nSCALE           ${scale.toFixed(3)}\nPINCH DISTANCE  ${intent.pinchDistance.toFixed(2)}\nHANDS           ${intent.handCount}`
  }
}
