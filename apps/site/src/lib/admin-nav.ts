/**
 * The admin sidebar, as data. One tree decides what staff see, in what order, and under which heading; nothing else does.
 *
 * Payload's own sidebar is one level deep and orders groups by where a collection first appears in the config, so it cannot say "Events >
 * RadioLive > Shows". `components/admin/Nav` draws this tree instead, and `plugins/adminNav.ts` sets every entity's `admin.group` to its
 * top-level heading here, so the dashboard's cards agree with the sidebar. Nothing in a collection's own config names a group.
 *
 * Pure TypeScript: it is imported by the config, so it must not import Payload, React or the app. `admin-nav.test.ts` and
 * `tests/int/admin-navigation.int.spec.ts` fail when a collection or global is in no place here, so a new one cannot quietly go missing.
 *
 * The order of the tree is the order of the sidebar, and `plugins/adminNav.ts` sorts the config the same way, so the dashboard's cards follow it too.
 *
 * Adding a screen: put its slug in the group an editor would look in. Moving a page into `pages` (PAGE-BLOCKS.md phases 4 to 7) means
 * deleting its line from "Pages". A group with more than about six items is a reason to give it sub-groups.
 */

export type NavEntityKind = 'collection' | 'global'

/** One link: a collection's list, or a global's edit screen. `label` replaces the entity's own name where the heading above already gives context. */
export type NavItem = { kind: NavEntityKind; slug: string; label?: string }

/** A heading. Its items are links or further headings; the sidebar draws at most two levels (a group and a sub-group). */
export type NavGroup = { label: string; items: (NavItem | NavGroup)[] }

export const isNavGroup = (entry: NavItem | NavGroup): entry is NavGroup => 'items' in entry

const c = (slug: string, label?: string): NavItem => ({ kind: 'collection', slug, ...(label ? { label } : {}) })
const g = (slug: string, label?: string): NavItem => ({ kind: 'global', slug, ...(label ? { label } : {}) })

export const ADMIN_NAV: readonly NavGroup[] = [
  {
    label: 'Stories',
    items: [c('posts'), c('clips'), c('network-items'), c('network-sources')],
  },
  {
    // The coded pages leave this list as they move into `pages` (PAGE-BLOCKS.md phases 4 to 7); Home is last to go.
    label: 'Pages',
    items: [c('pages'), g('homepage'), g('unearthing-hub'), g('voyager-hub'), g('radiolive-hub')],
  },
  {
    label: 'Shows & series',
    items: [c('productions'), c('series'), c('fellowships'), c('seasons'), c('archive-items'), c('sites')],
  },
  {
    label: 'Events',
    items: [
      { label: 'Community calendar', items: [c('events'), c('event-categories')] },
      { label: 'RadioLive', items: [c('performances', 'Shows'), c('artists')] },
    ],
  },
  {
    label: 'Organize',
    items: [c('sections'), c('categories'), c('contributors'), c('publishing-identities')],
  },
  {
    label: 'Media library',
    items: [c('media'), c('audio'), c('video')],
  },
  {
    label: 'Sponsorship',
    items: [c('sponsors'), c('placement-items'), c('underwriting-agreements'), g('sponsorship-settings')],
  },
  {
    // Staff and readers are different identities and different collections (CLAUDE.md, "Boundaries"); only the sidebar puts them side by side.
    label: 'Members & accounts',
    items: [c('users'), c('audience-profiles'), c('memberships'), c('member-feeds'), g('giving-settings')],
  },
  {
    label: 'System',
    items: [c('redirects'), c('forms'), c('form-submissions'), c('search')],
  },
  {
    // Last, and the only heading made of globals alone: Payload's dashboard lists every collection's group before any global-only group,
    // so this is where the dashboard puts it too. `admin-nav.test.ts` holds the order.
    label: 'Site settings',
    items: [g('header'), g('footer'), g('site-settings'), g('shared-text'), g('listen-live')],
  },
]

/**
 * Entities that are deliberately in no group: no sidebar link and no dashboard card. Each says why; the test requires every one of
 * them to be hidden (`admin.hidden`) or `admin.group: false` in its own config, so this list and the configs cannot drift.
 */
