import { describe, expect, it } from 'vitest'

import type { Page, Post } from '../payload-types'

import { generateMeta, generateStoryMeta } from './generateMeta'

// The metadata used to be the Payload starter's placeholder: every title "Payload Website Template", every share image the starter's.
const noPlaceholder = (m: unknown) => expect(JSON.stringify(m)).not.toMatch(/Payload Website Template|website-template-OG/)

describe('page and story metadata', () => {
  it('a story with no SEO fields at all is titled by its own title, and no placeholder appears anywhere', () => {
    const m = generateStoryMeta({ title: 'A migrated story', path: '/local-news/2024-05-01/a-migrated-story', meta: {} } as Post)
    expect(m.title).toBe('A migrated story')
    noPlaceholder(m)
  })
  it('a page with no SEO fields is titled by its title, falls back to the station\'s defaults for the rest, and keeps its canonical address', async () => {
    const m = await generateMeta({ doc: { title: 'About WUWF', path: '/about-us', meta: {} } as Partial<Page> })
    expect(m.title).toBe('About WUWF')
    expect(m.alternates).toEqual({ canonical: '/about-us' })
    expect(m.openGraph).toMatchObject({ siteName: 'WUWF Public Media', title: 'About WUWF' })
    noPlaceholder(m)
  })
  it('no document at all gives the station\'s own defaults, not a placeholder', async () => {
    const m = await generateMeta({ doc: null })
    expect(m.title).toBeUndefined() // the layout's default title, "WUWF Public Media", applies
    noPlaceholder(m)
  })
  it('a page\'s SEO title and a long description are used as written (the description trimmed)', async () => {
    const m = await generateMeta({ doc: { title: 'Page', path: '/p', meta: { title: 'SEO title', description: 'word '.repeat(80) } } as Partial<Page> })
    expect(m.title).toBe('SEO title')
    expect((m.description ?? '').length).toBeLessThanOrEqual(160)
  })
})
