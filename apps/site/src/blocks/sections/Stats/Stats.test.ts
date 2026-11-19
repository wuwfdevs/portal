import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { StatsSection, percentOf } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(StatsSection, 'sectionStats', block)
const stats = [{ value: '79%', text: 'think more highly of a business that supports public radio', compare: '43%' }, { value: '22,500', text: 'listen in a typical week' }]

describe('percentOf', () => {
  it('reads a percentage and nothing else', () => {
    expect(percentOf('79%')).toBe(79)
    expect(percentOf(' 79.5 % ')).toBe(79.5)
    expect(percentOf('22,500')).toBeNull()
    expect(percentOf('$40')).toBeNull()
    expect(percentOf('')).toBeNull()
    expect(percentOf(undefined)).toBeNull()
  })
  it('keeps a bar inside its track', () => {
    expect(percentOf('250%')).toBe(100)
    expect(percentOf('1000%')).toBeNull()
    expect(percentOf('100%')).toBe(100)
  })
})

describe('Stats section', () => {
  it('draws nothing when no figure has both its number and its words', () => {
    expect(html({})).toBe('')
    expect(html({ stats: [{ value: '5' }, { text: 'no number' }, null], source: 'Somewhere' })).toBe('')
  })
  it('tiles: each figure, and the source line', () => {
    const out = html({ variant: 'tiles', tone: 'grey', stats, source: 'Nielsen Audio, Spring 2026.', valueLabel: 'ignored in tiles' })
    expect(out).toContain('data-tone="grey"')
    for (const s of ['79%', '22,500', 'listen in a typical week', 'Nielsen Audio, Spring 2026.']) expect(out).toContain(s)
    expect(out).not.toContain('ignored in tiles')
    expect(out).not.toContain('width:')
  })
  it('compare: both figures with their group names and a bar for each percentage', () => {
    const out = html({ variant: 'compare', stats, source: 'S', valueLabel: 'NPR listeners', compareLabel: 'Non-listeners' })
    expect(out).toContain('NPR listeners')
    expect(out).toContain('Non-listeners')
    expect(out).toContain('width:79%')
    expect(out).toContain('width:43%')
    // the count has no second figure and is not a percentage: no bar for it
    expect(out.match(/width:\d/g)?.length).toBe(2)
  })
  it('draws the figures without a source line, but never an empty one', () => {
    const out = html({ stats })
    expect(out).toContain('22,500')
    expect(out).not.toContain('<p class="max-w-4xl')
  })
})
