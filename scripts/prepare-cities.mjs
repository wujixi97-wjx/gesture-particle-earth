import { mkdir, writeFile } from 'node:fs/promises'

const base = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/'
async function read(name) {
  const response = await fetch(`${base}${name}`)
  if (!response.ok) throw new Error(`Natural Earth download failed (${response.status}): ${name}`)
  return (await response.json()).features
}

const [places110, places50, places10, countries] = await Promise.all([
  read('ne_110m_populated_places.geojson'),
  read('ne_50m_populated_places.geojson'),
  read('ne_10m_populated_places.geojson'),
  read('ne_110m_admin_0_countries.geojson'),
])

const selected = [...places110]
const covered = new Set(selected.map(({ properties }) => properties.ADM0_A3))
// These Natural Earth map units have no permanent cities to label.
const noCity = new Set(['ATA', 'ATF'])
for (const { properties: country } of countries) {
  const code = country.ADM0_A3
  if (covered.has(code) || noCity.has(code)) continue
  const candidates = places50.filter(({ properties }) => properties.ADM0_A3 === code)
  if (!candidates.length) {
    const sourceCode = code === 'SDS' ? 'SSD' : code
    candidates.push(...places10.filter(({ properties }) => properties.ADM0_A3 === sourceCode))
  }
  candidates.sort((a, b) => {
    if (code === 'SDS') return Number(b.properties.NAME === 'Juba') - Number(a.properties.NAME === 'Juba')
    return Number(b.properties.ADM0CAP) - Number(a.properties.ADM0CAP)
      || Number(b.properties.POP_MAX) - Number(a.properties.POP_MAX)
  })
  if (!candidates.length) throw new Error(`No populated place found for ${country.ADMIN} (${code})`)
  const place = candidates[0]
  selected.push({ ...place, properties: { ...place.properties, ADM0_A3: code } })
  covered.add(code)
}

const cities = selected.map(({ properties: place, geometry }) => {
  const population = Number(place.POP_MAX) || 0
  const rank = Number(place.LABELRANK) || 10
  return {
    name: place.NAMEASCII || place.NAME,
    country: place.ADM0_A3,
    lat: Number(geometry.coordinates[1].toFixed(5)),
    lon: Number(geometry.coordinates[0].toFixed(5)),
    capital: Number(place.ADM0CAP) === 1,
    priority: Math.round((Number(place.ADM0CAP) === 1 ? 10 : 0)
      + (Number(place.WORLDCITY) === 1 ? 5 : 0)
      + Math.log10(population + 1) * 3 - rank * 2),
  }
}).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))

const expectedCountryCodes = countries.map(({ properties }) => properties.ADM0_A3)
  .filter(code => !noCity.has(code)).sort()
const output = new URL('../src/data/', import.meta.url)
await mkdir(output, { recursive: true })
await writeFile(new URL('cities.ts', output),
  `// Generated from Natural Earth populated places. Public domain: https://www.naturalearthdata.com/about/terms-of-use/\n`
  + `export type CityRecord = { name: string; country: string; lat: number; lon: number; capital: boolean; priority: number }\n`
  + `export const CITIES: CityRecord[] = ${JSON.stringify(cities, null, 2)}\n`
  + `export const EXPECTED_COUNTRY_CODES = ${JSON.stringify(expectedCountryCodes)} as const\n`)
console.log(`Prepared ${cities.length} local city markers covering ${expectedCountryCodes.length}/${expectedCountryCodes.length} populated Natural Earth map units.`)
