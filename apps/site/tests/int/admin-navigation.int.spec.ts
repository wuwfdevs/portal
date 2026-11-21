import { getPayload } from 'payload'
import config from '@/payload.config'
import { describe, expect, it } from 'vitest'

import { ADMIN_NAV, NAV_OMITTED, navEntries, topGroupOf } from '@/lib/admin-nav'

// The admin sidebar is how staff find things, and it is one tree (`lib/admin-nav.ts`). Every collection and global must be in it or be
// deliberately left out, so a new one cannot quietly go missing, and the tree must not name one that does not exist.

describe('admin navigation', async () => {
  const payload = await getPayload({ config: await config })
  const collections = payload.config.collections
  const globals = payload.config.globals

  // Payload's own bookkeeping collections (`payload-preferences`, `payload-migrations`, ...) are never in the sidebar and are not ours to place.
  const slugs = (kind: 'collection' | 'global') =>
    (kind === 'collection' ? collections : globals).map((e) => String(e.slug)).filter((slug) => !slug.startsWith('payload-'))

  it('puts every collection and global in the tree, or leaves it out on purpose', () => {
    const inTree = new Set(navEntries().map((e) => `${e.kind}:${e.slug}`))
    const omitted = new Set(NAV_OMITTED.map((e) => `${e.kind}:${e.slug}`))
    const missing = [
      ...slugs('collection').map((s) => `collection:${s}`),
      ...slugs('global').map((s) => `global:${s}`),
    ].filter((k) => !inTree.has(k) && !omitted.has(k))
    expect(missing).toEqual([])
  })

  it('names no entity that does not exist', () => {
    const real = new Set([...slugs('collection').map((s) => `collection:${s}`), ...slugs('global').map((s) => `global:${s}`)])
    expect([...navEntries().map((e) => `${e.kind}:${e.slug}`), ...NAV_OMITTED.map((e) => `${e.kind}:${e.slug}`)].filter((k) => !real.has(k))).toEqual([])
  })

  it('keeps an omitted entity hidden or ungrouped in its own config, so the list and the configs agree', () => {
    for (const o of NAV_OMITTED) {
      const entity = (o.kind === 'collection' ? collections : globals).find((e) => e.slug === o.slug)!
      expect(entity.admin?.hidden === true || entity.admin?.group === false, o.slug).toBe(true)
    }
  })

  it('sets every entity\'s admin group (the dashboard cards) to its top-level heading in the tree', () => {
    for (const e of navEntries()) {
      const entity = (e.kind === 'collection' ? collections : globals).find((x) => x.slug === e.slug)!
      expect(entity.admin?.group, e.slug).toBe(e.group)
    }
    expect(topGroupOf('collection', 'users')).toBe('Members & accounts')
  })

  it('offers live preview on every page-like global in the Pages group', () => {
    const pageGlobals = navEntries()
      .filter((e) => e.kind === 'global' && e.group === 'Pages')
      .map((e) => globals.find((g) => g.slug === e.slug)!)
    expect(pageGlobals.map((g) => g.slug).sort()).toEqual(['radiolive-hub', 'unearthing-hub', 'voyager-hub'])
    for (const g of pageGlobals) expect(typeof g.admin?.livePreview === 'object' && g.admin.livePreview !== null && 'url' in g.admin.livePreview, g.slug).toBe(true)
  })

  it('keeps pictures, audio and video together, and the plugins\' collections under System', () => {
    const under = (heading: string) => navEntries().filter((e) => e.group === heading).map((e) => e.slug)
    expect(under('Media library')).toEqual(['media', 'audio', 'video'])
    expect(under('System')).toEqual(['redirects', 'forms', 'form-submissions', 'search'])
  })

  it('lists the collections and globals in the tree\'s order, which is how Payload orders its dashboard', () => {
    const tree = navEntries()
    const order = (kind: 'collection' | 'global', list: readonly { slug: string }[]) => list.map((e) => `${kind}:${e.slug}`).filter((k) => tree.some((t) => `${t.kind}:${t.slug}` === k))
    expect(order('collection', collections)).toEqual(tree.filter((t) => t.kind === 'collection').map((t) => `collection:${t.slug}`))
    expect(order('global', globals)).toEqual(tree.filter((t) => t.kind === 'global').map((t) => `global:${t.slug}`))
  })

  it('has the sidebar group order the owner approved', () => {
    expect(ADMIN_NAV.map((g) => g.label)).toEqual([
      'Stories',
      'Pages',
      'Shows & series',
      'Events',
      'Organize',
      'Media library',
      'Sponsorship',
      'Members & accounts',
      'System',
      'Site settings',
    ])
  })
})
