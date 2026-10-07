import { describe, expect, it } from 'vitest'
import { GestureController } from '../../src/gesture/GestureController'
import { applyRotationSensitivity, applyZoomSensitivity } from '../../src/input/PointerController'
import type { TrackedHand } from '../../src/gesture/types'

function hand(gesture: string, x = 0.5, confidence = 0.9): TrackedHand {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }))
  landmarks[4] = { x: x - 0.07, y: 0.4, z: 0 }
  landmarks[8] = { x: x + 0.08, y: 0.4, z: 0 }
  landmarks[5] = { x: x - 0.1, y: 0.5, z: 0 }
  landmarks[17] = { x: x + 0.1, y: 0.5, z: 0 }
  return { handedness: 'Right', landmarks, worldLandmarks: landmarks, gesture, confidence }
}

describe('stable gesture transitions', () => {
  it('ignores low-confidence special gestures', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand('Closed_Fist', 0.5, 0.4)] }, 1)
    controller.process({ timestamp: 1600, hands: [hand('Closed_Fist', 0.5, 0.4)] }, 1)
    expect(controller.consume().explode).toBe(false)
  })
  it('starts at the first palm position without a rotation jump', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand('None', 0.2)] }, 1)
    const intent = controller.consume()
    expect(intent.rotationX).toBe(0)
    expect(intent.rotationY).toBe(0)
  })
})

describe('pointer zoom sensitivity', () => {
  it('reduces scale jumps at the default sensitivity', () => {
    expect(applyZoomSensitivity(2, 0.5)).toBeCloseTo(Math.sqrt(2))
    expect(applyZoomSensitivity(0.5, 0.5)).toBeCloseTo(Math.sqrt(0.5))
  })
  it('clamps sensitivity to the supported range', () => {
    expect(applyZoomSensitivity(2, 0)).toBeCloseTo(2 ** 0.2)
    expect(applyZoomSensitivity(2, 2)).toBeCloseTo(2 ** 1.4)
  })
})

describe('pointer rotation sensitivity', () => {
  it('reduces drag rotation at the default sensitivity', () => {
    expect(applyRotationSensitivity(1, 0.35)).toBeCloseTo(0.35)
  })
  it('clamps rotation sensitivity to the supported range', () => {
    expect(applyRotationSensitivity(1, 0)).toBeCloseTo(0.15)
    expect(applyRotationSensitivity(1, 2)).toBeCloseTo(1.4)
  })
})
