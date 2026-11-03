import { describe, expect, it } from 'vitest'

import { feedToken, type FeedState } from './token'

const base: FeedState = { count: 12, latestUpdateAt: '2026-10-21T18:16:00.000Z', blogUpdatedAt: '2026-10-07T16:01:00.000Z', coverage: 'live' }

describe('feedToken', () => {
  it('is the same for the same state', () => {
    expect(feedToken({ ...base })).toBe(feedToken({ ...base }))
  })
  it('changes when an update is added, removed or changed', () => {
    expect(feedToken({ ...base, count: 13 })).not.toBe(feedToken(base))
    expect(feedToken({ ...base, count: 11 })).not.toBe(feedToken(base))
    expect(feedToken({ ...base, latestUpdateAt: '2026-10-21T18:20:00.000Z' })).not.toBe(feedToken(base))
  })
  it('changes when the blog itself changes: it ends, or its pins or introduction are saved', () => {
    expect(feedToken({ ...base, coverage: 'ended' })).not.toBe(feedToken(base))
    expect(feedToken({ ...base, blogUpdatedAt: '2026-10-22T10:00:00.000Z' })).not.toBe(feedToken(base))
  })
  it('does not confuse one field with another', () => {
    expect(feedToken({ count: 1, latestUpdateAt: '2', blogUpdatedAt: null })).not.toBe(feedToken({ count: 1, latestUpdateAt: null, blogUpdatedAt: '2' }))
  })
  it('works for a blog with nothing in it yet', () => {
    expect(feedToken({ count: 0 })).toBe('0|||')
  })
})
