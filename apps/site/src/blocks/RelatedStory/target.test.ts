import { describe, expect, it } from 'vitest'

import type { Post } from '@/payload-types'

import { relatedStoryTarget } from './target'

const post = (extra: Partial<Post> = {}) => ({ id: 7, title: 'The current headline', path: '/local-news/2026-11-03/current', ...extra }) as Post

describe('which headline and address a related-story line shows', () => {
  it('uses the typed words and address when no story is picked (a migrated line, or another site)', () => {
    expect(relatedStoryTarget({ headline: ' Lawmakers react ', url: ' /local-news/2024-11-14/x ' })).toEqual({ href: '/local-news/2024-11-14/x', headline: 'Lawmakers react' })
  })
  it('uses the picked story\'s own title and path, ignoring anything typed beside it', () => {
    expect(relatedStoryTarget({ story: post(), headline: 'Old words', url: '/old' })).toEqual({ href: '/local-news/2026-11-03/current', headline: 'The current headline' })
  })
  it('shows nothing, not a dead line, when there is nothing to link to', () => {
    expect(relatedStoryTarget({})).toBeNull()
    expect(relatedStoryTarget({ headline: 'No address' })).toBeNull()
    expect(relatedStoryTarget({ url: '/only-an-address' })).toBeNull()
  })
  it('shows nothing for a picked story that is not loaded or has no address yet, and does not fall back to old typed words', () => {
    expect(relatedStoryTarget({ story: 7, headline: 'Old words', url: '/old' })).toBeNull()
    expect(relatedStoryTarget({ story: post({ path: null }) })).toBeNull()
  })
})
