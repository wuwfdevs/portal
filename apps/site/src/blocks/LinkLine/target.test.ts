import { describe, expect, it } from 'vitest'

import type { Post } from '@/payload-types'

import { linkLineTarget } from './target'

const post = (extra: Partial<Post> = {}) => ({ id: 7, title: 'The current headline', path: '/local-news/2026-11-03/current', ...extra }) as Post

describe('which words and address a link line shows', () => {
  it('uses the typed words and address when no story is picked (a migrated line, or another site)', () => {
    expect(linkLineTarget({ linkText: ' Lawmakers react ', url: ' /local-news/2024-11-14/x ' })).toEqual({ href: '/local-news/2024-11-14/x', text: 'Lawmakers react' })
    expect(linkLineTarget({ linkText: 'Donate Here', url: '/thanks-for-your-support' })).toEqual({ href: '/thanks-for-your-support', text: 'Donate Here' })
    expect(linkLineTarget({ linkText: 'Elsewhere', url: 'http://www.example.org/plain' })).toEqual({ href: 'http://www.example.org/plain', text: 'Elsewhere' })
  })
  it('uses the picked story\'s own title and path, ignoring anything typed beside it', () => {
    expect(linkLineTarget({ story: post(), linkText: 'Old words', url: '/old' })).toEqual({ href: '/local-news/2026-11-03/current', text: 'The current headline' })
  })
  it('shows nothing, not a dead line, when there is nothing safe to link to', () => {
    expect(linkLineTarget({})).toBeNull()
    expect(linkLineTarget({ linkText: 'No address' })).toBeNull()
    expect(linkLineTarget({ url: '/only-an-address' })).toBeNull()
    expect(linkLineTarget({ linkText: 'Bad', url: 'javascript:alert(1)' })).toBeNull()
  })
  it('shows nothing for a picked story that is not loaded or has no address yet, and does not fall back to old typed words', () => {
    expect(linkLineTarget({ story: 7, linkText: 'Old words', url: '/old' })).toBeNull()
    expect(linkLineTarget({ story: post({ path: null }) })).toBeNull()
  })
})
