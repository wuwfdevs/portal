import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Payload } from 'payload'

import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import {
  pathsAffectedByAgreement,
  pathsAffectedByCollection,
  type FundableSlug,
} from '@/lib/underwriting/invalidate'
import { agreementTag, collectionTag } from '@/lib/underwriting/resolve'

/**
 * An acknowledgment is rendered into pre-rendered pages, and the starter refreshes pages by path. So a change
 * to an agreement, or to what a fellowship/series/production points at, works out which story and hub pages it
 * reaches and revalidates exactly those: one edit updates every affected page. The cache tags are revalidated
 * too, for any cached data fetched under them.
 *
 * Working out the pages must never fail the edit that triggered it, but a failure is logged, not hidden.
 */
async function refresh(payload: Payload, find: () => Promise<string[]>, label: string): Promise<void> {
  try {
    const paths = await find()
    payload.logger.info(`Revalidating ${paths.length} page(s) for ${label}`)
    for (const path of paths) revalidatePath(path)
  } catch (error) {
    payload.logger.warn(`Could not work out the pages affected by ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const revalidateAgreement: CollectionAfterChangeHook = async ({ doc, req: { payload, context } }) => {
  if (context.disableRevalidate) return doc
  revalidateTag(agreementTag(String(doc.id)))
  await refresh(payload, () => pathsAffectedByAgreement(payload, doc.id), `agreement ${doc.id}`)
  return doc
}

export const revalidateAgreementDelete: CollectionAfterDeleteHook = ({ doc, req: { context } }) => {
  // The collections that carried it no longer point at it, so the affected pages cannot be worked out here;
  // they refresh on their own schedule (the article page revalidates hourly).
  if (!context.disableRevalidate) revalidateTag(agreementTag(String(doc.id)))
  return doc
}

export const revalidateCollection: CollectionAfterChangeHook = async ({ doc, collection, req: { payload, context } }) => {
  if (context.disableRevalidate) return doc
  revalidateTag(collectionTag(String(doc.id)))
  await refresh(payload, () => pathsAffectedByCollection(payload, collection.slug as FundableSlug, doc.id), `${collection.slug} ${doc.id}`)
  return doc
}

export const revalidateCollectionDelete: CollectionAfterDeleteHook = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) revalidateTag(collectionTag(String(doc.id)))
  return doc
}
