import { describe, expect, it } from 'vitest'

import { pickClips, pickPodcasts, pickRadioLive, videoCount } from './slots'

const clip = (id: number, series: number | null) => ({ id, series: series === null ? null : { id: series } })

describe('videoCount', () => {
  it('keeps the stored number within 3 to 10', () => {
    expect(videoCount(6)).toBe(6)
    expect(videoCount(1)).toBe(3)
    expect(videoCount(40)).toBe(10)
    expect(videoCount(4.6)).toBe(5)
  })
  it('uses 6 when nothing usable is stored', () => {
    expect(videoCount(null)).toBe(6)
    expect(videoCount(undefined)).toBe(6)
    expect(videoCount(Number.NaN)).toBe(6)
  })
})

describe('pickClips', () => {
  const clips = [clip(1, 7), clip(2, null), clip(3, 8), clip(4, 7), clip(5, null)]

  it('takes the newest when no series is chosen', () => {
    expect(pickClips(clips, { seriesId: null, count: 3 }).map((c) => c.id)).toEqual([1, 2, 3])
  })
  it("puts the chosen series' clips first and tops up with the newest of the rest", () => {
    expect(pickClips(clips, { seriesId: 7, count: 4 }).map((c) => c.id)).toEqual([1, 4, 2, 3])
  })
  it('matches a series id whether it arrives as a number or a string', () => {
    expect(pickClips(clips, { seriesId: '8', count: 1 }).map((c) => c.id)).toEqual([3])
  })
  it('falls back to the newest when the chosen series has no published clip', () => {
    expect(pickClips(clips, { seriesId: 99, count: 2 }).map((c) => c.id)).toEqual([1, 2])
  })
  it('returns nothing when there are no clips', () => {
    expect(pickClips([], { seriesId: 7, count: 6 })).toEqual([])
  })
})

describe('pickPodcasts', () => {
  const ep = (publishedAt: string) => ({ publishedAt })
  const rows = [
    { show: { id: 1 }, latest: ep('2026-10-01T00:00:00Z') },
    { show: { id: 2 }, latest: null },
    { show: { id: 3 }, latest: ep('2026-11-01T00:00:00Z') },
    { show: { id: 4 }, latest: ep('2026-09-01T00:00:00Z') },
    { show: { id: 5 }, latest: ep('2026-08-01T00:00:00Z') },
  ]

  it('features the show with the newest episode when none is pinned', () => {
    const got = pickPodcasts(rows, { featuredId: null, othersCount: 3 })
    expect(got?.featured.show.id).toBe(3)
    expect(got?.others.map((r) => r.show.id)).toEqual([1, 4, 5])
  })
  it("features the editor's pick and leaves it out of the others", () => {
    const got = pickPodcasts(rows, { featuredId: 4, othersCount: 3 })
    expect(got?.featured.show.id).toBe(4)
    expect(got?.others.map((r) => r.show.id)).toEqual([3, 1, 5])
  })
  it('ignores a pick that has no published episode, and one that is not listed', () => {
    expect(pickPodcasts(rows, { featuredId: 2, othersCount: 0 })?.featured.show.id).toBe(3)
    expect(pickPodcasts(rows, { featuredId: 42, othersCount: 0 })?.featured.show.id).toBe(3)
  })
  it('puts a show with no episode yet after the others', () => {
    expect(pickPodcasts(rows, { featuredId: null, othersCount: 10 })?.others.map((r) => r.show.id)).toEqual([1, 4, 5, 2])
  })
  it('is null when no listed show has an episode', () => {
    expect(pickPodcasts([{ show: { id: 2 }, latest: null }], { featuredId: null, othersCount: 3 })).toBeNull()
    expect(pickPodcasts([], { featuredId: null, othersCount: 3 })).toBeNull()
  })
})

describe('pickRadioLive', () => {
  it('takes the soonest coming show and the newest recorded set', () => {
    expect(pickRadioLive({ upcoming: ['dec', 'jan'], latest: 'oct' })).toEqual({ next: 'dec', latest: 'oct' })
  })
  it('shows either one alone', () => {
    expect(pickRadioLive({ upcoming: [], latest: 'oct' })).toEqual({ next: null, latest: 'oct' })
    expect(pickRadioLive({ upcoming: ['dec'], latest: null })).toEqual({ next: 'dec', latest: null })
  })
  it('is null when there is nothing to show', () => {
    expect(pickRadioLive({ upcoming: [], latest: null })).toBeNull()
  })
})
