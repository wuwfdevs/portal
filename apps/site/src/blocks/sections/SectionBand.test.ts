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
  it('puts the heading above the content by default, with the link in the heading row and not after the content', () => {
    const out = html({}, heading)
    expect(out.indexOf('A title')).toBeLessThan(out.indexOf('/more'))
    expect(out.indexOf('/more')).toBeLessThan(out.indexOf('Content'))
    expect(out).not.toContain('lg:grid-cols')
  })
  it('has no header to hold the link when there is no heading, so the link follows the content', () => {
    const out = html({})
    expect(out.indexOf('Content')).toBeLessThan(out.indexOf('/more'))
  })
  it('does the same inside Columns', () => {
    const withHeading = html({ inline: true }, heading)
    expect(withHeading.indexOf('/more')).toBeLessThan(withHeading.indexOf('Content'))
    const bare = html({ inline: true })
    expect(bare.indexOf('Content')).toBeLessThan(bare.indexOf('/more'))
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

describe('SectionBand: tight', () => {
  const draw = (tight?: boolean) => renderToStaticMarkup(createElement(SectionBand as never, { block: { blockType: 'x' }, tight }, createElement('p', null, 'Content')))
  it('has the ordinary padding by default', () => {
    expect(draw()).toContain('py-12 md:py-14')
  })
  it('takes less above from a tablet up when tight, and the same below', () => {
    const out = draw(true)
    expect(out).toContain('md:pt-6')
    expect(out).toContain('md:pb-14')
    expect(out).not.toContain('md:py-14')
  })
})
