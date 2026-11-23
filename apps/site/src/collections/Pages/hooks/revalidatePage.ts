import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { setNavTag } from '@/lib/page-sets/nav'
import { isPageSetId } from '@/lib/page-sets/registry'

import type { Page } from '../../../payload-types'

/** A page in a set shows in every other page's sub-navigation, so saving, moving or removing one refreshes the set (`lib/page-sets/load.ts` reads it under this tag). */
function revalidateSets(...sets: Array<string | null | undefined>): void {
  for (const set of new Set(sets)) if (isPageSetId(set)) revalidateTag(setNavTag(set), 'max')
}

/** The address of the show a page speaks for, when the page is (or was) its home: the show's address renders the page, so that address is what a save refreshes. */
async function showHomePath(payload: import('payload').Payload, page: Partial<Page> | undefined): Promise<string | null> {
  if (!page?.isShowHome) return null
  const id = typeof page.show === 'object' && page.show ? page.show.id : page.show
  if (id === null || id === undefined) return null
  const show = await payload.findByID({ collection: 'productions', id, depth: 0, overrideAccess: true, select: { path: true } }).catch(() => null)
  return typeof show?.path === 'string' ? show.path : null
}

export const revalidatePage: CollectionAfterChangeHook<Page> = async ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = doc.isHome ? '/' : doc.path

      if (path) {
        payload.logger.info(`Revalidating page at path: ${path}`)
        revalidatePath(path)
      }
      revalidateTag('pages-sitemap', 'max')
    }
    // Draft saves do not change what the public sees; a publish, an unpublish or a move between sets does.
    if (doc._status === 'published' || previousDoc?._status === 'published') revalidateSets(doc.pageSet, previousDoc?.pageSet)

    // A show's home page is drawn at the show's address: refresh it when the page is published, unpublished, unticked or moved to another show.
    if (doc._status === 'published' || previousDoc?._status === 'published') {
      for (const path of new Set([await showHomePath(payload, doc), await showHomePath(payload, previousDoc)])) if (path) revalidatePath(path)
    }

    // If the page was previously published, we need to revalidate the old path
    if (previousDoc?._status === 'published' && (doc._status !== 'published' || previousDoc.path !== doc.path)) {
      const oldPath = previousDoc.isHome ? '/' : previousDoc.path

      if (oldPath) {
        payload.logger.info(`Revalidating old page at path: ${oldPath}`)
        revalidatePath(oldPath)
      }
      revalidateTag('pages-sitemap', 'max')
    }
  }
  return doc
}

export const revalidateDelete: CollectionAfterDeleteHook<Page> = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) {
    const path = doc?.isHome ? '/' : doc?.path
    if (path) revalidatePath(path)
    revalidateSets(doc?.pageSet)
    revalidateTag('pages-sitemap', 'max')
  }

  return doc
}
