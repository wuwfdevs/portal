import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { ClosingBandSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(ClosingBandSection, 'sectionClosingBand', block)

describe('Closing band section', () => {
  it('draws nothing without a title', () => {
    expect(html({})).toBe('')
    expect(html({ heading: { intro: 'Only a line' }, actions: [{ label: 'Go', href: '/go' }] })).toBe('')
  })
  it('draws the title, the sentence and the buttons', () => {
    const out = html({ tone: 'teal', heading: { eyebrow: 'Join us', title: 'Give today', intro: 'Every gift counts.' }, actions: [{ label: 'Give', href: '/support' }, { label: 'Other ways', href: '/support/ways' }] })
    expect(out).toContain('data-tone="teal"')
    for (const s of ['Join us', 'Give today', 'Every gift counts.', 'Give', 'Other ways']) expect(out).toContain(s)
    expect(out).toContain('href="/support/ways"')
  })
  it('still draws the title when every button is unsafe', () => {
    const out = html({ heading: { title: 'Hello' }, actions: [{ label: 'Bad', href: 'data:text/html,x' }] })
    expect(out).toContain('Hello')
    expect(out).not.toContain('Bad')
  })
})
