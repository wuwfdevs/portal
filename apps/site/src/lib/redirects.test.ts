import { describe, expect, it } from 'vitest'

import { redirects } from '../../redirects'
import { GIVING_PATHS } from './giving/paths'
import { panelViews, groupViews } from './giving/content'
import { LEGACY_GIVING_REDIRECTS } from './giving/legacy-addresses'
import { GIVING_STARTER } from './giving/starter'
import { selectWay } from './giving/ways'
import { isReservedPath } from './paths'

describe('static redirects', () => {
  it('sends Grove\'s old donation page to the Support page, temporarily so it can be repointed later', async () => {
    const all = await redirects!()
    expect(all).toContainEqual({ source: '/thanks-for-your-support', destination: '/support', permanent: false })
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
    const pages = new Set<string>(Object.values(GIVING_PATHS))
    for (const r of LEGACY_GIVING_REDIRECTS) {
      expect(r.source, r.source).toMatch(/^\/[a-z0-9-]+$/) // one segment, no trailing slash: Next already redirects the slash form
      expect(isReservedPath(r.source), `${r.source} is on a path this site already owns, so it would never have been Grove's page`).toBe(false)
      const path = r.destination.split(/[?#]/)[0]!
      expect(pages.has(path), `${r.destination} is not one of the giving pages`).toBe(true)
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

  it('makes the permanent ones permanent and leaves the donation page temporary', () => {
    expect(LEGACY_GIVING_REDIRECTS.find((r) => r.source === '/thanks-for-your-support')?.permanent).toBe(false)
    expect(LEGACY_GIVING_REDIRECTS.filter((r) => r.source !== '/thanks-for-your-support').every((r) => r.permanent)).toBe(true)
  })
})
