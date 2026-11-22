import { describe, expect, it } from 'vitest'

import { CASES_LONG, CASES_WIDE, COUNTY_SHAPES, COUNTY_VALUES, PLACES } from '../fixtures'
import type { ChartSpec, MapSpec, TableSpec } from '../spec'
import { buildMapFeatures, joinKey } from './map'
import { chartRecords } from './chart'
import { prepareSpec, validateSpec } from './index'
import type { ChartModel, MapModel, TableModel } from './types'
import type { SvgNode } from '../svg-tree'

const ctx = (dataset = CASES_WIDE, boundary = null as typeof COUNTY_SHAPES | null) => ({ dataset, boundary })
const prep = (spec: Parameters<typeof prepareSpec>[0], c: ReturnType<typeof ctx>) => prepareSpec(spec, { ...c, idPrefix: 'v1' }, 'v1')

const walk = (n: SvgNode | string, f: (n: SvgNode) => void) => {
  if (typeof n === 'string') return
  f(n)
  n.children.forEach((c) => walk(c, f))
}
const tags = (n: SvgNode) => {
  const s = new Set<string>()
  walk(n, (x) => s.add(x.tag))
  return s
}
const ids = (n: SvgNode) => {
  const out: string[] = []
  walk(n, (x) => x.attrs.id && out.push(x.attrs.id))
  return out
}

const wideLine: ChartSpec = { kind: 'chart', type: 'line', x: 'Year', y: ['Escambia', 'Santa Rosa', 'Okaloosa'] }

describe('chart engine', () => {
  it('draws a multi-series line chart twice (wide and narrow) as a tree of drawing tags only', () => {
    const m = prep(wideLine, ctx()) as ChartModel
    expect(m.engine).toBe('chart')
    expect(m.wide.attrs.width).toBe('720')
    expect(m.narrow.attrs.width).toBe('360')
    for (const svg of [m.wide, m.narrow]) {
      expect(tags(svg).has('path')).toBe(true)
      expect([...tags(svg)].every((t) => ['svg', 'g', 'path', 'rect', 'line', 'circle', 'text', 'tspan', 'title', 'desc', 'defs', 'clipPath', 'ellipse', 'polyline', 'polygon', 'linearGradient', 'stop'].includes(t))).toBe(true)
    }
    expect(m.legend.map((l) => l.label)).toEqual(['Escambia', 'Santa Rosa', 'Okaloosa'])
    expect(new Set(m.legend.map((l) => l.color)).size).toBe(3)
  })
  it('keeps ids apart between the wide and narrow drawings and between visualizations', () => {
    const a = prep(wideLine, ctx()) as ChartModel
    const all = [...ids(a.wide), ...ids(a.narrow)]
    expect(new Set(all).size).toBe(all.length)
    expect(all.every((i) => i.startsWith('v1-'))).toBe(true)
  })
  it('has a text table of exactly the columns drawn, formatted', () => {
    const m = prep({ ...wideLine, yFormat: { style: 'number', suffix: ' cases' } }, ctx()) as ChartModel
    expect(m.dataTable.columns).toEqual(['Year', 'Escambia', 'Santa Rosa', 'Okaloosa'])
    expect(m.dataTable.rows[0]).toEqual(['2019', '120 cases', '80 cases', '60 cases'])
    expect(m.summary).toMatch(/Line chart/)
  })
  it('splits one value column by a series column (long data), and a one-series chart has no legend', () => {
    const long: ChartSpec = { kind: 'chart', type: 'column', x: 'Year', y: ['Cases'], series: 'County' }
    expect(chartRecords(long, CASES_LONG.table).seriesNames).toEqual(['Escambia', 'Santa Rosa'])
    const one = prep({ kind: 'chart', type: 'column', x: 'Year', y: ['Escambia'] }, ctx()) as ChartModel
    expect(one.legend).toEqual([])
  })
  it('draws every chart type, with a date axis, a category axis and a number axis', () => {
    const dated = { ...CASES_WIDE, table: { ...CASES_WIDE.table } }
    for (const type of ['line', 'area', 'column', 'bar', 'scatter'] as const) {
      const spec: ChartSpec = { kind: 'chart', type, x: 'Year', y: ['Escambia'], sort: type === 'bar' ? 'valueDesc' : null }
      expect(() => prep(spec, ctx(dated))).not.toThrow()
    }
    const cat = prep({ kind: 'chart', type: 'bar', x: 'County', y: ['Cases'], sort: 'valueDesc' }, ctx(CASES_LONG)) as ChartModel
    expect(cat.wide.children.length).toBeGreaterThan(0)
  })
  it('leaves empty values out rather than drawing them as zero, and refuses a chart with nothing to draw', () => {
    const t = { ...CASES_WIDE, table: { ...CASES_WIDE.table, rows: CASES_WIDE.table.rows.map((r, i) => (i === 1 ? { ...r, Escambia: null } : r)) } }
    expect(chartRecords(wideLine, t.table).records.filter((r) => r.series === 'Escambia')).toHaveLength(3)
    const empty = { ...CASES_WIDE, table: { ...CASES_WIDE.table, rows: CASES_WIDE.table.rows.map((r) => ({ ...r, Escambia: null })) } }
    expect(() => prep({ kind: 'chart', type: 'line', x: 'Year', y: ['Escambia'] }, ctx(empty))).toThrow(/no values/)
  })
  it('does not let a column heading that looks like markup become markup', () => {
    const t = { ...CASES_WIDE, table: { columns: [{ name: 'Year', type: 'number' as const, empty: 0 }, { name: '<img src=x onerror=alert(1)>', type: 'number' as const, empty: 0 }], rows: [{ Year: 2020, '<img src=x onerror=alert(1)>': 4 }, { Year: 2021, '<img src=x onerror=alert(1)>': 7 }] } }
    const m = prep({ kind: 'chart', type: 'line', x: 'Year', y: ['<img src=x onerror=alert(1)>'] }, ctx(t)) as ChartModel
    expect(tags(m.wide).has('img')).toBe(false)
    expect(JSON.stringify(m.wide)).not.toContain('onerror=alert(1)>"')
  })
})

