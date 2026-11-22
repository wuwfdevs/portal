// The contract between a configuration and something drawable. An engine knows its own kind of spec and nothing about Payload, caching or
// pages: `validate` says what is wrong in words an editor can act on, `prepare` returns a plain, serialisable model that a React component
// draws. Adding an engine means one file here, one entry in `index.ts`, and one view in `components/DataViz`.

import type { SpecContext, VizSpec } from '../spec'
import type { Cell, ColumnType } from '../types'
import type { ValueFormat } from '../spec'
import type { SvgNode } from '../svg-tree'
import type { GeoCollection } from '../types'

export interface PrepareContext extends SpecContext {
  /** Put in front of every id in a drawing so two on one page never collide (the visualization's id). */
  idPrefix: string
}

export interface LegendEntry {
  label: string
  color: string
}

/** A table a person can read without the picture: every chart and map has one, and so does its download. Cells are already formatted. */
export interface PlainTable {
  columns: string[]
  rows: string[][]
  /** How many rows the dataset has beyond those shown. */
  more: number
}

export interface ChartModel {
  engine: 'chart'
  /** The same drawing at two widths: text stays readable on a phone because it is drawn for the phone, not shrunk. */
  wide: SvgNode
  narrow: SvgNode
  legend: LegendEntry[]
  /** One sentence that says what the chart is made of (not what it shows: the editor writes that). */
  summary: string
  dataTable: PlainTable
}

export interface MapModel {
  engine: 'map'
  svg: SvgNode
  legend: LegendEntry[]
  legendTitle: string | null
  /** True when some areas have no value and are drawn grey. */
  hasNoData: boolean
  /** Rows of values that matched no area (a county spelled differently), so an editor can be told. */
  unmatched: number
  summary: string
  dataTable: PlainTable
  /** What the pan-and-zoom map is given, or null when the map is not interactive. */
  interactive: null | {
    features: GeoCollection
    center: [number, number]
    bounds: [number, number, number, number]
    attribution: string | null
  }
}

export interface TableModel {
  engine: 'table'
  columns: Array<{ id: string; label: string; type: ColumnType; format: ValueFormat | null }>
  rows: Cell[][]
  searchable: boolean
  pageSize: number
  sort: { column: string; direction: 'asc' | 'desc' } | null
  /** Rows left out because there are more than a page can carry; the download has them all. */
  omitted: number
}

export interface EmbedModel {
  engine: 'embed'
  url: string
  width: number | null
  height: number | null
}

export type RenderModel = ChartModel | MapModel | TableModel | EmbedModel

export interface Engine<S extends VizSpec, M extends RenderModel> {
  kind: S['kind']
  label: string
  validate(spec: S, ctx: SpecContext, embedHosts: readonly string[]): string[]
  prepare(spec: S, ctx: PrepareContext): M
}
