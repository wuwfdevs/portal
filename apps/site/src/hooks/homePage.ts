import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, Field } from 'payload'
import { APIError } from 'payload'

import { userCan } from '@/access/permissions'
import { writeRedirect } from '@/hooks/pathHooks'

/**
 * Which page is the home page (`pages.isHome`). The page with the box ticked is served at `/` (`resolveHome`) and has no path of its own; one page at a time holds it.
 * Ticking it on another page and publishing moves it: `demoteOtherHomePages` unticks the old one in the same save, and the old page gets an address from its slug like
 * any page (`pathBeforeChange`), so nothing is left without an address. Unticking it on the home page itself is refused, because the site must always have one: choose
 * another page instead. The box exists only on pages in the home set (its blocks and sponsor places are what make a front page), and only a publisher may change it.
 */

/** Context flag the swap sets on the page it unticks, so `guardHomePage` lets that one change through. */
export const HOME_SWAP = 'homeSwap'

export const isHomeField: Field = {
  name: 'isHome',
  type: 'checkbox',
  defaultValue: false,
  label: 'Use as the home page',
  index: true,
  access: { update: ({ req }) => userCan(req.user as { roles?: string[] } | null, 'content.publish') },
  admin: {
    position: 'sidebar',
    condition: (data) => data?.pageSet === 'home',
    description:
      'The front page of the site, at wuwf.org. Ticking this and publishing makes this page the home page and unticks the current one (which then gets an address from its own address name). The home page cannot be unticked: tick another page instead.',
  },
}

export const guardHomePage: CollectionBeforeChangeHook = ({ data, originalDoc, operation, context }) => {
  if (operation !== 'update' && operation !== 'create') return data
  if (operation === 'update' && originalDoc?.isHome && data?.isHome === false && !context?.[HOME_SWAP]) {
    throw new APIError('The site needs a home page: make another page the home page instead of unticking this one.', 400, undefined, true)
  }
  // The home page is served at "/" and has no address of its own: a page that is becoming it lets go of the one it had (`demoteOtherHomePages` leaves a redirect from it).
  const becoming = data?.isHome ?? originalDoc?.isHome
  // Checked here, not in the field's `validate`: Payload skips a hidden field's validation, and the box is hidden outside the home set, which is exactly where it must be refused.
  const pageSet = data?.pageSet !== undefined ? data.pageSet : originalDoc?.pageSet
  if (becoming && pageSet !== 'home') throw new APIError('Only a page in the Home page set can be the home page.', 400, undefined, true)
  if (becoming && (data?.path ?? originalDoc?.path)) data.path = null
  return data
}

export const demoteOtherHomePages: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context }) => {
  // Only a published save moves the home page: a draft that ticks the box changes nothing the public sees until it is published.
  if (!doc?.isHome || doc._status !== 'published') return doc
  const others = await req.payload.find({
    collection: 'pages',
    where: { and: [{ isHome: { equals: true } }, { id: { not_equals: doc.id } }] },
    draft: false,
    depth: 0,
    limit: 10,
    pagination: false,
    overrideAccess: true,
    req,
  })
  for (const old of others.docs) {
    await req.payload.update({
      collection: 'pages',
      id: old.id,
      data: { isHome: false },
      draft: false,
      depth: 0,
      overrideAccess: true,
      req,
      context: { ...context, [HOME_SWAP]: true },
    })
  }
  // The page's old address, if it was published at one, now leads to the home page.
  const from = typeof previousDoc?.path === 'string' && previousDoc.path !== '' ? previousDoc.path : null
  if (from && !previousDoc?.isHome && previousDoc?._status === 'published') await writeRedirect(req.payload, req, from, '/')
  return doc
}
