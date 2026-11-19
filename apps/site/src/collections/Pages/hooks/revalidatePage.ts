import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { setNavTag } from '@/lib/page-sets/nav'
import { isPageSetId } from '@/lib/page-sets/registry'

import type { Page } from '../../../payload-types'

/** A page in a set shows in every other page's sub-navigation, so saving, moving or removing one refreshes the set (`lib/page-sets/load.ts` reads it under this tag). */
function revalidateSets(...sets: Array<string | null | undefined>): void {
  for (const set of new Set(sets)) if (isPageSetId(set)) revalidateTag(setNavTag(set), 'max')
}

export const revalidatePage: CollectionAfterChangeHook<Page> = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = doc.slug === 'home' ? '/' : doc.path

      if (path) {
        payload.logger.info(`Revalidating page at path: ${path}`)
        revalidatePath(path)
      }
      revalidateTag('pages-sitemap', 'max')
    }
    // Draft saves do not change what the public sees; a publish, an unpublish or a move between sets does.
    if (doc._status === 'published' || previousDoc?._status === 'published') revalidateSets(doc.pageSet, previousDoc?.pageSet)

    // If the page was previously published, we need to revalidate the old path
    if (previousDoc?._status === 'published' && (doc._status !== 'published' || previousDoc.path !== doc.path)) {
      const oldPath = previousDoc.slug === 'home' ? '/' : previousDoc.path

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
    const path = doc?.slug === 'home' ? '/' : doc?.path
    if (path) revalidatePath(path)
    revalidateSets(doc?.pageSet)
    revalidateTag('pages-sitemap', 'max')
  }

  return doc
}
