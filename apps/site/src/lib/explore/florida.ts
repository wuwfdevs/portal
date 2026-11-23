// Where Explore's map starts. Florida, west to east and south to north in degrees, a little beyond the outline so the Keys and the Panhandle sit inside the frame. Pure.

import type { MapBounds } from './filter'

export const FLORIDA_BOUNDS: [[number, number], [number, number]] = [
  [-87.9, 24.2],
  [-79.7, 31.2],
]

/** The map's bounds as the filter reads them. */
export function boundsOf(sw: { lng: number; lat: number }, ne: { lng: number; lat: number }): MapBounds {
  return { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat }
}

/** Where the outline file is served from: this site's own `public/data`, so no third party is asked for it. */
export const FLORIDA_OUTLINE_URL = '/data/florida-outline.geojson'
