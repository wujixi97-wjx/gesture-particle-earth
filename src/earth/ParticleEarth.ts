import * as THREE from 'three'
import { CONFIG, EARTH_LIGHT, QUALITY, type QualityTier, clamp } from '../config'
import vertexShader from '../shaders/earth.vert.glsl?raw'
import fragmentShader from '../shaders/earth.frag.glsl?raw'
import atmosphereVertex from '../shaders/atmosphere.vert.glsl?raw'
import atmosphereFragment from '../shaders/atmosphere.frag.glsl?raw'

const COUNT = QUALITY.high.particles

// Centralized visual controls. These change distribution and shading only;
// particle counts and the single Points draw call remain unchanged.
const VISUAL = {
  landAcceptance: 0.97,
  antarcticaAcceptance: 0.20,
  oceanAcceptance: 0.18,
  coastSampleRadiusPx: 2,
  landSize: 1.08,
  oceanSize: 0.80,
  coastSizeBoost: 0.045,
  landAlpha: 0.96,
  oceanAlpha: 0.19,
  landBrightness: 1.18,
  oceanBrightness: 0.78,
  coastBrightness: 1.20,
  sideLight: 0.62,
  backLight: 0.12,
  occluderRadius: 0.988,
} as const

export class ParticleEarth {
  readonly group = new THREE.Group()
  readonly uniforms = {
    uTime: { value: 0 }, uIntro: { value: 0 }, uDisperse: { value: 0 },
    uSwirl: { value: 0 }, uPointScale: { value: 1.6 }, uFlash: { value: 0 },
    uField: { value: new THREE.Vector3(999, 999, 999) },
    uFieldStrength: { value: 0 }, uFieldRadius: { value: CONFIG.gravityRadius },
    uLandAlpha: { value: VISUAL.landAlpha }, uOceanAlpha: { value: VISUAL.oceanAlpha },
    uLandBrightness: { value: VISUAL.landBrightness }, uOceanBrightness: { value: VISUAL.oceanBrightness },
    uCoastBrightness: { value: VISUAL.coastBrightness },
    uSideLight: { value: VISUAL.sideLight }, uBackLight: { value: VISUAL.backLight },
    uSunDirection: { value: new THREE.Vector3(...EARTH_LIGHT.direction).normalize() },
    uTwilight: { value: EARTH_LIGHT.twilight },
    uNightLight: { value: EARTH_LIGHT.night }, uDayLight: { value: EARTH_LIGHT.day },
  }
  private geometry = new THREE.BufferGeometry()
  private material = new THREE.ShaderMaterial({
    uniforms: this.uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending,
  })
  private points = new THREE.Points(this.geometry, this.material)
  private occluder: THREE.Mesh
  private atmosphere: THREE.Mesh
  private ring: THREE.Mesh
  private ringMaterial: THREE.MeshBasicMaterial
  private burstStart = -1
  private assembleStart = -1
  private burstStartValue = 0
  private assembleStartValue = 1
  private localField = new THREE.Vector3()
  private inverse = new THREE.Matrix4()
  private flashStart = -1
  private mode: 'idle' | 'exploding' | 'exploded' | 'assembling' = 'idle'

