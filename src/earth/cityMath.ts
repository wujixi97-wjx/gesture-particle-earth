import * as THREE from 'three'

export type LabelRect = { x: number; y: number; width: number; height: number }

export function geoToUnit(lat: number, lon: number): THREE.Vector3 {
  const latitude = lat * Math.PI / 180
  const longitude = lon * Math.PI / 180
  const ring = Math.cos(latitude)
  return new THREE.Vector3(Math.sin(longitude) * ring, Math.sin(latitude), Math.cos(longitude) * ring)
}

// Euler XYZ: rotate longitude to +Z, then latitude toward the camera.
export function cityFocusRotation(lat: number, lon: number, currentYaw: number): { x: number; y: number } {
  const targetYaw = -lon * Math.PI / 180
  const delta = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw))
  return { x: Math.max(-1.1, Math.min(1.1, lat * Math.PI / 180)), y: currentYaw + delta }
}

export function isFrontFacing(normal: THREE.Vector3, toCamera: THREE.Vector3, threshold = 0.28): boolean {
  return normal.dot(toCamera) >= threshold
}

export function rectanglesOverlap(a: LabelRect, b: LabelRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y
}
