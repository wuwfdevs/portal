import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidateTag } from '@/lib/revalidate'

import { agreementTag, collectionTag } from '@/lib/underwriting/resolve'

/**
 * Pages that show an acknowledgment fetch through a cache entry tagged with the agreements and
 * collections they resolved through (resolveUnderwriting().tags). Changing an agreement, or what a
 * fellowship/series/production points at, invalidates those tags, so one edit updates every page.
 */
export const revalidateAgreement: CollectionAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (context.disableRevalidate) return doc
  payload.logger.info(`Revalidating pages for agreement ${doc.id}`)
  revalidateTag(agreementTag(String(doc.id)))
  return doc
}

export const revalidateAgreementDelete: CollectionAfterDeleteHook = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) revalidateTag(agreementTag(String(doc.id)))
  return doc
}

export const revalidateCollection: CollectionAfterChangeHook = ({ doc, req: { payload, context } }) => {
  if (context.disableRevalidate) return doc
  payload.logger.info(`Revalidating pages for collection ${doc.id}`)
  revalidateTag(collectionTag(String(doc.id)))
  return doc
}

export const revalidateCollectionDelete: CollectionAfterDeleteHook = ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) revalidateTag(collectionTag(String(doc.id)))
  return doc
}
