import { describe, expect, it } from 'vitest'

import { DESCRIPTION_MAX, imageUrlOf, isMigrated, leadImageOf, modifiedAtOf, sitemapEntry, storyMetadata, storySchema, storySeoInputOf, trimDescription } from './meta'

const SITE = 'https://www.wuwf.org'
const photo = (url: string, alt = 'A photo') => ({ url, alt })

describe('trimDescription', () => {
  it('leaves text that fits as it is, with its whitespace tidied, and has nothing to say about nothing', () => {
    expect(trimDescription('  A short\n description. ')).toBe('A short description.')
    expect(trimDescription('   ')).toBeNull()
    expect(trimDescription(null)).toBeNull()
  })
  it('stops at the end of a sentence when one fits, keeping a closing quote', () => {
    const text = 'The Escambia County commission voted Tuesday to approve a new stormwater fee. Residents had asked for a delay of one year. Officials said the fee would take effect in October.'
    const out = trimDescription(text)!
    expect(out).toBe('The Escambia County commission voted Tuesday to approve a new stormwater fee. Residents had asked for a delay of one year.')
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(trimDescription('Speaking to reporters after the vote on Tuesday night, she said it was “the best week of my career.” ' + 'More words follow here and keep going until the limit is passed by a distance. '.repeat(3))).toMatch(/career\.”$/)
  })
  it('cuts at a word with an ellipsis when no sentence ends in time, and never inside a word', () => {
    const text = 'Officials in Escambia and Santa Rosa counties are weighing a long list of stormwater and drainage projects across the region, a plan that would take years to complete and cost far more than first thought'
    const out = trimDescription(text)!
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(out.endsWith('…')).toBe(true)
    expect(text.startsWith(out.slice(0, -1))).toBe(true)
    expect(out.slice(0, -1)).not.toMatch(/\s$/)
    expect(text.charAt(out.length - 1)).toBe(' ')
  })
  it('does not stop at a very early sentence end (that would leave almost nothing)', () => {
    const text = 'Yes. ' + 'The council debated the proposal at length before finally reaching a decision on the matter late in the evening on Tuesday night. '.repeat(2)
    expect(trimDescription(text)!.length).toBeGreaterThan(100)
  })
})

describe('the lead picture and its address', () => {
  const og = { url: '/api/media/file/a.jpg', alt: 'Alt', sizes: { og: { url: '/api/media/file/a-og.jpg' } } }
  it('prefers the SEO image, then the first picture of the lead (a photo, a gallery\'s first photo, a video\'s poster)', () => {
    expect(leadImageOf({ meta: { image: photo('/seo.jpg') }, featuredMedia: [{ blockType: 'mediaBlock', media: photo('/lead.jpg') }] })?.url).toBe('/seo.jpg')
    expect(leadImageOf({ featuredMedia: [{ blockType: 'mediaBlock', media: photo('/lead.jpg') }] })?.url).toBe('/lead.jpg')
    expect(leadImageOf({ featuredMedia: [{ blockType: 'gallery', images: [{ image: photo('/g1.jpg') }, { image: photo('/g2.jpg') }] }] })?.url).toBe('/g1.jpg')
    expect(leadImageOf({ featuredMedia: [{ blockType: 'videoPlayer', poster: photo('/poster.jpg') }] })?.url).toBe('/poster.jpg')
  })
  it('has none when the lead has no picture, an embed, or a relation that was not loaded (a bare id)', () => {
    expect(leadImageOf({})).toBeNull()
    expect(leadImageOf({ meta: { image: 7 }, featuredMedia: [{ blockType: 'embed' }, { blockType: 'mediaBlock', media: 12 }] })).toBeNull()
  })
  it('gives an absolute address, preferring the share-card size, and keeps an address that is already absolute', () => {
    expect(imageUrlOf(og, SITE)).toBe(`${SITE}/api/media/file/a-og.jpg`)
    expect(imageUrlOf({ url: '/api/media/file/b.jpg' }, `${SITE}/`)).toBe(`${SITE}/api/media/file/b.jpg`)
    expect(imageUrlOf({ url: 'https://files.example.org/b.jpg' }, SITE)).toBe('https://files.example.org/b.jpg')
    expect(imageUrlOf({}, SITE)).toBeNull()
    expect(imageUrlOf(null, SITE)).toBeNull()
  })
})

