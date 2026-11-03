import { describe, expect, it } from 'vitest'

import { MissingAssetError, resolveAssets } from './assets'

describe('putting library ids back into a converted story', () => {
  const ids = new Map<string, number | string>([['https://x/a.jpg', 11], ['https://x/b.mp3', 'aud-2']])
  it('replaces every token, deep inside arrays and objects', () => {
    const story = { featured: [{ media: { $asset: 'https://x/a.jpg' }, caption: 'c' }], audio: { $asset: 'https://x/b.mp3' }, nested: { list: [{ image: { $asset: 'https://x/a.jpg' } }] } }
    expect(resolveAssets(story, ids)).toEqual({ featured: [{ media: 11, caption: 'c' }], audio: 'aud-2', nested: { list: [{ image: 11 }] } })
  })
  it('does not change the original', () => {
    const story = { media: { $asset: 'https://x/a.jpg' } }
    resolveAssets(story, ids)
    expect(story).toEqual({ media: { $asset: 'https://x/a.jpg' } })
  })
  it('refuses to produce a story that points at nothing, and names the files that have no record', () => {
    const story = { a: { $asset: 'https://x/a.jpg' }, b: { $asset: 'https://x/missing.jpg' }, c: { $asset: 'https://x/gone.mp3' } }
    expect(() => resolveAssets(story, ids)).toThrow(MissingAssetError)
    try {
      resolveAssets(story, ids)
    } catch (e) {
      expect((e as MissingAssetError).urls).toEqual(['https://x/missing.jpg', 'https://x/gone.mp3'])
    }
  })
  it('leaves an object that merely has an $asset-like field among others alone', () => {
    const v = { $asset: 'https://x/a.jpg', other: 1 }
    expect(resolveAssets(v, ids)).toEqual(v)
  })
})
