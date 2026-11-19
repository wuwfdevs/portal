import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { CalloutSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(CalloutSection, 'sectionCallout', block)

describe('Callout section', () => {
  it('draws nothing without text', () => {
    expect(html({})).toBe('')
    expect(html({ title: 'Only a title', text: '  ' })).toBe('')
  })
  it('tint: a title and paragraphs in a box', () => {
    const out = html({ variant: 'tint', tone: 'accent', title: 'Recognition, if you want it', text: 'Let us know.\n\nAnonymous is always fine.', cite: 'ignored here' })
    expect(out).toContain('data-tone="accent"')
    expect(out).toContain('<h2')
    expect(out).toContain('Recognition, if you want it')
    expect(out).toContain('<p>Let us know.</p>')
    expect(out).toContain('<p>Anonymous is always fine.</p>')
    expect(out).not.toContain('ignored here')
    expect(out).not.toContain('<blockquote')
  })
  it('quote: a blockquote with its source, and no box', () => {
    const out = html({ variant: 'quote', text: 'I give a gift to the Foundation.', cite: 'Sample language', title: 'Share this with your attorney' })
    expect(out).toContain('<blockquote')
    expect(out).toContain('Sample language')
    expect(out).toContain('Share this with your attorney')
    expect(out).not.toContain('<h2')
  })
})

describe('Callout section: a link inside', () => {
  it('draws the link when it has both words and a safe address', () => {
    const out = renderBlock(CalloutSection, 'sectionCallout', { variant: 'tint', text: 'A note.', moreLabel: 'See the packages →', moreHref: '/sponsor/on-air#packages' })
    expect(out).toContain('href="/sponsor/on-air#packages"')
    expect(renderBlock(CalloutSection, 'sectionCallout', { text: 'A note.', moreLabel: 'x', moreHref: 'data:text/html,x' })).not.toContain('href=')
  })
})
