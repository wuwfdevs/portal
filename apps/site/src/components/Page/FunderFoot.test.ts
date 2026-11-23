import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FunderFoot, FunderFootView } from './FunderFoot'

const lines = [
  { agreementId: 'a1', sponsorId: 's1', sponsorName: 'Florida Public Archaeology Network', text: 'Unearthing Florida is made possible by the Florida Public Archaeology Network.', via: { kind: 'production' as const, id: 'p1', slug: 'unearthing-florida', title: 'Unearthing Florida' }, textVersion: 1 },
]
let credit: unknown = { lines, hubHref: null, independenceHref: '/editorial-independence', subject: 'program' }
let fail = false
const loadCredit = vi.fn(async () => {
  if (fail) throw new Error('down')
  return credit
})
vi.mock('@/lib/section-data/load', () => ({ loadCredit: (...a: unknown[]) => (loadCredit as unknown as (...x: unknown[]) => unknown)(...a) }))

const draw = async (productionId: string | number | null | undefined) => {
  const out = await FunderFoot({ productionId })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  fail = false
  credit = { lines, hubHref: null, independenceHref: '/editorial-independence', subject: 'program' }
  loadCredit.mockClear()
})

describe('the funder foot', () => {
  it('draws the production\'s running agreements on the neutral panel, headed "Support for this program", linked to the independence policy', async () => {
    const out = await draw(7)
    expect(loadCredit).toHaveBeenCalledWith({ relationTo: 'productions', id: 7 })
    expect(out).toContain('Support for this program')
    expect(out).toContain('made possible by the Florida Public Archaeology Network')
    expect(out).toContain('href="/editorial-independence"')
    expect(out).toContain('aria-label="Funding"')
  })
  it('draws nothing, and reads nothing, without a production', async () => {
    expect(await draw(null)).toBe('')
    expect(await draw(undefined)).toBe('')
    expect(loadCredit).not.toHaveBeenCalled()
  })
  it('draws nothing when no agreement is running, and when the read fails', async () => {
    credit = { lines: [], hubHref: null, independenceHref: null, subject: 'program' }
    expect(await draw(7)).toBe('')
    fail = true
    expect(await draw(7)).toBe('')
  })
  it('takes its wording only from the agreements: the view has no words of its own beyond the panel\'s label', () => {
    const out = renderToStaticMarkup(createElement(FunderFootView, { credit: { lines, independenceHref: null } }))
    expect(out).not.toContain('Editorial independence')
    expect(out).toContain('Supporters do not choose, review or approve what WUWF airs.')
  })
})
