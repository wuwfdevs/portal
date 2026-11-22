import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CASES_WIDE, COUNTY_SHAPES, COUNTY_VALUES } from '@/lib/dataviz/fixtures'
import { prepareSpec } from '@/lib/dataviz/engines'
import type { VizSpec } from '@/lib/dataviz/spec'
import type { VisualizationView } from '@/lib/dataviz/view'

import { VisualizationFigure } from './Figure'

const view = (spec: VizSpec, ctx: { dataset: typeof CASES_WIDE; boundary: typeof COUNTY_SHAPES | null }, extra: Partial<VisualizationView> = {}): VisualizationView => ({
  id: 9,
  kind: spec.kind,
  title: 'Cases rose in every county',
  caption: 'Weekly counts, 2019 to 2022.',
  altText: 'A line chart: cases peaked in 2020 in all three counties.',
  source: { name: 'Health Dept', url: 'https://example.org/data' },
  methodology: 'Counted weekly.\n\nAdjusted for reporting delays.',
  data: { datasetTitle: 'Cases', versionNumber: 2, versionLabel: 'Through 2022', asOf: '2026-11-01T00:00:00.000Z', pinned: false },
  download: { url: '/api/dataset-versions/file/cases.csv', filename: 'cases.csv', label: 'Download the data (CSV, 1 KB)' },
  model: prepareSpec(spec, { ...ctx, idPrefix: 'viz9' }, 'viz9'),
  ...extra,
})
const html = async (v: VisualizationView) => renderToStaticMarkup(await VisualizationFigure({ view: v }))

describe('the figure', () => {
  it('a chart is two labelled drawings, a legend, a data table, and everything the reader is owed', async () => {
    const out = await html(view({ kind: 'chart', type: 'line', x: 'Year', y: ['Escambia', 'Santa Rosa'] }, { dataset: CASES_WIDE, boundary: null }))
    expect((out.match(/role="img"/g) ?? []).length).toBe(2)
    expect(out).toContain('aria-describedby="viz-9-desc"')
    expect(out).toContain('id="viz-9-desc"')
    expect(out).toContain('cases peaked in 2020')
    expect(out).toContain('View the data as a table')
    expect(out).toContain('Source:')
    expect(out).toContain('href="https://example.org/data"')
    expect(out).toContain('Data as of November 1, 2026')
    expect(out).toContain('How this was made')
    expect(out).toContain('Adjusted for reporting delays.')
    expect(out).toContain('download="cases.csv"')
    expect(out).toContain('<th')
    expect(out).not.toMatch(/<script|<style|onload=|dangerouslySetInnerHTML/)
  })
  it('a source link that is not safe is drawn as plain text', async () => {
    const out = await html(view({ kind: 'chart', type: 'column', x: 'Year', y: ['Escambia'] }, { dataset: CASES_WIDE, boundary: null }, { source: { name: 'Evil', url: 'javascript:alert(1)' } }))
    expect(out).toContain('Evil')
    expect(out).not.toContain('javascript:')
  })
  it('a map has a legend, the no-data note when needed, and the data table; the interactive button only when switched on', async () => {
    const spec = { kind: 'map', geometry: 'boundaries', joinColumn: 'FIPS', boundaryKey: 'GEOID', valueColumn: 'Rate', labelColumn: 'County', classes: 3 } as const
    const plain = await html(view(spec, { dataset: COUNTY_VALUES, boundary: COUNTY_SHAPES }))
    expect(plain).toContain(' to ')
    expect(plain).not.toContain('Explore the map')
    const live = await html(view({ ...spec, interactive: true }, { dataset: COUNTY_VALUES, boundary: COUNTY_SHAPES }))
    expect(live).toContain('Explore the map')
  })
  it('a table is a labelled region with sortable headings', async () => {
    const out = await html(view({ kind: 'table', columns: [], pageSize: 5 }, { dataset: CASES_WIDE, boundary: null }))
    expect(out).toContain('role="region"')
    expect(out).toContain('aria-sort="none"')
    expect(React).toBeTruthy()
  })
})
