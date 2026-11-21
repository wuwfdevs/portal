import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { GivingLevelsSection } from './Component'

let settings: Record<string, unknown> = {}
vi.mock('@/lib/giving/load', () => ({ loadGivingSettings: async () => settings }))

const draw = async (block: Record<string, unknown>) => {
  const out = await GivingLevelsSection({ block: { blockType: 'sectionGivingLevels', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  settings = {
    levels: [
      { id: 'b', name: 'Sustaining Member', amount: '$10 a month or more', minimumMonthly: 10, emphasis: 'featured', benefits: [{ text: 'NPR+ Podcast Bundle' }] },
      { id: 'a', name: 'Member', amount: '$5 a month', minimumMonthly: 5, benefits: [{ text: 'A thank-you' }] },
      { name: 'Unfinished' },
    ],
    donationForm: { monthlyAddress: 'https://give.example.org/monthly' },
  }
})

describe('Giving levels section', () => {
  it('draws nothing without a level that has a name and a monthly minimum', async () => {
    settings = { levels: [{ name: 'Unfinished' }] }
    expect(await draw({})).toBe('')
    settings = {}
    expect(await draw({})).toBe('')
  })
  it('draws the levels from the settings, lowest first, with what each comes with', async () => {
    const out = await draw({ heading: { title: 'Membership levels' } })
    expect(out.indexOf('Member</strong>')).toBeLessThan(out.indexOf('Sustaining Member</strong>'))
    for (const s of ['Membership levels', '$5 a month', '$10 a month or more', 'NPR+ Podcast Bundle', 'A thank-you']) expect(out).toContain(s)
    expect(out).not.toContain('Unfinished')
  })
  it('links each level to the donation form, naming the level for a screen reader, only when it has words for the link', async () => {
    const out = await draw({ buttonLabel: 'Give at this level' })
    expect(out.match(/href="https:\/\/give\.example\.org\/monthly"/g)).toHaveLength(2)
    expect(out).toContain('Give at this level<span class="sr-only"> (Member)</span>')
    expect(await draw({})).not.toContain('give.example.org')
  })
  it('draws no link where there is no form address, and a footnote with its link only when safe', async () => {
    settings = { ...settings, donationForm: {} }
    expect(await draw({ buttonLabel: 'Give at this level' })).not.toContain('Give at this level')
    const out = await draw({ footnote: 'A level is a thank-you.', footnoteLinkLabel: 'Read more', footnoteLinkHref: '/support/ways' })
    expect(out).toContain('A level is a thank-you.')
    expect(out).toContain('href="/support/ways"')
    expect(await draw({ footnote: 'Note.', footnoteLinkLabel: 'Bad', footnoteLinkHref: 'javascript:alert(1)' })).not.toContain('javascript:')
  })
})
