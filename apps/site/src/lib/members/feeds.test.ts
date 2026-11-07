import { describe, expect, it } from 'vitest'

import { makeFeedToken, memberFeedAudioPath, memberFeedPath, podcastAppLinks, verifyFeedToken } from './feeds'

const secret = 'feed-secret'

describe('private member feeds', () => {
  it('makes a token that only works for its own show and version', () => {
    const t = makeFeedToken(42, 7, 1, secret)
    expect(t).toMatch(/^42-1-[A-Za-z0-9_-]{32}$/)
    expect(verifyFeedToken(t, 7, secret)).toMatchObject({ profileId: 42, version: 1 })
    expect(verifyFeedToken(t, 8, secret)).toBeNull()
    expect(verifyFeedToken(t, 7, 'other-secret')).toBeNull()
  })

  it('refuses a token whose profile or version was changed, or that is malformed', () => {
    const t = makeFeedToken(42, 7, 1, secret)
    const [, , sig] = t.split('-')
    expect(verifyFeedToken(`43-1-${sig}`, 7, secret)).toBeNull()
    expect(verifyFeedToken(`42-2-${sig}`, 7, secret)).toBeNull()
    for (const bad of ['', '42-1', '42-1-short', `x-1-${sig}`, `42-1-${sig}.xml`, `42-1-${sig}x`]) expect(verifyFeedToken(bad, 7, secret)).toBeNull()
  })

  it('gives a new address after a reset (a new version)', () => {
    expect(makeFeedToken(42, 7, 2, secret)).not.toBe(makeFeedToken(42, 7, 1, secret))
  })

  it('builds the addresses and the podcast-app buttons, without Spotify', () => {
    expect(memberFeedPath('barefoot-mary', 'tok')).toBe('/feeds/barefoot-mary/tok.xml')
    expect(memberFeedAudioPath('barefoot-mary', 'tok', 9)).toBe('/feeds/barefoot-mary/tok/audio/9')
    const links = podcastAppLinks('https://wuwf.org/feeds/barefoot-mary/tok.xml')
    expect(links.map((l) => l.app)).toEqual(['Apple Podcasts', 'Overcast', 'Pocket Casts'])
    expect(links[0]!.href).toBe('podcast://wuwf.org/feeds/barefoot-mary/tok.xml')
    expect(links[1]!.href).toBe('overcast://x-callback-url/add?url=https%3A%2F%2Fwuwf.org%2Ffeeds%2Fbarefoot-mary%2Ftok.xml')
  })
})
