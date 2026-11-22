// Small datasets for the tests of the data visualization system.

import { parseDataset } from './parse'
import type { DatasetSnapshot } from './types'

export function snapshot(format: 'csv' | 'json' | 'geojson', text: string, id = 1): DatasetSnapshot {
  const r = parseDataset(format, text)
  if (!r.ok) throw new Error(r.reason)
  return { datasetId: id, versionId: id * 10, versionNumber: 1, versionLabel: null, format, table: r.dataset.table, geo: r.dataset.geo, publishedAt: '2026-11-01T00:00:00.000Z', file: null }
}

export const CASES_WIDE = snapshot(
  'csv',
  `Year,Escambia,Santa Rosa,Okaloosa
2019,120,80,60
2020,300,150,90
2021,210,170,130
2022,180,160,140
`,
)

export const CASES_LONG = snapshot(
  'csv',
  `Year,County,Cases
2020,Escambia,300
2020,Santa Rosa,150
2021,Escambia,210
2021,Santa Rosa,170
`,
)

export const COUNTY_VALUES = snapshot(
  'csv',
  `FIPS,County,Rate
12033,Escambia,12.5
12113,Santa Rosa,8
12091,Okaloosa,4.25
99999,Nowhere,1
`,
  2,
)

const square = (x: number, y: number) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] })

export const COUNTY_SHAPES = snapshot(
  'geojson',
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { GEOID: '12033', NAME: 'Escambia County' }, geometry: square(-87.5, 30.5) },
      { type: 'Feature', properties: { GEOID: '12113', NAME: 'Santa Rosa County' }, geometry: square(-86.5, 30.5) },
      { type: 'Feature', properties: { GEOID: '12091', NAME: 'Okaloosa County' }, geometry: square(-85.5, 30.5) },
    ],
  }),
  3,
)

export const PLACES = snapshot(
  'csv',
  `Name,Lat,Lon,Visitors
Pensacola,30.42,-87.22,500
Gulf Breeze,30.36,-87.16,200
`,
  4,
)
