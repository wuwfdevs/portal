import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'

import type { Post } from '../../../payload-types'

export const revalidatePost: CollectionAfterChangeHook<Post> = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published' && doc.path) {
      const path = doc.path

      payload.logger.info(`Revalidating post at path: ${path}`)

      revalidatePath(path)
      // The front page lists the newest published work.
      revalidatePath('/')
      revalidateTag('posts-sitemap', 'max')
    }

    // If the post was previously published and has gone or moved, the old path needs revalidating too
    if (previousDoc?.path && previousDoc._status === 'published' && (doc._status !== 'published' || previousDoc.path !== doc.path)) {
      const oldPath = previousDoc.path

      payload.logger.info(`Revalidating old post at path: ${oldPath}`)

      revalidatePath(oldPath)
      revalidatePath('/')
      revalidateTag('posts-sitemap', 'max')
    }
  }
  return doc
}

export const revalidateDelete: CollectionAfterDeleteHook<Post> = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) {
    if (doc?.path) revalidatePath(doc.path)
    revalidatePath('/')
    revalidateTag('posts-sitemap', 'max')
  }

  return doc
}
