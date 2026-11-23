import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { FLORIDA_BOUNDS, FLORIDA_OUTLINE_URL, boundsOf } from './florida'

const file = path.resolve(process.cwd(), 'public', FLORIDA_OUTLINE_URL.replace(/^\//, ''))
const geo = JSON.parse(readFileSync(file, 'utf8')) as { type: string; features: Array<{ properties: { name: string; source: string }; geometry: { type: string; coordinates: number[][][][] } }> }
const polygons = geo.features[0]!.geometry.coordinates

// Even-odd ray casting over every polygon's outer ring.
const inside = (lng: number, lat: number): boolean =>
  polygons.some((poly) => {
    const ring = poly[0]!
    let c = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!
      const [xj, yj] = ring[j]!
      if (yi! > lat !== yj! > lat && lng < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) c = !c
    }
    return c
  })

describe('the self-hosted Florida outline', () => {
  it('is a small file this site serves, with its source named, so the map asks no third party for the state', () => {
    expect(FLORIDA_OUTLINE_URL.startsWith('/')).toBe(true)
    expect(statSync(file).size).toBeLessThan(40_000)
    expect(geo.type).toBe('FeatureCollection')
    expect(geo.features[0]!.properties.name).toBe('Florida')
    expect(geo.features[0]!.properties.source).toMatch(/Natural Earth/)
  })
  it('has closed rings that sit inside the map\'s starting frame', () => {
    const [[w, s], [e, n]] = FLORIDA_BOUNDS
    for (const poly of polygons) {
      const ring = poly[0]!
      expect(ring.length).toBeGreaterThanOrEqual(4)
      expect(ring[0]).toEqual(ring[ring.length - 1])
      for (const [x, y] of ring) {
        expect(x).toBeGreaterThanOrEqual(w)
        expect(x).toBeLessThanOrEqual(e)
        expect(y).toBeGreaterThanOrEqual(s)
        expect(y).toBeLessThanOrEqual(n)
      }
    }
  })
  it('is Florida: land where its cities are, water and other states where they are not', () => {
    expect(inside(-84.28, 30.44), 'Tallahassee').toBe(true)
    expect(inside(-81.66, 30.33), 'Jacksonville').toBe(true)
    expect(inside(-81.78, 26.64), 'Fort Myers').toBe(true)
    expect(inside(-81.8, 24.556), 'Old Town Key West').toBe(true)
    expect(inside(-84.39, 33.75), 'Atlanta').toBe(false)
    expect(inside(-86.0, 28.0), 'the Gulf').toBe(false)
    expect(inside(-79.9, 28.0), 'the Atlantic').toBe(false)
  })
  it('turns a map\'s corners into the bounds the filter reads', () => {
    expect(boundsOf({ lng: -88, lat: 24 }, { lng: -80, lat: 31 })).toEqual({ west: -88, south: 24, east: -80, north: 31 })
  })
})
