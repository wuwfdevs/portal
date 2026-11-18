import type { Payload } from 'payload'

import type { SyncStore, SourceToSync } from './sync'
import { tombstoneFields } from './tombstone'
import type { NetworkCandidate } from './types'

/**
 * The database half of a poll: `SyncStore` over Payload's Local API. Every write here is the system's (`overrideAccess`, and the
 * `networkSystem` context that the status rules look for). Pure parts live in `sync.ts`; this file only maps and saves.
 *
 * Rules kept here, not in the poll:
 * - one row per CDS id (the collection's unique index is the backstop);
 * - a dismissed story is left alone when it turns up again;
 * - a story that has gone is flagged only if it was published (an editor decides); a waiting or kept one is simply deleted;
 * - a story that turns restricted is blanked to a tombstone, and its post, if any, goes back to a draft.
 */

export const SYSTEM_CONTEXT = { networkSystem: true } as const

/** A candidate as the item's fields. Never sets `status`; the caller decides that. */
export function itemFields(c: NetworkCandidate, now: Date): Record<string, unknown> {
  return {
    title: c.title,
    teaser: c.teaser,
    publishedAt: c.publishedAt,
    modifiedAt: c.modifiedAt,
    canonicalUrl: c.canonicalUrl,
    ownerHrefs: c.ownerHrefs,
    brandingHrefs: c.brandingHrefs,
    image: c.image
      ? { href: c.image.href, hrefTemplate: c.image.hrefTemplate, width: c.image.width, height: c.image.height, altText: c.image.altText, caption: c.image.caption, credit: c.image.credit }
      : { href: null, hrefTemplate: null, width: null, height: null, altText: null, caption: null, credit: null },
    imageDroppedAsRestricted: c.imageDroppedAsRestricted,
    audio: c.audio ? { href: c.audio.href, mimeType: c.audio.mimeType, durationSeconds: c.audio.durationSeconds } : { href: null, mimeType: null, durationSeconds: null },
    audioSkipped: c.audioSkipped,
    lastSeenAt: now.toISOString(),
  }
}

type Existing = { id: number | string; status: string; post: unknown }

export function payloadSyncStore(payload: Payload): SyncStore {
  const find = async (cdsIds: string[], select: Record<string, true> = { cdsId: true, status: true, post: true }) =>
    cdsIds.length === 0
      ? []
      : (
          await payload.find({
            collection: 'network-items',
            where: { cdsId: { in: cdsIds } },
            limit: cdsIds.length,
            pagination: false,
            depth: 0,
            overrideAccess: true,
            select,
          })
        ).docs

  return {
    async upsertCandidates(sourceId: SourceToSync['id'], candidates: NetworkCandidate[], now: Date) {
      const created: string[] = []
      const updated: string[] = []
      const existing = new Map<string, Existing>()
      for (const doc of await find(candidates.map((c) => c.cdsId))) existing.set(doc.cdsId, doc as unknown as Existing)

      for (const c of candidates) {
        const have = existing.get(c.cdsId)
        if (!have) {
          await payload.create({
            collection: 'network-items',
            overrideAccess: true,
            context: SYSTEM_CONTEXT,
            data: { ...itemFields(c, now), cdsId: c.cdsId, source: sourceId, status: 'new', firstSeenAt: now.toISOString() } as never,
          })
          created.push(c.cdsId)
          continue
        }
        if (have.status === 'dismissed') continue
        // A story that came back after being flagged as removed goes back to what it was: published if it has a post, else waiting.
        const status = have.status === 'gone' ? (have.post ? 'published' : 'new') : have.status
        await payload.update({
          collection: 'network-items',
          id: have.id,
          overrideAccess: true,
          context: SYSTEM_CONTEXT,
          data: { ...itemFields(c, now), status, ...(have.status === 'gone' ? { goneAt: null } : {}) } as never,
        })
        updated.push(c.cdsId)
      }
      return { created, updated }
    },

    async heldIds(sourceId, limit) {
      const found = await payload.find({
        collection: 'network-items',
        where: { and: [{ source: { equals: sourceId } }, { status: { in: ['new', 'held', 'published'] } }] },
        sort: '-lastSeenAt',
        limit,
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { cdsId: true },
      })
      return found.docs.map((d) => d.cdsId)
    },

    async markGone(cdsIds, now) {
      for (const doc of await find(cdsIds)) {
        const item = doc as unknown as Existing
        if (item.status === 'published') {
          await payload.update({ collection: 'network-items', id: item.id, overrideAccess: true, context: SYSTEM_CONTEXT, data: { status: 'gone', goneAt: now.toISOString() } as never })
        } else if (item.status === 'new' || item.status === 'held') {
          await payload.delete({ collection: 'network-items', id: item.id, overrideAccess: true, context: SYSTEM_CONTEXT })
        }
      }
    },

    async takeDown(cdsIds) {
      for (const doc of await find(cdsIds)) {
        const item = doc as unknown as Existing
        const postId = typeof item.post === 'object' && item.post !== null ? (item.post as { id: number | string }).id : item.post
        if (item.status === 'published' && (typeof postId === 'number' || typeof postId === 'string')) {
          await payload.update({ collection: 'posts', id: postId, overrideAccess: true, context: SYSTEM_CONTEXT, data: { _status: 'draft' } as never })
        }
        await payload.update({
          collection: 'network-items',
          id: item.id,
          overrideAccess: true,
          context: SYSTEM_CONTEXT,
          data: { ...tombstoneFields(), status: 'dismissed' } as never,
        })
      }
    },
  }
}

/**
 * Deletes waiting stories first found before the cutoff: a story nobody picked in a month is not going to be. (First found, not last seen:
 * the source keeps serving a story for as long as it likes, so "last seen" would keep every waiting story alive for ever.) Returns how many went.
 */
export async function deleteStaleNewItems(payload: Payload, before: Date): Promise<number> {
  const stale = await payload.find({
    collection: 'network-items',
    where: { and: [{ status: { equals: 'new' } }, { firstSeenAt: { less_than: before.toISOString() } }] },
    limit: 500,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { status: true },
  })
  for (const doc of stale.docs) await payload.delete({ collection: 'network-items', id: doc.id, overrideAccess: true, context: SYSTEM_CONTEXT })
  return stale.docs.length
}
