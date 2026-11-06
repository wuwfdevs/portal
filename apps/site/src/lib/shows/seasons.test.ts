import { describe, expect, it } from 'vitest'

import { currentSeason, episodeLabel, groupBySeason, seasonName } from './seasons'

describe('season names and episode labels', () => {
  it('writes a season as the boards do', () => {
    expect(seasonName(1)).toBe('Season One')
    expect(seasonName(12)).toBe('Season Twelve')
    expect(seasonName(20)).toBe('Season Twenty')
    expect(seasonName(21)).toBe('Season 21')
  })
  it('labels episodes, trailers and bonus episodes', () => {
    expect(episodeLabel(0)).toBe('Ep. 0')
    expect(episodeLabel(5, 'full')).toBe('Ep. 5')
    expect(episodeLabel(null)).toBeNull()
    expect(episodeLabel(3, 'trailer')).toBe('Trailer')
    expect(episodeLabel(null, 'bonus')).toBe('Bonus')
    expect(episodeLabel(4, 'bonus')).toBe('Bonus · Ep. 4')
  })
})

describe('grouping episodes by season', () => {
  const s1 = { id: 1, number: 1 }
  const s2 = { id: 2, number: 2 }
  const s3 = { id: 3, number: 3 } // no episodes
  const ep = (title: string, season: unknown, episodeNumber: number | null, publishedAt: string, episodeType: 'full' | 'trailer' | 'bonus' = 'full') => ({ title, season, episodeNumber, publishedAt, episodeType })

  const episodes = [
    ep('S1E2', 1, 2, '2025-02-01'),
    ep('S1E0', { id: 1 }, 0, '2025-01-01'),
    ep('S1 bonus', 1, null, '2025-06-01', 'bonus'),
    ep('S1 trailer', 1, null, '2024-12-01', 'trailer'),
    ep('S2E1', 2, 1, '2026-01-01'),
    ep('Loose old', null, null, '2020-01-01'),
    ep('Loose new', 99, null, '2021-01-01'), // a season not in the list
  ]

  it('puts the newest season first, each in episode order, and seasonless episodes last', () => {
    const groups = groupBySeason([s1, s2, s3], episodes)
    expect(groups.map((g) => [g.season?.number ?? null, g.episodes.map((e) => e.title)])).toEqual([
      [2, ['S2E1']],
      [1, ['S1 trailer', 'S1E0', 'S1E2', 'S1 bonus']],
      [null, ['Loose new', 'Loose old']],
    ])
  })

  it('says which season is airing: the one with the newest episode', () => {
    expect(currentSeason([s1, s2], episodes)?.number).toBe(2)
    expect(currentSeason([s1, s2], [ep('only', 1, 1, '2025-01-01'), ep('loose', null, null, '2030-01-01')])?.number).toBe(1)
    expect(currentSeason([s1], [])).toBeNull()
  })
})
