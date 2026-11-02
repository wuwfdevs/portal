import { describe, expect, it } from 'vitest'

import { dayString, toAgreement, toCollectionRef, toContentRef } from './load'
import { resolveUnderwriting } from './resolve'

const sponsor = { id: 7, name: 'Example Foundation', url: 'https://example.org' }
const agreementDoc = {
  id: 3, sponsor, text: 'Made possible in part by support from Example Foundation.', textVersion: 2,
  kind: 'recognition' as const, startsOn: '2026-07-01T12:00:00.000Z', endsOn: '2027-06-30T12:00:00.000Z', active: true,
}

describe('dayString', () => {
  it('takes the calendar day of a stored date and refuses anything else', () => {
    expect(dayString('2026-07-01T12:00:00.000Z')).toBe('2026-07-01')
    expect(dayString('2026-07-01')).toBe('2026-07-01')
    expect(dayString('')).toBeNull()
    expect(dayString(null)).toBeNull()
    expect(dayString('July 1')).toBeNull()
  })
})

describe('toAgreement', () => {
  it('maps a populated agreement', () => {
    expect(toAgreement(agreementDoc)).toMatchObject({
      id: '3', sponsorId: '7', sponsorName: 'Example Foundation', startsOn: '2026-07-01', endsOn: '2027-06-30',
      formats: [], placements: [], active: true, url: 'https://example.org', textVersion: 2,
    })
  })
  it('treats an unpopulated reference as absent instead of crashing a page', () => {
    expect(toAgreement(3)).toBeNull()
    expect(toAgreement('3')).toBeNull()
    expect(toAgreement(null)).toBeNull()
  })
  it('cannot acknowledge anyone without a sponsor, a start date or any wording', () => {
    expect(toAgreement({ ...agreementDoc, sponsor: 7 })).toBeNull()
    expect(toAgreement({ ...agreementDoc, startsOn: null })).toBeNull()
    expect(toAgreement({ ...agreementDoc, text: '' })).toBeNull()
  })
  it('reads active as true unless it is explicitly false', () => {
    expect(toAgreement({ ...agreementDoc, active: undefined })?.active).toBe(true)
    expect(toAgreement({ ...agreementDoc, active: false })?.active).toBe(false)
  })
})

describe('toCollectionRef', () => {
  it('drops agreements that cannot be read and keeps the rest', () => {
    const ref = toCollectionRef('fellowship', { id: 1, slug: 'coastal-futures', title: 'Coastal Futures', agreements: [agreementDoc, 99, null] })
    expect(ref?.agreements).toHaveLength(1)
    expect(toCollectionRef('fellowship', 1)).toBeNull()
  })
})

describe('toContentRef → resolveUnderwriting, the way a page does it', () => {
  const post = (over: object = {}) => ({
    id: 11, _status: 'published' as const, publishedAt: '2026-10-28T12:00:00.000Z', format: 'web' as const,
    fellowship: { id: 1, slug: 'coastal-futures', title: 'Coastal Futures', agreements: [agreementDoc] },
    series: { id: 2, slug: 'after-isaias', title: 'After Isaias', agreements: [] },
    production: null,
    categories: [{ id: 5, slug: 'growth', title: 'Growth & Development' }],
    ...over,
  })
  const ctx = { placement: 'article' as const, now: '2026-10-30T12:00:00Z' }

  it('gives the Coastal Futures story its single Example Foundation line', () => {
    const r = resolveUnderwriting(toContentRef(post() as never), ctx)
    expect(r.lines.map((l) => l.sponsorName)).toEqual(['Example Foundation'])
  })
  it('a draft carries no acknowledgment even with a publish date typed in', () => {
    expect(resolveUnderwriting(toContentRef(post({ _status: 'draft' }) as never), ctx).lines).toEqual([])
  })
  it('a story whose fellowship was not populated carries nothing, rather than an error', () => {
    expect(resolveUnderwriting(toContentRef(post({ fellowship: 1 }) as never), ctx).lines).toEqual([])
  })
  it('a topic with an agreement attached is still never acknowledged', () => {
    const r = resolveUnderwriting(toContentRef(post({ fellowship: null, categories: [{ id: 5, slug: 'g', title: 'G', agreements: [agreementDoc] }] }) as never), ctx);
    expect(r.lines).toEqual([])
  })
})
