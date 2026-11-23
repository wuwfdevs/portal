import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { ShowSpotlightSection } from './Component'

let slot: unknown = null
let fail = false
const loadPodcastsSlot = vi.fn(async () => {
  if (fail) throw new Error('down')
  return slot
})
vi.mock('@/lib/homepage/load-slots', () => ({ loadPodcastsSlot: (...a: unknown[]) => (loadPodcastsSlot as unknown as (...x: unknown[]) => unknown)(...a) }))
vi.mock('@/utilities/getGlobals', () => ({ getCachedGlobal: () => async () => ({ independencePolicy: null }) }))

const show = (id: number, title: string) => ({ id, title, path: `/shows/${title.toLowerCase()}`, heroImage: null })
const draw = async (block: Record<string, unknown>) => {
  const out = await ShowSpotlightSection({ block: { blockType: 'sectionShowSpotlight', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  fail = false
  loadPodcastsSlot.mockClear()
  slot = {
    featured: { show: show(1, 'Barefoot'), heroImage: null, episodes: 3, latest: { id: 9, title: 'A new episode', path: '/shows/barefoot/2026-11-20/new', publishedAt: '2026-11-20T12:00:00.000Z', meta: {}, featuredAudio: null } },
    acknowledgments: [],
    others: [{ show: show(2, 'Other'), heroImage: null, episodes: 4, latest: null }],
  }
})

describe('Show spotlight', () => {
  it('asks for the show an editor picked', async () => {
    await draw({ featuredShow: { id: 1 } })
    expect(loadPodcastsSlot).toHaveBeenLastCalledWith(1)
  })
  it('draws the show, its newest episode and the others, headed and linked to all podcasts in the header', async () => {
    const out = await draw({})
    expect(out).toContain('Podcasts made in Pensacola')
    expect(out).toContain('A new episode')
    expect(out).toContain('Other')
    expect(out.indexOf('All podcasts')).toBeLessThan(out.indexOf('A new episode'))
  })
  it('with Only these shows, asks for those alone and links where the editor says', async () => {
    const out = renderToStaticMarkup((await ShowSpotlightSection({ block: { blockType: 'sectionShowSpotlight', onlyShows: [{ id: 5 }, 6], moreLabel: 'All shows', moreHref: '/voyager/shows' } as never, context: testContext })) as never)
    expect(loadPodcastsSlot).toHaveBeenLastCalledWith(null, [5, 6])
    expect(out).toContain('All shows')
    expect(out).toContain('href="/voyager/shows"')
    expect(out).not.toContain('All podcasts')
  })
  it('on a Voyager page it draws nothing until some shows are chosen, and never reads the directory for them', async () => {
    const voyager = { ...testContext, setId: 'voyager' as const }
    const bare = await ShowSpotlightSection({ block: { blockType: 'sectionShowSpotlight' } as never, context: voyager })
    expect(bare).toBeNull()
    expect(loadPodcastsSlot).not.toHaveBeenCalled()
    const chosen = await ShowSpotlightSection({ block: { blockType: 'sectionShowSpotlight', onlyShows: [5] } as never, context: voyager })
    expect(renderToStaticMarkup(chosen as never)).toContain('A new episode')
    expect(loadPodcastsSlot).toHaveBeenLastCalledWith(null, [5])
  })
  it('draws nothing when no listed show has an episode, and when the read fails', async () => {
    slot = null
    expect(await draw({})).toBe('')
    fail = true
    expect(await draw({})).toBe('')
  })
})