describe('chart validation', () => {
  const v = (s: ChartSpec, c = ctx()) => validateSpec(s, c)
  it('accepts a good chart', () => expect(v(wideLine)).toEqual([]))
  it('names the columns that exist when one does not', () => {
    expect(v({ ...wideLine, x: 'Yr' })[0]).toMatch(/"Yr" is not in this dataset. Columns: Year, Escambia/)
  })
  it('wants a number for the value, and for a scatter x', () => {
    expect(v({ kind: 'chart', type: 'line', x: 'Year', y: ['Year', 'County'] }, ctx(CASES_LONG))[0]).toMatch(/County|not in this dataset/)
    expect(v({ kind: 'chart', type: 'scatter', x: 'County', y: ['Cases'] }, ctx(CASES_LONG))[0]).toMatch(/needs number/)
  })
  it('refuses several value columns together with a series column, and too many series', () => {
    expect(v({ kind: 'chart', type: 'line', x: 'Year', y: ['Cases', 'Year'], series: 'County' }, ctx(CASES_LONG)).join(' ')).toMatch(/either several value columns/)
    expect(v({ ...wideLine, y: Array(7).fill('Escambia') }).join(' ')).toMatch(/6 series at most/)
  })
  it('refuses a series column with more values than there are colours', () => {
    const many = { ...CASES_LONG, table: { ...CASES_LONG.table, rows: Array.from({ length: 8 }, (_, i) => ({ Year: 2020, County: `C${i}`, Cases: i })) } }
    expect(v({ kind: 'chart', type: 'line', x: 'Year', y: ['Cases'], series: 'County' }, ctx(many)).join(' ')).toMatch(/8 different values/)
  })
})

