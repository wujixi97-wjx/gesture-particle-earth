import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { cityFocusRotation, geoToUnit } from '../../src/earth/cityMath'

describe('city focus', () => {
  it.each([[39.90172, 116.3942], [-6.17247, 106.82749], [51.5, -.12], [-33.9, 18.4]])('centers %s/%s on the visible hemisphere', (lat, lon) => {
    const focus = cityFocusRotation(lat, lon, -1.75)
    const point = geoToUnit(lat, lon).applyEuler(new THREE.Euler(focus.x, focus.y, 0))
    expect(point.x).toBeCloseTo(0); expect(point.y).toBeCloseTo(0); expect(point.z).toBeCloseTo(1)
  })
  it('takes the shortest yaw path and respects the existing pitch range', () => {
    for (const yaw of [-20, -3, 0, 3, 20]) {
      const focus = cityFocusRotation(85, -179, yaw)
      expect(Math.abs(focus.y - yaw)).toBeLessThanOrEqual(Math.PI)
      expect(focus.x).toBe(1.1)
    }
  })
})
