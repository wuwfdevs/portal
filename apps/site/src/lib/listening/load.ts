import 'server-only'

import { unstable_cache } from 'next/cache'

import { LISTENING_PATHS, type ListeningHub, type ListeningQuery } from '@wuwf/portal-contracts'

import { callListening } from './portal'
import { currentClientHash } from './request-context'

/** What a page learns when it asks the Portal for a question or the hub. A page turns each into its own screen. */
export type QueryLoad = { kind: 'ok'; query: ListeningQuery } | { kind: 'not_available' } | { kind: 'not_set_up' } | { kind: 'error' }
export type HubLoad = { kind: 'ok'; hub: ListeningHub } | { kind: 'not_set_up' } | { kind: 'error' }

export async function loadQuery(publicId: string): Promise<QueryLoad> {
  const clientHash = await currentClientHash()
  const result = await callListening<{ query: ListeningQuery }>(LISTENING_PATHS.query, { publicId, ...(clientHash ? { clientHash } : {}) })
  if (result.ok) return { kind: 'ok', query: result.query }
  if (result.error === 'not_available') return { kind: 'not_available' }
  if (result.error === 'not_set_up') return { kind: 'not_set_up' }
  return { kind: 'error' }
}

export async function loadHub(): Promise<HubLoad> {
  const clientHash = await currentClientHash()
  const result = await callListening<{ hub: ListeningHub }>(LISTENING_PATHS.hub, clientHash ? { clientHash } : {})
  if (result.ok) return { kind: 'ok', hub: result.hub }
  if (result.error === 'not_set_up') return { kind: 'not_set_up' }
  return { kind: 'error' }
}

/** How long a placed question's state may be out of date. The Portal still refuses an answer to a question that has closed. */
export const PLACEMENT_REVALIDATE_SECONDS = 300

/**
 * The question as a PLACEMENT reads it: inside a story or a topic page, which are built ahead and reused. The ordinary
 * `loadQuery` reads the request's headers (for the rate-limit hash) and never caches, which would make every page that holds a
 * question render fresh on each view and wait on the Portal. This one sends no hash, and keeps the answer for a few minutes;
 * a failure is not kept (it throws out of the cache and reads as "no question here"), so one bad moment does not hide a question.
 */
const placedQuery = unstable_cache(
  async (publicId: string) => {
    const result = await callListening<{ query: ListeningQuery }>(LISTENING_PATHS.query, { publicId })
    if (result.ok) return result.query
    if (result.error === 'not_available' || result.error === 'not_set_up') return null
    throw new Error(`listening query read failed: ${result.error}`)
  },
  ['listening-placed-query'],
  { revalidate: PLACEMENT_REVALIDATE_SECONDS, tags: ['listening-query'] },
)

export async function loadPlacedQuery(publicId: string): Promise<ListeningQuery | null> {
  try {
    return await placedQuery(publicId)
  } catch {
    return null
  }
}
