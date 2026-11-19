import { describe, expect, it } from 'vitest'

import { ADMIN_NAV, NAV_OMITTED, isNavGroup, navEntries, pruneNav, topGroupOf, type NavGroup } from './admin-nav'

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
    expect(topGroupOf('collection', 'nope')).toBeNull()
  })
})

describe('pruneNav', () => {
  it('drops links a person cannot read and the headings left empty', () => {
    const staffOnly = new Set(['users', 'audience-profiles', 'memberships', 'member-feeds'])
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
