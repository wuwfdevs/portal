import { NavHamburger, NavWrapper } from '@payloadcms/next/client'
import { Logout } from '@payloadcms/ui'
import type { ServerProps } from 'payload'
import { PREFERENCE_KEYS } from 'payload/shared'
import React from 'react'

import { ADMIN_NAV, isNavGroup, pruneNav, type NavGroup as TreeGroup, type NavItem } from '@/lib/admin-nav'

import { AdminNavClient, type NavNode } from './Client'

/**
 * The admin sidebar: the tree in `lib/admin-nav.ts`, two levels deep, drawn with Payload's own pieces (its wrapper, hamburger, group
 * toggle and logout), so it opens, closes and remembers collapsed groups exactly as the stock sidebar does. Payload's `DefaultNav` is what
 * this replaces; it cannot nest. What a person sees is what they may read: a link is dropped when `permissions` say no, and a heading
 * with nothing left under it goes too.
 */

type Label = string | Record<string, string> | ((args: { t: (key: string) => string }) => string) | undefined

/** A name as Payload stores it: text, a per-language object, or a function of the translator. Falls back to the slug. */
function nameOf(label: Label, language: string, fallback: string): string {
  if (typeof label === 'string') return label
  if (typeof label === 'function') {
    try {
      return label({ t: (key: string) => key })
    } catch {
      return fallback
    }
  }
  if (label && typeof label === 'object') return label[language] ?? label.en ?? Object.values(label)[0] ?? fallback
  return fallback
}

export const AdminNav: React.FC<ServerProps> = async ({ payload, permissions, user, i18n, visibleEntities }) => {
  const { collections, globals } = payload.config
  const visible = (kind: 'collection' | 'global', slug: string) => {
    const list = kind === 'collection' ? visibleEntities?.collections : visibleEntities?.globals
    return list ? (list as readonly string[]).includes(slug) : true
  }
  const canRead = (kind: 'collection' | 'global', slug: string) => {
    const entry = kind === 'collection' ? permissions?.collections?.[slug] : permissions?.globals?.[slug]
    return Boolean(entry?.read) && visible(kind, slug)
  }

  const nameFor = (item: NavItem): string => {
    if (item.label) return item.label
    if (item.kind === 'collection') {
      const found = collections.find((c) => c.slug === item.slug)
      return nameOf(found?.labels?.plural as Label, i18n.language, item.slug)
    }
    const found = globals.find((x) => x.slug === item.slug)
    return nameOf(found?.label as Label, i18n.language, item.slug)
  }

  const adminRoute = payload.config.routes.admin
  const toNode = (entry: NavItem | TreeGroup): NavNode =>
    isNavGroup(entry)
      ? { type: 'group', label: entry.label, items: entry.items.map(toNode) }
      : {
          type: 'link',
          label: nameFor(entry),
          href: `${adminRoute}/${entry.kind === 'collection' ? 'collections' : 'globals'}/${entry.slug}`,
          id: entry.kind === 'collection' ? `nav-${entry.slug}` : `nav-global-${entry.slug}`,
        }

  const groups = pruneNav(ADMIN_NAV, canRead).map((g) => toNode(g) as Extract<NavNode, { type: 'group' }>)

  // Which groups the person has collapsed (Payload keeps this per person; the toggle writes it).
  const prefs = user?.collection
    ? await payload
        .find({
          collection: 'payload-preferences',
          depth: 0,
          limit: 1,
          pagination: false,
          where: {
            and: [{ key: { equals: PREFERENCE_KEYS.NAV } }, { 'user.relationTo': { equals: user.collection } }, { 'user.value': { equals: user.id } }],
          },
        })
        .then((res) => res.docs[0]?.value as { groups?: Record<string, { open?: boolean }> } | undefined)
        .catch(() => undefined)
    : undefined

  return (
    <NavWrapper baseClass="nav">
      <nav className="nav__wrap" aria-label="Admin">
        <AdminNavClient groups={groups} openState={prefs?.groups ?? {}} />
        <div className="nav__controls">
          <Logout />
        </div>
      </nav>
      <div className="nav__header">
        <div className="nav__header-content">
          <NavHamburger baseClass="nav" />
        </div>
      </div>
    </NavWrapper>
  )
}

export default AdminNav