  constructor() {
    this.points.frustumCulled = false
    // A nearly black inner sphere writes depth before transparent points render.
    // It prevents far-side particles and cities from shining through the globe.
    this.occluder = new THREE.Mesh(
      new THREE.SphereGeometry(CONFIG.radius * VISUAL.occluderRadius, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x010101, depthWrite: true, colorWrite: true, toneMapped: false }),
    )
    this.group.add(this.occluder)
    this.group.add(this.points)
    const atmosphere = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uFlash: this.uniforms.uFlash },
      vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment,
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    })
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.radius * 1.055, 48, 32), atmosphere)
    this.group.add(this.atmosphere)
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0x2c7f98, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    this.ring = new THREE.Mesh(new THREE.RingGeometry(CONFIG.radius * 1.05, CONFIG.radius * 1.08, 96), this.ringMaterial)
    this.group.add(this.ring)
    this.group.rotation.y = -1.75
  }

  async loadMask(): Promise<void> {
    const image = new Image()
    image.src = `${import.meta.env.BASE_URL}world-mask.svg`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 1440; canvas.height = 720
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D unavailable')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    this.generate(pixels, canvas.width, canvas.height)
  }

  private generate(pixels: Uint8ClampedArray, width: number, height: number): void {
    const positions = new Float32Array(COUNT * 3)
    const spawn = new Float32Array(COUNT * 3)
    const velocity = new Float32Array(COUNT * 3)
    const kind = new Float32Array(COUNT)
    const coast = new Float32Array(COUNT)
    const size = new Float32Array(COUNT)
    const seed = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      let lon = 0, y = 0, land = false, px = 0, py = 0
      for (let attempt = 0; attempt < 50; attempt++) {
        lon = Math.random() * 2 - 1
        y = Math.random() * 2 - 1
        px = Math.min(width - 1, Math.max(0, Math.floor((lon + 1) * 0.5 * width)))
        py = Math.min(height - 1, Math.max(0, Math.floor((1 - y) * 0.5 * height)))
        land = pixels[(py * width + px) * 4] > 130
        const acceptance = land
          ? (y < -0.7 ? VISUAL.antarcticaAcceptance : VISUAL.landAcceptance)
          : VISUAL.oceanAcceptance
        if (Math.random() < acceptance) break
      }
      const angle = lon * Math.PI
      const ring = Math.sqrt(1 - y * y)
      const nx = Math.sin(angle) * ring, ny = y, nz = Math.cos(angle) * ring
      const offset = i * 3
      const radius = CONFIG.radius * (1 + (Math.random() - 0.5) * 0.012)
      positions[offset] = nx * radius; positions[offset + 1] = ny * radius; positions[offset + 2] = nz * radius
      const far = 4.5 + Math.random() * 3.5
      spawn[offset] = (Math.random() - 0.5) * far * 2
      spawn[offset + 1] = (Math.random() - 0.5) * far * 1.4
      spawn[offset + 2] = (Math.random() - 0.5) * far
      const force = 0.55 + Math.random() * 1.35
      velocity[offset] = (nx + (Math.random() - 0.5) * 0.5) * force
      velocity[offset + 1] = (ny + (Math.random() - 0.5) * 0.5) * force
      velocity[offset + 2] = (nz + (Math.random() - 0.5) * 0.5) * force
      kind[i] = land ? 1 : 0
      if (land) {
        const radius = VISUAL.coastSampleRadiusPx
        const west = pixels[(py * width + Math.max(0, px - radius)) * 4] < 130 ? 1 : 0
        const east = pixels[(py * width + Math.min(width - 1, px + radius)) * 4] < 130 ? 1 : 0
        const north = pixels[(Math.max(0, py - radius) * width + px) * 4] < 130 ? 1 : 0
        const south = pixels[(Math.min(height - 1, py + radius) * width + px) * 4] < 130 ? 1 : 0
        coast[i] = (west + east + north + south) * 0.25
      }
      size[i] = land
        ? VISUAL.landSize + coast[i] * VISUAL.coastSizeBoost
        : VISUAL.oceanSize
      seed[i] = Math.random()
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute('aSpawn', new THREE.BufferAttribute(spawn, 3))
    this.geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocity, 3))
    this.geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    this.geometry.setAttribute('aCoast', new THREE.BufferAttribute(coast, 1))
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    this.geometry.setDrawRange(0, COUNT)
  }

  setQuality(tier: QualityTier, dpr: number): void {
    this.geometry.setDrawRange(0, QUALITY[tier].particles)
    this.uniforms.uPointScale.value = 1.6 * Math.min(2, dpr)
  }

  setField(world: THREE.Vector3 | null, strength: number): void {
    if (world) {
      this.group.updateWorldMatrix(true, false)
      this.inverse.copy(this.group.matrixWorld).invert()
      this.localField.copy(world).applyMatrix4(this.inverse)
      this.uniforms.uField.value.copy(this.localField)
    }
    this.uniforms.uFieldStrength.value += ((world ? strength : 0) - this.uniforms.uFieldStrength.value) * 0.16
  }

  explode(now: number): void {
    this.burstStartValue = this.uniforms.uDisperse.value
    this.burstStart = now; this.mode = 'exploding'; this.flashStart = now
  }

  assemble(now: number): void {
    this.assembleStartValue = this.uniforms.uDisperse.value
    this.assembleStart = now; this.mode = 'assembling'; this.flashStart = now
  }

  get effectState(): 'idle' | 'exploding' | 'exploded' | 'assembling' { return this.mode }

  update(now: number, dt: number): void {
    this.uniforms.uTime.value = now / 1000
    this.uniforms.uIntro.value = clamp((now - this.introStart) / 2800, 0, 1)
    if (this.mode === 'exploding') {
      const t = clamp((now - this.burstStart) / CONFIG.explosionMs, 0, 1)
      this.uniforms.uDisperse.value = this.burstStartValue + (1 - this.burstStartValue) * (1 - (1 - t) ** 3)
      if (t >= 1) this.mode = 'exploded'
    } else if (this.mode === 'assembling') {
      const t = clamp((now - this.assembleStart) / CONFIG.assembleMs, 0, 1)
      const ease = t * t * (3 - 2 * t)
      this.uniforms.uDisperse.value = this.assembleStartValue * (1 - ease)
      this.uniforms.uSwirl.value = Math.sin(Math.PI * t) * 0.75
      if (t >= 1) { this.mode = 'idle'; this.uniforms.uSwirl.value = 0; this.flashStart = now }
    }
    const flashAge = now - this.flashStart
    this.uniforms.uFlash.value = this.flashStart < 0 ? 0 : Math.max(0, 1 - flashAge / 600)
    if (this.mode === 'exploding' && flashAge < 600) {
      this.ring.visible = true
      this.ring.scale.setScalar(1 + flashAge / 600 * 1.7)
      this.ringMaterial.opacity = (1 - flashAge / 600) * 0.16
    } else { this.ring.visible = false }
    void dt
  }

  private introStart = performance.now()

  dispose(): void {
    this.geometry.dispose(); this.material.dispose()
    this.occluder.geometry.dispose(); (this.occluder.material as THREE.Material).dispose()
    this.atmosphere.geometry.dispose(); (this.atmosphere.material as THREE.Material).dispose()
    this.ring.geometry.dispose(); this.ringMaterial.dispose()
  }
}
