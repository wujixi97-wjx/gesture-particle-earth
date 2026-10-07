import * as THREE from 'three'
import type { QualityTier } from '../config'

type EarthMode = 'idle' | 'exploding' | 'exploded' | 'assembling'
type AsteroidOrbit = { phase: number; speed: number; radius: number; squash: number; tilt: number; scale: number; spin: number }
type MeteorPath = { phase: number; lane: number; speed: number; length: number; depth: number; slope: number; radius: number; tilt: number; roll: number; distant: boolean }
const METEOR_COUNT = 32
const TRAIL_SEGMENTS = 18
// Three loose orbital layers; a few paths remain in the distant sky.
const METEOR = { radius: 2.65, layerGap: .58, squash: .8, tilt: 1.05, roll: -.22 } as const

export class StarField {
  readonly group = new THREE.Group()
  readonly orbit = new THREE.Group()
  readonly asteroidRing = new THREE.Group()
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  private far = this.makePoints(1100, 0x819092, .018, 8, 18, .28)
  private mid = this.makeTwinklingPoints(260)
  private dust = this.makePoints(110, 0x526166, .028, 4, 10, .12)
  private galaxy = this.makeGalaxy()
  private glow = this.makeGlow()
  private orbitLine: THREE.Line
  private satellite: THREE.Points
  private asteroidDummy = new THREE.Object3D()
  private asteroidColor = new THREE.Color()
  private asteroidOrbits: AsteroidOrbit[] = Array.from({ length: 28 }, (_, i) => ({
    phase: i / 28 * Math.PI * 2 + Math.random() * .18,
    speed: .000006 + Math.random() * .000008,
    radius: 2.28 + Math.random() * .82,
    squash: .94 + Math.random() * .1,
    tilt: -.12 + Math.random() * .24,
    scale: .68 + Math.random() * .67,
    spin: .00008 + Math.random() * .00012,
  }))
  private asteroids = this.makeAsteroids()
  private ringDust = this.makeRingDust()
  private meteorWidth = 11
  private meteorHeight = 6
  private meteorCenter = new THREE.Vector3()
  private meteorScale = 1
  private meteorPoint = new THREE.Vector3()
  private meteorTime = 0
  private meteorPaths: MeteorPath[] = Array.from({ length: METEOR_COUNT }, (_, i) => ({
    // Alternate paths across the full screen so medium quality still spans the sky.
    phase: ((i < 16 ? i * 2 : (i - 16) * 2 + 1) / METEOR_COUNT + Math.random() * .018) * Math.PI * 2,
    lane: ((i * .61803398875) % 1 - .5) * 1.08,
    speed: (i % 9 === 0 ? .00015 : .000045) + Math.random() * .000035,
    length: .28 + Math.random() * .24,
    depth: -1.5 - Math.random(),
    slope: -.22 + Math.random() * .1,
    radius: METEOR.radius + (i % 3) * METEOR.layerGap + Math.random() * .2,
    tilt: METEOR.tilt + (Math.random() - .5) * .24,
    roll: METEOR.roll + (Math.random() - .5) * .28,
    distant: i % 8 === 7,
  }))
  private meteorStream = this.makeMeteorStream()
  private meteorHeads = this.makeMeteorHeads()
  private orbitOpacity = 1
  private tier: QualityTier = 'high'

  constructor() {
    const { line, satellite } = this.makeOrbit()
    this.orbitLine = line; this.satellite = satellite
    this.orbit.add(line, satellite)
    const asteroidLight = new THREE.DirectionalLight(0xc8d8d8, .62)
    asteroidLight.position.set(-4, 5, 6)
    this.asteroidRing.rotation.set(1.02, .18, -.3)
    this.asteroidRing.add(this.ringDust, this.asteroids, asteroidLight)
    this.group.add(this.galaxy, this.far, this.mid, this.dust, this.glow, this.meteorStream, this.meteorHeads)
    this.updateAsteroids(0)
  }

