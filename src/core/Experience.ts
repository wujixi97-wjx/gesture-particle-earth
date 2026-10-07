import * as THREE from 'three'
import { CONFIG, QUALITY, clamp } from '../config'
import { CityMarkers } from '../earth/CityMarkers'
import { cityFocusRotation } from '../earth/cityMath'
import type { CityRecord } from '../data/cities'
import { ParticleEarth } from '../earth/ParticleEarth'
import { StarField } from '../effects/StarField'
import { GestureController } from '../gesture/GestureController'
import { HandTracker } from '../gesture/HandTracker'
import type { HandFrame } from '../gesture/types'
import { PointerController } from '../input/PointerController'
import { HUD } from '../ui/HUD'
import { AppStateMachine } from './AppStateMachine'
import { PerformanceManager } from './PerformanceManager'
import { PRESENTATION, PresentationController } from './PresentationController'

export class Experience {
  private hud: HUD
  private machine = new AppStateMachine()
  private performance = new PerformanceManager()
  private gestures = new GestureController()
  private tracker = new HandTracker()
  private earth = new ParticleEarth()
  private cities: CityMarkers
  private stars = new StarField()
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  private renderer: THREE.WebGLRenderer | null = null
  private pointer: PointerController | null = null
  private raf = 0
  private lastFrame = 0
  private startTime = performance.now()
  private scale = 1
  private targetScale = 1
  private zoomSensitivity = 0.5
  private rotationSensitivity = 0.35
  private rotationVelocityX = 0
  private rotationVelocityY = 0
  private lastHandFrame = 0
  private lastTrackingResult = 0
  private cameraActive = false
  private cameraLoading = false
  private presentation = new PresentationController()
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private focusTarget: { x: number; y: number } | null = null
  private exploring = false
  private pickStart: { x: number; y: number; id: number } | null = null
  private raycaster = new THREE.Raycaster()
  private screenPoint = new THREE.Vector2()
  private worldPoint = new THREE.Vector3()
  private fieldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

  constructor(root: HTMLElement) {
    this.hud = new HUD(root)
    this.cities = new CityMarkers(root, this.earth.group, this.selectCity)
    this.earth.group.add(this.stars.orbit, this.stars.asteroidRing)
    const storedSensitivity = Number(localStorage.getItem('earth-zoom-sensitivity'))
    if (Number.isFinite(storedSensitivity) && storedSensitivity >= 0.2 && storedSensitivity <= 1.4) {
      this.zoomSensitivity = storedSensitivity
    }
    this.hud.zoomSensitivityInput.value = String(this.zoomSensitivity)
    this.hud.zoomSensitivityValue.value = `${Math.round(this.zoomSensitivity * 100)}%`
    this.hud.zoomSensitivityInput.oninput = () => {
      this.zoomSensitivity = Number(this.hud.zoomSensitivityInput.value)
      this.hud.zoomSensitivityValue.value = `${Math.round(this.zoomSensitivity * 100)}%`
      localStorage.setItem('earth-zoom-sensitivity', String(this.zoomSensitivity))
    }
    const storedRotationSensitivity = Number(localStorage.getItem('earth-rotation-sensitivity'))
    if (Number.isFinite(storedRotationSensitivity) && storedRotationSensitivity >= 0.15 && storedRotationSensitivity <= 1.4) {
      this.rotationSensitivity = storedRotationSensitivity
    }
    this.hud.rotationSensitivityInput.value = String(this.rotationSensitivity)
    this.hud.rotationSensitivityValue.value = `${Math.round(this.rotationSensitivity * 100)}%`
    this.hud.rotationSensitivityInput.oninput = () => {
      this.rotationSensitivity = Number(this.hud.rotationSensitivityInput.value)
      this.hud.rotationSensitivityValue.value = `${Math.round(this.rotationSensitivity * 100)}%`
      localStorage.setItem('earth-rotation-sensitivity', String(this.rotationSensitivity))
    }
  }