describe('map engine', () => {
  const choropleth: MapSpec = { kind: 'map', geometry: 'boundaries', joinColumn: 'FIPS', boundaryKey: 'GEOID', valueColumn: 'Rate', labelColumn: 'County', classes: 3 }
  it('matches codes and names the way agencies write them', () => {
    expect(joinKey('01')).toBe(joinKey('1'))
    expect(joinKey('Escambia County')).toBe(joinKey(' escambia '))
    expect(joinKey('12033')).toBe('12033')
  })
  it('joins values to shapes, colours them in steps, and counts the rows that matched nothing', () => {
    const b = buildMapFeatures(choropleth, COUNTY_VALUES, COUNTY_SHAPES)
    expect(b.features).toHaveLength(3)
    expect(b.matched).toBe(3)
    expect(b.unmatched).toBe(1)
    expect(b.features.map((f) => f.properties.value)).toEqual([12.5, 8, 4.25])
    expect(new Set(b.features.map((f) => f.properties.color)).size).toBe(3)
  })
  it('draws the map as a tree, with a legend from the same steps and a text table', () => {
    const m = prep(choropleth, ctx(COUNTY_VALUES, COUNTY_SHAPES)) as MapModel
    expect(tags(m.svg).has('path')).toBe(true)
    expect(m.svg.attrs.width).toBe('720')
    expect(m.narrow.attrs.width).toBe('360')
    expect(m.legend).toHaveLength(3)
    expect(m.legend[0]!.label).toMatch(/ to /)
    expect(m.unmatched).toBe(1)
    expect(m.interactive).toBeNull()
    expect(m.dataTable.columns).toEqual(['County', 'Rate'])
  })
  it('hands the shapes to the interactive map only when it is switched on', () => {
    const m = prep({ ...choropleth, interactive: true }, ctx(COUNTY_VALUES, COUNTY_SHAPES)) as MapModel
    expect(m.interactive?.features.features).toHaveLength(3)
    expect(m.interactive?.bounds).toEqual([-87.5, 30.5, -84.5, 31.5])
  })
  it('draws a GeoJSON dataset as it is, and rows with a latitude and longitude as points', () => {
    expect(() => prep({ kind: 'map', geometry: 'dataset', labelColumn: 'NAME' }, ctx(COUNTY_SHAPES))).not.toThrow()
    const m = prep({ kind: 'map', geometry: 'points', latColumn: 'Lat', lonColumn: 'Lon', valueColumn: 'Visitors', labelColumn: 'Name' }, ctx(PLACES)) as MapModel
    expect(tags(m.svg).has('circle') || tags(m.svg).has('path')).toBe(true)
  })
  it('says what is wrong: no match at all, a table where shapes were wanted, a missing column', () => {
    const v = (s: MapSpec, c: ReturnType<typeof ctx>) => validateSpec(s, c)
    expect(v({ ...choropleth, joinColumn: 'County', boundaryKey: 'NAME' }, ctx(COUNTY_VALUES, COUNTY_SHAPES))).toEqual([])
    expect(v({ ...choropleth, joinColumn: 'County' }, ctx(COUNTY_VALUES, COUNTY_SHAPES)).join(' ')).toMatch(/None of the values/)
    expect(v({ kind: 'map', geometry: 'dataset' }, ctx(COUNTY_VALUES)).join(' ')).toMatch(/is a table/)
    expect(v({ ...choropleth, valueColumn: 'Rte' }, ctx(COUNTY_VALUES, COUNTY_SHAPES)).join(' ')).toMatch(/"Rte" is not in this dataset/)
    expect(v({ ...choropleth, boundaryKey: 'Nope' }, ctx(COUNTY_VALUES, COUNTY_SHAPES)).join(' ')).toMatch(/no property "Nope"/)
    expect(v(choropleth, ctx(COUNTY_VALUES, null)).join(' ')).toMatch(/GeoJSON dataset for the boundaries/)
  })
  it('keeps points that are off the globe out, and counts them', () => {
    const bad = { ...PLACES, table: { ...PLACES.table, rows: [...PLACES.table.rows, { Name: 'X', Lat: 300, Lon: 0, Visitors: 1 }] } }
    const b = buildMapFeatures({ kind: 'map', geometry: 'points', latColumn: 'Lat', lonColumn: 'Lon' }, bad, null)
    expect(b.features).toHaveLength(2)
    expect(b.unmatched).toBe(1)
  })
})

