import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { FeatureSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(FeatureSection, 'sectionFeature', block)
const picture = { id: 4, url: '/media/lead.jpg', alt: 'A guitarist on stage', width: 1200, height: 800, mimeType: 'image/jpeg' }

describe('Feature section', () => {
  it('draws nothing without a headline', () => {
    expect(html({})).toBe('')
    expect(html({ headline: '   ', line: 'Only a line' })).toBe('')
  })
  it('hero: one h1, the label, the line and the buttons, in a band with its anchor and tone', () => {
    const out = html({
      variant: 'hero', anchor: 'top', tone: 'dark', label: 'Next show · Thursday', headline: 'Save your seat', line: 'Three artists.',
      actions: [{ label: 'Reserve', href: '/radiolive#tickets' }, { label: 'Watch', href: 'https://example.org/w' }],
    })
    expect(out).toContain('<h1')
    expect(out).not.toContain('<h2')
    expect(out).toContain('id="top"')
    expect(out).toContain('data-tone="dark"')
    for (const s of ['Next show · Thursday', 'Save your seat', 'Three artists.', 'Reserve', 'Watch']) expect(out).toContain(s)
    expect(out).toContain('href="/radiolive#tickets"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('split: an h2, and the picture and its side and ratio only here', () => {
    const left = html({ variant: 'split', headline: 'Tunnel Vision', image: picture, ratio: 'portrait', imageSide: 'left' })
    expect(left).toContain('<h2')
    expect(left).not.toContain('<h1')
    expect(left).toContain('aspect-[4/5]')
    expect(left).toContain('md:order-2')
    const right = html({ variant: 'split', headline: 'Tunnel Vision', image: picture, ratio: 'wide' })
    expect(right).toContain('aspect-video')
    expect(right).not.toContain('md:order-2')
  })
  it('hero ignores the split-only fields it still holds', () => {
    const out = html({ variant: 'hero', headline: 'H', image: picture, ratio: 'portrait', imageSide: 'left' })
    expect(out).not.toContain('aspect-[4/5]')
    expect(out).not.toContain('md:order-')
  })
  it('keeps the words when the picture or audio was deleted (a bare id)', () => {
    for (const variant of ['hero', 'split']) {
      const out = html({ variant, headline: 'Still here', image: 7, audio: 9 })
      expect(out).toContain('Still here')
      expect(out).not.toContain('<img')
      expect(out).not.toContain('<button')
    }
  })
  it('falls back to the standard ratio for a ratio it does not know', () => {
    expect(html({ variant: 'split', headline: 'H', image: picture, ratio: 'enormous' })).toContain('aspect-[4/3]')
  })
  it('draws no button for an unsafe address or a missing label', () => {
    const out = html({ headline: 'H', actions: [{ label: 'Bad', href: 'javascript:alert(1)' }, { label: '', href: '/ok' }, { label: 'Fine', href: '/fine' }] })
    expect(out).not.toContain('javascript')
    expect(out).not.toContain('Bad')
    expect(out).toContain('href="/fine"')
    expect(out).not.toContain('href="/ok"')
  })
})