  async start(): Promise<void> {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.hud.canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })
      this.renderer.setClearColor(0x000000, 1)
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.camera.position.set(0, 0, 7.5)
      this.scene.add(this.earth.group, this.stars.group)
      await this.earth.loadMask()
      this.setQuality()
      this.resize()
      window.addEventListener('resize', this.resize)
      this.pointer = new PointerController(this.hud.canvas, () => this.targetScale, () => this.zoomSensitivity, () => this.rotationSensitivity,
        (x, y) => { this.rotationVelocityX += x; this.rotationVelocityY += y },
        scale => { this.targetScale = scale },
        () => this.earth.effectState === 'idle' ? this.triggerExplosion() : this.triggerAssemble())
      this.hud.enableButton.onclick = () => void this.enableCamera()
      this.hud.retryButton.onclick = () => void this.enableCamera()
      this.hud.effectButton.onclick = () => {
        if (this.earth.effectState === 'idle') this.triggerExplosion()
        else if (this.earth.effectState === 'exploded') this.triggerAssemble()
      }
      this.hud.setEffectState(this.earth.effectState)
      this.hud.immersiveButton.onclick = () => this.presentation.toggle(performance.now())
      this.hud.fullscreenButton.onclick = () => void this.toggleFullscreen()
      window.addEventListener('pointerdown', this.userActivity, true)
      window.addEventListener('pointermove', this.userActivity, true)
      window.addEventListener('wheel', this.userActivity, { passive: true, capture: true })
      window.addEventListener('keydown', this.userActivity, true)
      window.addEventListener('input', this.userActivity, true)
      document.addEventListener('fullscreenchange', this.fullscreenChanged)
      this.hud.closeCityButton.onclick = () => {
        this.focusTarget = null; this.exploring = false; this.hud.showCity(null)
        this.userActivity()
      }
      this.hud.canvas.addEventListener('pointerdown', this.pickDown)
      this.hud.canvas.addEventListener('pointerup', this.pickUp)
      this.hud.canvas.addEventListener('pointercancel', this.pickCancel)
      this.machine.transition('IDLE')
      this.raf = requestAnimationFrame(this.tick)
      window.setTimeout(() => this.hud.setReady(), 1700)
    } catch (error) {
      this.machine.transition('ERROR')
      this.showWebGLFallback(error)
    }
  }

  private showWebGLFallback(error: unknown): void {
    this.renderer?.dispose(); this.renderer = null
    this.hud.canvas.classList.add('hidden')
    const fallback = document.createElement('div')
    fallback.className = 'css-earth'
    fallback.innerHTML = '<div class="css-earth-orb"></div><p>WEBGL UNAVAILABLE · TRY A CURRENT BROWSER</p>'
    this.hud.canvas.parentElement?.append(fallback)
    this.hud.setTracking('fallback', 'GRAPHICS UNAVAILABLE')
    this.hud.showError(`WebGL could not start: ${String(error)}`)
    this.hud.setReady()
  }

  private userActivity = (): void => {
    this.presentation.interact(performance.now())
    this.focusTarget = null
  }

  private selectCity = (city: CityRecord): void => {
    if (this.earth.effectState !== 'idle') return
    this.presentation.interact(performance.now())
    this.rotationVelocityX = 0; this.rotationVelocityY = 0
    this.focusTarget = cityFocusRotation(city.lat, city.lon, this.earth.group.rotation.y)
    this.exploring = true
    this.hud.showCity(city)
  }

  private pickDown = (event: PointerEvent): void => {
    this.pickStart = event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null
  }
  private pickCancel = (): void => { this.pickStart = null }
  private pickUp = (event: PointerEvent): void => {
    const start = this.pickStart
    this.pickStart = null
    if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return
    const city = this.cities.pick(event.clientX, event.clientY, this.camera, this.earth.group)
    if (city) this.selectCity(city)
  }

  private fullscreenChanged = (): void => {
    this.hud.fullscreenButton.textContent = document.fullscreenElement ? '退出全屏' : '全屏'
    this.userActivity()
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen()
      else this.hud.showError('此浏览器不支持全屏；仍可使用沉浸模式。')
    } catch { this.hud.showError('无法进入全屏；仍可使用沉浸模式。') }
  }

  private async enableCamera(): Promise<void> {
    if (this.cameraActive || this.cameraLoading) return
    this.cameraLoading = true
    this.machine.transition('CAMERA_PERMISSION')
    this.hud.setTracking('loading', '等待摄像头授权 · 视频仅本地处理')
    try {
      await this.tracker.start(this.onHandFrame, this.cameraError,
        () => this.hud.setTracking('loading', '识别模型加载中 · 请稍候'))
      this.cameraActive = true
      this.lastTrackingResult = performance.now()
      this.hud.bindVideo(this.tracker.video)
      this.hud.setTracking('active', 'PROCESSING ON DEVICE')
      if (this.machine.state === 'CAMERA_PERMISSION') this.machine.transition('IDLE')
    } catch (error) { this.cameraError(String(error)) }
    finally { this.cameraLoading = false }
  }

  private cameraError = (message: string): void => {
    this.tracker.stop()
    this.cameraActive = false
    this.gestures.onLost(performance.now())
    this.lastHandFrame = 0
    this.machine.transition('MOUSE_FALLBACK')
    this.hud.setTracking('fallback', 'MOUSE / TOUCH ACTIVE')
    this.hud.showError(`Camera unavailable: ${message}. Mouse and touch remain available.`)
  }

  private onHandFrame = (frame: HandFrame): void => {
    // Worker timestamps describe capture, not delivery. Fresh results must not expire
    // immediately just because CPU inference took longer than a render frame.
    const receivedAt = performance.now()
    this.lastTrackingResult = receivedAt
    this.gestures.process({ ...frame, timestamp: receivedAt }, this.targetScale)
    this.hud.drawHands(frame)
    const hasHand = frame.hands.length > 0
    if (hasHand) this.userActivity()
    if (hasHand) this.lastHandFrame = receivedAt
    if (hasHand) {
      if (this.machine.state === 'IDLE' || this.machine.state === 'MOUSE_FALLBACK') this.machine.transition('HAND_DETECTED')
      if (this.machine.state === 'HAND_DETECTED') this.machine.transition('INTERACTIVE')
    } else if (this.machine.state === 'INTERACTIVE' && performance.now() - this.lastHandFrame > CONFIG.handLostMs) {
      this.machine.transition('IDLE')
    }
    this.hud.setInteracting(hasHand || performance.now() - this.lastHandFrame < CONFIG.handLostMs)
  }

  private triggerExplosion(): void {
    if (this.earth.effectState === 'exploding' || this.earth.effectState === 'exploded') return
    this.earth.explode(performance.now())
    this.focusTarget = null; this.exploring = false; this.hud.showCity(null)
    this.hud.setEffectState(this.earth.effectState)
    this.machine.transition('EXPLODING')
  }

  private triggerAssemble(): void {
    if (this.earth.effectState === 'idle' || this.earth.effectState === 'assembling') return
    this.earth.assemble(performance.now())
    this.hud.setEffectState(this.earth.effectState)
    this.machine.transition('ASSEMBLING')
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick)
    if (!this.renderer) return
    if (document.hidden && now - this.lastFrame < 120) return
    const dt = clamp((now - (this.lastFrame || now)) / 1000, 0, 0.05)
    this.lastFrame = now
    if (this.performance.update(now)) this.setQuality()
    this.tracker.setFrameRate(this.performance.tier === 'low' ? 15 : this.performance.tier === 'medium' ? 20 : 30)

    // Empty detection results still pause input immediately in GestureController.
    // Only silence from the worker uses the configured tracking timeout.
    if (this.cameraActive && now - this.lastTrackingResult > CONFIG.handLostMs) this.gestures.onLost(now)
    const intent = this.gestures.consume()
    if (intent.explode) this.triggerExplosion()
    if (intent.assemble) this.triggerAssemble()
    if (intent.targetScale !== null) this.targetScale = intent.targetScale
    this.scale += (this.targetScale - this.scale) * Math.min(1, dt * 8)
    this.earth.group.scale.setScalar(this.scale)
    this.rotationVelocityX += intent.rotationX
    this.rotationVelocityY += intent.rotationY
    this.earth.group.rotation.x = clamp(this.earth.group.rotation.x + this.rotationVelocityX, -1.1, 1.1)
    this.earth.group.rotation.y += this.rotationVelocityY
    this.rotationVelocityX *= Math.exp(-dt * 7)
    this.rotationVelocityY *= Math.exp(-dt * 7)
    const cruising = this.presentation.cruising(now, this.cameraActive || this.cameraLoading,
      this.earth.effectState === 'idle', this.reducedMotion.matches, this.exploring)
    if (cruising && !document.hidden) this.earth.group.rotation.y += PRESENTATION.cruiseSpeed * dt
    if (this.focusTarget && !document.hidden) {
      const factor = this.reducedMotion.matches ? 1 : Math.min(1, dt * 4)
      const rotation = this.earth.group.rotation
      rotation.x += (this.focusTarget.x - rotation.x) * factor
      rotation.y += (this.focusTarget.y - rotation.y) * factor
      if (Math.abs(rotation.x - this.focusTarget.x) + Math.abs(rotation.y - this.focusTarget.y) < .001) this.focusTarget = null
    }
    const focusing = String(this.focusTarget !== null)
    if (document.body.dataset.focusing !== focusing) document.body.dataset.focusing = focusing
    this.hud.setPresentation(this.presentation.immersive, this.presentation.controlsHidden(now), cruising)

    let fieldActive = false
    if (intent.field) {
      this.screenPoint.set(intent.field.x * 2 - 1, 1 - intent.field.y * 2)
      this.raycaster.setFromCamera(this.screenPoint, this.camera)
      if (this.raycaster.ray.intersectPlane(this.fieldPlane, this.worldPoint)) {
        if (this.worldPoint.length() < CONFIG.radius * this.scale * 1.18) {
          this.earth.setField(this.worldPoint, CONFIG.gravityStrength)
          fieldActive = true
        }
      }
    }
    if (!fieldActive) this.earth.setField(null, 0)
    this.earth.update(now, dt)
    this.cities.update(now, this.camera, this.earth.group,
      this.earth.effectState === 'idle' && this.earth.uniforms.uIntro.value > 0.98)
    this.stars.setEarthTransform(this.earth.group.position, this.scale)
    this.stars.update(now - this.startTime, this.earth.effectState)
    if (this.earth.effectState === 'exploded' && this.machine.state === 'EXPLODING') this.machine.transition('EXPLODED')
    if (this.earth.effectState === 'idle' && this.machine.state === 'ASSEMBLING') this.machine.transition(this.cameraActive ? 'INTERACTIVE' : 'MOUSE_FALLBACK')
    if (this.cameraActive && now - this.lastHandFrame > CONFIG.handLostMs && this.machine.state === 'INTERACTIVE') this.machine.transition('IDLE')
    const feedback = this.machine.state === 'EXPLODING' ? 'EXPLODING' : this.machine.state === 'ASSEMBLING' ? 'ASSEMBLING' : intent.activity
    this.hud.setGestureFeedback(feedback)
    this.hud.setEffectState(this.earth.effectState)
    this.hud.updateDebug(this.performance.fps, this.performance.tier, QUALITY[this.performance.tier].particles, this.machine.state, intent, this.earth.group.rotation, this.scale)
    this.renderer.render(this.scene, this.camera)
  }

  private setQuality(): void {
    if (!this.renderer) return
    const dpr = Math.min(devicePixelRatio || 1, this.performance.settings.dpr)
    this.renderer.setPixelRatio(dpr)
    this.earth.setQuality(this.performance.tier, dpr)
    this.cities.setPointScale(dpr)
    this.stars.setQuality(this.performance.tier)
    this.resize()
  }

  private resize = (): void => {
    if (!this.renderer) return
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight)
    this.camera.aspect = width / height
    this.earth.group.position.x = width > 900 ? 0.25 : 0
    this.camera.position.z = width < 650 ? 12.2 : width < 1000 ? 8.7 : 7.5
    this.camera.updateProjectionMatrix()
    this.stars.setViewport(width, height, this.camera.position.z)
    this.renderer.setSize(width, height, false)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('pointerdown', this.userActivity, true)
    window.removeEventListener('pointermove', this.userActivity, true)
    window.removeEventListener('wheel', this.userActivity, true)
    window.removeEventListener('keydown', this.userActivity, true)
    window.removeEventListener('input', this.userActivity, true)
    document.removeEventListener('fullscreenchange', this.fullscreenChanged)
    this.hud.canvas.removeEventListener('pointerdown', this.pickDown)
    this.hud.canvas.removeEventListener('pointerup', this.pickUp)
    this.hud.canvas.removeEventListener('pointercancel', this.pickCancel)
    document.body.classList.remove('immersive', 'controls-hidden')
    this.pointer?.dispose(); this.tracker.stop(); this.cities.dispose(); this.earth.dispose(); this.stars.dispose(); this.renderer?.dispose()
  }
}
