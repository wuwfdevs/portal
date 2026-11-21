import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { CarpoolSection } from './Component'

let settings: Record<string, unknown> = {}
vi.mock('@/lib/sponsorship/load', () => ({ loadSponsorshipSettings: async () => ({ settings, programs: [], interests: [], budgets: [] }) }))

const draw = async (block: Record<string, unknown>) => {
  const out = await CarpoolSection({ block: { blockType: 'sectionCarpool', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  settings = { carpool: { sixMonths: 780, oneYear: 1430 } }
})

describe('Carpool plan section', () => {
  it('draws nothing without a price', async () => {
    settings = {}
    expect(await draw({})).toBe('')
    settings = { carpool: {} }
    expect(await draw({})).toBe('')
  })
  it('draws both prices with what each comes to a month, and the day note by the year only', async () => {
    const out = await draw({ perDayNote: 'or about $4 a day', slotsNote: 'Six slots a week.', heading: { title: 'The Carpool Plan' }, actions: [{ label: 'Ask about Carpool', href: '/sponsor#inquire' }] })
    for (const s of ['The Carpool Plan', '$780', '$130 a month', '$1,430', '$119.17 a month, or about $4 a day', 'Six slots a week.', 'Ask about Carpool']) expect(out).toContain(s)
    expect(out.match(/or about \$4 a day/g)).toHaveLength(1)
  })
  it('draws a single price when only one is set', async () => {
    settings = { carpool: { oneYear: 1200 } }
    const out = await draw({})
    expect(out).toContain('$1,200')
    expect(out).not.toContain('6 months')
  })
})
