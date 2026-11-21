import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { RateEstimatorSection } from './Component'

let settings: Record<string, unknown> = {}
vi.mock('@/lib/sponsorship/load', () => ({ loadSponsorshipSettings: async () => ({ settings, programs: [], interests: [], budgets: [] }) }))

const draw = async (block: Record<string, unknown>) => {
  const out = await RateEstimatorSection({ block: { blockType: 'sectionRateEstimator', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  settings = {
    dayparts: [
      { label: 'Morning Drive', when: '5 a.m. to 9 a.m.', open: 55, m3: 50, m6: 45, y1: 40 },
      { label: 'Midday', when: '9 a.m. to 3 p.m.', open: 30, m3: 28, m6: 26, y1: 24 },
    ],
    creditCounts: [{ count: 13 }, { count: 26 }],
    prepayPercent: 5,
    nonprofitPercent: 20,
  }
})

describe('Rate estimator section', () => {
  it('draws nothing without a daypart or a schedule size', async () => {
    settings = { dayparts: [], creditCounts: [{ count: 26 }] }
    expect(await draw({})).toBe('')
    settings = { dayparts: [{ label: 'Midday', open: 1, m3: 1, m6: 1, y1: 1 }], creditCounts: [] }
    expect(await draw({})).toBe('')
  })
  it('draws the rate card from the settings, with the block’s words around it', async () => {
    const out = await draw({ anchor: 'rates', tone: 'grey', heading: { title: 'By the credit' }, note: 'Rates are per credit.', estimatorTitle: 'Estimate a schedule', estimatorCta: 'Request a proposal', estimatorDisclaimer: 'An estimate.' })
    expect(out).toContain('id="rates"')
    expect(out).toContain('data-tone="grey"')
    for (const s of ['By the credit', 'Morning Drive', 'Midday', '$55', '$24', 'Rates are per credit.', 'Estimate a schedule', 'An estimate.']) expect(out).toContain(s)
    expect(out).toContain('href="/sponsor#inquire"')
  })
  it('estimates from the first row, one year and 26 credits to begin with, and says the nonprofit rate applies to open rates', async () => {
    const out = await draw({})
    expect(out).toContain('Morning Drive · 1 year')
    expect(out).toContain('$1,040')
    expect(out).toContain('applies to open rates')
  })
  it('labels the choices even when the words are empty', async () => {
    const out = await draw({})
    expect(out).toContain('aria-label="Length of commitment"')
    expect(out).toContain('aria-label="Credits in the schedule"')
  })
  it('has no button without its words', async () => {
    expect(await draw({})).not.toContain('href="/sponsor#inquire"')
  })
})
