import { describe, expect, it } from 'vitest'

import { clampPercent, collectionsOf, episodeCount, periodCounts, sitesWithEpisodes, type EpisodeRef, type SiteRef } from './group'
import { PERIODS, eraLabel, periodLabel } from './periods'

const ep = (id: number, over: Partial<EpisodeRef> = {}): EpisodeRef => ({ id, title: `Episode ${id}`, path: `/unearthing-florida/2024-04-0${id}/e${id}`, publishedAt: `2024-04-0${id}T12:00:00Z`, period: null, siteId: null, series: null, ...over })
const site = (id: number, over: Partial<SiteRef> = {}): SiteRef => ({ id, name: `Site ${id}`, short: `S${id}`, place: 'Place', era: 'native', description: null, x: 10, y: 10, ...over })

describe('periods', () => {
  it('are in time order, each with an era, and have labels', () => {
    expect(PERIODS.map((p) => p.value)).toHaveLength(7)
    expect(new Set(PERIODS.map((p) => p.value)).size).toBe(7)
    expect(eraLabel('spanish')).toBe('Spanish colonial')
    expect(periodLabel('civil-war')).toBe('Civil War')
    expect(eraLabel(null)).toBe('')
  })
})

describe('episodeCount', () => {
  it('says none, one and many in words', () => {
    expect([0, 1, 3].map(episodeCount)).toEqual(['No episodes yet', '1 episode', '3 episodes'])
  })
})

describe('periodCounts', () => {
  it('counts the episodes in each period and lists every period, even with none', () => {
    const rows = periodCounts([ep(1, { period: 'first-spanish' }), ep(2, { period: 'first-spanish' }), ep(3, { period: 'civil-war' }), ep(4)])
    expect(rows).toHaveLength(7)
    expect(rows.find((r) => r.value === 'first-spanish')?.count).toBe(2)
    expect(rows.find((r) => r.value === 'civil-war')?.count).toBe(1)
    expect(rows.find((r) => r.value === 'british-west-florida')?.count).toBe(0)
  })
})

describe('collectionsOf', () => {
  const missions = { id: 1, title: 'The Spanish missions', slug: 'missions' }
  const wrecks = { id: 2, title: 'Wrecks of the Gulf', slug: 'wrecks' }
  it('groups by series, biggest first, episodes oldest first, and leaves out episodes with no series', () => {
    const out = collectionsOf([ep(3, { series: missions }), ep(1, { series: missions }), ep(2, { series: wrecks }), ep(4)])
    expect(out.map((c) => c.title)).toEqual(['The Spanish missions', 'Wrecks of the Gulf'])
    expect(out[0]!.episodes.map((e) => e.id)).toEqual([1, 3])
  })
  it('breaks ties by title and handles no episodes', () => {
    expect(collectionsOf([ep(1, { series: wrecks }), ep(2, { series: missions })]).map((c) => c.title)).toEqual(['The Spanish missions', 'Wrecks of the Gulf'])
    expect(collectionsOf([])).toEqual([])
  })
  it('puts an undated episode first rather than failing', () => {
    expect(collectionsOf([ep(2, { series: missions }), ep(1, { series: missions, publishedAt: null })])[0]!.episodes.map((e) => e.id)).toEqual([1, 2])
  })
})

describe('sitesWithEpisodes', () => {
  it('attaches each site\'s episodes and count, matching ids across number and string', () => {
    const out = sitesWithEpisodes([site(1), site(2)], [ep(1, { siteId: 1 }), ep(2, { siteId: '1' }), ep(3, { siteId: 2 }), ep(4)])
    expect(out.map((s) => s.count)).toEqual([2, 1])
    expect(out[0]!.episodes.map((e) => e.id)).toEqual([1, 2])
  })
})

describe('clampPercent', () => {
  it('keeps pins on the map', () => {
    expect([-5, 50, 140, Number.NaN].map(clampPercent)).toEqual([0, 50, 100, 50])
  })
})
