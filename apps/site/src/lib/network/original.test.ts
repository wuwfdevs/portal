import { describe, expect, it } from 'vitest'

import { storyMetadata, storySeoInputOf } from '../seo/meta'
import { canonicalOverride, isHttpsAddress, sourceLabel } from './original'

describe('isHttpsAddress', () => {
  it('accepts only a full https address', () => {
    expect(isHttpsAddress('https://station.example.org/a')).toBe(true)
    expect(isHttpsAddress(' https://station.example.org/a ')).toBe(true)
    for (const bad of ['http://station.example.org/a', 'javascript:alert(1)', 'station.example.org', '', null, undefined, 4]) expect(isHttpsAddress(bad)).toBe(false)
  })
})

describe('canonicalOverride', () => {
  it('names the original publisher for a story that is not WUWF\'s', () => {
    expect(canonicalOverride({ source: 'wire', original: { url: 'https://station.example.org/a' } })).toBe('https://station.example.org/a')
    expect(canonicalOverride({ source: 'npr', original: { url: 'https://www.npr.org/a' } })).toBe('https://www.npr.org/a')
  })

  it('never overrides a WUWF story, even one with an original address filled in by mistake', () => {
    expect(canonicalOverride({ source: 'wuwf', original: { url: 'https://station.example.org/a' } })).toBeNull()
    expect(canonicalOverride({ original: { url: 'https://station.example.org/a' } })).toBeNull()
  })

  it('falls back to the story\'s own address when there is no valid original', () => {
    expect(canonicalOverride({ source: 'wire' })).toBeNull()
    expect(canonicalOverride({ source: 'wire', original: { url: 'http://insecure.example.org' } })).toBeNull()
  })
})

describe('sourceLabel', () => {
  it('reads "From <credit>" for another station and nothing for WUWF', () => {
    expect(sourceLabel({ source: 'wire', original: { credit: ' WLRN ' } })).toBe('From WLRN')
    expect(sourceLabel({ source: 'wuwf', original: { credit: 'WLRN' } })).toBeNull()
  })

  it('says NPR for an NPR story with no credit, and nothing for a wire story with none', () => {
    expect(sourceLabel({ source: 'npr' })).toBe('From NPR')
    expect(sourceLabel({ source: 'wire' })).toBeNull()
  })
})

describe('story metadata for a story from another publisher', () => {
  const post = { title: 'A story', path: '/2026-11-18/a-story', source: 'wire', original: { url: 'https://station.example.org/a-story' } }

  it('points the canonical link at the original publisher', () => {
    const meta = storyMetadata(storySeoInputOf(post, 'https://www.wuwf.org'))
    expect(meta.alternates?.canonical).toBe('https://station.example.org/a-story')
    // The share card still names this site's own address: people share the page they are reading.
    expect(meta.openGraph?.url).toBe('https://www.wuwf.org/2026-11-18/a-story')
  })

  it('leaves a WUWF story canonical to its own path', () => {
    const meta = storyMetadata(storySeoInputOf({ ...post, source: 'wuwf' }, 'https://www.wuwf.org'))
    expect(meta.alternates?.canonical).toBe('/2026-11-18/a-story')
  })
})