describe('storyMetadata', () => {
  const base = { title: 'Pensacola votes on a stormwater fee', path: '/local-news/2024-05-01/stormwater', authors: [], siteUrl: SITE }
  it('uses the story\'s own title when no SEO title was written, never a placeholder', () => {
    const m = storyMetadata(base)
    expect(m.title).toBe('Pensacola votes on a stormwater fee')
    expect(JSON.stringify(m)).not.toMatch(/Payload|Template/)
    expect(m.openGraph).toMatchObject({ type: 'article', title: 'Pensacola votes on a stormwater fee', siteName: 'WUWF Public Media', url: `${SITE}/local-news/2024-05-01/stormwater` })
    expect(m.alternates).toEqual({ canonical: '/local-news/2024-05-01/stormwater' })
  })
  it('prefers an SEO title and description when they were written, and falls back to the dek, trimmed', () => {
    expect(storyMetadata({ ...base, metaTitle: 'Stormwater fee vote', metaDescription: 'The vote.' }).title).toBe('Stormwater fee vote')
    expect(storyMetadata({ ...base, metaDescription: 'The vote.' }).description).toBe('The vote.')
    expect(storyMetadata({ ...base, dek: 'The dek.' }).description).toBe('The dek.')
    expect(storyMetadata({ ...base, metaDescription: 'x'.repeat(300) }).description!.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(storyMetadata(base).description).toBeUndefined()
  })
  it('carries the publish and modified times, the authors and the section for an article card', () => {
    const m = storyMetadata({ ...base, publishedAt: '2024-05-01T15:00:00Z', modifiedAt: '2024-05-02T09:00:00Z', authors: ['A Reporter', 'B Editor'], section: 'Local News' })
    expect(m.openGraph).toMatchObject({ publishedTime: '2024-05-01T15:00:00Z', modifiedTime: '2024-05-02T09:00:00Z', authors: ['A Reporter', 'B Editor'], section: 'Local News' })
  })
  it('has a large share image when the story has a picture, and says nothing about a picture when it has none', () => {
    const withImage = storyMetadata({ ...base, image: { url: `${SITE}/a.jpg`, alt: 'Flooded street' } })
    expect(withImage.openGraph).toMatchObject({ images: [{ url: `${SITE}/a.jpg`, alt: 'Flooded street' }] })
    expect(withImage.twitter).toMatchObject({ card: 'summary_large_image', images: [`${SITE}/a.jpg`] })
    const without = storyMetadata(base)
    expect(without.openGraph).not.toHaveProperty('images')
    expect(without.twitter).toMatchObject({ card: 'summary' })
  })
})

describe('storySchema', () => {
  const base = { title: 'T'.repeat(150), path: '/local-news/2024-05-01/x', authors: ['A Reporter'], siteUrl: SITE, publishedAt: '2024-05-01T15:00:00Z' }
  it('is a NewsArticle with the address, the dates, the byline and the picture', () => {
    const s = storySchema({ ...base, dek: 'A dek.', image: { url: `${SITE}/a.jpg` }, modifiedAt: '2024-05-02T09:00:00Z', section: 'Local News' })
    expect(s).toMatchObject({
      '@type': 'NewsArticle', url: `${SITE}/local-news/2024-05-01/x`, description: 'A dek.', image: [`${SITE}/a.jpg`],
      datePublished: '2024-05-01T15:00:00Z', dateModified: '2024-05-02T09:00:00Z', articleSection: 'Local News',
      author: [{ '@type': 'Person', name: 'A Reporter' }], publisher: { '@type': 'NewsMediaOrganization', name: 'WUWF Public Media' },
    })
    expect((s.headline as string).length).toBe(110)
  })
  it('credits the station when a story has no byline, and dates a story\'s last change by its publish date when nothing later is known', () => {
    const s = storySchema({ ...base, authors: [] })
    expect(s.author).toEqual([{ '@type': 'Organization', name: 'WUWF Public Media' }])
    expect(s.dateModified).toBe('2024-05-01T15:00:00Z')
  })
})

describe('storySeoInputOf', () => {
  const post = {
    title: 'A story', path: '/local-news/2024-05-01/a-story', publishedAt: '2024-05-01T15:00:00Z', updatedAt: '2026-11-03T12:00:00Z', dek: 'Dek.',
    legacy: { modifiedAt: '2024-05-02T09:00:00Z' },
    contributors: [{ name: 'A Reporter' }, 7, { name: ' ' }], section: { title: 'Local News' },
    featuredMedia: [{ blockType: 'mediaBlock', media: { url: '/api/media/file/a.jpg', alt: 'Flooded street', sizes: { og: { url: '/api/media/file/a-og.jpg' } } } }],
  }
  it('uses Grove\'s modified date for a migrated story, never the time the record was imported', () => {
    expect(storySeoInputOf(post, SITE).modifiedAt).toBe('2024-05-02T09:00:00Z')
    expect(storySeoInputOf({ ...post, legacy: null }, SITE).modifiedAt).toBe('2026-11-03T12:00:00Z')
  })
  it('names the loaded authors and section, and takes the picture from the lead', () => {
    const i = storySeoInputOf(post, SITE)
    expect(i.authors).toEqual(['A Reporter'])
    expect(i.section).toBe('Local News')
    expect(i.image).toEqual({ url: `${SITE}/api/media/file/a-og.jpg`, alt: 'Flooded street' })
  })
})

describe('when a story was last modified: never the day it was imported', () => {
  const IMPORTED = '2026-11-04T18:00:00Z'
  const migrated = { updatedAt: IMPORTED, publishedAt: '2016-03-13T19:39:31Z', legacy: { groveId: 'g-1', legacyPath: '/local-news/2016-03-13/x', modifiedAt: '2016-03-14T01:03:45Z' } }
  it('uses Grove\'s modified date for a migrated record, and the time it was saved for a native one', () => {
    expect(modifiedAtOf(migrated)).toBe('2016-03-14T01:03:45Z')
    expect(modifiedAtOf({ updatedAt: '2026-11-03T12:00:00Z', publishedAt: '2026-11-01T12:00:00Z' })).toBe('2026-11-03T12:00:00Z')
    expect(modifiedAtOf({ updatedAt: '2026-11-03T12:00:00Z', legacy: {} })).toBe('2026-11-03T12:00:00Z') // a native story's empty legacy group
  })
  it('has no answer for a migrated record Grove gave no modified date, and does NOT fall back to the import time', () => {
    expect(modifiedAtOf({ ...migrated, legacy: { ...migrated.legacy, modifiedAt: null } })).toBeNull()
    expect(modifiedAtOf({ ...migrated, legacy: { groveId: 'g-1', modifiedAt: null } })).toBeNull()
    expect(modifiedAtOf({ updatedAt: IMPORTED, legacy: { legacyPath: '/x/2016-03-13/y' } })).toBeNull() // known to be migrated by its path alone
    expect(isMigrated({ legacy: { groveId: 'g-1' } })).toBe(true)
    expect(isMigrated({ legacy: { modifiedAt: '2016-03-14T01:03:45Z' } })).toBe(true)
    expect(isMigrated({ legacy: {} })).toBe(false)
    expect(isMigrated({})).toBe(false)
  })
  it('keeps a migrated story with no Grove modified date out of "modifiedTime", and dates its structured data by its publish date', () => {
    const post = { title: 'Old story', path: '/local-news/2016-03-13/old', publishedAt: '2016-03-13T19:39:31Z', updatedAt: IMPORTED, legacy: { groveId: 'g-1', modifiedAt: null } }
    const input = storySeoInputOf(post, SITE)
    expect(input.modifiedAt).toBeNull()
    expect(storyMetadata(input).openGraph).not.toHaveProperty('modifiedTime')
    expect(storySchema(input).dateModified).toBe('2016-03-13T19:39:31Z')
    expect(JSON.stringify([storyMetadata(input), storySchema(input)])).not.toContain('2026-11-04')
  })
})

describe('sitemapEntry', () => {
  const base = { path: '/local-news/2016-03-13/x', updatedAt: '2026-11-04T18:00:00Z', publishedAt: '2016-03-13T19:39:31Z' }
  it('dates a migrated story by its Grove modified date, so 6,500 archived stories are not all "modified" on import day', () => {
    expect(sitemapEntry({ ...base, legacy: { groveId: 'g', modifiedAt: '2016-03-14T01:03:45Z' } }, SITE)).toEqual({ loc: `${SITE}/local-news/2016-03-13/x`, lastmod: '2016-03-14T01:03:45Z' })
  })
  it('falls back to the publish date for a migrated story with no modified date (a story is at least as new as its publication), and says nothing when there is no true date', () => {
    expect(sitemapEntry({ ...base, legacy: { groveId: 'g', modifiedAt: null } }, SITE)?.lastmod).toBe('2016-03-13T19:39:31Z')
    expect(sitemapEntry({ path: '/x', legacy: { groveId: 'g' } }, SITE)).toEqual({ loc: `${SITE}/x` })
  })
  it('dates a native story by when it was saved, tidies a trailing slash on the site address, and skips a record with no path', () => {
    expect(sitemapEntry(base, `${SITE}/`)).toEqual({ loc: `${SITE}/local-news/2016-03-13/x`, lastmod: '2026-11-04T18:00:00Z' })
    expect(sitemapEntry({ updatedAt: base.updatedAt }, SITE)).toBeNull()
  })
})
