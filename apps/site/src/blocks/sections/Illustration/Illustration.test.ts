import { describe, expect, it } from 'vitest'

import { renderBlock } from '../testing'
import { IllustrationSection } from './Component'

const html = (block: Record<string, unknown>) => renderBlock(IllustrationSection, 'sectionIllustration', block)

describe('Illustration section', () => {
  it('draws nothing without its label', () => {
    expect(html({})).toBe('')
    expect(html({ name: 'Example', label: '  ' })).toBe('')
  })
  it('draws the label, the sample sponsor and its address as text, hidden from a screen reader', () => {
    const out = html({ label: 'Illustration · display ad', caption: 'Sponsor message', name: 'Example Credit Union', line: 'A member-owned credit union.', website: 'example.org' })
    for (const s of ['Illustration · display ad', 'Sponsor message', 'Example Credit Union', 'A member-owned credit union.', 'example.org']) expect(out).toContain(s)
    expect(out).toContain('aria-hidden="true"')
    expect(out).not.toContain('href=')
  })
  it('draws without a band when it is inside Columns', () => {
    const out = html({ label: 'L', inline: true })
    expect(out).not.toContain('<section')
    expect(out).toContain('data-section="sectionIllustration"')
  })
})
