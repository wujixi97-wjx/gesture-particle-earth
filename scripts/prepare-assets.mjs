import { mkdir, readdir, copyFile, writeFile } from 'node:fs/promises'

const publicDir = new URL('../public/', import.meta.url)
const mediaDir = new URL('../public/mediapipe/', import.meta.url)
const wasmDir = new URL('../public/mediapipe/wasm/', import.meta.url)
await mkdir(wasmDir, { recursive: true })

const sourceWasm = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url)
for (const name of await readdir(sourceWasm)) {
  if (!name.includes('module') && (name.endsWith('.wasm') || name.endsWith('.js'))) await copyFile(new URL(name, sourceWasm), new URL(name, wasmDir))
}

async function download(url, target) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
}

await download('https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task', new URL('gesture_recognizer.task', mediaDir))

const mapResponse = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson')
if (!mapResponse.ok) throw new Error(`Natural Earth download failed: ${mapResponse.status}`)
const geojson = await mapResponse.json()
const project = ([lon, lat]) => `${((lon + 180) * 4).toFixed(2)},${((90 - lat) * 4).toFixed(2)}`
const rings = []
for (const feature of geojson.features) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  for (const polygon of polygons) {
    for (const ring of polygon) rings.push(`M${ring.map(project).join('L')}Z`)
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="720" viewBox="0 0 1440 720"><rect width="1440" height="720" fill="black"/><path d="${rings.join('')}" fill="white" fill-rule="evenodd"/></svg>`
await writeFile(new URL('world-mask.svg', publicDir), svg)
console.log(`Prepared MediaPipe WASM, gesture model, and Natural Earth mask (${rings.length} rings).`)
