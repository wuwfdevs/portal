// A stored record becomes what the engines read. Nothing here trusts what is stored: a deleted relation arrives as a bare id, a field an editor
// cleared arrives as null, and an old record may lack a field a later version of the form added. Anything that cannot be read is left out, and
// `validateSpec` then says what is missing. Pure.

import { DEFAULT_PAGE_SIZE, type ChartSpec, type ChartType, type MapSpec, type TableSpec, type ValueFormat, type VizSpec, CHART_TYPES } from './spec'
import type { Cell, DatasetFormat, DatasetSnapshot, GeoCollection, Row, Column } from './types'

type Loose = Record<string, unknown> | null | undefined

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** The id of a relation, whether it arrived as an id or as a populated record; null when it is missing. */
export function relationId(v: unknown): number | string | null {
  if (typeof v === 'number' || (typeof v === 'string' && v !== '')) return v
  if (v && typeof v === 'object' && 'id' in v) {
    const id = (v as { id: unknown }).id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

export function valueFormatOf(v: unknown): ValueFormat | null {
  const f = obj(v)
  const style = f.style === 'percent' || f.style === 'currency' ? f.style : f.style === 'number' ? 'number' : null
  if (!style) return null
  return { style, decimals: num(f.decimals), compact: f.compact === true, prefix: str(f.prefix), suffix: str(f.suffix) }
}

const CHART_TYPE_VALUES = new Set<string>(CHART_TYPES.map((t) => t.value))

/** The configuration of a stored visualization, or null when its kind is unknown. */
export function specOf(doc: Loose): VizSpec | null {
  const d = obj(doc)
  switch (d.kind) {
    case 'chart': {
      const c = obj(d.chart)
      return {
        kind: 'chart',
        type: (CHART_TYPE_VALUES.has(String(c.type)) ? c.type : 'line') as ChartType,
        x: str(c.x) ?? '',
        y: list(c.y),
        series: str(c.series),
        xLabel: str(c.xLabel),
        yLabel: str(c.yLabel),
        yFormat: valueFormatOf(c.yFormat),
        zeroBaseline: typeof c.zeroBaseline === 'boolean' ? c.zeroBaseline : null,
        sort: c.sort === 'valueDesc' || c.sort === 'valueAsc' ? c.sort : 'data',
      } satisfies ChartSpec
    }
    case 'map': {
      const m = obj(d.map)
      return {
        kind: 'map',
        geometry: m.geometry === 'points' || m.geometry === 'boundaries' ? m.geometry : 'dataset',
        valueColumn: str(m.valueColumn),
        labelColumn: str(m.labelColumn),
        latColumn: str(m.latColumn),
        lonColumn: str(m.lonColumn),
        joinColumn: str(m.joinColumn),
        boundaryKey: str(m.boundaryKey),
        classes: num(m.classes),
        legendTitle: str(m.legendTitle),
        valueFormat: valueFormatOf(m.valueFormat),
        interactive: m.interactive === true,
      } satisfies MapSpec
    }
    case 'table': {
      const t = obj(d.table)
      return {
        kind: 'table',
        columns: (Array.isArray(t.columns) ? t.columns : []).flatMap((c) => {
          const o = obj(c)
          const column = str(o.column)
          return column ? [{ column, label: str(o.label), format: valueFormatOf(o.format) }] : []
        }),
        sortColumn: str(t.sortColumn),
        sortDirection: t.sortDirection === 'desc' ? 'desc' : 'asc',
        searchable: t.searchable === true,
        pageSize: num(t.pageSize) ?? DEFAULT_PAGE_SIZE,
      } satisfies TableSpec
    }
    case 'embed': {
      const e = obj(d.embed)
      return { kind: 'embed', url: str(e.url) ?? '', width: num(e.width), height: num(e.height) }
    }
    default:
      return null
  }
}

/** The stored parsed data of a dataset version (`data`: rows and geometry, `columns`), checked for shape. */
export function snapshotOf(version: Loose, dataset: { id: number | string }, filePrefix = ''): DatasetSnapshot | null {
  const v = obj(version)
  const data = obj(v.data)
  const versionId = relationId(v.id)
  if (versionId === null || !Array.isArray(data.rows) || !Array.isArray(v.columns)) return null
  const columns: Column[] = (v.columns as unknown[]).flatMap((c) => {
    const o = obj(c)
    const name = str(o.name)
    const type = o.type === 'number' || o.type === 'date' || o.type === 'boolean' || o.type === 'string' ? o.type : null
    return name && type ? [{ name, type, empty: num(o.empty) ?? 0 }] : []
  })
  const geo = obj(data.geo)
  const format: DatasetFormat = v.format === 'json' || v.format === 'geojson' ? v.format : 'csv'
  const url = str(v.url)
  return {
    datasetId: dataset.id,
    versionId,
    versionNumber: num(v.version) ?? 0,
    versionLabel: str(v.label),
    format,
    table: { columns, rows: data.rows as Row[] },
    geo: geo.type === 'FeatureCollection' && Array.isArray(geo.features) ? (geo as unknown as GeoCollection) : null,
    publishedAt: str(v.publishedAt),
    file: url ? { url: `${filePrefix}${url}`, filename: str(v.filename) ?? 'data', filesize: num(v.filesize) } : null,
  }
}

/** A cell as it is stored, for a test or a caller that builds rows by hand. */
export const cellOf = (v: unknown): Cell => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null)
