// The chart engine: Observable Plot, run on the server against a small DOM, read back as a plain tree (`svg-tree.ts`). No chart code runs in
// the browser. The same chart is drawn twice, for a phone and for a wide screen, so type stays legible instead of shrinking with the picture.

import * as Plot from '@observablehq/plot'

import { isYearColumn, makeFormatter } from '../format'
import { SERIES_COLORS } from '../palette'
import { checkFormat, validateChart, type ChartSpec } from '../spec'
import { toSvgTree, type SvgNode } from '../svg-tree'
import type { DatasetTable } from '../types'
import { newDocument, plainTable } from './common'
import type { ChartModel, Engine, LegendEntry, PrepareContext } from './types'

interface Rec {
  x: Date | number | string
  y: number
  series: string
}

type XKind = 'date' | 'number' | 'text'

/** Long records from a table: one per cell to be drawn. Several value columns become several series; a series column splits one. Missing values are left out, never drawn as zero. */
export function chartRecords(spec: ChartSpec, table: DatasetTable): { records: Rec[]; seriesNames: string[]; xKind: XKind } {
  const xCol = table.columns.find((c) => c.name === spec.x)
  const xKind: XKind = xCol?.type === 'date' ? 'date' : xCol?.type === 'number' ? 'number' : 'text'
  const records: Rec[] = []
  const seriesNames: string[] = []
  const note = (name: string) => {
    if (!seriesNames.includes(name)) seriesNames.push(name)
  }
  for (const row of table.rows) {
    const xv = row[spec.x]
    if (xv === null || xv === undefined) continue
    const x = xKind === 'date' ? new Date(String(xv)) : xKind === 'number' ? Number(xv) : String(xv)
    if (x instanceof Date && Number.isNaN(x.getTime())) continue
    if (spec.series) {
      const y = row[spec.y[0]!]
      if (typeof y !== 'number') continue
      const s = String(row[spec.series] ?? 'No value')
      note(s)
      records.push({ x, y, series: s })
    } else {
      for (const col of spec.y) {
        const y = row[col]
        if (typeof y !== 'number') continue
        note(col)
        records.push({ x, y, series: col })
      }
    }
  }
  return { records, seriesNames, xKind }
}


interface Size {
  width: number
  height: number
  font: number
}
const SIZES = { wide: { width: 720, height: 420, font: 13 }, narrow: { width: 360, height: 340, font: 12 } } as const satisfies Record<string, Size>

