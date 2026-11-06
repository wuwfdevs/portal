import { describe, expect, it } from 'vitest'

import { CHUNK_SIZE, PROTOCOL_MAX_URLS, chunkCount, indexRequests, parseSitemapName, sitemapName, sitemapUrl } from './sitemap-plan'

describe('chunkCount', () => {
  it('is none for no stories and one more file each time a file fills', () => {
    expect(chunkCount(0)).toBe(0)
    expect(chunkCount(-5)).toBe(0)
    expect(chunkCount(Number.NaN)).toBe(0)
    expect(chunkCount(1)).toBe(1)
    expect(chunkCount(CHUNK_SIZE)).toBe(1)
    expect(chunkCount(CHUNK_SIZE + 1)).toBe(2)
    expect(chunkCount(6500)).toBe(4)
  })
  it('keeps one file under the protocol limit', () => {
    expect(CHUNK_SIZE).toBeLessThan(PROTOCOL_MAX_URLS)
  })
})

describe('sitemap names', () => {
  it('round-trip', () => {
    for (const r of [{ kind: 'posts', page: 3 }, { kind: 'pages' }, { kind: 'lists' }, { kind: 'shows' }, { kind: 'video' }, { kind: 'radiolive' }] as const) {
      expect(parseSitemapName(sitemapName(r))).toEqual(r)
    }
  })
  it('refuses anything else', () => {
    for (const bad of ['posts.xml', 'posts-0.xml', 'posts-01.xml', 'posts-x.xml', 'pages-2.xml', 'other.xml', 'pages.txt', '../pages.xml', 'posts-1.xml.gz', '']) {
      expect(parseSitemapName(bad)).toBeNull()
    }
  })
  it('builds the address under /sitemaps, tolerating a trailing slash on the site', () => {
    expect(sitemapUrl({ kind: 'posts', page: 2 }, 'https://www.wuwf.org/')).toBe('https://www.wuwf.org/sitemaps/posts-2.xml')
  })
})

describe('indexRequests', () => {
  it('lists the single files, then one file per chunk of stories', () => {
    expect(indexRequests({ posts: 4500, pages: 10, lists: 2000, shows: 40, video: 12, radiolive: 3 }).map(sitemapName)).toEqual(['pages.xml', 'posts-1.xml', 'posts-2.xml', 'posts-3.xml', 'lists.xml', 'shows.xml', 'video.xml', 'radiolive.xml'])
  })
  it('leaves out a file with nothing in it', () => {
    expect(indexRequests({ posts: 0, pages: 0, lists: 0, shows: 0, video: 0, radiolive: 0 })).toEqual([])
    expect(indexRequests({ posts: 1, pages: 0, lists: 0, shows: 3, video: 0, radiolive: 0 }).map(sitemapName)).toEqual(['posts-1.xml', 'shows.xml'])
  })
})
