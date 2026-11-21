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
