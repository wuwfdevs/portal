// A visualization's configuration, as the engines read it. Plain JSON (what the CMS stores, shaped by `shape.ts`), validated against the
// dataset it will draw. Pure. A configuration never holds data and a dataset never holds a configuration: a spec names columns, nothing more.

import type { Column, DatasetSnapshot } from './types'

export const CHART_TYPES = [
  { value: 'line', label: 'Line: a value over time or an ordered scale' },
  { value: 'area', label: 'Area: parts adding up over time' },
  { value: 'column', label: 'Columns: compare categories (stacked when there are several series)' },
  { value: 'bar', label: 'Bars: compare categories with long names (stacked when there are several series)' },
  { value: 'scatter', label: 'Scatter: how two measures relate' },
] as const
export type ChartType = (typeof CHART_TYPES)[number]['value']

export type VizKind = 'chart' | 'map' | 'table' | 'embed'
export const VIZ_KINDS: readonly VizKind[] = ['chart', 'map', 'table', 'embed']

/** How a number is written. Everything a reader sees goes through this, so a chart, its table and its download agree. */
export interface ValueFormat {
  style: 'number' | 'percent' | 'currency'
  /** Digits after the point. Unset: as many as the number needs, up to three. */
  decimals?: number | null
  /** 1,200,000 as 1.2M. Axis and legend only; the data table always shows the full number. */
  compact?: boolean
  /** Text before and after the number, e.g. "$" or " cases". Used when the style is plain `number`. */
  prefix?: string | null
  suffix?: string | null
}

export interface ChartSpec {
  kind: 'chart'
  type: ChartType
  /** The column along the bottom (or, for bars, the categories down the side). */
  x: string
  /** One column, or several: several are drawn as one series each ("wide" data, like Year, Cases, Deaths). */
  y: string[]
  /** A column whose values split one `y` into several series ("long" data, like County, Year, Cases). Not with several `y`. */
  series?: string | null
  xLabel?: string | null
  yLabel?: string | null
  yFormat?: ValueFormat | null
  /** Start the value scale at zero. On by default for columns, bars and areas, where length is the message. */
  zeroBaseline?: boolean | null
  sort?: 'data' | 'valueDesc' | 'valueAsc' | null
}

export interface MapSpec {
  kind: 'map'
  /** `dataset`: the dataset is GeoJSON and is drawn as it is. `points`: rows with a latitude and a longitude. `boundaries`: rows joined to the shapes of another dataset. */
  geometry: 'dataset' | 'points' | 'boundaries'
  valueColumn?: string | null
  labelColumn?: string | null
  latColumn?: string | null
  lonColumn?: string | null
  /** For `boundaries`: the column of the values dataset, and the property of the shapes it is matched to (a county name or FIPS code). */
  joinColumn?: string | null
  boundaryKey?: string | null
  classes?: number | null
  legendTitle?: string | null
  valueFormat?: ValueFormat | null
  /** Offer the pan-and-zoom map (MapLibre) on top of the drawing that is always there. */
  interactive?: boolean | null
}

export interface TableColumnSpec {
  column: string
  label?: string | null
  format?: ValueFormat | null
}

export interface TableSpec {
  kind: 'table'
  /** Empty: every column, in the file's order. */
  columns: TableColumnSpec[]
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc' | null
  searchable?: boolean | null
  pageSize?: number | null
}

export interface EmbedSpec {
  kind: 'embed'
  url: string
  /** Height-to-width of the original, so the frame keeps its shape. */
  width?: number | null
  height?: number | null
}

export type VizSpec = ChartSpec | MapSpec | TableSpec | EmbedSpec

export const DEFAULT_PAGE_SIZE = 25
export const MAX_SERIES = 6
export const MAX_CLASSES = 7
export const MIN_CLASSES = 3

const names = (cols: Column[]) => cols.map((c) => c.name).join(', ')

/** A message when `name` is not a column of the right type, or null. `types` empty: any type. */
export function checkColumn(label: string, name: string | null | undefined, cols: Column[], types: ReadonlyArray<Column['type']> = []): string | null {
  if (!name) return `Choose the ${label} column.`
  const col = cols.find((c) => c.name === name)
  if (!col) return `The ${label} column "${name}" is not in this dataset. Columns: ${names(cols) || 'none'}.`
  if (types.length > 0 && !types.includes(col.type)) {
    return `The ${label} column "${name}" holds ${col.type === 'string' ? 'text' : col.type}s; it needs ${types.map((t) => (t === 'string' ? 'text' : t)).join(' or ')}.`
  }
  return null
}

