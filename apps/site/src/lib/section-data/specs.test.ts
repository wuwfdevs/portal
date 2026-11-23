import { describe, expect, it } from 'vitest'

import { creditSpecOf, datesSpecOf, featuredSpecOf, listSpecOf } from './specs'

describe('listSpecOf: short videos', () => {
  it('reads the newest clips, or a section\'s, and nothing for a section that is not chosen', () => {
    expect(listSpecOf({ source: 'clips' })).toEqual({ source: 'clips', scope: 'latest', count: 6 })
    expect(listSpecOf({ source: 'clips', scope: 'section', section: { id: 4 }, count: 3 })).toEqual({ source: 'clips', scope: 'section', id: 4, count: 3 })
    expect(listSpecOf({ source: 'clips', scope: 'section' })).toBeNull()
    expect(listSpecOf({ source: 'clips', scope: 'topic', topic: 9 })).toEqual({ source: 'clips', scope: 'latest', count: 6 })
    // One series' videos can go first (the home page's short-video row had this choice); with none chosen the key is absent, so a cached spec is unchanged.
    expect(listSpecOf({ source: 'clips', series: { id: 4 }, count: 3 })).toEqual({ source: 'clips', scope: 'latest', count: 3, firstSeries: 4 })
    expect(listSpecOf({ source: 'clips', series: null })).toEqual({ source: 'clips', scope: 'latest', count: 6 })
  })
})

describe('listSpecOf', () => {
  it('reads only the fields of the chosen source and scope', () => {
    expect(listSpecOf({ source: 'stories', scope: 'section', section: { id: 4 }, topic: 9, show: 8 })).toEqual({ source: 'stories', scope: 'section', id: 4, count: 6 })
    expect(listSpecOf({ source: 'stories', scope: 'topic', section: 4, topic: { id: 9 } })).toEqual({ source: 'stories', scope: 'topic', id: 9, count: 6 })
    expect(listSpecOf({ source: 'stories', scope: 'latest', section: 4 })).toEqual({ source: 'stories', scope: 'latest', count: 6 })
    expect(listSpecOf({ source: 'stories' })).toEqual({ source: 'stories', scope: 'latest', count: 6 })
    expect(listSpecOf({ source: 'episodes', show: 3, section: 4 })).toEqual({ source: 'episodes', id: 3, count: 6 })
    expect(listSpecOf({ source: 'videos', show: 3 })).toEqual({ source: 'videos', count: 6 })
    expect(listSpecOf({ source: 'artists', count: 3 })).toEqual({ source: 'artists', count: 3 })
    expect(listSpecOf({ source: 'performances', count: 3, show: 4 })).toEqual({ source: 'performances', count: 3 })
  })
  it('lists the page\'s show when a list of a show\'s episodes has none chosen, and the chosen show otherwise', () => {
    expect(listSpecOf({ source: 'episodes', count: 3 }, { id: 8 })).toEqual({ source: 'episodes', id: 8, count: 3 })
    expect(listSpecOf({ source: 'episodes', show: { id: 5 } }, { id: 8 })).toEqual({ source: 'episodes', id: 5, count: 6 })
    expect(listSpecOf({ source: 'episodes' }, null)).toBeNull()
    expect(listSpecOf({ source: 'episodes' })).toBeNull()
    expect(listSpecOf({ source: 'episodes', allShows: true }, { id: 8 })).toEqual({ source: 'episodes', all: true, count: 6 })
  })
  it('reads every listed show for the shows source, and episodes from every show only when asked', () => {
    expect(listSpecOf({ source: 'shows', count: 3, show: 4 })).toEqual({ source: 'shows' })
    expect(listSpecOf({ source: 'episodes', allShows: true, show: 4, count: 5 })).toEqual({ source: 'episodes', all: true, count: 5 })
    expect(listSpecOf({ source: 'episodes', allShows: false, show: 4 })).toEqual({ source: 'episodes', id: 4, count: 6 })
    expect(listSpecOf({ source: 'episodes', allShows: 'yes' })).toBeNull()
  })
  it('has no spec when the choice a source needs is missing, or the source is unknown', () => {
    expect(listSpecOf({ source: 'stories', scope: 'section' })).toBeNull()
    expect(listSpecOf({ source: 'stories', scope: 'topic', topic: null })).toBeNull()
    expect(listSpecOf({ source: 'episodes' })).toBeNull()
    expect(listSpecOf({ source: 'podcasts' })).toBeNull()
    expect(listSpecOf({})).toBeNull()
  })
  it('keeps the count between 1 and 12 and whole', () => {
    expect(listSpecOf({ source: 'videos', count: 500 })).toMatchObject({ count: 12 })
    expect(listSpecOf({ source: 'videos', count: 0 })).toMatchObject({ count: 1 })
    expect(listSpecOf({ source: 'videos', count: -3 })).toMatchObject({ count: 1 })
    expect(listSpecOf({ source: 'videos', count: 4.9 })).toMatchObject({ count: 4 })
    expect(listSpecOf({ source: 'videos', count: 'many' })).toMatchObject({ count: 6 })
  })
})

