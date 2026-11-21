import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { CreditSection } from './Component'

let credit = { lines: [] as Array<{ agreementId: number; text: string }>, hubHref: null as string | null, independenceHref: null as string | null, subject: 'program' as 'program' | 'reporting' }
const loadCredit = vi.fn(async () => credit)
vi.mock('@/lib/section-data/load', () => ({ loadCredit: (...a: unknown[]) => (loadCredit as unknown as (...x: unknown[]) => unknown)(...a) }))

const draw = async (block: Record<string, unknown>) => {
  const out = await CreditSection({ block: { blockType: 'sectionCredit', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  credit = { lines: [{ agreementId: 1, text: 'Made possible by Gulf Power Foundation.' }], hubHref: null, independenceHref: '/about/independence', subject: 'program' }
  loadCredit.mockClear()
})

describe('Credit section', () => {
  it('draws nothing, and reads nothing, without a target', async () => {
    expect(await draw({})).toBe('')
    expect(await draw({ target: { relationTo: 'productions', value: null } })).toBe('')
    expect(loadCredit).not.toHaveBeenCalled()
  })
  it('asks for the agreement line of the record it names', async () => {
    await draw({ target: { relationTo: 'fellowships', value: { id: 5 } } })
    expect(loadCredit).toHaveBeenLastCalledWith({ relationTo: 'fellowships', id: 5 })
  })
  it('draws the line in the labelled neutral panel, with the policy link and no price or call to buy', async () => {
    const out = await draw({ target: { relationTo: 'productions', value: 2 }, tone: 'dark', id: 'blk' })
    expect(out).toContain('data-tone="dark"')
    expect(out).toContain('Support for this program')
    expect(out).toContain('Made possible by Gulf Power Foundation.')
    expect(out).toContain('href="/about/independence"')
    expect(out).toContain('id="credit-blk"')
    expect(out).not.toMatch(/\$|buy now/i)
  })
  it('says "reporting" for a fellowship and links to its page', async () => {
    credit = { ...credit, subject: 'reporting', hubHref: '/fellowships/coastal' }
    const out = await draw({ target: { relationTo: 'fellowships', value: 5 } })
    expect(out).toContain('Support for this reporting')
    expect(out).toContain('href="/fellowships/coastal"')
  })
  it('draws nothing when no agreement is running', async () => {
    credit = { ...credit, lines: [] }
    expect(await draw({ target: { relationTo: 'productions', value: 2 } })).toBe('')
  })
})
