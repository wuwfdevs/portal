// The map engine. Every map is drawn on the server as an SVG (Observable Plot's geo marks), which is what search engines, print, a slow
// connection and a screen reader's data table all rely on. When the editor turns "interactive" on, the same features are also handed to the
// pan-and-zoom map (MapLibre GL JS), which loads only when the reader asks for it.
//
// Three ways to get shapes (`MapSpec.geometry`): a GeoJSON dataset drawn as it is; rows with a latitude and a longitude; or rows joined to the
// shapes of a second dataset (a county table and a county boundary file). No basemap tiles are used: the site makes no request to a map
// provider on a reader's behalf unless the station sets one up (`MAP_STYLE_URL`, read by the view, never here).

import * as Plot from '@observablehq/plot'

import { equalSteps } from '../classes'
import { makeFormatter } from '../format'
import { BASE_SHAPE_COLOR, NO_DATA_COLOR, SHAPE_OUTLINE, blueRamp } from '../palette'
import { MAX_CLASSES, MAX_INTERACTIVE_VERTICES, MIN_CLASSES, checkFormat, validateMap, type MapSpec } from '../spec'
import { toSvgTree } from '../svg-tree'
import type { DatasetSnapshot, GeoCollection, GeoFeature } from '../types'
import { newDocument, plainTable } from './common'
import type { Engine, LegendEntry, MapModel, PrepareContext } from './types'

export interface MapFeature extends GeoFeature {
  properties: { label: string; value: number | null; color: string }
}

/** A join key that survives how agencies write the same place: case, spacing, leading zeros in a code, a trailing "County". */
export function joinKey(value: unknown): string {
  const s = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (/^\d+$/.test(s)) return String(Number(s))
  return s.replace(/ (county|parish)$/, '')
}

function vertexCount(value: unknown): number {
  if (!Array.isArray(value)) return 0
  if (value.length >= 2 && typeof value[0] === 'number') return 1
  return value.reduce<number>((n, v) => n + vertexCount(v), 0)
}

const firstTextColumn = (ds: DatasetSnapshot): string | null => ds.table.columns.find((c) => c.type === 'string')?.name ?? null

interface Built {
  features: MapFeature[]
  /** Rows (of the values dataset) that matched no shape. */
  unmatched: number
  matched: number
}

/** The shapes to draw with their values and colours. Pure; the browser's map calls the same function on the same inputs. */
export function buildMapFeatures(spec: MapSpec, dataset: DatasetSnapshot, boundary: DatasetSnapshot | null): Built {
  const label = spec.labelColumn ?? firstTextColumn(dataset)
  const raw: Array<{ geometry: GeoFeature['geometry']; label: string; value: number | null }> = []
  let unmatched = 0
  let matched = 0
  if (spec.geometry === 'dataset' && dataset.geo) {
    dataset.geo.features.forEach((f, i) => {
      const row = dataset.table.rows[i] ?? {}
      const v = spec.valueColumn ? row[spec.valueColumn] : null
      raw.push({ geometry: f.geometry, label: label ? String(row[label] ?? '') : '', value: typeof v === 'number' ? v : null })
    })
    matched = raw.length
  } else if (spec.geometry === 'points' && spec.latColumn && spec.lonColumn) {
    for (const row of dataset.table.rows) {
      const lat = row[spec.latColumn]
      const lon = row[spec.lonColumn]
      if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        unmatched++
        continue
      }
      const v = spec.valueColumn ? row[spec.valueColumn] : null
      raw.push({ geometry: { type: 'Point', coordinates: [lon, lat] }, label: label ? String(row[label] ?? '') : '', value: typeof v === 'number' ? v : null })
      matched++
    }
  } else if (spec.geometry === 'boundaries' && boundary?.geo && spec.joinColumn && spec.boundaryKey) {
    const byKey = new Map<string, number | null>()
    const labels = new Map<string, string>()
    for (const row of dataset.table.rows) {
      const k = joinKey(row[spec.joinColumn])
      const v = spec.valueColumn ? row[spec.valueColumn] : null
      byKey.set(k, typeof v === 'number' ? v : null)
      if (label) labels.set(k, String(row[label] ?? ''))
    }
    const seen = new Set<string>()
    boundary.geo.features.forEach((f) => {
      const k = joinKey(f.properties?.[spec.boundaryKey!])
      const hit = byKey.has(k)
      if (hit) {
        seen.add(k)
        matched++
      }
      raw.push({ geometry: f.geometry, label: labels.get(k) || String(f.properties?.[spec.boundaryKey!] ?? ''), value: hit ? (byKey.get(k) ?? null) : null })
    })
    unmatched = [...byKey.keys()].filter((k) => !seen.has(k)).length
  }
  const classes = spec.valueColumn
    ? equalSteps(raw.map((r) => r.value).filter((v): v is number => v !== null), spec.classes ?? 5, blueRamp(Math.max(MIN_CLASSES, Math.min(MAX_CLASSES, spec.classes ?? 5))), NO_DATA_COLOR)
    : null
  const features = raw.map<MapFeature>((r) => ({
    type: 'Feature',
    geometry: r.geometry,
    properties: { label: r.label, value: r.value, color: classes ? classes.colorOf(r.value) : spec.valueColumn ? NO_DATA_COLOR : BASE_SHAPE_COLOR },
  }))
  return { features, unmatched, matched }
}