  private positions(count: number, near: number, far: number): Float32Array {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, y = Math.random() * 2 - 1
      const radius = near + Math.pow(Math.random(), .62) * (far - near), ring = Math.sqrt(1 - y * y)
      positions[i * 3] = ring * Math.cos(angle) * radius
      positions[i * 3 + 1] = y * radius
      positions[i * 3 + 2] = ring * Math.sin(angle) * radius
    }
    return positions
  }

  private makePoints(count: number, color: number, size: number, near: number, far: number, opacity: number): THREE.Points {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions(count, near, far), 3))
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }))
  }

  private makeTwinklingPoints(count: number): THREE.Points {
    const geometry = new THREE.BufferGeometry(), phase = new Float32Array(count), twinkle = new Float32Array(count)
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions(count, 6, 14), 3))
    for (let i = 0; i < count; i++) { phase[i] = Math.random() * Math.PI * 2; twinkle[i] = Math.random() < .08 ? 1 : 0 }
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1)); geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1))
    return new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMotion: { value: this.reducedMotion ? 0 : 1 } },
      vertexShader: `attribute float aPhase,aTwinkle;uniform float uTime,uMotion;varying float vAlpha;void main(){vec4 v=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(.13*(7.5/max(1.,-v.z)),.8,2.1);vAlpha=.34+aTwinkle*sin(uTime*.0008+aPhase)*.045*uMotion;}`,
      fragmentShader: `precision highp float;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.08,1.,r))*vAlpha;if(a<.01)discard;gl_FragColor=vec4(.72,.82,.83,a);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
  }

  private texture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')!; draw(ctx, w, h)
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  private makeGalaxy(): THREE.Mesh {
    const map = this.texture((ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      g.addColorStop(0, 'rgba(90,110,116,.18)'); g.addColorStop(.48, 'rgba(52,62,66,.08)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 380; i++) { ctx.fillStyle = `rgba(150,165,166,${Math.random() * .1})`; ctx.fillRect(Math.random() * w, h * .5 + (Math.random() - .5) * h * .42, 1, 1) }
    }, 512, 192)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 7), new THREE.MeshBasicMaterial({ map, transparent: true, opacity: .18, depthWrite: false }))
    mesh.position.set(1.5, .3, -8); mesh.rotation.z = -.34; mesh.renderOrder = -2
    return mesh
  }

  private makeGlow(): THREE.Sprite {
    const map = this.texture((ctx, w) => {
      const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      g.addColorStop(0, 'rgba(215,230,228,.18)'); g.addColorStop(.14, 'rgba(145,170,170,.05)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, w)
    }, 256, 256)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: .24, depthWrite: false }))
    sprite.position.set(-7, 4.2, -5); sprite.scale.set(4.5, 4.5, 1)
    return sprite
  }

  private makeOrbit(): { line: THREE.Line; satellite: THREE.Points } {
    const vertices: THREE.Vector3[] = []
    for (let i = 0; i <= 72; i++) { const a = -.7 + i / 72 * 2.05; vertices.push(new THREE.Vector3(Math.cos(a) * 2.08, Math.sin(a) * 2.08, 0)) }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), new THREE.LineDashedMaterial({ color: 0x53696d, transparent: true, opacity: .18, dashSize: .08, gapSize: .11, depthWrite: false }))
    line.computeLineDistances(); this.orbit.rotation.set(.32, -.2, -.38)
    const satellite = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(2.08, 0, 0)]), new THREE.PointsMaterial({ color: 0x9fbfc0, size: .032, transparent: true, opacity: .55, depthWrite: false }))
    return { line, satellite }
  }

  private makeAsteroids(): THREE.InstancedMesh {
    const geometry = new THREE.IcosahedronGeometry(.035, 0)
    const material = new THREE.MeshStandardMaterial({ color: 0x303637, emissive: 0x090d0e, emissiveIntensity: .42, roughness: 1, flatShading: true })
    const mesh = new THREE.InstancedMesh(geometry, material, 28)
    const color = new THREE.Color()
    for (let i = 0; i < 28; i++) mesh.setColorAt(i, color.setScalar(.68 + Math.random() * .24))
    mesh.instanceColor!.needsUpdate = true
    mesh.frustumCulled = false
    return mesh
  }

  private makeRingDust(): THREE.Points {
    const count = 900, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3)
    const tint = new THREE.Color(0x64797b)
    const arcs = [0.12, 1.08, 2.42, 3.55, 4.82, 5.62]
    for (let i = 0; i < count; i++) {
      const start = arcs[i % arcs.length]
      const angle = start + Math.pow(Math.random(), .82) * (.38 + Math.random() * .58)
      const radius = 2.12 + Math.pow(Math.random(), .72) * 1.12
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle) * radius * (.94 + Math.random() * .08)
      positions[i * 3 + 2] = (Math.random() - .5) * .22
      const brightness = .42 + Math.random() * .43
      colors[i * 3] = tint.r * brightness; colors[i * 3 + 1] = tint.g * brightness; colors[i * 3 + 2] = tint.b * brightness
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, vertexColors: true, size: .028, transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending }))
  }

  private makeMeteorStream(): THREE.LineSegments {
    const positions = new Float32Array(METEOR_COUNT * TRAIL_SEGMENTS * 2 * 3)
    const colors = new Float32Array(positions.length)
    for (let i = 0; i < METEOR_COUNT; i++) {
      for (let segment = 0; segment < TRAIL_SEGMENTS; segment++) {
        const tail = (segment / TRAIL_SEGMENTS) ** 2
        const head = ((segment + 1) / TRAIL_SEGMENTS) ** 2
        const offset = (i * TRAIL_SEGMENTS + segment) * 6
        colors.set([.025 + .56 * tail, .03 + .64 * tail, .035 + .65 * tail,
          .025 + .56 * head, .03 + .64 * head, .035 + .65 * head], offset)
      }
    }
    const geometry = new THREE.BufferGeometry()
    const position = new THREE.BufferAttribute(positions, 3); position.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const stream = new THREE.LineSegments(geometry, new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 } },
      vertexShader: `attribute vec3 color;uniform float uScale;varying vec3 vColor;varying float vDepth;void main(){vColor=color;vDepth=clamp(.53+position.z/(7.*uScale),.22,.88);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vColor;varying float vDepth;void main(){gl_FragColor=vec4(vColor,vDepth*.82);}`,
      transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    // Dynamic positions must not use the zero-sized initial bounding sphere.
    stream.frustumCulled = false
    return stream
  }

  private makeMeteorHeads(): THREE.Points {
    const geometry = new THREE.BufferGeometry()
    const position = new THREE.BufferAttribute(new Float32Array(METEOR_COUNT * 3), 3)
    position.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position)
    const heads = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uDpr: { value: 1 } },
      vertexShader: `uniform float uScale,uDpr;varying float vDepth;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vDepth=clamp(.53+position.z/(7.*uScale),.22,.88);gl_Position=projectionMatrix*p;gl_PointSize=clamp(28./max(2.,-p.z),2.,6.)*uDpr;}`,
      fragmentShader: `varying float vDepth;void main(){float r=length(gl_PointCoord-.5)*2.;float core=1.-smoothstep(.18,.65,r);float halo=(1.-smoothstep(.3,1.,r))*.07;gl_FragColor=vec4(.75,.83,.84,(core+halo)*vDepth);}`,
      transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    heads.frustumCulled = false
    return heads
  }

  private meteorPosition(path: MeteorPath, angle: number): THREE.Vector3 {
    if (path.distant) {
      const x = angle / (Math.PI * 2) * 1.4 - .7
      return this.meteorPoint.set(x * this.meteorWidth, (path.lane + x * path.slope) * this.meteorHeight, path.depth - 2)
    }
    const x = Math.cos(angle) * path.radius, y = Math.sin(angle) * path.radius * METEOR.squash
    const py = y * Math.cos(path.tilt), z = y * Math.sin(path.tilt)
    const c = Math.cos(path.roll), s = Math.sin(path.roll)
    return this.meteorPoint.set(x * c - py * s, x * s + py * c, z).multiplyScalar(this.meteorScale).add(this.meteorCenter)
  }

  private updateMeteorStream(time: number): void {
    const positions = this.meteorStream.geometry.getAttribute('position') as THREE.BufferAttribute
    const heads = this.meteorHeads.geometry.getAttribute('position') as THREE.BufferAttribute
    const count = this.tier === 'high' ? METEOR_COUNT : this.tier === 'medium' ? 16 : 0
    for (let i = 0; i < count; i++) {
      const path = this.meteorPaths[i], head = (path.phase + time * path.speed) % (Math.PI * 2)
      for (let segment = 0; segment < TRAIL_SEGMENTS; segment++) {
        const tailX = head - path.length * (1 - segment / TRAIL_SEGMENTS)
        const nextX = head - path.length * (1 - (segment + 1) / TRAIL_SEGMENTS)
        const index = (i * TRAIL_SEGMENTS + segment) * 2
        let p = this.meteorPosition(path, tailX)
        positions.setXYZ(index, p.x, p.y, p.z)
        p = this.meteorPosition(path, nextX)
        positions.setXYZ(index + 1, p.x, p.y, p.z)
      }
      const p = this.meteorPosition(path, head)
      heads.setXYZ(i, p.x, p.y, p.z)
    }
    positions.needsUpdate = true
    heads.needsUpdate = true
  }

  setViewport(width: number, height: number, cameraZ: number): void {
    // Keep the shower spread over the visible sky on both desktop and mobile.
    this.meteorHeight = 2 * (cameraZ + 2) * Math.tan(THREE.MathUtils.degToRad(21))
    this.meteorWidth = this.meteorHeight * width / height
    ;(this.meteorHeads.material as THREE.ShaderMaterial).uniforms.uDpr.value = Math.min(window.devicePixelRatio, 2)
    this.updateMeteorStream(this.meteorTime)
  }

  setEarthTransform(position: THREE.Vector3, scale: number): void {
    this.meteorCenter.copy(position); this.meteorScale = scale
    ;(this.meteorStream.material as THREE.ShaderMaterial).uniforms.uScale.value = scale
    ;(this.meteorHeads.material as THREE.ShaderMaterial).uniforms.uScale.value = scale
  }

  private updateAsteroids(time: number): void {
    for (let i = 0; i < this.asteroids.count; i++) {
      const orbit = this.asteroidOrbits[i], angle = orbit.phase + time * orbit.speed
      const radius = orbit.radius + Math.sin(angle * 3.1 + orbit.phase) * .08
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * orbit.squash
      const c = Math.cos(orbit.tilt), s = Math.sin(orbit.tilt)
      this.asteroidDummy.position.set(x * c - y * s, x * s + y * c, Math.sin(angle * 2.3 + orbit.phase) * .16)
      this.asteroidDummy.rotation.set(angle * .7 + time * orbit.spin, angle * 1.1 - time * orbit.spin * .8, orbit.phase)
      const depth = y / radius * .5 + .5
      this.asteroidDummy.scale.setScalar(orbit.scale * (.78 + depth * .48))
      this.asteroidDummy.updateMatrix(); this.asteroids.setMatrixAt(i, this.asteroidDummy.matrix)
      this.asteroids.setColorAt(i, this.asteroidColor.setScalar(.48 + depth * .5))
    }
    this.asteroids.instanceMatrix.needsUpdate = true
    this.asteroids.instanceColor!.needsUpdate = true
  }

  setQuality(tier: QualityTier): void {
    this.tier = tier
    this.far.geometry.setDrawRange(0, tier === 'high' ? 1100 : tier === 'medium' ? 700 : 400)
    this.mid.geometry.setDrawRange(0, tier === 'high' ? 260 : 150)
    this.mid.visible = tier !== 'low'; this.dust.visible = tier === 'high'
    this.galaxy.visible = tier !== 'low'; this.glow.visible = tier === 'high'; this.orbit.visible = tier !== 'low'
    this.asteroids.count = tier === 'high' ? 28 : tier === 'medium' ? 16 : 0
    this.ringDust.geometry.setDrawRange(0, tier === 'high' ? 900 : tier === 'medium' ? 480 : 0)
    const meteorCount = tier === 'high' ? METEOR_COUNT : tier === 'medium' ? 16 : 0
    this.meteorStream.geometry.setDrawRange(0, meteorCount * TRAIL_SEGMENTS * 2)
    this.meteorHeads.geometry.setDrawRange(0, meteorCount)
    this.meteorStream.visible = this.meteorHeads.visible = tier !== 'low'
    this.asteroidRing.visible = tier !== 'low'
  }

  update(time: number, earthMode: EarthMode): void {
    if (document.hidden) return
    const motion = this.reducedMotion ? 0 : 1
    this.far.rotation.y = time * .000001 * motion; this.mid.rotation.y = -time * .000003 * motion; this.dust.rotation.z = time * .000006 * motion
    ;(this.mid.material as THREE.ShaderMaterial).uniforms.uTime.value = time
    this.orbitOpacity += ((earthMode === 'idle' ? 1 : 0) - this.orbitOpacity) * .08
    ;(this.orbitLine.material as THREE.LineDashedMaterial).opacity = .18 * this.orbitOpacity
    ;(this.satellite.material as THREE.PointsMaterial).opacity = .55 * this.orbitOpacity
    this.satellite.position.set(Math.cos(time * .00012 * motion) * 2.08, Math.sin(time * .00012 * motion) * 2.08, 0)
    this.orbit.visible = this.tier !== 'low' && this.orbitOpacity > .01
    this.ringDust.rotation.z = time * .000002 * motion
    this.meteorTime = time * motion
    this.updateMeteorStream(this.meteorTime)
    this.updateAsteroids(time * motion)
  }

  dispose(): void {
    for (const object of [this.far, this.mid, this.dust, this.satellite]) { object.geometry.dispose(); (object.material as THREE.Material).dispose() }
    this.orbitLine.geometry.dispose(); (this.orbitLine.material as THREE.Material).dispose()
    const galaxyMaterial = this.galaxy.material as THREE.MeshBasicMaterial; galaxyMaterial.map?.dispose(); this.galaxy.geometry.dispose(); galaxyMaterial.dispose()
    const glowMaterial = this.glow.material as THREE.SpriteMaterial; glowMaterial.map?.dispose(); glowMaterial.dispose()
    this.asteroids.geometry.dispose(); (this.asteroids.material as THREE.Material).dispose()
    this.ringDust.geometry.dispose(); (this.ringDust.material as THREE.Material).dispose()
    this.meteorStream.geometry.dispose(); (this.meteorStream.material as THREE.Material).dispose()
    this.meteorHeads.geometry.dispose(); (this.meteorHeads.material as THREE.Material).dispose()
  }
}
