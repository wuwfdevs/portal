import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { CheckListSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(CheckListSection, 'sectionCheckList', block)
const items = [{ text: 'Your business name' }, { text: ' ' }, { text: 'Where to learn more' }, null]

describe('Check list section', () => {
  it('draws nothing without a row that has words', () => {
    expect(html({})).toBe('')
    expect(html({ items: [{ text: '' }, null] })).toBe('')
  })
  it('draws each row once with the chosen mark, hidden from a screen reader', () => {
    expect(html({ items }).match(/<li/g)?.length).toBe(2)
    expect(html({ items, mark: 'cross' })).toContain('✕')
    expect(html({ items, mark: 'dot' })).toContain('•')
    const out = html({ items })
    expect(out).toContain('✓')
    expect(out).toContain('aria-hidden="true"')
  })
  it('uses the tick for a mark it does not know', () => {
    expect(html({ items, mark: 'star' })).toContain('✓')
  })
})

describe('Check list section: a second list beside the first', () => {
  const html2 = (block: Record<string, unknown>) => renderBlock(CheckListSection, 'sectionCheckList', block)
  it('draws both lists with their titles and marks', () => {
    const out = html2({ listTitle: 'A credit includes', mark: 'check', items: [{ text: 'Your name' }], second: { title: 'A credit leaves out', mark: 'cross', items: [{ text: 'Prices' }] } })
    for (const s of ['A credit includes', 'Your name', 'A credit leaves out', 'Prices', '✓', '✕']) expect(out).toContain(s)
  })
  it('draws the second list alone when the first is empty, and nothing when both are', () => {
    expect(html2({ second: { items: [{ text: 'Prices' }] } })).toContain('Prices')
    expect(html2({ second: { items: [] } })).toBe('')
  })
})
