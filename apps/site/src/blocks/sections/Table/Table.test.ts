import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { TableSection, tableOf } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(TableSection, 'sectionTable', block)
const columns = ['Daypart', 'Open', '3 months']

describe('tableOf', () => {
  it('pads a short row, drops a cell past the last column, and leaves out an empty row', () => {
    const t = tableOf(columns, [{ cells: ['Morning'] }, { cells: ['Midday', '$40', '$36', 'extra'] }, { cells: ['', ' '] }, { cells: [] }, null])
    expect(t?.body).toEqual([['Morning', '', ''], ['Midday', '$40', '$36']])
  })
  it('needs two named columns and one row', () => {
    expect(tableOf(['Only'], [{ cells: ['a'] }])).toBeNull()
    expect(tableOf(['A', ' ', ''], [{ cells: ['a'] }])).toBeNull()
    expect(tableOf(columns, [])).toBeNull()
    expect(tableOf(undefined, undefined)).toBeNull()
  })
  it('trims the empty columns at the end only', () => {
    expect(tableOf(['A', 'B', ' '], [{ cells: ['x', 'y'] }])?.head).toEqual(['A', 'B'])
  })
})

describe('Table section', () => {
  it('draws nothing without a usable table', () => {
    expect(html({})).toBe('')
    expect(html({ columns, rows: [] })).toBe('')
  })
  it('draws column headers, row headers and cells in a scrollable region a keyboard can reach', () => {
    const out = html({ anchor: 'rates', tone: 'grey', caption: 'Rates per credit', columns, rows: [{ cells: ['Morning Drive', '$55', '$50'] }, { cells: ['Midday', '$40', '$36'] }] })
    expect(out).toContain('id="rates"')
    expect(out).toContain('role="region"')
    expect(out).toContain('tabindex="0"')
    expect(out).toContain('aria-label="Rates per credit"')
    expect(out.match(/scope="col"/g)?.length).toBe(3)
    expect(out.match(/scope="row"/g)?.length).toBe(2)
    expect(out).toContain('$55')
    expect(out).toContain('>Morning Drive<')
  })
})

describe('Table section: pairs', () => {
  it('draws each row as two cards, the second marked as the one to follow, with the column names as labels', () => {
    const out = renderBlock(TableSection, 'sectionTable', { variant: 'pairs', columns: ['An ad would say', 'A credit says'], rows: [{ cells: ['Come in this weekend.', 'Support comes from Example.'] }] })
    for (const s of ['An ad would say', 'A credit says', 'Come in this weekend.', 'Support comes from Example.']) expect(out).toContain(s)
    expect(out).not.toContain('<table')
  })
})
