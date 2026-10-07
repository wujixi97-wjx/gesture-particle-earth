import * as THREE from 'three'
import { CONFIG, EARTH_LIGHT } from '../config'
import { CITIES, type CityRecord } from '../data/cities'
import { geoToUnit, isFrontFacing, rectanglesOverlap, type LabelRect } from './cityMath'

const markerVertex = `
attribute float aCapital;
uniform float uPointScale;
uniform vec3 uSunDirection;
uniform float uTwilight;
varying float vFacing;
varying float vCapital;
varying float vDaylight;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vFacing = dot(normalize(mat3(modelViewMatrix) * normalize(position)), normalize(-view.xyz));
  vCapital = aCapital;
  vDaylight = smoothstep(-uTwilight, uTwilight, dot(normalize(mat3(modelViewMatrix) * normalize(position)), uSunDirection));
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(uPointScale * mix(4.2, 6.2, aCapital) * (7.5 / max(1.0, -view.z)), 2.2, 10.0);
}`

const markerFragment = `
precision highp float;
varying float vFacing;
varying float vCapital;
varying float vDaylight;
void main() {
  if (vFacing < 0.08) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.14, 0.50, r);
  float halo = 1.0 - smoothstep(0.18, 1.0, r);
  float edgeFade = smoothstep(0.08, 0.30, vFacing);
  vec3 color = mix(vec3(0.80, 0.93, 0.94), vec3(0.91, 0.98, 0.99), vCapital);
  float nightEmphasis = mix(1.0, 0.90, vDaylight);
  gl_FragColor = vec4(color, (core * 0.94 + halo * 0.09) * edgeFade * nightEmphasis);
}`

type Marker = { city: CityRecord; normal: THREE.Vector3; local: THREE.Vector3 }