const compact = (list: Array<string | null>): string[] => list.filter((m): m is string => m !== null)

export interface SpecContext {
  dataset: DatasetSnapshot
  /** The shapes a `boundaries` map joins to. */
  boundary: DatasetSnapshot | null
}

/** The most vertices an interactive map is given: the shapes travel to the reader's browser, so they are held to far less than a drawing is. */
export const MAX_INTERACTIVE_VERTICES = 60_000

export function validateChart(spec: ChartSpec, { dataset }: SpecContext): string[] {
  const cols = dataset.table.columns
  const xTypes: Column['type'][] = spec.type === 'scatter' ? ['number'] : []
  const problems = compact([checkColumn('horizontal (x)', spec.x, cols, xTypes)])
  if (!spec.y || spec.y.length === 0) problems.push('Choose at least one value column.')
  for (const y of spec.y ?? []) problems.push(...compact([checkColumn('value', y, cols, ['number'])]))
  if (spec.series) {
    if ((spec.y ?? []).length > 1) problems.push('Use either several value columns or a column that splits the series, not both.')
    else problems.push(...compact([checkColumn('series', spec.series, cols)]))
    if (spec.series === spec.x) problems.push('The series column cannot be the same as the horizontal column.')
  }
  if ((spec.y ?? []).length > MAX_SERIES) problems.push(`A chart can draw ${MAX_SERIES} series at most; more cannot be told apart. Show the main ones, or use a table.`)
  if (spec.series && problems.length === 0) {
    const distinct = new Set(dataset.table.rows.map((r) => r[spec.series!])).size
    if (distinct > MAX_SERIES) problems.push(`The column "${spec.series}" has ${distinct} different values; a chart can draw ${MAX_SERIES} series at most. Filter the dataset, or use a table or map.`)
  }
  return problems
}

export function validateTable(spec: TableSpec, { dataset }: SpecContext): string[] {
  const cols = dataset.table.columns
  const problems = compact((spec.columns ?? []).map((c) => checkColumn('table', c.column, cols)))
  if (spec.sortColumn) problems.push(...compact([checkColumn('sort', spec.sortColumn, cols)]))
  return problems
}

export function validateMap(spec: MapSpec, { dataset, boundary }: SpecContext): string[] {
  const cols = dataset.table.columns
  const problems: string[] = []
  const value = spec.valueColumn ? checkColumn('value', spec.valueColumn, cols, ['number']) : null
  if (value) problems.push(value)
  if (spec.labelColumn) problems.push(...compact([checkColumn('label', spec.labelColumn, cols)]))
  if (spec.geometry === 'dataset') {
    if (!dataset.geo) problems.push('This map draws a GeoJSON dataset, but the chosen dataset is a table. Choose a GeoJSON dataset, or join the table to boundaries.')
  } else if (spec.geometry === 'points') {
    problems.push(...compact([checkColumn('latitude', spec.latColumn, cols, ['number']), checkColumn('longitude', spec.lonColumn, cols, ['number'])]))
  } else if (spec.geometry === 'boundaries') {
    problems.push(...compact([checkColumn('join', spec.joinColumn, cols)]))
    if (!boundary?.geo) problems.push('Choose a GeoJSON dataset for the boundaries.')
    else if (!spec.boundaryKey) problems.push('Choose the boundary property that matches the join column.')
    else if (!boundary.table.columns.some((c) => c.name === spec.boundaryKey)) problems.push(`The boundaries have no property "${spec.boundaryKey}". Properties: ${names(boundary.table.columns) || 'none'}.`)
    if (!spec.valueColumn) problems.push('Choose the value column that colours the areas.')
  }
  if (spec.classes != null && (spec.classes < MIN_CLASSES || spec.classes > MAX_CLASSES)) problems.push(`Use ${MIN_CLASSES} to ${MAX_CLASSES} colour steps.`)
  return problems
}

/** The first problem with a number format, or null. Kept tiny: the form already limits the choices. */
export function checkFormat(f: ValueFormat | null | undefined): string | null {
  if (!f) return null
  if (f.decimals != null && (f.decimals < 0 || f.decimals > 6)) return 'Decimals must be between 0 and 6.'
  return null
}
