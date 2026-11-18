import type { Payload } from 'payload'

import { isServiceId, type SourceFinder } from './poll'
import { deleteStaleNewItems, payloadSyncStore, SYSTEM_CONTEXT } from './payload-store'
import { retentionCutoffs } from './retention'
import { syncSource, type CdsReader, type SourceToSync, type SyncResult } from './sync'

/**
 * Polls every active network source once, then clears out old waiting stories. What the scheduler calls (`app/api/network/poll`).
 * The summary holds counts and names only: never a story's words, and never a response from CDS.
 */

export type SourceSummary = {
  name: string
  found: number
  created: number
  updated: number
  restricted: number
  gone: number
  takenDown: number
  awaitingAutoPublish: number
  error: string | null
}

export type PollSummary = { status: 'not_configured' } | { status: 'ok'; sources: SourceSummary[]; deletedStale: number }

type SourceDoc = {
  id: number | string
  name: string
  findBy: 'owner' | 'collection'
  serviceId?: string | null
  collectionId?: number | null
  mode: 'auto' | 'queue'
  poll?: { cursor?: string | null } | null
}

/** The finder a source record describes, or null when its record is incomplete (an editor has not finished it). */
export function finderOf(source: Pick<SourceDoc, 'findBy' | 'serviceId' | 'collectionId'>): SourceFinder | null {
  if (source.findBy === 'collection') {
    return typeof source.collectionId === 'number' && Number.isInteger(source.collectionId) && source.collectionId > 0 ? { kind: 'collection', collectionId: source.collectionId } : null
  }
  const id = source.serviceId?.trim()
  return id && isServiceId(id) ? { kind: 'owner', serviceId: id } : null
}

const summarise = (name: string, r: SyncResult): SourceSummary => ({
  name,
  found: r.found,
  created: r.created.length,
  updated: r.updated,
  restricted: r.restricted,
  gone: r.gone,
  takenDown: r.takenDown,
  awaitingAutoPublish: r.awaitingAutoPublish.length,
  error: r.error,
})

export async function runNetworkPoll(payload: Payload, cds: CdsReader | null, now: Date = new Date()): Promise<PollSummary> {
  if (!cds) return { status: 'not_configured' }

  const sources = (await payload.find({ collection: 'network-sources', where: { active: { equals: true } }, limit: 200, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as SourceDoc[]
  const store = payloadSyncStore(payload)
  const summaries: SourceSummary[] = []

  for (const source of sources) {
    const finder = finderOf(source)
    if (!finder) {
      summaries.push({ name: source.name, found: 0, created: 0, updated: 0, restricted: 0, gone: 0, takenDown: 0, awaitingAutoPublish: 0, error: 'This source is not finished: it needs a service ID or a collection ID.' })
      continue
    }
    const input: SourceToSync = { id: source.id, name: source.name, finder, mode: source.mode, cursor: source.poll?.cursor ? new Date(source.poll.cursor) : null }
    const result = await syncSource(input, { cds, store, now: () => now })
    summaries.push(summarise(source.name, result))
    await payload.update({
      collection: 'network-sources',
      id: source.id,
      overrideAccess: true,
      context: SYSTEM_CONTEXT,
      data: {
        poll: {
          lastPolledAt: result.run.lastPolledAt.toISOString(),
          cursor: result.run.cursor.toISOString(),
          foundNew: result.run.foundNew,
          skippedRestricted: result.run.skippedRestricted,
          error: result.run.error,
        },
      } as never,
    })
  }

  const deletedStale = await deleteStaleNewItems(payload, retentionCutoffs(now).deleteNewBefore)
  return { status: 'ok', sources: summaries, deletedStale }
}
