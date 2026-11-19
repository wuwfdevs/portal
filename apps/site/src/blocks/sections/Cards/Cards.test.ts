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

describe('Cards section: small print and a link under the cards', () => {
  it('draws the note and the link when it has them, and neither when it has not', () => {
    const cards = [{ title: 'A' }]
    const out = html({ cards, note: 'Source: MRI.', moreLabel: 'See the guidelines →', moreHref: '/sponsor/credit-guidelines' })
    expect(out).toContain('Source: MRI.')
    expect(out).toContain('href="/sponsor/credit-guidelines"')
    expect(out).toContain('See the guidelines →')
    const bare = html({ cards })
    expect(bare).not.toContain('Source')
    expect(bare).not.toContain('href=')
  })
  it('never draws an unsafe link under the cards', () => {
    expect(html({ cards: [{ title: 'A' }], moreLabel: 'Go', moreHref: 'javascript:alert(1)' })).not.toContain('href=')
  })
})

describe('Cards section: a price that is the link', () => {
  it('uses the price as the link when the card has no words for it, with one arrow only', () => {
    const out = html({ cards: [{ title: 'A', price: 'From $23 a credit', href: '/sponsor/on-air' }, { title: 'B', price: 'Priced on request →', href: '/sponsor/events' }] })
    expect(out).toContain('From $23 a credit →')
    expect(out).toContain('Priced on request →')
    expect(out).not.toContain('→ →')
    expect(out).not.toContain('Read more')
  })
})