describe('drawing details found by looking at screenshots', () => {
  it('rewinds polygons so a counter-clockwise outer ring (RFC 7946) is not drawn as the whole world', async () => {
    const { rewound } = await import('./map')
    const ccw = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
    const out = rewound(ccw) as { coordinates: number[][][] }
    expect(out.coordinates[0]![1]).toEqual([0, 1])
    const m = prep({ kind: 'map', geometry: 'boundaries', joinColumn: 'County', boundaryKey: 'NAME', valueColumn: 'Rate', classes: 4 }, ctx(COUNTY_VALUES, COUNTY_SHAPES)) as MapModel
    const widths: number[] = []
    walk(m.svg, (n) => { if (n.tag === 'path' && n.attrs.d) widths.push(n.attrs.d.length) })
    expect(Math.max(...widths)).toBeLessThan(400)
  })
  it('puts year ticks on the years, not between them', () => {
    const m = prep(wideLine, ctx()) as ChartModel
    const labels: string[] = []
    walk(m.wide, (n) => n.children.forEach((c) => typeof c === 'string' && labels.push(c)))
    expect(labels).toContain('2019')
    expect(labels.some((l) => /\.5$/.test(l))).toBe(false)
    expect(labels).not.toContain('2,019')
  })
})

describe('table engine', () => {
  const spec: TableSpec = { kind: 'table', columns: [{ column: 'County', label: 'Place' }, { column: 'Rate', format: { style: 'number', decimals: 1 } }], sortColumn: 'Rate', sortDirection: 'desc', searchable: true, pageSize: 3 }
  it('picks and renames columns, keeps raw cells, and carries the sort and the page size', () => {
    const m = prep(spec, ctx(COUNTY_VALUES)) as TableModel
    expect(m.columns.map((c) => c.label)).toEqual(['Place', 'Rate'])
    expect(m.rows[0]).toEqual(['Escambia', 12.5])
    expect(m.sort).toEqual({ column: 'Rate', direction: 'desc' })
    expect(m.pageSize).toBe(5)
    expect(m.searchable).toBe(true)
  })
  it('shows every column when none are chosen, and refuses a column that is not there', () => {
    expect((prep({ kind: 'table', columns: [] }, ctx(COUNTY_VALUES)) as TableModel).columns).toHaveLength(3)
    expect(validateSpec({ kind: 'table', columns: [{ column: 'Nope' }] }, ctx(COUNTY_VALUES))[0]).toMatch(/not in this dataset/)
  })
})

describe('embed engine', () => {
  it('uses the site embed rules: a known host passes, an address on this site or a plain http address does not', () => {
    expect(validateSpec({ kind: 'embed', url: 'https://datawrapper.dwcdn.net/abc12/1/' }, null, [])).toEqual([])
    expect(validateSpec({ kind: 'embed', url: 'http://example.com/x' }, null, [])[0]).toBeTruthy()
    expect(validateSpec({ kind: 'embed', url: '' }, null, [])[0]).toMatch(/Enter the address/)
  })
  it('needs no dataset', () => {
    expect(prepareSpec({ kind: 'embed', url: 'https://flo.uri.sh/visualisation/1/embed', width: 600, height: 400 }, null)).toEqual({ engine: 'embed', url: 'https://flo.uri.sh/visualisation/1/embed', width: 600, height: 400 })
  })
  it('asks for a dataset when a chart has none', () => {
    expect(validateSpec(wideLine, null)).toEqual(['Choose a dataset.'])
  })
})
