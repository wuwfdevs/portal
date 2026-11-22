import { describe, expect, it } from 'vitest'

import { DataVizBand, visualizationIdOf } from './Component'
import { DataViz } from './config'

describe('Chart, map or table section', () => {
  it('is a reference to a visualization, and nothing else of its own', () => {
    const own = DataViz.fields.map((f) => ('name' in f ? f.name : '')).filter((n) => !['hidden', 'anchor', 'tone', 'heading', 'placement'].includes(n))
    expect(own).toEqual(['visualization'])
  })
  it('reads the chosen id whether the relation is populated, bare or gone', () => {
    expect(visualizationIdOf(5)).toBe(5)
    expect(visualizationIdOf({ id: 'a' })).toBe('a')
    expect(visualizationIdOf(null)).toBeNull()
    expect(visualizationIdOf({})).toBeNull()
  })
  it('draws nothing when the figure could not be loaded', async () => {
    expect(await DataVizBand({ block: { blockType: 'sectionDataViz' }, view: null })).toBeNull()
  })
})
