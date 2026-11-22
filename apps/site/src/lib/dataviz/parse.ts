// An uploaded file becomes a table (and, for GeoJSON, geometry). Pure and strict: a file that cannot be read is refused with a sentence an
// editor can act on, and nothing is guessed silently. Used when a dataset version is saved and again by tests; never at render time.

import { parseCsv } from './csv'
import {
  MAX_COLUMNS, MAX_FEATURES, MAX_FILE_BYTES, MAX_ROWS, MAX_VERTICES,
  type Cell, type Column, type ColumnType, type DatasetFormat, type DatasetTable, type GeoCollection, type GeoFeature, type ParsedDataset, type Row,
} from './types'

export type ParseResult = { ok: true; dataset: ParsedDataset } | { ok: false; reason: string }

const fail = (reason: string): ParseResult => ({ ok: false, reason })

const NUMBER = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][-+]?\d+)?$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[-+]\d{2}:?\d{2})?)?$/
const MISSING = new Set(['', 'na', 'n/a', 'null', 'none', '-', '--', '—'])

/** Whether a raw string is empty in the way spreadsheets and agencies write "no value". */
export const isMissing = (s: string): boolean => MISSING.has(s.trim().toLowerCase())

/** The way a column names its values: blanks and repeats are fixed so every column is addressable. */
export function cleanHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

function toNumber(s: string): number | null {
  const t = s.trim()
  if (!NUMBER.test(t) || t === '' || t === '.' || t === '+' || t === '-') return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Decide a column's type from its raw values: all numbers, all ISO dates, all true/false, otherwise text. Empty cells do not vote. */
export function inferType(values: readonly unknown[]): ColumnType {
  let n = 0, d = 0, b = 0, total = 0
  for (const v of values) {
    if (v === null || v === undefined) continue
    if (typeof v === 'number') { total++; n++; continue }
    if (typeof v === 'boolean') { total++; b++; continue }
    const s = String(v)
    if (isMissing(s)) continue
    total++
    if (toNumber(s) !== null) n++
    else if (ISO_DATE.test(s.trim()) && !Number.isNaN(Date.parse(s.trim()))) d++
    else if (/^(true|false)$/i.test(s.trim())) b++
  }
  if (total === 0) return 'string'
  if (n === total) return 'number'
  if (d === total) return 'date'
  if (b === total) return 'boolean'
  return 'string'
}

function coerce(v: unknown, type: ColumnType): Cell {
  if (v === null || v === undefined) return null
  if (type === 'number') {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    return isMissing(String(v)) ? null : toNumber(String(v))
  }
  if (type === 'boolean') {
    if (typeof v === 'boolean') return v
    const s = String(v).trim().toLowerCase()
    return s === 'true' ? true : s === 'false' ? false : null
  }
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  if (type === 'date') return isMissing(s) ? null : s.trim()
  return isMissing(s) && s.trim() === '' ? null : s
}

/** Build the table from raw header names and raw rows (each an array of unknowns, in header order). */
export function buildTable(headers: string[], raw: unknown[][]): DatasetTable {
  const columns: Column[] = headers.map((name, c) => {
    const type = inferType(raw.map((r) => r[c]))
    return { name, type, empty: 0 }
  })
  const rows: Row[] = raw.map((r) => {
    const row: Row = {}
    columns.forEach((col, c) => {
      const cell = coerce(r[c], col.type)
      if (cell === null) col.empty++
      row[col.name] = cell
    })
    return row
  })
  return { columns, rows }
}

function checkSize(columns: number, rows: number): string | null {
  if (columns < 1) return 'The file has no columns.'
  if (columns > MAX_COLUMNS) return `The file has ${columns} columns; the most a dataset can have is ${MAX_COLUMNS}.`
  if (rows < 1) return 'The file has a header but no rows.'
  if (rows > MAX_ROWS) return `The file has ${rows.toLocaleString('en-US')} rows; the most a dataset can have is ${MAX_ROWS.toLocaleString('en-US')}. Summarise it first, or split it into several datasets.`
  return null
}

function parseCsvText(text: string): ParseResult {
  const result = parseCsv(text)
  if (!result.ok) return fail(result.reason)
  const [head, ...body] = result.records
  if (!head) return fail('The file is empty.')
  const problem = checkSize(head.length, body.length)
  if (problem) return fail(problem)
  const headers = cleanHeaders(head)
  // A row longer than the header means a comma was not quoted; refuse rather than shift every later cell.
  const bad = body.findIndex((r) => r.length > head.length)
  if (bad >= 0) return fail(`Row ${bad + 2} has ${body[bad]!.length} values but the header has ${head.length}. A value containing a comma needs quotation marks around it.`)
  return { ok: true, dataset: { format: 'csv', table: buildTable(headers, body), geo: null } }
}

function parseJsonRows(value: unknown): ParseResult {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (['data', 'rows', 'records', 'items', 'results'] as const).map((k) => (value as Record<string, unknown>)[k]).find(Array.isArray)
      : undefined
  if (!Array.isArray(list)) return fail('Expected a list of records: an array of objects, or an object with a "data" or "rows" array.')
  if (!list.every((r) => r && typeof r === 'object' && !Array.isArray(r))) return fail('Every item in the list must be an object with the same kind of fields, like {"county": "Escambia", "cases": 12}.')
  const headers: string[] = []
  for (const r of list as Record<string, unknown>[]) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k)
  const problem = checkSize(headers.length, list.length)
  if (problem) return fail(problem)
  const names = cleanHeaders(headers)
  const raw = (list as Record<string, unknown>[]).map((r) => headers.map((h) => r[h]))
  return { ok: true, dataset: { format: 'json', table: buildTable(names, raw), geo: null } }
}

