import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { FellowshipFeatureSection, fellowshipFeatureClaim } from './Component'

let feature: unknown = null
const loadFeature = vi.fn(async () => feature)
vi.mock('@/lib/home-blocks/load', () => ({ loadFeature: (...a: unknown[]) => (loadFeature as unknown as (...x: unknown[]) => unknown)(...a) }))
vi.mock('@/utilities/getGlobals', () => ({ getCachedGlobal: () => async () => ({ independencePolicy: { slug: 'independence' } }) }))

const draw = async (block: Record<string, unknown>) => {
  const out = await FellowshipFeatureSection({ block: { blockType: 'sectionFellowshipFeature', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  feature = {
    fellowship: { id: 6, title: 'Coastal Futures', slug: 'coastal-futures', summary: 'Reporting on the coast.' },
    story: { id: 5, title: 'Eight feet of water', path: '/news/2026-11-20/eight-feet', meta: { description: 'A line.' } },
    acknowledgments: [{ agreementId: 1, text: 'Made possible by Example Foundation.' }],
  }
  loadFeature.mockClear()
})

describe('Fellowship feature', () => {
  it('draws nothing, and reads nothing, without a fellowship', async () => {
    expect(await draw({})).toBe('')
    expect(loadFeature).not.toHaveBeenCalled()
  })
  it('draws nothing once the fellowship is gone', async () => {
    feature = null
    expect(await draw({ fellowship: 6 })).toBe('')
  })
  it('asks for the fellowship and the story chosen', async () => {
    await draw({ fellowship: { id: 6 }, story: { id: 5 } })
    expect(loadFeature).toHaveBeenLastCalledWith(6, 5)
  })
  it('draws the story and the funder line from the agreement, in the neutral panel, with the policy link', async () => {
    const out = await draw({ fellowship: 6 })
    expect(out).toContain('Eight feet of water')
    expect(out).toContain('Coastal Futures Fellowship')
    expect(out).toContain('Support for this reporting')
    expect(out).toContain('Made possible by Example Foundation.')
    expect(out).toContain('href="/independence"')
  })
  it('claims the one story it features before any run below does', async () => {
    expect(await fellowshipFeatureClaim({ blockType: 'sectionFellowshipFeature', fellowship: 6 })).toEqual({ candidates: [], take: 1, pinned: [5] })
    expect(await fellowshipFeatureClaim({ blockType: 'sectionFellowshipFeature' })).toBeNull()
  })
})
