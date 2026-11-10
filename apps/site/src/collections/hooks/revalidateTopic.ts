import type { CollectionAfterChangeHook } from 'payload'

import { listHref } from '@/lib/lists/route'
import { revalidatePath } from '@/lib/revalidate'

/** A topic's page shows its title and its listening question; saving the topic refreshes the first page. */
export const revalidateTopic: CollectionAfterChangeHook = ({ doc, previousDoc, req: { context } }) => {
  if (context.disableRevalidate) return doc
  if (typeof doc.slug === 'string' && doc.slug) revalidatePath(listHref('topic', doc.slug))
  if (typeof previousDoc?.slug === 'string' && previousDoc.slug && previousDoc.slug !== doc.slug) revalidatePath(listHref('topic', previousDoc.slug))
  return doc
}