describe('featuredSpecOf', () => {
  it('reads a picked story or show, populated or bare, or the section a newest story comes from', () => {
    expect(featuredSpecOf({ mode: 'pick', record: { relationTo: 'posts', value: { id: 7 } } })).toEqual({ mode: 'pick', relationTo: 'posts', id: 7 })
    expect(featuredSpecOf({ record: { relationTo: 'productions', value: 3 } })).toEqual({ mode: 'pick', relationTo: 'productions', id: 3 })
    expect(featuredSpecOf({ mode: 'newest', section: { id: 2 }, record: { relationTo: 'posts', value: 7 } })).toEqual({ mode: 'newest', sectionId: 2 })
  })
  it('has no spec for nothing chosen, or a collection it does not read', () => {
    expect(featuredSpecOf({})).toBeNull()
    expect(featuredSpecOf({ mode: 'newest' })).toBeNull()
    expect(featuredSpecOf({ mode: 'pick', record: { relationTo: 'users', value: 1 } })).toBeNull()
    expect(featuredSpecOf({ mode: 'pick', record: { relationTo: 'posts', value: null } })).toBeNull()
  })
})

describe('datesSpecOf and creditSpecOf', () => {
  it('reads the source and a bounded count', () => {
    expect(datesSpecOf({ source: 'radiolive', count: 99 })).toEqual({ source: 'radiolive', count: 12 })
    expect(datesSpecOf({ source: 'typed' })).toEqual({ source: 'typed', count: 6 })
    expect(datesSpecOf({ source: 'other' })).toBeNull()
  })
  it('credit names a production, fellowship or series', () => {
    expect(creditSpecOf({ target: { relationTo: 'fellowships', value: { id: 5 } } })).toEqual({ relationTo: 'fellowships', id: 5 })
    expect(creditSpecOf({ target: { relationTo: 'series', value: 2 } })).toEqual({ relationTo: 'series', id: 2 })
    expect(creditSpecOf({ target: { relationTo: 'posts', value: 2 } })).toBeNull()
    expect(creditSpecOf({ target: { relationTo: 'productions', value: null } })).toBeNull()
    expect(creditSpecOf({})).toBeNull()
  })
})

describe('a list on The Voyager\'s pages (hubs redesign, slice 5)', () => {
  it('reads only the Voyager\'s stories, video stories and short videos, and says so in the spec (so it is in the cache key)', () => {
    expect(listSpecOf({ source: 'stories', count: 3 }, null, 'voyager')).toEqual({ source: 'stories', scope: 'latest', count: 3, voyager: true })
    expect(listSpecOf({ source: 'videos', count: 2 }, null, 'voyager')).toEqual({ source: 'videos', count: 2, voyager: true })
    expect(listSpecOf({ source: 'clips', count: 4 }, null, 'voyager')).toEqual({ source: 'clips', scope: 'latest', count: 4, voyager: true })
  })
  it('leaves the station\'s pages and the sources that are not an identity\'s stories alone', () => {
    expect(listSpecOf({ source: 'clips', count: 4 }, null, 'station')).toEqual({ source: 'clips', scope: 'latest', count: 4 })
    expect(listSpecOf({ source: 'clips', count: 4 })).not.toHaveProperty('voyager')
    expect(listSpecOf({ source: 'artists', count: 3 }, null, 'voyager')).toEqual({ source: 'artists', count: 3 })
    expect(listSpecOf({ source: 'shows' }, null, 'voyager')).toEqual({ source: 'shows' })
  })
})
