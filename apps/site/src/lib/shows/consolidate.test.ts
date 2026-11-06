import { describe, expect, it } from 'vitest'

import { consolidatedShowPath, movedEpisodePath, newEpisodePath, planShowMoves } from './consolidate'

describe('consolidatedShowPath', () => {
  it("moves both of Grove's show addresses under /shows", () => {
    expect(consolidatedShowPath('/show/acoustic-interlude')).toBe('/shows/acoustic-interlude')
    expect(consolidatedShowPath('/podcast/the-ecominutes')).toBe('/shows/the-ecominutes')
  })
  it('leaves anything else alone', () => {
    for (const p of ['/shows/high-ground', '/unearthing-florida', '/show', '/show/x/2026-01-01/ep', '/local-news/2026-01-01/x', '/showcase/x', '', null, undefined]) {
      expect(consolidatedShowPath(p)).toBeNull()
    }
  })
})

describe('movedEpisodePath', () => {
  it("moves an episode that sits under the show's old address", () => {
    expect(movedEpisodePath('/podcast/the-ecominutes/2026-09-09/eco-rices-whale', '/podcast/the-ecominutes', '/shows/the-ecominutes')).toBe('/shows/the-ecominutes/2026-09-09/eco-rices-whale')
  })
  it('leaves an episode elsewhere, including one under a show whose name only starts the same', () => {
    expect(movedEpisodePath('/local-news/2026-09-09/x', '/show/a', '/shows/a')).toBeNull()
    expect(movedEpisodePath('/show/ab/2026-09-09/x', '/show/a', '/shows/a')).toBeNull()
    expect(movedEpisodePath('/show/a', '/show/a', '/shows/a')).toBeNull()
    expect(movedEpisodePath(null, '/show/a', '/shows/a')).toBeNull()
  })
})

describe('newEpisodePath', () => {
  it('puts a new episode under a show at /shows', () => {
    expect(newEpisodePath({ showPath: '/shows/high-ground', date: '2026-11-06', slug: 'ep-4' })).toBe('/shows/high-ground/2026-11-06/ep-4')
  })
  it('does nothing for a show still at a Grove address', () => {
    expect(newEpisodePath({ showPath: '/show/high-ground', date: '2026-11-06', slug: 'ep-4' })).toBeNull()
  })
})

describe('planShowMoves', () => {
  it('plans a move for each Grove show and skips the rest', () => {
    const plan = planShowMoves([
      { id: 1, path: '/show/b' },
      { id: 2, path: '/podcast/a' },
      { id: 3, path: '/shows/c' },
      { id: 4, path: null },
    ])
    expect(plan.moves).toEqual([
      { id: 2, from: '/podcast/a', to: '/shows/a' },
      { id: 1, from: '/show/b', to: '/shows/b' },
    ])
    expect(plan.clashes).toEqual([])
  })
  it('moves neither of two shows that would land on the same address', () => {
    const plan = planShowMoves([
      { id: 1, path: '/show/x' },
      { id: 2, path: '/podcast/x' },
    ])
    expect(plan.moves).toEqual([])
    expect(plan.clashes).toEqual([{ to: '/shows/x', shows: [{ id: 1, from: '/show/x' }, { id: 2, from: '/podcast/x' }] }])
  })
})
