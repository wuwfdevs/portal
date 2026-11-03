import { describe, expect, it } from 'vitest'

import { getMediaUrl } from './getMediaUrl'

const STAMP = '2026-11-03T03:14:19.745Z'
const TAG = encodeURIComponent(STAMP)

describe('getMediaUrl', () => {
  it('adds the cache tag to a plain address with a ?', () => {
    expect(getMediaUrl('/api/media/file/a.jpg', STAMP)).toBe(`/api/media/file/a.jpg?${TAG}`)
  })

  it('joins the tag to an address that already has a query with &, never a second ?', () => {
    const out = getMediaUrl('/api/media/file/pexels-pixabay-47730.jpg?prefix=media', STAMP)
    expect(out).toBe(`/api/media/file/pexels-pixabay-47730.jpg?prefix=media&${TAG}`)
    expect(out.match(/\?/g)).toHaveLength(1)
    // The folder survives intact: the file route reads exactly `media`.
    expect(new URL(out, 'https://example.test').searchParams.get('prefix')).toBe('media')
  })

  it('keeps a fragment at the end', () => {
    expect(getMediaUrl('/a.jpg?prefix=media#top', STAMP)).toBe(`/a.jpg?prefix=media&${TAG}#top`)
    expect(getMediaUrl('/a.jpg#top', STAMP)).toBe(`/a.jpg?${TAG}#top`)
  })

  it('leaves the address alone with no tag, and gives an empty string for no address', () => {
    expect(getMediaUrl('/a.jpg?prefix=media')).toBe('/a.jpg?prefix=media')
    expect(getMediaUrl('/a.jpg?prefix=media', '')).toBe('/a.jpg?prefix=media')
    expect(getMediaUrl('/a.jpg?prefix=media', null)).toBe('/a.jpg?prefix=media')
    expect([getMediaUrl(null, STAMP), getMediaUrl(undefined, STAMP), getMediaUrl('', STAMP)]).toEqual(['', '', ''])
  })
})
