import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { QuotesSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(QuotesSection, 'sectionQuotes', block)

describe('Quotes section', () => {
  it('draws nothing when no row has words', () => {
    expect(html({})).toBe('')
    expect(html({ quotes: [{ name: 'Only a name' }, { quote: '  ' }, null] })).toBe('')
  })
  it('draws the words in quotation marks with the name and role, and keeps a nameless one', () => {
    const out = html({ tone: 'grey', quotes: [{ quote: 'We hear from neighbours.', name: 'Pat Lee', role: 'Owner, Gulf Coast Hardware' }, { quote: 'Plain and honest.' }] })
    expect(out).toContain('data-tone="grey"')
    expect(out).toContain('“We hear from neighbours.”')
    expect(out).toContain('Pat Lee')
    expect(out).toContain('Owner, Gulf Coast Hardware')
    expect(out).toContain('“Plain and honest.”')
    expect(out.match(/<figcaption/g)?.length).toBe(1)
  })
})
