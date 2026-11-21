import type { Config, Plugin } from 'payload'

import { navEntries, topGroupOf, type NavEntityKind } from '@/lib/admin-nav'

/**
 * Makes the config agree with the sidebar tree (`lib/admin-nav.ts`), so the tree is the only place a heading or an order is named.
 *
 * - Every collection's and global's `admin.group` becomes its top-level heading. The dashboard's cards are grouped by it.
 * - Collections and globals are sorted into the tree's order. Payload's dashboard orders its groups, and the cards inside them, by position
 *   in the config, so without this the dashboard would not match the sidebar. An entity in no place in the tree keeps its place after the
 *   ones that are, and keeps whatever its own config says for `group` (the navigation test requires it to be `hidden` or `group: false`).
 *
 * It runs last, so it also reaches the collections the other plugins add (redirects, forms, search).
 */
const position = (() => {
  const order = new Map(navEntries().map((e, i) => [`${e.kind}:${e.slug}`, i]))
  return (kind: NavEntityKind, slug: string) => order.get(`${kind}:${slug}`) ?? Number.MAX_SAFE_INTEGER
})()

/** A stable sort: equal positions (everything outside the tree) stay in the order they were given. */
const byTree = <T extends { slug: string }>(kind: NavEntityKind, list: readonly T[]): T[] =>
  list.map((entity, i) => ({ entity, i })).sort((a, b) => position(kind, a.entity.slug) - position(kind, b.entity.slug) || a.i - b.i).map((x) => x.entity)

export const adminNavGroups: Plugin = (config: Config): Config => ({
  ...config,
  collections: config.collections
    ? byTree(
        'collection',
        config.collections.map((collection) => {
          const group = topGroupOf('collection', collection.slug)
          return group ? { ...collection, admin: { ...collection.admin, group } } : collection
        }),
      )
    : config.collections,
  globals: config.globals
    ? byTree(
        'global',
        config.globals.map((global) => {
          const group = topGroupOf('global', global.slug)
          return group ? { ...global, admin: { ...global.admin, group } } : global
        }),
      )
    : config.globals,
})
