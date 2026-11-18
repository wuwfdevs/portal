import { describe, expect, it } from 'vitest'

import { choosePlaceholderPhotos } from '../../scripts/staging-demo/placeholder-pictures'

// The photo choice for the staging demonstration's placeholder pictures: landscape, big, not wire or demonstration art, and always the same ones.

const photo = (id: number, width: number, height: number, filename = `photo-${id}.jpg`, mimeType = 'image/jpeg') => ({ id, width, height, filename, mimeType })

describe('choosePlaceholderPhotos', () => {
  it('keeps big landscape photos between 4:3 and 16:9 and drops the rest', () => {
    const chosen = choosePlaceholderPhotos([
      photo(1, 6000, 4000), // 3:2, big
      photo(2, 1200, 800), // too small
      photo(3, 4000, 6000), // portrait
      photo(4, 6000, 2000), // a 3:1 panorama, too wide a crop for a card
      photo(5, 3000, 3000), // square
      photo(6, 2048, 1365), // 3:2
      photo(7, 4000, 2667, 'clip.mp4', 'video/mp4'), // not an image
    ])
    expect(chosen.map((m) => m.id)).toEqual([1, 6])
  })

  it('leaves out wire photos, our own demonstration art, logos and test shots', () => {
    const chosen = choosePlaceholderPhotos([
      photo(1, 6000, 4000, 'ap23115683277482.jpg'),
      photo(2, 6000, 4000, 'demo-sponsor-banner.png'),
      photo(3, 6000, 4000, 'wuwf-logo.png'),
      photo(4, 6000, 4000, 'Test shot.jpg'),
      photo(5, 6000, 4000, 'screenshot-2026.png'),
      photo(6, 6000, 4000, 'img-7801.JPG'),
    ])
    expect(chosen.map((m) => m.id)).toEqual([6])
  })

  it('is the same choice every run: oldest first, at most the count asked for', () => {
    const library = [photo(30, 6000, 4000), photo(10, 6000, 4000), photo(20, 6000, 4000)]
    expect(choosePlaceholderPhotos(library, 2).map((m) => m.id)).toEqual([10, 20])
    expect(choosePlaceholderPhotos([...library].reverse(), 2).map((m) => m.id)).toEqual([10, 20])
    expect(choosePlaceholderPhotos(library, 0)).toEqual([])
  })

  it('handles a record with no size or name, and an empty library', () => {
    expect(choosePlaceholderPhotos([{ id: 1, mimeType: 'image/jpeg' }, { id: 2 }], 5)).toEqual([])
    expect(choosePlaceholderPhotos([], 5)).toEqual([])
  })
})