function draw(spec: ChartSpec, records: Rec[], seriesNames: string[], xKind: XKind, size: Size, idPrefix: string): SvgNode {
  const fmt = makeFormatter(spec.yFormat)
  const multi = seriesNames.length > 1
  const colorOf = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length]!
  const color = multi ? { domain: seriesNames, range: seriesNames.map((_, i) => colorOf(i)) } : undefined
  const paint = multi ? 'series' : colorOf(0)
  const horizontal = spec.type === 'bar'
  const zero = spec.zeroBaseline ?? (spec.type === 'column' || spec.type === 'bar' || spec.type === 'area')
  const maxLabel = Math.max(0, ...records.map((r) => fmt(r.y).length))
  const longestCategory = Math.max(0, ...records.map((r) => String(r.x).length))
  const marginLeft = horizontal ? Math.min(size.width * 0.45, 16 + longestCategory * size.font * 0.58) : Math.max(44, 18 + maxLabel * size.font * 0.6)
  const sortBy = spec.sort === 'valueDesc' ? '-y' : spec.sort === 'valueAsc' ? 'y' : undefined

  const xTick = xKind === 'number' && isYearColumn(spec.x, records.map((r) => (typeof r.x === 'number' ? r.x : null))) ? (d: number) => String(d) : undefined
  const common = { x: 'x', y: 'y' } as const
  const marks: Plot.Markish[] = []
  if (zero && !horizontal) marks.push(Plot.ruleY([0]))
  if (zero && horizontal) marks.push(Plot.ruleX([0]))

  switch (spec.type) {
    case 'line': {
      marks.push(Plot.lineY(records, { ...common, z: 'series', stroke: paint, strokeWidth: 2.5, strokeLinejoin: 'round' }))
      if (records.length / Math.max(1, seriesNames.length) <= 24) marks.push(Plot.dot(records, { ...common, fill: paint, r: 3 }))
      break
    }
    case 'area':
      marks.push(Plot.areaY(records, { ...common, z: 'series', fill: paint, fillOpacity: 0.85 }))
      break
    case 'column':
      marks.push(Plot.barY(records, { ...common, fill: paint, ...(sortBy ? { sort: { x: sortBy } } : {}) }))
      break
    case 'bar':
      marks.push(Plot.barX(records, { x: 'y', y: 'x', fill: paint, ...(sortBy ? { sort: { y: sortBy === 'y' ? 'x' : '-x' } } : {}) }))
      break
    case 'scatter':
      marks.push(Plot.dot(records, { ...common, stroke: paint, fill: paint, fillOpacity: 0.55, r: 4.5 }))
      break
  }

  const xScale: Plot.ScaleOptions =
    xKind === 'date' ? { type: 'utc', label: spec.xLabel ?? null } : xKind === 'text' && spec.type !== 'scatter' ? { type: horizontal ? undefined : 'band', label: spec.xLabel ?? null } : { label: spec.xLabel ?? null, ...(xTick ? { tickFormat: xTick } : {}) }

  const valueAxis: Plot.ScaleOptions = { grid: true, label: spec.yLabel ?? null, tickFormat: (d: number) => fmt(d), ...(zero ? { zero: true } : {}), nice: true }
  const plot = Plot.plot({
    document: newDocument(),
    width: size.width,
    height: size.height,
    marginLeft,
    marginRight: 16,
    marginBottom: 36,
    marginTop: 24,
    style: { fontSize: `${size.font}px`, fontFamily: 'inherit', overflow: 'visible' },
    ...(color ? { color } : {}),
    ...(horizontal ? { x: valueAxis, y: { label: spec.xLabel ?? null, ...(xKind === 'date' ? {} : { type: 'band' as const }) } } : { x: xScale, y: valueAxis }),
    marks,
  }) as unknown as { tagName: string }
  const tree = toSvgTree(plot as never, `${idPrefix}-`)
  if (!tree) throw new Error('The chart could not be drawn.')
  return tree
}

function describe(spec: ChartSpec, seriesNames: string[], records: Rec[]): string {
  const kind = { line: 'Line chart', area: 'Area chart', column: 'Column chart', bar: 'Bar chart', scatter: 'Scatter plot' }[spec.type]
  const n = seriesNames.length
  return `${kind} of ${spec.y.length === 1 && !spec.series ? spec.y[0] : n > 1 ? `${n} series` : 'one series'} by ${spec.x}, ${records.length} values.`
}

export const chartEngine: Engine<ChartSpec, ChartModel> = {
  kind: 'chart',
  label: 'Chart',
  validate: (spec, ctx) => [...validateChart(spec, ctx), ...(checkFormat(spec.yFormat) ? [checkFormat(spec.yFormat)!] : [])],
  prepare(spec, ctx: PrepareContext) {
    const { records, seriesNames, xKind } = chartRecords(spec, ctx.dataset.table)
    if (records.length === 0) throw new Error('The chart has no values to draw: every value in the chosen columns is empty.')
    const legend: LegendEntry[] = seriesNames.length > 1 ? seriesNames.map((label, i) => ({ label, color: SERIES_COLORS[i % SERIES_COLORS.length]! })) : []
    const used = [spec.x, ...spec.y, ...(spec.series ? [spec.series] : [])]
    return {
      engine: 'chart',
      wide: draw(spec, records, seriesNames, xKind, SIZES.wide, `${ctx.idPrefix}-w`),
      narrow: draw(spec, records, seriesNames, xKind, SIZES.narrow, `${ctx.idPrefix}-n`),
      legend,
      summary: describe(spec, seriesNames, records),
      dataTable: plainTable(ctx.dataset.table, used, Object.fromEntries(spec.y.map((c) => [c, spec.yFormat]))),
    }
  },
}
