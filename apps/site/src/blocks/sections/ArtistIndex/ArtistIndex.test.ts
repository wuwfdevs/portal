import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { indexArtists } from '@/lib/radiolive/artist-index'

import { testContext } from '../testing'
import { ArtistIndexSection, ArtistIndexView, type ArtistIndexEntry } from './Component'

const shows = [
  { slug: 'a', startsAt: '2026-10-02T18:00:00Z', lineup: [{ slug: 'jesse-bumann', name: 'Jesse Bumann' }, { slug: 'zoe-lopez', name: 'Zoë Lopez' }] },
  { slug: 'b', startsAt: '2026-11-06T18:00:00Z', lineup: [{ slug: 'jesse-bumann', name: 'Jesse Bumann' }] },
]
const entries: ArtistIndexEntry[] = indexArtists(shows, new Date('2026-11-23T18:00:00Z')).map((artist) => ({ artist, item: null }))
const block = { blockType: 'sectionArtistIndex', tone: 'grey', heading: { title: 'All artists' } }

let loaded: ArtistIndexEntry[] = entries
let fail = false
vi.mock('@/lib/radiolive/artist-index-load', () => ({
  loadArtistIndex: async () => {
    if (fail) throw new Error('down')
    return loaded
  },
}))
beforeEach(() => {
  loaded = entries
  fail = false
})

describe('ArtistIndexView', () => {
  const html = renderToStaticMarkup(ArtistIndexView({ block: block as never, entries }) as never)
  it('draws every artist as a link to their page, on the server, so it reads without script', () => {
    expect(html).toContain('href="/radiolive/artists/jesse-bumann"')
    expect(html).toContain('href="/radiolive/artists/zoe-lopez"')
    expect(html).toContain('2 appearances · Nov 6, 2026')
  })
  it('has a labelled search and the letters that have an artist', () => {
    expect(html).toContain('Search artists by name')
    expect(html).toContain('Names that start with J')
    expect(html).not.toContain('Names that start with Q')
    expect(html).toContain('2 artists')
  })
  it('draws nothing without an artist', () => {
    expect(ArtistIndexView({ block: block as never, entries: [] })).toBeNull()
  })
})

describe('ArtistIndexSection', () => {
  it('reads the index and draws it', async () => {
    expect(renderToStaticMarkup((await ArtistIndexSection({ block: block as never, context: testContext })) as never)).toContain('Jesse Bumann')
  })
  it('leaves the block out when the read fails, rather than failing the page', async () => {
    fail = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(renderToStaticMarkup((await ArtistIndexSection({ block: block as never, context: testContext })) as never)).toBe('')
    spy.mockRestore()
  })
})
