import 'server-only'

import { LISTENING_PATHS, type ListeningConversation, type ListeningErrorCode, type ListeningTable } from '@wuwf/portal-contracts'

import { callListening } from './portal'
import { currentClientHash } from './request-context'
import { readTableSession } from './table-session'

/**
 * What a page needs from the Portal for the table this phone holds. A page reads; it never sets a cookie, so a session the Portal
 * no longer accepts is reported here and the page says so (the cookie is dropped the next time a server action runs).
 */
export type TableLoad<T> = { kind: 'ok' } & T | { kind: 'no_session' } | { kind: 'not_set_up' } | { kind: 'refused'; code: ListeningErrorCode } | { kind: 'unavailable' }

async function load<T extends object>(path: typeof LISTENING_PATHS.tableState | typeof LISTENING_PATHS.conversation): Promise<TableLoad<T>> {
  const session = await readTableSession()
  if (!session) return { kind: 'no_session' }
  const hash = await currentClientHash()
  const result = await callListening<T>(path, { session, ...(hash ? { clientHash: hash } : {}) })
  if (result.ok) return { kind: 'ok', ...result } as TableLoad<T>
  if (result.error === 'not_set_up') return { kind: 'not_set_up' }
  if (result.error === 'unavailable' || result.error === 'rate_limited') return { kind: 'unavailable' }
  return { kind: 'refused', code: result.error }
}

export const loadTableState = () => load<{ table: ListeningTable }>(LISTENING_PATHS.tableState)
export const loadConversationState = () => load<{ conversation: ListeningConversation }>(LISTENING_PATHS.conversation)