export const NAV_OMITTED: readonly { kind: NavEntityKind; slug: string; why: string }[] = [
  { kind: 'collection', slug: 'live-updates', why: 'Posted from inside their live blog; reachable by address only.' },
  { kind: 'collection', slug: 'submission-rate-limits', why: 'Internal bookkeeping for the event form.' },
  { kind: 'collection', slug: 'event-submission-images', why: 'Pictures belong to a submitted event and are reached from it.' },
  { kind: 'collection', slug: 'portal-sign-ins', why: 'Records of one-time Portal tokens; never edited.' },
  { kind: 'global', slug: 'sponsorship', why: 'Moved into pages and Sponsorship settings; dropped in PAGE-BLOCKS.md phase 7.' },
  { kind: 'global', slug: 'support-page', why: 'Moved into pages and Giving settings; dropped in PAGE-BLOCKS.md phase 7.' },
]

/** Every link in the tree, in order, with the top-level heading it sits under. */
export function navEntries(tree: readonly NavGroup[] = ADMIN_NAV): { kind: NavEntityKind; slug: string; group: string; path: string[] }[] {
  const out: { kind: NavEntityKind; slug: string; group: string; path: string[] }[] = []
  const walk = (group: NavGroup, top: string, path: string[]) => {
    for (const entry of group.items) {
      if (isNavGroup(entry)) walk(entry, top, [...path, entry.label])
      else out.push({ kind: entry.kind, slug: entry.slug, group: top, path })
    }
  }
  for (const group of tree) walk(group, group.label, [group.label])
  return out
}

/** The top-level heading an entity sits under, or null when it is not in the tree. This is what its `admin.group` is set to. */
export function topGroupOf(kind: NavEntityKind, slug: string, tree: readonly NavGroup[] = ADMIN_NAV): string | null {
  return navEntries(tree).find((e) => e.kind === kind && e.slug === slug)?.group ?? null
}

/**
 * The tree as one signed-in person may see it: links they cannot read are dropped, and a heading left with nothing under it goes too
 * (an editor never sees an empty "Members & accounts"). `canRead` is how the caller answers "may this person open this?".
 */
export function pruneNav(tree: readonly NavGroup[], canRead: (kind: NavEntityKind, slug: string) => boolean): NavGroup[] {
  const prune = (group: NavGroup): NavGroup | null => {
    const items: (NavItem | NavGroup)[] = []
    for (const entry of group.items) {
      if (isNavGroup(entry)) {
        const kept = prune(entry)
        if (kept) items.push(kept)
      } else if (canRead(entry.kind, entry.slug)) items.push(entry)
    }
    return items.length > 0 ? { label: group.label, items } : null
  }
  return tree.map(prune).filter((x): x is NavGroup => x !== null)
}

/** A resolved sidebar node, as the server hands it to the client: a link with its address, or a heading holding more nodes. */
export type NavNode = { type: 'link'; label: string; href: string; id: string } | { type: 'group'; label: string; items: NavNode[] }

/** Whether `pathname` is this address or somewhere under it (`/admin/collections/posts` and `/admin/collections/posts/12`, not `/admin/collections/posts-extra`). */
export const isActivePath = (pathname: string, href: string): boolean => pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])

/** Whether the page being shown is somewhere under this node, at any depth. */
export const holdsCurrentPage = (node: NavNode, pathname: string): boolean =>
  node.type === 'link' ? isActivePath(pathname, node.href) : node.items.some((item) => holdsCurrentPage(item, pathname))

/**
 * Whether a heading starts open. Headings start closed: a sidebar of ten open lists is clutter. A heading the person opened or closed keeps
 * that choice (Payload stores it per person, by heading name); otherwise it is open only when the page they are on is inside it, so the
 * sidebar always shows where they are.
 */
export const startsOpen = (node: Extract<NavNode, { type: 'group' }>, pathname: string, saved: Record<string, { open?: boolean }>): boolean =>
  saved[node.label]?.open ?? holdsCurrentPage(node, pathname)
