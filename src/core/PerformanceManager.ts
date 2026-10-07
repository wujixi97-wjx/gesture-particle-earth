import { CONFIG, QUALITY, type QualityTier } from '../config'

export class PerformanceManager {
  tier: QualityTier
  private lowSince = 0
  private highSince = 0
  private lastChange = -Infinity
  private sampleFrames = 0
  private sampleStart = 0
  fps = 60

  constructor() {
    const nav = navigator as Navigator & { deviceMemory?: number }
    this.tier = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent) || (nav.deviceMemory && nav.deviceMemory <= 4) ? 'low'
      : (nav.hardwareConcurrency || 4) <= 4 || devicePixelRatio > 2 ? 'medium' : 'high'
  }

  get settings() { return QUALITY[this.tier] }

  update(now: number): boolean {
    if (!this.sampleStart) this.sampleStart = now
    this.sampleFrames++
    const elapsed = now - this.sampleStart
    if (elapsed < 1000) return false
    this.fps = this.sampleFrames * 1000 / elapsed
    this.sampleFrames = 0
    this.sampleStart = now
    if (now - this.lastChange < CONFIG.qualityCooldownMs) return false
    if (this.fps < CONFIG.lowFps) {
      if (!this.lowSince) this.lowSince = now
      this.highSince = 0
      if (now - this.lowSince >= CONFIG.degradeMs && this.tier !== 'low') {
        this.tier = this.tier === 'high' ? 'medium' : 'low'
        this.lastChange = now; this.lowSince = 0
        return true
      }
    } else if (this.fps > CONFIG.highFps) {
      if (!this.highSince) this.highSince = now
      this.lowSince = 0
      if (now - this.highSince >= CONFIG.upgradeMs && this.tier !== 'high') {
        this.tier = this.tier === 'low' ? 'medium' : 'high'
        this.lastChange = now; this.highSince = 0
        return true
      }
    } else {
      this.lowSince = 0; this.highSince = 0
    }
    return false
  }
}