/** The legend for the classes: "12 to 40", from the same edges that coloured the shapes. */
function legendFor(spec: MapSpec, features: MapFeature[]): LegendEntry[] {
  if (!spec.valueColumn) return []
  const values = features.map((f) => f.properties.value).filter((v): v is number => v !== null)
  const steps = Math.max(MIN_CLASSES, Math.min(MAX_CLASSES, spec.classes ?? 5))
  const ramp = blueRamp(steps)
  const classes = equalSteps(values, steps, ramp, NO_DATA_COLOR)
  if (!classes) return []
  const fmt = makeFormatter(spec.valueFormat)
  const n = classes.edges.length - 1
  if (n === 1) return [{ label: fmt(classes.edges[0]!), color: classes.colorOf(classes.edges[0]!) }]
  return Array.from({ length: n }, (_, i) => ({
    label: `${fmt(classes.edges[i]!)} to ${fmt(classes.edges[i + 1]!)}`,
    color: classes.colorOf(classes.edges[i]!),
  }))
}

function boundsOf(features: GeoFeature[]): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90
  const visit = (v: unknown) => {
    if (!Array.isArray(v)) return
    if (v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
      w = Math.min(w, v[0]); e = Math.max(e, v[0]); s = Math.min(s, v[1]); n = Math.max(n, v[1])
      return
    }
    v.forEach(visit)
  }
  for (const f of features) visit(f.geometry?.coordinates)
  return w > e ? [-180, -90, 180, 90] : [w, s, e, n]
}

export const mapEngine: Engine<MapSpec, MapModel> = {
  kind: 'map',
  label: 'Map',
  validate(spec, ctx) {
    const problems = [...validateMap(spec, ctx), ...(checkFormat(spec.valueFormat) ? [checkFormat(spec.valueFormat)!] : [])]
    if (problems.length > 0) return problems
    const built = buildMapFeatures(spec, ctx.dataset, ctx.boundary)
    if (built.features.length === 0) problems.push('Nothing on this map can be drawn: no rows have a usable position.')
    else if (spec.geometry === 'boundaries' && built.matched === 0) problems.push(`None of the values in "${spec.joinColumn}" match a "${spec.boundaryKey}" on the boundaries. Check that both name places the same way (county names, or FIPS codes).`)
    if (spec.interactive) {
      const vertices = built.features.reduce((n, f) => n + vertexCount(f.geometry?.coordinates), 0)
      if (vertices > MAX_INTERACTIVE_VERTICES) problems.push(`An interactive map is limited to ${MAX_INTERACTIVE_VERTICES.toLocaleString('en-US')} points of geometry (this one has ${vertices.toLocaleString('en-US')}). Simplify the shapes, or turn interactive off: the drawing stays.`)
    }
    return problems
  },
  prepare(spec, ctx: PrepareContext) {
    const built = buildMapFeatures(spec, ctx.dataset, ctx.boundary)
    if (built.features.length === 0) throw new Error('The map has nothing to draw.')
    const collection: GeoCollection = { type: 'FeatureCollection', features: built.features }
    const points = spec.geometry === 'points'
    const plot = Plot.plot({
      document: newDocument(),
      width: 720,
      margin: 8,
      style: { fontSize: '12px', fontFamily: 'inherit', overflow: 'visible' },
      projection: points ? { type: 'mercator', domain: collection, inset: 24 } : { type: 'mercator', domain: collection, inset: 8 },
      marks: [
        points
          ? Plot.dot(built.features, Plot.geoCentroid({ r: 5, fill: (d: MapFeature) => d.properties.color, stroke: SHAPE_OUTLINE, strokeWidth: 0.75, title: (d: MapFeature) => d.properties.label }))
          : Plot.geo(built.features, { fill: (d: MapFeature) => d.properties.color, stroke: SHAPE_OUTLINE, strokeWidth: 0.75, title: (d: MapFeature) => d.properties.label }),
      ],
    })
    const svg = toSvgTree(plot as never, `${ctx.idPrefix}-`)
    if (!svg) throw new Error('The map could not be drawn.')
    const legend = legendFor(spec, built.features)
    const names = [
      ...(spec.labelColumn ?? firstTextColumn(ctx.dataset) ? [spec.labelColumn ?? firstTextColumn(ctx.dataset)!] : []),
      ...(spec.valueColumn ? [spec.valueColumn] : []),
      ...(spec.geometry === 'points' ? [spec.latColumn!, spec.lonColumn!] : []),
    ].filter((n, i, all) => all.indexOf(n) === i)
    const bounds = boundsOf(built.features)
    return {
      engine: 'map',
      svg,
      legend,
      legendTitle: spec.legendTitle ?? spec.valueColumn ?? null,
      hasNoData: spec.valueColumn != null && built.features.some((f) => f.properties.value === null),
      unmatched: built.unmatched,
      summary: `Map of ${built.features.length} ${points ? 'places' : 'areas'}${spec.valueColumn ? `, coloured by ${spec.valueColumn}` : ''}.`,
      dataTable: plainTable(ctx.dataset.table, names, spec.valueColumn ? { [spec.valueColumn]: spec.valueFormat } : {}),
      interactive: spec.interactive
        ? { features: collection, bounds, center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], attribution: ctx.dataset.file ? null : null }
        : null,
    }
  },
}
