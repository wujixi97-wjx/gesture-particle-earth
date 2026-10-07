import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CITIES, EXPECTED_COUNTRY_CODES } from '../../src/data/cities'
import { geoToUnit, isFrontFacing, rectanglesOverlap } from '../../src/earth/cityMath'

describe('city coordinates and visibility', () => {
  it('uses the same east-positive globe orientation as the particle map', () => {
    expect(geoToUnit(0, 0).toArray()).toEqual([0, 0, 1])
    expect(geoToUnit(0, 90).x).toBeCloseTo(1)
    expect(geoToUnit(0, -90).x).toBeCloseTo(-1)
    expect(geoToUnit(90, 0).y).toBeCloseTo(1)
    expect(geoToUnit(45, 45).length()).toBeCloseTo(1)
  })

  it('hides back-side and near-limb markers', () => {
    const towardCamera = new THREE.Vector3(0, 0, 1)
    expect(isFrontFacing(new THREE.Vector3(0, 0, 1), towardCamera)).toBe(true)
    expect(isFrontFacing(new THREE.Vector3(0, 0, -1), towardCamera)).toBe(false)
    expect(isFrontFacing(new THREE.Vector3(1, 0, 0), towardCamera)).toBe(false)
  })

  it('rejects overlapping city name rectangles', () => {
    const first = { x: 100, y: 100, width: 70, height: 20 }
    expect(rectanglesOverlap(first, { x: 160, y: 110, width: 70, height: 20 })).toBe(true)
    expect(rectanglesOverlap(first, { x: 180, y: 110, width: 70, height: 20 })).toBe(false)
  })
})

describe('local Natural Earth city catalogue', () => {
  it('has at least one city for every populated 110m map unit', () => {
    const covered = new Set(CITIES.map(city => city.country))
    expect(EXPECTED_COUNTRY_CODES.filter(code => !covered.has(code))).toEqual([])
    expect(EXPECTED_COUNTRY_CODES).toHaveLength(175)
    expect(CITIES).toHaveLength(250)
    expect(CITIES.find(city => city.country === 'SDS')?.name).toBe('Juba')
  })

  it('contains valid names and coordinates', () => {
    for (const city of CITIES) {
      expect(city.name.length).toBeGreaterThan(0)
      expect(city.lat).toBeGreaterThanOrEqual(-90)
      expect(city.lat).toBeLessThanOrEqual(90)
      expect(city.lon).toBeGreaterThanOrEqual(-180)
      expect(city.lon).toBeLessThanOrEqual(180)
    }
  })
})
