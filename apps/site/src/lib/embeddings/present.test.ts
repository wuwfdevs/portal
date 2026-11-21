import { describe, expect, it } from 'vitest'

import { VOYAGER_BADGE_LABEL } from '@/lib/voyager/identity'

import { isOlder, presentRelated, sharedLabel, storyFactsOf, type StoryFacts } from './present'

const now = new Date('2026-11-18T12:00:00Z')
const growth = { id: 1, title: 'Growth & Development' }
const housing = { id: 2, title: 'Housing' }
const schools = { id: 3, title: 'Schools' }

const current: StoryFacts = { topics: [growth], seriesId: 10, productionId: null }

describe('sharedLabel', () => {
  it('says nothing when nothing is shared', () => {
    expect(sharedLabel(current, { topics: [schools], seriesId: 11, productionId: 5 })).toBeNull()
    expect(sharedLabel(current, { topics: [] })).toBeNull()
  })
  it('names a shared topic, series or show, the most specific first', () => {
    expect(sharedLabel(current, { topics: [growth, housing] })).toBe('Same topic')
    expect(sharedLabel(current, { topics: [schools], seriesId: 10 })).toBe('Same series')
    expect(sharedLabel({ ...current, productionId: 5 }, { topics: [growth], seriesId: 10, productionId: 5 })).toBe('Same show')
  })
  it('compares ids as text, and never matches two missing ones', () => {
    expect(sharedLabel({ topics: [{ id: '1', title: 'x' }] }, { topics: [{ id: 1, title: 'x' }] })).toBe('Same topic')
    expect(sharedLabel({ topics: [], seriesId: null }, { topics: [], seriesId: null })).toBeNull()
    expect(sharedLabel({ topics: [], productionId: undefined }, { topics: [], productionId: undefined })).toBeNull()
  })
})

describe('isOlder', () => {
  it('is true only past a year', () => {
    expect(isOlder('2026-01-01T00:00:00Z', now)).toBe(false)
    expect(isOlder('2025-11-19T12:00:00Z', now)).toBe(false)
    expect(isOlder('2025-11-17T12:00:00Z', now)).toBe(true)
    expect(isOlder('2021-03-04T12:00:00Z', now)).toBe(true)
  })
  it('says nothing about a missing or unreadable date', () => {
    expect(isOlder(null, now)).toBe(false)
    expect(isOlder(undefined, now)).toBe(false)
    expect(isOlder('not a date', now)).toBe(false)
  })
})

describe('presentRelated', () => {
  it('shows a recent story with its plain date and what it shares', () => {
    const p = presentRelated(current, { topics: [housing, growth], publishedAt: '2026-10-16T15:00:00Z' }, now)
    expect(p.sameLabel).toBe('Same topic')
    expect(p.date).toBe('Oct 16, 2026')
    expect(p.dateTime).toBe('2026-10-16')
    expect(p.older).toBe(false)
  })

  it('puts the topics the two stories share first in the kicker, and shows at most two', () => {
    const p = presentRelated(current, { topics: [schools, housing, growth] }, now)
    expect(p.kicker).toBe('Growth & Development, Schools')
    expect(p.tone).toBe('topic')
  })

  it('marks a story over a year old with "From"', () => {
    const p = presentRelated(current, { topics: [housing], publishedAt: '2021-03-04T18:00:00Z' }, now)
    expect(p.older).toBe(true)
    expect(p.date).toBe('From Mar 4, 2021')
  })

  it('names the show for an episode or a show story, and prefers it to topics', () => {
    expect(presentRelated(current, { topics: [growth], productionTitle: 'High Ground', format: 'audio' }, now)).toMatchObject({ kicker: 'Episode · High Ground', tone: 'show' })
    expect(presentRelated(current, { topics: [growth], productionTitle: 'High Ground', format: 'article' }, now)).toMatchObject({ kicker: 'Show · High Ground', tone: 'show' })
  })

  it('shows the Voyager badge in place of everything else, and still says what is shared', () => {
    const p = presentRelated(current, { topics: [growth], voyager: true, productionTitle: 'X' }, now)
    expect(p).toMatchObject({ kicker: VOYAGER_BADGE_LABEL, tone: 'voyager', sameLabel: 'Same topic' })
  })

  it('falls back to the series title, then to nothing, and says nothing it does not know', () => {
    expect(presentRelated(current, { topics: [], seriesTitle: 'After Isaias' }, now).kicker).toBe('Series · After Isaias')
    const bare = presentRelated(current, { topics: [] }, now)
    expect(bare).toMatchObject({ kicker: null, sameLabel: null, date: '', dateTime: null, older: false })
  })
})

describe('storyFactsOf', () => {
  it('reads topics, series and show from loaded records and ignores bare ids', () => {
    expect(storyFactsOf({ categories: [{ id: 1, title: 'Housing' }, 7, { id: 2 }], series: { id: 10, title: 'S' }, production: 4 })).toEqual({
      topics: [{ id: 1, title: 'Housing' }],
      seriesId: 10,
      productionId: null,
    })
    expect(storyFactsOf({})).toEqual({ topics: [], seriesId: null, productionId: null })
  })
})
