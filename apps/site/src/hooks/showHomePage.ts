import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, Field } from 'payload'
import { APIError } from 'payload'

import { userCan } from '@/access/permissions'
import { writeRedirect } from '@/hooks/pathHooks'

/**
 * A show's home page (hubs redesign, 2026-11-23). A page **names its show** (`pages.show`: the production it speaks for) and one page per show is flagged as the show's home
 * (`pages.isShowHome`). The show's own address (`/shows/<slug>`) then renders that page; a show with no home page keeps the standard show page. The page holds no rule: gates,
 * feeds, member levels and the support attribution code are read from the production, through the page's show.
 *
 * It follows the home page's pattern (`hooks/homePage.ts`): the flagged page has no address of its own (the show's address is its address), only a publisher can change the box,
 * ticking it on another of the show's pages and publishing moves it (`demoteOtherShowHomePages`), and a page becoming a show's home leaves a redirect from the address it had. Unlike
 * the site's home page a show may have none, so unticking is allowed. A page may name a show without being its home (RadioLive's page names the RadioLive production for its funder line;
 * a show's About page names its show so the strip lists it).
 */

/** Context flag the swap sets on the page it unticks. */
export const SHOW_HOME_SWAP = 'showHomeSwap'

const idOf = (v: unknown): number | string | null => {
  if (typeof v === 'number' || typeof v === 'string') return v
  if (v && typeof v === 'object' && 'id' in v) return idOf((v as { id: unknown }).id)
  return null
}

export const showField: Field = {
  name: 'show',
  type: 'relationship',
  relationTo: 'productions',
  index: true,
  admin: {
    position: 'sidebar',
    condition: (_, { template }) => template === 'sections',
    description:
      'The production this page speaks for. Its funder line, support attribution and episodes are read from the production, never typed on the page. Choose it for a show\'s pages and for a hub that has a production (RadioLive).',
  },
}

export const isShowHomeField: Field = {
  name: 'isShowHome',
  type: 'checkbox',
  defaultValue: false,
  label: 'Use as the show\'s home page',
  index: true,
  access: { update: ({ req }) => userCan(req.user as { roles?: string[] } | null, 'content.publish') },
  admin: {
    position: 'sidebar',
    condition: (data) => Boolean(data?.show),
    description:
      'The show\'s own address (wuwf.org/shows/…) shows this page instead of the standard show page. Ticking this and publishing makes this page the show\'s home and unticks the current one. This page then has no address of its own; its old one leads to the show\'s.',
  },
}

export const navHiddenField: Field = {
  name: 'navHidden',
  type: 'checkbox',
  defaultValue: false,
  label: 'Leave out of the page strip',
  admin: {
    position: 'sidebar',
    condition: (_, { template }) => template === 'sections',
    description: 'The strip of the set\'s (or the show\'s) pages does not list this page. Use it for a page the strip\'s title already links to (a show\'s home).',
  },
}

/** Whether a stored production is one a page may take as its home address: it has a path. Looked up here so the refusal is a sentence an editor can act on. */
async function showPath(req: Parameters<CollectionBeforeChangeHook>[0]['req'], id: number | string): Promise<string | null> {
  const show = await req.payload.findByID({ collection: 'productions', id, depth: 0, overrideAccess: true, req, select: { path: true } }).catch(() => null)
  return typeof show?.path === 'string' && show.path.startsWith('/') ? show.path : null
}

export const guardShowHome: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' && operation !== 'create') return data
  const becoming = data?.isShowHome ?? originalDoc?.isShowHome
  if (!becoming) return data
  const template = data?.template ?? originalDoc?.template
  if (template !== 'sections') throw new APIError('Only a page of sections can be a show\'s home page.', 400, undefined, true)
  if (data?.isHome ?? originalDoc?.isHome) throw new APIError('The site\'s home page cannot also be a show\'s home page.', 400, undefined, true)
  const showId = idOf(data?.show !== undefined ? data.show : originalDoc?.show)
  if (showId === null) throw new APIError('Choose the show this page is the home of before ticking "Use as the show\'s home page".', 400, undefined, true)
  if ((await showPath(req, showId)) === null) throw new APIError('That show has no address yet, so it has nowhere to show a home page. Give the show an address first.', 400, undefined, true)
  // The show's address is its address: the page lets go of the one it had (`demoteOtherShowHomePages` leaves a redirect from it).
  if (data?.path ?? originalDoc?.path) data.path = null
  return data
}

export const demoteOtherShowHomePages: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context }) => {
  // Only a published save moves a show's home page: a draft that ticks the box changes nothing the public sees until it is published.
  if (!doc?.isShowHome || doc._status !== 'published') return doc
  const showId = idOf(doc.show)
  if (showId === null) return doc
  const others = await req.payload.find({
    collection: 'pages',
    where: { and: [{ isShowHome: { equals: true } }, { show: { equals: showId } }, { id: { not_equals: doc.id } }] },
    draft: false,
    depth: 0,
    limit: 10,
    pagination: false,
    overrideAccess: true,
    req,
  })
  for (const old of others.docs) {
    await req.payload.update({ collection: 'pages', id: old.id, data: { isShowHome: false }, draft: false, depth: 0, overrideAccess: true, req, context: { ...context, [SHOW_HOME_SWAP]: true } })
  }
  // The address the page had now leads to the show's.
  const from = typeof previousDoc?.path === 'string' && previousDoc.path !== '' ? previousDoc.path : null
  if (from && !previousDoc?.isShowHome && previousDoc?._status === 'published') {
    const to = await showPath(req, showId)
    if (to) await writeRedirect(req.payload, req, from, to)
  }
  return doc
}
