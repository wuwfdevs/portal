import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { PackagesSection } from './Component'

let settings: Record<string, unknown> = {}
vi.mock('@/lib/sponsorship/load', () => ({ loadSponsorshipSettings: async () => ({ settings, programs: [], interests: [], budgets: [] }) }))

const draw = async (block: Record<string, unknown>) => {
  const out = await PackagesSection({ block: { blockType: 'sectionPackages', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  settings = { packages: { items: [{ name: 'Starter', description: 'Twelve credits.', price: 1000, value: 1400 }, { name: 'No price' }, { price: 5 }] } }
})

describe('Packages section', () => {
  it('draws nothing without a package that has a name and a price', async () => {
    settings = { packages: { items: [{ name: 'No price' }] } }
    expect(await draw({})).toBe('')
    settings = {}
    expect(await draw({})).toBe('')
  })
  it('draws each package with its price from the settings and what the buyer saves', async () => {
    const out = await draw({ heading: { title: 'New sponsor packages' }, packageLabel: 'Package', note: 'Credits run within a year.' })
    for (const s of ['New sponsor packages', 'Package 1', 'Starter', 'Twelve credits.', '$1,000', 'A $1,400 value. You save $400.', 'Credits run within a year.']) expect(out).toContain(s)
    expect(out).not.toContain('Package 2')
  })
  it('does not claim a saving when the value is not more than the price', async () => {
    settings = { packages: { items: [{ name: 'Even', price: 500, value: 500 }] } }
    expect(await draw({})).not.toContain('You save')
  })
})
