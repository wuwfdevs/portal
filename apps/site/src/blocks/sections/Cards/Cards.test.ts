import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { SectionContext } from '../types'
import { CardsSection } from './Component'

const context: SectionContext = { themeId: 'wuwf', setId: null, draft: false, pageId: 1 }
const html = (block: Record<string, unknown>) => renderToStaticMarkup(createElement(CardsSection, { block: { blockType: 'sectionCards', ...block }, context }))

describe('Cards section', () => {
  it('draws nothing when there is no card, or no card has a title', () => {
    expect(html({})).toBe('')
    expect(html({ cards: [] })).toBe('')
    expect(html({ cards: [{ title: '  ' }, { text: 'no title' }, null] })).toBe('')
    expect(html({ heading: { title: 'Only a heading' } })).toBe('')
  })
  it('draws each card with its tag, text, price and link, in a band with its anchor and tone', () => {
    const out = html({
      anchor: 'where', tone: 'dark', heading: { eyebrow: 'Start', title: 'Where you can appear' },
      cards: [{ title: 'On air', tag: 'Radio', text: 'Inside the news.', price: 'From $23 a credit', href: '/sponsor/on-air', linkLabel: 'See rates' }],
    })
    expect(out).toContain('id="where"')
    expect(out).toContain('data-tone="dark"')
    expect(out).toContain('data-section="sectionCards"')
    for (const s of ['Where you can appear', 'On air', 'Radio', 'Inside the news.', 'From $23 a credit']) expect(out).toContain(s)
    expect(out).toContain('href="/sponsor/on-air"')
    expect(out).toContain('See rates')
  })
  it('falls back to the plain tone for an unknown one, and says "Read more" when the link has no words', () => {
    const out = html({ tone: '#ff0000', cards: [{ title: 'A', href: 'https://example.org' }] })
    expect(out).toContain('data-tone="plain"')
    expect(out).toContain('Read more')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('never draws a link for an address that is not safe', () => {
    const out = html({ cards: [{ title: 'A', href: 'javascript:alert(1)' }, { title: 'B', href: '//evil.example' }] })
    expect(out).not.toContain('href=')
    expect(out).toContain('>A<')
    expect(out).toContain('>B<')
  })
})
