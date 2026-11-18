import { describe, expect, it } from 'vitest'

import { starterModules } from './starter'

const sections = [
  { id: 7, slug: 'florida-news' },
  { id: 3, slug: 'local-news' },
  { id: 9, slug: 'commentary' },
]

describe('starterModules', () => {
  it('adds the starter sections that exist, in the station\'s order, and ignores the rest', () => {
    expect(starterModules(sections, []).map((m) => [m.heading, m.section])).toEqual([['Local News', 3], ['Florida News', 7]])
  })
  it('gives each five stories, switched on', () => {
    for (const m of starterModules(sections, null)) expect(m).toMatchObject({ count: 5, enabled: true })
  })
  it('never replaces a home page that already has sections', () => {
    expect(starterModules(sections, [{ heading: 'Mine' }])).toEqual([])
  })
  it('is empty when none of them exist yet (before the import)', () => {
    expect(starterModules([{ id: 1, slug: 'commentary' }], undefined)).toEqual([])
  })
})
