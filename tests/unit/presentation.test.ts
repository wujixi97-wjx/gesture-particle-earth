import { describe, expect, it } from 'vitest'
import { PresentationController } from '../../src/core/PresentationController'

describe('presentation timing', () => {
  it('starts touring only after 15 idle seconds and stops immediately on input', () => {
    const view = new PresentationController(0)
    expect(view.cruising(14999, false, true, false)).toBe(false)
    expect(view.cruising(15000, false, true, false)).toBe(true)
    view.interact(15001)
    expect(view.cruising(15002, false, true, false)).toBe(false)
  })
  it('never competes with camera, reduced motion, effects or exploration', () => {
    const view = new PresentationController(0)
    expect(view.cruising(16000, true, true, false)).toBe(false)
    expect(view.cruising(16000, false, true, true)).toBe(false)
    expect(view.cruising(16000, false, false, false)).toBe(false)
    expect(view.cruising(16000, false, true, false, true)).toBe(false)
  })
  it('hides controls only in immersion and reveals them on activity', () => {
    const view = new PresentationController(0)
    expect(view.controlsHidden(5000)).toBe(false)
    view.toggle(100)
    expect(view.controlsHidden(3599)).toBe(false)
    expect(view.controlsHidden(3600)).toBe(true)
    view.interact(3700)
    expect(view.controlsHidden(3701)).toBe(false)
    view.toggle(3800)
    expect(view.controlsHidden(9000)).toBe(false)
  })
})
