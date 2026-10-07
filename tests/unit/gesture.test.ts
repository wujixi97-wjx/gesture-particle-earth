import { describe, expect, it } from 'vitest'
import { AppStateMachine } from '../../src/core/AppStateMachine'
import { GestureController, palmCenter, pinchRatio } from '../../src/gesture/GestureController'
import type { TrackedHand } from '../../src/gesture/types'

function hand(gesture = 'None', x = 0.5, y = 0.5, pinched = false, confidence = 0.9, ratio = pinched ? .1 : .75): TrackedHand {
  const rawX = 1 - x
  const landmarks = Array.from({ length: 21 }, () => ({ x: rawX, y, z: 0 }))
  landmarks[4] = { x: rawX - 0.06, y: y - 0.1, z: 0 }
  landmarks[8] = { x: rawX - .06 + ratio * .2, y: y - 0.1, z: 0 }
  landmarks[5] = { x: rawX - 0.1, y, z: 0 }
  landmarks[17] = { x: rawX + 0.1, y, z: 0 }
  return { handedness: 'Left', landmarks, worldLandmarks: landmarks, gesture, confidence }
}

describe('gesture controller', () => {
  it('does not latch zoom from an overlapping-finger frame classified as an open palm', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand('Open_Palm', .4, .5, false, .99, .2)] }, 1)
    expect(controller.consume().activity).toBe('ROTATING')
    controller.process({ timestamp: 1100, hands: [hand('Open_Palm', .6, .5, false, .99, .2)] }, 1)
    expect(controller.consume().rotationY).toBeGreaterThan(0)
  })
  it('preserves zoom through a dropped detection and rebases without jumps', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand('None', .5, .5, true)] }, 1.4)
    controller.consume()
    controller.process({ timestamp: 1400, hands: [] }, 1.4)
    expect(controller.consume().activity).toBe('NO_HAND')
    controller.process({ timestamp: 1800, hands: [hand('None', .8, .7, false, .9, .7)] }, 1.4)
    const resumed = controller.consume()
    expect(resumed.activity).toBe('ZOOMING')
    expect(resumed.targetScale).toBe(1.4)
    expect(resumed.rotationY).toBe(0)
    controller.process({ timestamp: 4000, hands: [hand('Open_Palm', .4)] }, 1.4)
    const expired = controller.consume()
    expect(expired.activity).toBe('ROTATING'); expect(expired.rotationY).toBe(0)
  })
  it('resumes slow rotation after intermittent empty and uncertain gesture frames', () => {
    const controller = new GestureController()
    let movement = 0
    for (let i = 0; i < 40; i++) {
      const hands = i === 10 || i === 20 ? [] : [hand(i % 2 ? 'None' : 'Open_Palm', .3 + i * .005, .5, false, .4)]
      controller.process({ timestamp: 1000 + i * 100, hands }, 1)
      movement += controller.consume().rotationY
    }
    expect(movement).toBeGreaterThan(.2)
  })
  it('normalizes pinch against palm width', () => {
    expect(pinchRatio(hand('None', 0.5, 0.5, true))).toBeCloseTo(0.1)
    expect(palmCenter(hand()).x).toBeCloseTo(0.53)
  })
  it('never triggers effects from a held fist or open palm', () => {
    const controller = new GestureController()
    for (const [timestamp, gesture] of [[1000, 'Closed_Fist'], [2000, 'Closed_Fist'], [3000, 'Open_Palm']] as const) {
      controller.process({ timestamp, hands: [hand(gesture)] }, 1)
      const intent = controller.consume()
      expect(intent.explode).toBe(false); expect(intent.assemble).toBe(false)
    }
  })
  it('enters zoom without a jump and no longer zooms from vertical movement', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand()] }, 1)
    controller.consume()
    controller.process({ timestamp: 1100, hands: [hand('None', 0.5, 0.5, true)] }, 1)
    expect(controller.consume().targetScale).toBeCloseTo(1)
    controller.process({ timestamp: 1200, hands: [hand('None', 0.5, 0.4, true)] }, 1)
    expect(controller.consume().targetScale).toBeCloseTo(1)
    controller.process({ timestamp: 1300, hands: [hand('Open_Palm', 0.5, 0.4)] }, 1)
    expect(controller.consume().targetScale).toBeCloseTo(1)
    controller.process({ timestamp: 1500, hands: [hand('Open_Palm', 0.5, 0.4)] }, 1)
    const released = controller.consume()
    expect(released.targetScale).toBeNull()
    expect(released.rotationX).toBe(0)
    expect(released.rotationY).toBe(0)
  })
  it('zooms by finger spacing, stays latched beyond the old exit threshold, and clamps limits', () => {
    const controller = new GestureController()
    const send = (time: number, ratio: number) => {
      controller.process({ timestamp: time, hands: [hand('None', .5, .5, false, .9, ratio)] }, 1)
      return controller.consume()
    }
    expect(send(1000, .25).targetScale).toBe(1)
    let enlarged = 1
    for (let i = 0; i < 30; i++) enlarged = send(1100 + i * 33, .7).targetScale!
    expect(enlarged).toBeGreaterThan(1.5)
    expect(send(2200, .7).activity).toBe('ZOOMING')
    let reduced = enlarged
    for (let i = 0; i < 30; i++) reduced = send(2300 + i * 33, .15).targetScale!
    expect(reduced).toBeLessThan(enlarged)
    for (let i = 0; i < 60; i++) enlarged = send(3400 + i * 33, 3).targetScale!
    expect(enlarged).toBe(2.2)
    for (let i = 0; i < 60; i++) reduced = send(5500 + i * 33, 0).targetScale!
    expect(reduced).toBe(.65)
  })
  it('filters spacing jitter and requires a stable confident open palm to exit zoom', () => {
    const controller = new GestureController()
    const send = (time: number, gesture: string, ratio: number, confidence = .9) => {
      controller.process({ timestamp: time, hands: [hand(gesture, .5, .5, false, confidence, ratio)] }, 1.3)
      return controller.consume()
    }
    expect(send(1000, 'None', .2).targetScale).toBe(1.3)
    for (let i = 1; i < 30; i++) expect(send(1000 + i * 33, 'None', .2 + Math.sin(i) * .015).targetScale).toBe(1.3)
    expect(send(2000, 'Open_Palm', .75, .3).activity).toBe('ZOOMING')
    expect(send(2100, 'Open_Palm', .75).targetScale).toBe(1.3)
    expect(send(2250, 'None', .75).activity).toBe('ZOOMING')
    expect(send(2300, 'Open_Palm', .75).activity).toBe('ZOOMING')
    expect(send(2499, 'Open_Palm', .75).activity).toBe('ZOOMING')
    const exit = send(2500, 'Open_Palm', .75)
    expect(exit.activity).toBe('ROTATING'); expect(exit.targetScale).toBeNull()
    expect(exit.rotationX).toBe(0); expect(exit.rotationY).toBe(0)
  })
  it('rebases zoom after losing and reacquiring a hand', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand('None', .5, .5, true)] }, 1.6)
    expect(controller.consume().targetScale).toBe(1.6)
    controller.process({ timestamp: 1100, hands: [] }, 1.6)
    expect(controller.consume().activity).toBe('NO_HAND')
    controller.process({ timestamp: 1200, hands: [hand('None', .8, .8, true, .9, .25)] }, 1.6)
    const resumed = controller.consume()
    expect(resumed.targetScale).toBe(1.6); expect(resumed.rotationX).toBe(0); expect(resumed.rotationY).toBe(0)
  })
  it('filters small palm jitter but responds to deliberate movement', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand()] }, 1)
    controller.consume()
    controller.process({ timestamp: 1100, hands: [hand('None', 0.502)] }, 1)
    expect(controller.consume().rotationY).toBe(0)
    controller.process({ timestamp: 1200, hands: [hand('None', 0.62)] }, 1)
    expect(Math.abs(controller.consume().rotationY)).toBeGreaterThan(0)
  })
  it.each([15, 20, 30])('responds to slow movement on both axes at %i fps', fps => {
    const controller = new GestureController()
    let horizontal = 0, vertical = 0
    for (let i = 0; i <= fps; i++) {
      controller.process({ timestamp: 1000 + i * 1000 / fps, hands: [hand('Open_Palm', .3 + i * .12 / fps, .3 + i * .12 / fps)] }, 1)
      const intent = controller.consume()
      horizontal += intent.rotationY; vertical += intent.rotationX
    }
    expect(horizontal).toBeGreaterThan(.2)
    expect(vertical).toBeGreaterThan(.15)
  })
  it('does not accumulate bounded stationary jitter into rotation', () => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand()] }, 1); controller.consume()
    for (let i = 1; i <= 120; i++) {
      controller.process({ timestamp: 1000 + i * 33, hands: [hand('Open_Palm', .5 + Math.sin(i) * .004, .5 + Math.cos(i) * .004)] }, 1)
      const intent = controller.consume()
      expect(intent.rotationX).toBe(0); expect(intent.rotationY).toBe(0)
    }
  })
  it.each(['pinch', 'fist', 'lost'])('does not replay movement after %s', mode => {
    const controller = new GestureController()
    controller.process({ timestamp: 1000, hands: [hand()] }, 1); controller.consume()
    if (mode === 'lost') controller.onLost(1100)
    else {
      controller.process({ timestamp: 1100, hands: [hand(mode === 'fist' ? 'Closed_Fist' : 'None', .8, .7, mode === 'pinch')] }, 1)
      controller.consume()
    }
    for (let i = 0; i < 30; i++) {
      controller.process({ timestamp: 1200 + i * 33, hands: [hand('Open_Palm', .8, .7)] }, 1)
      const intent = controller.consume()
      expect(intent.rotationX).toBe(0); expect(intent.rotationY).toBe(0)
    }
    controller.process({ timestamp: 2300, hands: [hand('Open_Palm', .95, .85)] }, 1)
    expect(controller.consume().rotationY).toBeGreaterThan(0)
  })
})

describe('state machine', () => {
  it('rejects invalid jumps and accepts the interaction chain', () => {
    const machine = new AppStateMachine()
    expect(machine.transition('EXPLODED')).toBe(false)
    expect(machine.transition('IDLE')).toBe(true)
    expect(machine.transition('HAND_DETECTED')).toBe(true)
    expect(machine.transition('INTERACTIVE')).toBe(true)
    expect(machine.transition('EXPLODING')).toBe(true)
    expect(machine.transition('EXPLODED')).toBe(true)
    expect(machine.transition('ASSEMBLING')).toBe(true)
  })
})
