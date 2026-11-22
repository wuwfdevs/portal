// The shared vocabulary of the data visualization system. Pure types: no Payload, no React.
//
// Three things are kept apart on purpose (ARCHITECTURE: datasets, configurations, engines):
//   a DATASET is rows (and maybe geometry) with attribution, parsed once when a version is uploaded;
//   a VISUALIZATION is a configuration: which dataset (latest or one pinned version), which engine, and which columns do what;
//   an ENGINE turns a configuration plus a dataset into something drawable and knows nothing about where either came from.

export type ColumnType = 'number' | 'string' | 'date' | 'boolean'
export type Cell = string | number | boolean | null
export type Row = Record<string, Cell>

export interface Column {
  name: string
  type: ColumnType
  /** Cells that are empty (or, for a number or date column, not readable as one). */
  empty: number
}

export interface DatasetTable {
  columns: Column[]
  rows: Row[]
}

export type DatasetFormat = 'csv' | 'json' | 'geojson'

/** The part of GeoJSON the system reads. Geometry is passed on as it is and only drawn, never edited. */
export interface GeoFeature {
  type: 'Feature'
  geometry: { type: string; coordinates?: unknown; geometries?: unknown[] } | null
  properties: Record<string, unknown> | null
}
export interface GeoCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

/**
 * What a parsed upload becomes. For GeoJSON `table` holds each feature's properties, row i being feature i, so a map and a table can share one
 * dataset; for CSV and JSON `geo` is null.
 */
export interface ParsedDataset {
  format: DatasetFormat
  table: DatasetTable
  geo: GeoCollection | null
}

/** What the engines are given of a dataset version: enough to draw, and what to say about it. */
export interface DatasetSnapshot {
  datasetId: number | string
  versionId: number | string
  versionNumber: number
  versionLabel: string | null
  format: DatasetFormat
  table: DatasetTable
  geo: GeoCollection | null
  /** When this version was published (ISO), for "data as of". */
  publishedAt: string | null
  file: { url: string; filename: string; filesize: number | null } | null
}

export const MAX_ROWS = 10_000
export const MAX_COLUMNS = 60
export const MAX_FEATURES = 2_000
/** Coordinates in all geometry: a boundary file is simplified before it is uploaded, never drawn at survey detail. */
export const MAX_VERTICES = 250_000
export const MAX_FILE_BYTES = 6 * 1024 * 1024
