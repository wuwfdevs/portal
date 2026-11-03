import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidatePath } from '@/lib/revalidate'

/** A show's page and the podcast directory both show its name, summary and picture: saving the show refreshes them at once. */
export const revalidateShow: CollectionAfterChangeHook = ({ doc, previousDoc, req: { context } }) => {
  if (!context.disableRevalidate) {
    for (const p of [doc?.path, previousDoc?.path]) if (typeof p === 'string' && p) revalidatePath(p)
    revalidatePath('/podcasts')
  }
  return doc
}
export const revalidateShowDelete: CollectionAfterDeleteHook = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) {
    if (typeof doc?.path === 'string' && doc.path) revalidatePath(doc.path)
    revalidatePath('/podcasts')
  }
  return doc
}
