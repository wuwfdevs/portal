import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SectionBand } from './SectionBand'

const html = (block: Record<string, unknown>, heading?: Record<string, string>) =>
  renderToStaticMarkup(
    createElement(SectionBand as never, { block: { blockType: 'x', ...block }, heading, more: createElement('a', { href: '/more' }, 'More') }, createElement('p', null, 'Content')),
  )

describe('SectionBand: where the heading sits', () => {
  const heading = { eyebrow: 'Why', title: 'A title', intro: 'One.\n\nTwo.' }
  it('puts the heading above the content by default, and the link after it', () => {
    const out = html({}, heading)
    expect(out.indexOf('A title')).toBeLessThan(out.indexOf('Content'))
    expect(out.indexOf('Content')).toBeLessThan(out.indexOf('/more'))
    expect(out).not.toContain('lg:grid-cols')
  })
  it('puts the heading and the link in a column beside the content when asked', () => {
    const out = html({ placement: 'side' }, heading)
    expect(out).toContain('lg:grid-cols')
    expect(out.indexOf('/more')).toBeLessThan(out.indexOf('Content'))
  })
  it('keeps the heading above when there is none to put beside', () => {
    expect(html({ placement: 'side' })).not.toContain('lg:grid-cols')
  })
  it('draws the intro paragraph by paragraph, and nothing for an empty heading', () => {
    const out = html({}, heading)
    expect(out).toContain('<p>One.</p>')
    expect(out).toContain('<p>Two.</p>')
    expect(html({}, {})).not.toContain('<header')
  })
})
