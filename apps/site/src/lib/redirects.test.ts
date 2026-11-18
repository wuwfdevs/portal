import { describe, expect, it } from 'vitest'

import { redirects } from '../../redirects'
import { GIVING_PATHS } from './giving/paths'
import { panelViews, groupViews } from './giving/content'
import { LEGACY_GIVING_REDIRECTS } from './giving/legacy-addresses'
import { GIVING_STARTER } from './giving/starter'
import { selectWay } from './giving/ways'
import { isReservedPath } from './paths'
import { SPONSOR_PATHS } from './sponsorship/paths'

describe('static redirects', () => {
  it('sends Grove\'s old donation page to the Support page, temporarily so it can be repointed later', async () => {
    const all = await redirects!()
    expect(all).toContainEqual({ source: '/thanks-for-your-support', destination: '/support', permanent: false })
  })
  it('sends the starter template\'s /posts list to /latest, page 1 to the plain address', async () => {
    const all = await redirects!()
    expect(all).toContainEqual({ source: '/posts', destination: '/latest', permanent: true })
    expect(all).toContainEqual({ source: '/posts/page/1', destination: '/latest', permanent: true })
    expect(all.findIndex((r) => r.source === '/posts/page/1')).toBeLessThan(all.findIndex((r) => r.source.startsWith('/posts/page/:')))
    expect(all).toContainEqual({ source: '/posts/page/:pageNumber(\\d+)', destination: '/latest/page/:pageNumber', permanent: true })
  })
  it('keeps the incompatible-browser redirect, and puts the specific redirect ahead of its catch-all', async () => {
    const all = await redirects!()
    expect(all.findIndex((r) => r.source === '/thanks-for-your-support')).toBeLessThan(all.findIndex((r) => r.destination === '/ie-incompatible.html'))
  })

  it('sends each of Grove\'s giving pages to its page on this site', async () => {
    const all = await redirects!()
    for (const r of LEGACY_GIVING_REDIRECTS) {
      expect(all, r.source).toContainEqual({ source: r.source, destination: r.destination, permanent: r.permanent })
    }
    expect(all).toContainEqual({ source: '/leave-a-legacy', destination: '/support/legacy', permanent: true })
    expect(all).toContainEqual({ source: '/sustaining-membership', destination: '/support', permanent: true })
  })

  it('keeps every giving redirect out of loops and chains, on real pages only', () => {
    const sources = LEGACY_GIVING_REDIRECTS.map((r) => r.source)
    expect(new Set(sources).size).toBe(sources.length)
    const pages = new Set<string>([...Object.values(GIVING_PATHS), ...Object.values(SPONSOR_PATHS)])
    for (const r of LEGACY_GIVING_REDIRECTS) {
      // One plain segment (Next already redirects the trailing-slash form), or a dated story under a section this site now owns.
      expect(r.source, r.source).toMatch(/^\/[a-z0-9-]+(\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+)?$/)
      if (r.source.split('/').length === 2) expect(isReservedPath(r.source), `${r.source} is on a path this site already owns, so it would never have been Grove's page`).toBe(false)
      else expect(isReservedPath(r.source), `${r.source} is meant to be a Grove story under a section this site owns`).toBe(true)
      const path = r.destination.split(/[?#]/)[0]!
      expect(pages.has(path), `${r.destination} is not a page on this site (giving or sponsorship)`).toBe(true)
      expect(sources, `${r.source} sends to another redirect`).not.toContain(path)
    }
  })

  it('opens the way to give a redirect names, not the first one by default', () => {
    const ways = GIVING_STARTER.ways as never
    for (const r of LEGACY_GIVING_REDIRECTS) {
      const asked = new URL(r.destination, 'https://x.invalid').searchParams.get('way')
      if (!asked) continue
      expect(selectWay(panelViews(ways), groupViews(ways), asked)?.panel.slug, r.destination).toBe(asked)
    }
  })

  it('makes the permanent ones permanent and leaves the two donation addresses temporary', () => {
    const temporary = ['/thanks-for-your-support', '/donate']
    expect(LEGACY_GIVING_REDIRECTS.filter((r) => !r.permanent).map((r) => r.source).sort()).toEqual(temporary.sort())
  })
})
