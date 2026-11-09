import 'server-only'

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