export class CityMarkers {
  readonly points: THREE.Points
  private geometry = new THREE.BufferGeometry()
  private material = new THREE.ShaderMaterial({
    uniforms: {
      uPointScale: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(...EARTH_LIGHT.direction).normalize() },
      uTwilight: { value: EARTH_LIGHT.twilight },
    },
    vertexShader: markerVertex, fragmentShader: markerFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  private markers: Marker[] = []
  private layer = document.createElement('div')
  private labels: HTMLSpanElement[] = []
  private used: LabelRect[] = []
  private obstacles: HTMLElement[] = []
  private world = new THREE.Vector3()
  private normal = new THREE.Vector3()
  private toCamera = new THREE.Vector3()
  private cameraWorld = new THREE.Vector3()
  private screen = new THREE.Vector3()
  private lastUpdate = 0

  constructor(root: HTMLElement, globe: THREE.Group, onSelect: (city: CityRecord) => void = () => {}) {
    const positions = new Float32Array(CITIES.length * 3)
    const capitals = new Float32Array(CITIES.length)
    for (let i = 0; i < CITIES.length; i++) {
      const city = CITIES[i]
      const normal = geoToUnit(city.lat, city.lon)
      const local = normal.clone().multiplyScalar(CONFIG.radius * 1.022)
      local.toArray(positions, i * 3)
      capitals[i] = city.capital ? 1 : 0
      this.markers.push({ city, normal, local })
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute('aCapital', new THREE.BufferAttribute(capitals, 1))
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.visible = false
    globe.add(this.points)

    this.layer.className = 'city-label-layer hidden'
    this.layer.setAttribute('aria-label', '城市标记')
    for (let i = 0; i < 12; i++) {
      const label = document.createElement('span')
      label.className = 'city-label hidden'
      label.setAttribute('role', 'button')
      label.tabIndex = 0
      label.onclick = () => {
        const city = CITIES[Number(label.dataset.city)]
        if (city && this.points.visible) onSelect(city)
      }
      label.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); label.click() }
      }
      this.layer.append(label)
      this.labels.push(label)
    }
    root.append(this.layer)
    this.obstacles = Array.from(root.querySelectorAll<HTMLElement>(
      '.topbar, .center-copy, .tracking, .bottom-panel, .side-readout, #debug-panel, .camera-preview, .view-controls, #city-info'))
  }

  setPointScale(dpr: number): void { this.material.uniforms.uPointScale.value = Math.min(2, dpr) }

  update(now: number, camera: THREE.Camera, globe: THREE.Group, visible: boolean): void {
    this.points.visible = visible
    this.layer.classList.toggle('hidden', !visible)
    if (!visible) { this.lastUpdate = 0; return }
    if (now - this.lastUpdate < 34) return
    this.lastUpdate = now
    globe.updateWorldMatrix(true, false)
    camera.getWorldPosition(this.cameraWorld)
    this.used.length = 0
    for (const obstacle of this.obstacles) {
      const style = getComputedStyle(obstacle)
      if (obstacle.classList.contains('hidden') || style.visibility === 'hidden' || Number(style.opacity) < 0.03) continue
      const bounds = obstacle.getBoundingClientRect()
      if (bounds.width && bounds.height) this.used.push({
        x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      })
    }
    const width = window.innerWidth, height = window.innerHeight
    const mobile = width < 650
    const maxLabels = mobile ? 5 : width < 1000 ? 8 : 12
    const minX = mobile ? width * 0.08 : width * 0.34
    const maxX = mobile ? width * 0.92 : width * 0.82
    const minY = mobile ? height * 0.30 : height * 0.17
    const maxY = mobile ? height * 0.64 : height * 0.80
    let shown = 0

    for (const marker of this.markers) {
      this.world.copy(marker.local).applyMatrix4(globe.matrixWorld)
      this.normal.copy(marker.normal).transformDirection(globe.matrixWorld)
      this.toCamera.copy(this.cameraWorld).sub(this.world).normalize()
      if (!isFrontFacing(this.normal, this.toCamera)) continue
      this.screen.copy(this.world).project(camera)
      if (this.screen.z < -1 || this.screen.z > 1) continue
      const x = (this.screen.x + 1) * width * 0.5
      const y = (1 - this.screen.y) * height * 0.5
      if (x < minX || x > maxX || y < minY || y > maxY) continue
      const labelWidth = Math.max(42, marker.city.name.length * 7 + 12)
      const labelX = x + 12 + labelWidth < maxX ? x + 12 : x - 12 - labelWidth
      if (labelX < minX || labelX + labelWidth > maxX) continue
      const rect = { x: labelX - 5, y: y - 12, width: labelWidth + 10, height: 24 }
      if (this.used.some(other => rectanglesOverlap(rect, other))) continue
      this.used.push(rect)
      const label = this.labels[shown]
      label.dataset.city = String(this.markers.indexOf(marker))
      label.setAttribute('aria-label', `探索 ${marker.city.name}`)
      if (label.textContent !== marker.city.name) label.textContent = marker.city.name
      label.style.left = `${labelX}px`
      label.style.top = `${y}px`
      label.classList.remove('hidden')
      if (++shown >= maxLabels) break
    }
    for (let i = shown; i < this.labels.length; i++) this.labels[i].classList.add('hidden')
  }

  pick(x: number, y: number, camera: THREE.Camera, globe: THREE.Group): CityRecord | null {
    if (!this.points.visible) return null
    // Labels remain pointer-transparent so wheel/drag still reach the canvas.
    // Resolve a stationary tap here; keyboard activation uses label.onclick.
    for (const label of this.labels) {
      if (label.classList.contains('hidden')) continue
      const rect = label.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return CITIES[Number(label.dataset.city)]
    }
    globe.updateWorldMatrix(true, false)
    camera.getWorldPosition(this.cameraWorld)
    let picked: CityRecord | null = null, nearest = 12 * 12
    for (const marker of this.markers) {
      this.world.copy(marker.local).applyMatrix4(globe.matrixWorld)
      this.normal.copy(marker.normal).transformDirection(globe.matrixWorld)
      this.toCamera.copy(this.cameraWorld).sub(this.world).normalize()
      if (!isFrontFacing(this.normal, this.toCamera)) continue
      this.screen.copy(this.world).project(camera)
      if (Math.abs(this.screen.z) > 1) continue
      const dx = (this.screen.x + 1) * window.innerWidth * .5 - x
      const dy = (1 - this.screen.y) * window.innerHeight * .5 - y
      const distance = dx * dx + dy * dy
      if (distance < nearest) { nearest = distance; picked = marker.city }
    }
    return picked
  }

  dispose(): void {
    this.layer.remove()
    this.points.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
