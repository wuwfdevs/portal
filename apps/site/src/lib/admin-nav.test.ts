import { describe, expect, it } from 'vitest'

import { ADMIN_NAV, NAV_OMITTED, holdsCurrentPage, isActivePath, isNavGroup, navEntries, pruneNav, startsOpen, topGroupOf, type NavGroup, type NavNode } from './admin-nav'

describe('the admin sidebar tree', () => {
  const entries = navEntries()

  it('lists every entity once', () => {
    const keys = entries.map((e) => `${e.kind}:${e.slug}`)
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })

  it('keeps an omitted entity out of the tree', () => {
    for (const o of NAV_OMITTED) expect(topGroupOf(o.kind, o.slug), o.slug).toBeNull()
  })

  it('has unique heading names (Payload stores a group\'s open or closed state under its name)', () => {
    const names: string[] = []
    const walk = (g: NavGroup) => {
      names.push(g.label)
      for (const e of g.items) if (isNavGroup(e)) walk(e)
    }
    ADMIN_NAV.forEach(walk)
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
  })

  it('draws at most two levels and no empty heading', () => {
    for (const top of ADMIN_NAV) {
      expect(top.items.length, top.label).toBeGreaterThan(0)
      for (const e of top.items) {
        if (!isNavGroup(e)) continue
        expect(e.items.length, e.label).toBeGreaterThan(0)
        expect(e.items.some(isNavGroup), `${e.label} nests a third level`).toBe(false)
      }
    }
  })

  it('keeps each heading to a size an editor can scan', () => {
    for (const top of ADMIN_NAV) expect(navEntries([top]).length, top.label).toBeLessThanOrEqual(8)
  })

  it('puts a heading made only of globals after every heading that has a collection (the dashboard lists collections first)', () => {
    const hasCollection = ADMIN_NAV.map((top) => navEntries([top]).some((e) => e.kind === 'collection'))
    const firstGlobalOnly = hasCollection.indexOf(false)
    if (firstGlobalOnly !== -1) expect(hasCollection.slice(firstGlobalOnly).every((x) => !x), 'a global-only heading sits above a collection heading').toBe(true)
  })

  it('answers which heading a collection is under, whatever its depth', () => {
    expect(topGroupOf('collection', 'performances')).toBe('Events')
    expect(topGroupOf('collection', 'events')).toBe('Events')
    expect(topGroupOf('collection', 'users')).toBe('Members & accounts')
    expect(topGroupOf('global', 'sponsorship-settings')).toBe('Sponsorship')
    expect(topGroupOf('global', 'giving-settings')).toBe('Members & accounts')
    expect(topGroupOf('collection', 'nope')).toBeNull()
  })
})

describe('pruneNav', () => {
  it('drops links a person cannot read and the headings left empty', () => {
    const staffOnly = new Set(['users', 'audience-profiles', 'memberships', 'member-feeds', 'giving-settings'])
    const pruned = pruneNav(ADMIN_NAV, (_k, slug) => !staffOnly.has(slug))
    expect(pruned.map((g) => g.label)).not.toContain('Members & accounts')
    expect(pruned.map((g) => g.label)).toContain('Stories')
  })

  it('drops a sub-heading with nothing left, and keeps its sibling', () => {
    const pruned = pruneNav(ADMIN_NAV, (_k, slug) => slug !== 'performances' && slug !== 'artists')
    const events = pruned.find((g) => g.label === 'Events')!
    expect(events.items.filter(isNavGroup).map((g) => g.label)).toEqual(['Community calendar'])
  })

  it('returns nothing for a person who can read nothing', () => {
    expect(pruneNav(ADMIN_NAV, () => false)).toEqual([])
  })
})

describe('which headings start open', () => {
  const link = (slug: string): NavNode => ({ type: 'link', label: slug, href: `/admin/collections/${slug}`, id: `nav-${slug}` })
  const group = (label: string, items: NavNode[]): Extract<NavNode, { type: 'group' }> => ({ type: 'group', label, items })
  const events = group('Events', [group('Community calendar', [link('events')]), group('RadioLive', [link('performances'), link('artists')])])

  it('matches an address and anything under it, and nothing that only starts with the same letters', () => {
    expect(isActivePath('/admin/collections/posts', '/admin/collections/posts')).toBe(true)
    expect(isActivePath('/admin/collections/posts/12', '/admin/collections/posts')).toBe(true)
    expect(isActivePath('/admin/collections/posts-extra', '/admin/collections/posts')).toBe(false)
    expect(isActivePath('/admin', '/admin/collections/posts')).toBe(false)
  })

  it('finds the current page at any depth', () => {
    expect(holdsCurrentPage(events, '/admin/collections/artists')).toBe(true)
    expect(holdsCurrentPage(events, '/admin/collections/artists/3')).toBe(true)
    expect(holdsCurrentPage(events, '/admin/collections/posts')).toBe(false)
  })

  it('starts everything closed on a page that is under no heading (the dashboard)', () => {
    for (const g of [events, ...events.items.filter((i): i is Extract<NavNode, { type: 'group' }> => i.type === 'group')]) expect(startsOpen(g, '/admin', {}), g.label).toBe(false)
  })

  it('opens exactly the headings on the way to the current page', () => {
    const [calendar, radiolive] = events.items as Extract<NavNode, { type: 'group' }>[]
    expect(startsOpen(events, '/admin/collections/performances', {})).toBe(true)
    expect(startsOpen(radiolive!, '/admin/collections/performances', {})).toBe(true)
    expect(startsOpen(calendar!, '/admin/collections/performances', {})).toBe(false)
  })

  it('keeps a choice the person made, over where they happen to be', () => {
    expect(startsOpen(events, '/admin', { Events: { open: true } })).toBe(true)
    expect(startsOpen(events, '/admin/collections/performances', { Events: { open: false } })).toBe(false)
  })
})
