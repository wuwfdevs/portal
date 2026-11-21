import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let sharedText: unknown = null
vi.mock('@/utilities/getGlobals', () => ({ getCachedGlobal: () => async () => sharedText }))

import { ALL_STORIES_HREF, HomeFoot } from './HomeFoot'

// What the home page ends with, whatever its sections: the way to every story, and the membership appeal from the Shared text global.

const draw = async () => renderToStaticMarkup(await HomeFoot())

describe('HomeFoot', () => {
  beforeEach(() => {
    sharedText = null
  })
  it('always ends with the button to every story', async () => {
    const out = await draw()
    expect(out).toContain(`href="${ALL_STORIES_HREF}"`)
    expect(out).toContain('All stories')
    expect(ALL_STORIES_HREF).toBe('/latest')
  })
  it('draws the membership appeal from the shared words, and nothing for it without words', async () => {
    expect(await draw()).not.toContain('Become a member')
    sharedText = { membershipAppeal: { text: 'Support the news you trust.', buttonLabel: 'Become a member', buttonHref: '/support' } }
    const out = await draw()
    expect(out).toContain('Support the news you trust.')
    expect(out).toContain('Become a member')
  })
})