const GEOMETRY_TYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'])

function countVertices(value: unknown): number {
  if (!Array.isArray(value)) return 0
  if (value.length >= 2 && typeof value[0] === 'number') return 1
  let n = 0
  for (const v of value) n += countVertices(v)
  return n
}

/** Whether a position lies on the globe. GeoJSON is longitude, latitude: swapped values are the usual mistake. */
function positionsInRange(value: unknown): boolean {
  if (!Array.isArray(value)) return true
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') return Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
  return value.every(positionsInRange)
}

function parseGeoJson(value: unknown): ParseResult {
  const v = value as { type?: unknown; features?: unknown; geometry?: unknown; properties?: unknown }
  let features: unknown[]
  if (v?.type === 'FeatureCollection' && Array.isArray(v.features)) features = v.features
  else if (v?.type === 'Feature') features = [v]
  else if (typeof v?.type === 'string' && GEOMETRY_TYPES.has(v.type)) features = [{ type: 'Feature', geometry: v, properties: {} }]
  else return fail('This is not GeoJSON: it needs "type": "FeatureCollection" with a "features" list.')
  if (features.length < 1) return fail('The GeoJSON has no features.')
  if (features.length > MAX_FEATURES) return fail(`The GeoJSON has ${features.length.toLocaleString('en-US')} features; the most is ${MAX_FEATURES.toLocaleString('en-US')}. Filter it to the area you need.`)
  let vertices = 0
  const clean: GeoFeature[] = []
  for (const [i, f] of (features as GeoFeature[]).entries()) {
    if (!f || f.type !== 'Feature') return fail(`Feature ${i + 1} is not a GeoJSON Feature.`)
    const g = f.geometry
    if (g !== null && (typeof g !== 'object' || !GEOMETRY_TYPES.has(g.type))) return fail(`Feature ${i + 1} has a geometry type this system does not draw.`)
    if (g && !positionsInRange(g.coordinates)) return fail(`Feature ${i + 1} has coordinates outside the globe. GeoJSON lists longitude first, then latitude; the file may use a projected coordinate system, which must be converted to WGS 84 (EPSG:4326).`)
    vertices += g ? countVertices(g.coordinates) + countVertices(g.geometries) : 0
    clean.push({ type: 'Feature', geometry: g, properties: f.properties && typeof f.properties === 'object' ? f.properties : {} })
  }
  if (vertices > MAX_VERTICES) return fail(`The geometry has ${vertices.toLocaleString('en-US')} points; the most is ${MAX_VERTICES.toLocaleString('en-US')}. Simplify it first (mapshaper.org does this in a few clicks) so pages stay quick.`)
  const headers: string[] = []
  for (const f of clean) for (const k of Object.keys(f.properties ?? {})) if (!headers.includes(k)) headers.push(k)
  const names = cleanHeaders(headers)
  const raw = clean.map((f) => headers.map((h) => (f.properties as Record<string, unknown>)[h]))
  // Features with no properties still make a table: it has no columns, which a map can draw and a table cannot.
  const table = headers.length > 0 ? buildTable(names, raw) : { columns: [], rows: clean.map(() => ({})) }
  return { ok: true, dataset: { format: 'geojson', table, geo: { type: 'FeatureCollection', features: clean } satisfies GeoCollection } }
}

/** The format an upload's file name says it is, or null. `.geojson` is GeoJSON; a `.json` file is read as GeoJSON when it declares itself one. */
export function formatFromFilename(name: string): DatasetFormat | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv'
  if (ext === 'geojson') return 'geojson'
  if (ext === 'json') return 'json'
  return null
}

/** Parse an uploaded file. `format` comes from the file's name; a `.json` file that is GeoJSON is recognised as such. */
export function parseDataset(format: DatasetFormat, text: string): ParseResult {
  if (text.length > MAX_FILE_BYTES) return fail(`The file is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`)
  if (format === 'csv') return parseCsvText(text)
  let value: unknown
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return fail('The file is not valid JSON. Check for a missing comma or bracket.')
  }
  const declared = (value as { type?: unknown } | null)?.type
  const looksGeo = typeof declared === 'string' && (declared === 'FeatureCollection' || declared === 'Feature' || GEOMETRY_TYPES.has(declared))
  return format === 'geojson' || looksGeo ? parseGeoJson(value) : parseJsonRows(value)
}
