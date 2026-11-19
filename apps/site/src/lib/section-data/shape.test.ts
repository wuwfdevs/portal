import { describe, expect, it } from 'vitest'

import {
  artistListItem, audioOf, datePartsOf, isUpcoming, performanceDateItem, pictureOf, productionFeatured, relationId, storyFeatured, storyListItem, typedDateItem, upcomingDates,
} from './shape'

const media = { id: 5, url: '/media/a.jpg', alt: 'A guitar', width: 800, height: 600, mimeType: 'image/jpeg', updatedAt: '2026-11-01T00:00:00Z', focalX: 10, focalY: 90 }

describe('relationId, pictureOf, audioOf', () => {
  it('reads an id from a populated or a bare relation, and nothing from anything else', () => {
    expect(relationId(7)).toBe(7)
    expect(relationId('abc')).toBe('abc')
    expect(relationId({ id: 9, title: 'x' })).toBe(9)
    for (const v of [null, undefined, '', {}, [], true]) expect(relationId(v)).toBeNull()
  })
  it('draws a picture only for a populated record with an address (a deleted one is a bare id)', () => {
    expect(pictureOf(media)).toMatchObject({ id: 5, url: '/media/a.jpg', alt: 'A guitar', focalX: 10 })
    for (const v of [7, null, undefined, {}, { id: 1 }, { id: 1, url: ' ' }]) expect(pictureOf(v)).toBeNull()
  })
  it('keeps an audio record without an address (members only) so the player can refuse it, and drops a bare id', () => {
    expect(audioOf({ id: 2, title: 'T', durationSeconds: 61 })).toMatchObject({ id: 2, url: null, durationSeconds: 61 })
    expect(audioOf(2)).toBeNull()
  })
})

describe('story and show shaping', () => {
  const post = { id: 3, title: ' Hurricane season ', path: '/news/2026-11-01/hurricane', format: 'audio', publishedAt: '2026-11-01T15:00:00Z', dek: 'The dek', meta: { description: 'Meta line', image: media }, featuredAudio: { id: 4, url: '/a.mp3', title: 'A' } }
  it('a story list entry has its title, address, picture and a meta line', () => {
    expect(storyListItem(post)).toMatchObject({ id: 'post-3', title: 'Hurricane season', href: '/news/2026-11-01/hurricane', meta: 'Audio story · Nov 1, 2026' })
    expect(storyListItem(post)?.image?.id).toBe(5)
  })
  it('a story with no title, no id, or a bare id is left out; an address that is not on this site is dropped', () => {
    expect(storyListItem({ id: 1 })).toBeNull()
    expect(storyListItem(12)).toBeNull()
    expect(storyListItem({ id: 1, title: 'T', path: '//evil.example/x' })?.href).toBeNull()
    expect(storyListItem({ id: 1, title: 'T', path: 'https://evil.example/x' })?.href).toBeNull()
    expect(storyListItem({ id: 1, title: 'T', meta: { image: 8 } })?.image).toBeNull()
  })
  it('a featured story takes the description, else the dek, and its audio', () => {
    expect(storyFeatured(post)).toMatchObject({ kind: 'story', description: 'Meta line', audio: { id: 4 } })
    expect(storyFeatured({ ...post, meta: {} })?.description).toBe('The dek')
    expect(storyFeatured({})).toBeNull()
  })
  it('a featured show links to /shows/<slug>, only for a safe slug', () => {
    expect(productionFeatured({ title: 'Barefoot Mary', slug: 'barefoot-mary', tagline: 'Folk and more' })).toMatchObject({ kind: 'show', href: '/shows/barefoot-mary', description: 'Folk and more', image: null })
    expect(productionFeatured({ title: 'X', slug: '../admin' })?.href).toBeNull()
    expect(productionFeatured({ slug: 'x' })).toBeNull()
  })
  it('an artist links to its RadioLive page', () => {
    expect(artistListItem({ id: 1, name: 'Pat Byrn', slug: 'pat-byrn', photo: media })).toMatchObject({ id: 'artist-1', href: '/radiolive/artists/pat-byrn' })
    expect(artistListItem({ id: 1, slug: 'x' })).toBeNull()
  })
})

describe('dated lines', () => {
  const now = new Date('2026-12-01T12:00:00Z')
  it('a performance needs a title and a valid start; its address is /radiolive/<slug>', () => {
    expect(performanceDateItem({ id: 1, title: 'Night', startsAt: '2026-12-04T00:00:00Z', slug: 'night', venue: 'Museum' })).toMatchObject({ id: 'show-1', href: '/radiolive/night', place: 'Museum' })
    expect(performanceDateItem({ id: 1, title: 'Night', startsAt: 'not a date' })).toBeNull()
    expect(performanceDateItem({ id: 1, startsAt: '2026-12-04T00:00:00Z' })).toBeNull()
  })
  it('a typed row needs a title and a start, and an end before the start is ignored', () => {
    expect(typedDateItem({ title: 'Open house', startsAt: '2026-12-10T18:00:00Z', endsAt: '2026-12-10T20:00:00Z' }, 0)?.endsAt).toBe('2026-12-10T20:00:00.000Z')
    expect(typedDateItem({ title: 'x', startsAt: '2026-12-10T18:00:00Z', endsAt: '2026-12-09T00:00:00Z' }, 0)?.endsAt).toBeNull()
    expect(typedDateItem({ title: 'x' }, 0)).toBeNull()
    expect(typedDateItem(null, 0)).toBeNull()
  })
  it('a line is upcoming until its end, or three hours after its start when it has none', () => {
    const line = (startsAt: string, endsAt: string | null = null) => ({ startsAt, endsAt })
    expect(isUpcoming(line('2026-12-01T13:00:00Z'), now)).toBe(true)
    expect(isUpcoming(line('2026-12-01T10:00:00Z'), now)).toBe(true)
    expect(isUpcoming(line('2026-12-01T08:00:00Z'), now)).toBe(false)
    expect(isUpcoming(line('2026-12-01T08:00:00Z', '2026-12-01T13:00:00Z'), now)).toBe(true)
    expect(isUpcoming(line('2026-12-01T08:00:00Z', '2026-12-01T11:59:59Z'), now)).toBe(false)
  })
  it('keeps the upcoming lines, soonest first, at most the limit', () => {
    const mk = (id: string, startsAt: string) => ({ id, title: id, startsAt, endsAt: null, place: null, href: null })
    const out = upcomingDates([mk('c', '2026-12-09T00:00:00Z'), mk('past', '2026-11-01T00:00:00Z'), null, mk('a', '2026-12-02T00:00:00Z'), mk('b', '2026-12-05T00:00:00Z')], now, 2)
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
    expect(upcomingDates([mk('a', '2026-12-02T00:00:00Z')], now, 0)).toEqual([])
  })
  it('shows the station\'s local date and time (Central), and no time for a day line', () => {
    expect(datePartsOf('2026-12-04T00:00:00Z')).toEqual({ month: 'Dec', day: '3', weekday: 'Thursday', time: '6 p.m.' })
    expect(datePartsOf('2026-12-04T00:30:00Z').time).toBe('6:30 p.m.')
    expect(datePartsOf('2026-07-04T14:05:00Z').time).toBe('9:05 a.m.')
    expect(datePartsOf('2026-12-10T06:00:00Z').time).toBe('')
    expect(datePartsOf('2026-12-04T18:00:00Z').time).toBe('12 p.m.')
  })
})
