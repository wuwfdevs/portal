import 'server-only'

import type { ListeningPath } from '@wuwf/portal-contracts'

import { readListeningConfig } from './config'
import { callListeningWith, type PortalCall } from './portal-call'

export type { PortalCall } from './portal-call'

/** A signed call to the Portal's listening API, read from this server's environment. See `portal-call.ts`. */
export function callListening<T extends object>(path: ListeningPath, body: Record<string, unknown>): Promise<PortalCall<T>> {
  return callListeningWith<T>(readListeningConfig(), fetch, path, body)
}
